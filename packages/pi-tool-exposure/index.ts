import { readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DefaultPackageManager,
  SettingsManager,
  getAgentDir,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

type Exposure = "direct" | "deferred" | "model-only";
type Adapter = { source: string; tools: Record<string, Exposure> };
export type ExposureConfig = { enabled: boolean; adapters: Adapter[] };
const fileName = "pi-tool-exposure.json";
const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
function knownKeys(value: Record<string, unknown>, allowed: string[]) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw new Error(`${fileName}: unknown field ${key}`);
}
export function parseExposureConfig(value: unknown): ExposureConfig {
  if (!isObject(value)) throw new Error(`${fileName}: config must be an object`);
  knownKeys(value, ["enabled", "adapters"]);
  if (value.enabled !== undefined && typeof value.enabled !== "boolean")
    throw new Error(`${fileName}: enabled must be a boolean`);
  const input = value.adapters === undefined ? [] : value.adapters;
  if (!Array.isArray(input)) throw new Error(`${fileName}: adapters must be an array`);
  const sources = new Set<string>(),
    names = new Set<string>();
  const adapters = input.map((entry): Adapter => {
    if (!isObject(entry)) throw new Error(`${fileName}: each adapter must be an object`);
    knownKeys(entry, ["source", "tools"]);
    if (
      typeof entry.source !== "string" ||
      !entry.source.trim() ||
      entry.source !== entry.source.trim() ||
      sources.has(entry.source)
    )
      throw new Error(`${fileName}: source must be a unique nonempty Pi package source`);
    if (!isObject(entry.tools) || !Object.keys(entry.tools).length)
      throw new Error(`${fileName}: tools must be a nonempty map`);
    for (const [name, exposure] of Object.entries(entry.tools)) {
      if (
        !name.trim() ||
        name !== name.trim() ||
        names.has(name) ||
        !["direct", "deferred", "model-only"].includes(exposure as string)
      )
        throw new Error(`${fileName}: tool names must be unique and exposures valid`);
      names.add(name);
    }
    sources.add(entry.source);
    return { source: entry.source, tools: entry.tools as Adapter["tools"] };
  });
  return { enabled: value.enabled ?? true, adapters };
}

export function withExposure(
  pi: ExtensionAPI,
  rules: Record<string, Exposure>,
  registered = new Map<string, symbol>(),
): ExtensionAPI {
  const policy = new Map(Object.entries(rules));
  const owner = Symbol("adapted factory");
  return {
    ...pi,
    registerTool(tool) {
      if (registered.has(tool.name) && registered.get(tool.name) !== owner)
        throw new Error(`${fileName}: duplicate adapted tool ${tool.name}`);
      registered.set(tool.name, owner);
      const direct = tool.exposure === undefined || tool.exposure === "direct";
      const exposure = policy.get(tool.name);
      pi.registerTool(direct && exposure ? { ...tool, exposure } : tool);
    },
  };
}

export async function registerAdapters(
  pi: ExtensionAPI,
  config: ExposureConfig,
  agentDir = getAgentDir(),
) {
  if (!config.enabled || !config.adapters.length) return;
  const settings = SettingsManager.create(agentDir, agentDir, { projectTrusted: false });
  const configured = settings.getGlobalSettings().packages ?? [];
  const manager = new DefaultPackageManager({
    cwd: agentDir,
    agentDir,
    settingsManager: SettingsManager.inMemory({
      packages: config.adapters.map((adapter) => adapter.source),
    }),
  });
  const roots = new Set<string>();
  for (const adapter of config.adapters) {
    const installed = manager.getInstalledPath(adapter.source, "user");
    if (!installed || !(await stat(installed)).isDirectory())
      throw new Error(`${fileName}: install the package directory first: ${adapter.source}`);
    const root = await realpath(installed);
    if (roots.has(root))
      throw new Error(`${fileName}: sources resolve to the same package: ${adapter.source}`);
    roots.add(root);
    for (const entry of configured) {
      const source = typeof entry === "string" ? entry : entry.source;
      const nativePath = manager.getInstalledPath(source, "user");
      if (!nativePath || (await realpath(nativePath)) !== root) continue;
      if (
        typeof entry === "string" ||
        !Array.isArray(entry.extensions) ||
        entry.extensions.length !== 0
      )
        throw new Error(
          `${fileName}: set extensions: [] on the native package declaration before adapting ${source}`,
        );
    }
  }
  const resources = await manager.resolve(async () => "error");
  const entries = config.adapters.map((adapter) => ({
    adapter,
    files: resources.extensions
      .filter(
        (resource) =>
          resource.enabled &&
          resource.metadata.origin === "package" &&
          resource.metadata.source === adapter.source,
      )
      .map((resource) => resource.path),
  }));
  const files = new Set<string>();
  for (const entry of entries) {
    if (!entry.files.length)
      throw new Error(`${fileName}: no package extensions discovered for ${entry.adapter.source}`);
    for (const file of entry.files) {
      const canonical = await realpath(file);
      if (files.has(canonical)) throw new Error(`${fileName}: duplicate discovered entry ${file}`);
      files.add(canonical);
    }
  }
  const registered = new Map<string, symbol>();
  for (const entry of entries)
    for (const file of entry.files) {
      const module = await import(pathToFileURL(file).href);
      if (typeof module.default !== "function")
        throw new Error(`${fileName}: entry must export an extension factory: ${file}`);
      await module.default(withExposure(pi, entry.adapter.tools, registered));
    }
}

export default async function toolExposure(pi: ExtensionAPI) {
  let value: unknown = {};
  try {
    value = JSON.parse(
      (await readFile(join(getAgentDir(), fileName), "utf8")).replace(/^\uFEFF/, ""),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await registerAdapters(pi, parseExposureConfig(value));
}
