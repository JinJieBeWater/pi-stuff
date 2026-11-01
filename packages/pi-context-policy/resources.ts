import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DefaultPackageManager,
  getAgentDir,
  loadSkills,
  SettingsManager,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { loadExtensionPackages } from "../../lib/extension-packages.ts";
import { fileName, matchesEnv, type Policy } from "./policy.ts";

function resourcePath(path: string, agentDir: string) {
  return path === "~"
    ? homedir()
    : path.startsWith("~/")
      ? resolve(homedir(), path.slice(2))
      : resolve(agentDir, path);
}

export async function registerResources(
  pi: ExtensionAPI,
  config: Policy,
  agentDir = getAgentDir(),
  env: NodeJS.ProcessEnv = process.env,
) {
  if (
    !config.enabled ||
    (!config.extensions.length && !config.tools.length && !config.skills.length)
  )
    return;
  if (config.tools.length && !config.extensions.length)
    throw new Error(`${fileName}: tools rules require managed extensions`);
  const settingsManager = SettingsManager.create(agentDir, agentDir, {
    projectTrusted: false,
  });
  const settings = settingsManager.getGlobalSettings();
  const nativeSkillFiles = new Set<string>();
  if (config.skills.length) {
    // Top-level exclusions do not disable package manifest entries.
    const native = await new DefaultPackageManager({
      cwd: agentDir,
      agentDir,
      settingsManager,
    }).resolve(async () => "skip");
    const { skills } = loadSkills({
      cwd: agentDir,
      agentDir,
      includeDefaults: false,
      skillPaths: native.skills
        .filter((resource) => resource.enabled)
        .map((resource) => resource.path),
    });
    for (const skill of skills) nativeSkillFiles.add(await realpath(skill.filePath));
  }

  const skillPaths: string[] = [];
  const managedPaths = new Set<string>();
  for (const rule of config.skills) {
    const path = resourcePath(rule.path, agentDir);
    if (managedPaths.has(path)) throw new Error(`${fileName}: duplicate skill path ${path}`);
    managedPaths.add(path);
    if (
      !(settings.skills ?? []).some(
        (entry) => entry.startsWith("-") && resourcePath(entry.slice(1), agentDir) === path,
      )
    )
      throw new Error(`${fileName}: exclude the native skill path first: -${path}`);
    const enabled = matchesEnv(rule.whenEnv, env);
    const info = await stat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT" || enabled) throw error;
      return undefined;
    });
    if (!info) continue;
    const file = info.isDirectory() ? join(path, "SKILL.md") : path;
    const canonical = await realpath(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT" || enabled) throw error;
      return undefined;
    });
    if (canonical && nativeSkillFiles.has(canonical))
      throw new Error(`${fileName}: disable the native skill/package skills entry first: ${path}`);
    if (!enabled) continue;
    if (!info.isDirectory() && extname(path) !== ".md")
      throw new Error(`${fileName}: skill file must be Markdown: ${path}`);
    if (!(await stat(info.isDirectory() ? join(path, "SKILL.md") : path)).isFile())
      throw new Error(`${fileName}: skill path must be a SKILL.md file or its directory: ${path}`);
    skillPaths.push(path);
  }

  const tools = new Map(config.tools.map((rule) => [rule.name, matchesEnv(rule.whenEnv, env)]));
  await loadExtensionPackages({
    pi,
    packages: config.extensions.map((rule) => ({
      source: rule.source,
      enabled: matchesEnv(rule.whenEnv, env),
    })),
    agentDir,
    configName: fileName,
    parentPath: fileURLToPath(new URL("./index.ts", import.meta.url)),
    wrap: (api) => ({
      ...api,
      registerTool(tool) {
        if (tools.get(tool.name) !== false) api.registerTool(tool);
      },
    }),
  });
  if (skillPaths.length) pi.on("resources_discover", () => ({ skillPaths }));
}
