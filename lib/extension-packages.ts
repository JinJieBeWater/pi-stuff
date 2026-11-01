import { realpath, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  DefaultPackageManager,
  SettingsManager,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

export async function loadExtensionPackages({
  pi,
  packages,
  agentDir,
  configName,
  parentPath,
  wrap,
}: {
  pi: ExtensionAPI;
  packages: { source: string; enabled: boolean }[];
  agentDir: string;
  configName: string;
  parentPath: string;
  wrap: (api: ExtensionAPI, source: string) => ExtensionAPI;
}) {
  if (!packages.length) return;
  const settings = SettingsManager.create(agentDir, agentDir, { projectTrusted: false });
  // Check native entries before selecting rules so aliases cannot bypass the handoff.
  const native = await new DefaultPackageManager({
    cwd: agentDir,
    agentDir,
    settingsManager: settings,
  }).resolve(async () => "skip");
  const nativeFiles = new Set(
    await Promise.all(
      native.extensions
        .filter((resource) => resource.enabled)
        .map((resource) =>
          realpath(resource.path).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
            return undefined;
          }),
        ),
    ),
  );
  const manager = new DefaultPackageManager({
    cwd: agentDir,
    agentDir,
    settingsManager: SettingsManager.inMemory({}),
  });
  const roots = new Set<string>();
  const installedPackages: typeof packages = [];
  for (const entry of packages) {
    const { source, enabled } = entry;
    const installed = manager.getInstalledPath(source, "user");
    if (
      !installed ||
      !(
        await stat(installed).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
          return undefined;
        })
      )?.isDirectory()
    ) {
      if (enabled) throw new Error(`${configName}: install the package directory first: ${source}`);
      continue;
    }
    const root = await realpath(installed);
    if (roots.has(root))
      throw new Error(`${configName}: sources resolve to the same package: ${source}`);
    roots.add(root);
    installedPackages.push(entry);
  }
  const resources = await new DefaultPackageManager({
    cwd: agentDir,
    agentDir,
    settingsManager: SettingsManager.inMemory({
      packages: installedPackages.map((entry) => entry.source),
    }),
  }).resolve(async () => "error");
  const entries = installedPackages.map(({ source, enabled }) => ({
    source,
    enabled,
    files: resources.extensions
      .filter(
        (resource) =>
          resource.enabled &&
          resource.metadata.origin === "package" &&
          resource.metadata.source === source,
      )
      .map((resource) => resource.path),
  }));
  const files = new Set<string>();
  const parent = await realpath(parentPath);
  for (const entry of entries) {
    if (entry.enabled && !entry.files.length)
      throw new Error(`${configName}: no package extensions discovered for ${entry.source}`);
    for (const file of entry.files) {
      const canonical = await realpath(file);
      if (nativeFiles.has(canonical))
        throw new Error(
          `${configName}: set extensions: [] or exclude the native extension entry before adapting ${entry.source}: ${file}`,
        );
      if (canonical === parent)
        throw new Error(`${configName}: cannot manage its own extension entry`);
      if (files.has(canonical))
        throw new Error(`${configName}: duplicate discovered entry ${file}`);
      files.add(canonical);
    }
  }
  const owners = new Map<string, symbol>();
  for (const entry of entries)
    if (entry.enabled)
      for (const file of entry.files) {
        const module = await import(pathToFileURL(file).href);
        if (typeof module.default !== "function")
          throw new Error(`${configName}: entry must export an extension factory: ${file}`);
        const owner = Symbol(file);
        const scoped: ExtensionAPI = {
          ...pi,
          registerTool(tool) {
            if (owners.has(tool.name) && owners.get(tool.name) !== owner)
              throw new Error(`${configName}: duplicate adapted tool ${tool.name}`);
            owners.set(tool.name, owner);
            pi.registerTool(tool);
          },
        };
        await module.default(wrap(scoped, entry.source));
      }
}
