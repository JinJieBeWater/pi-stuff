import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadExtensionPackages } from "../../lib/extension-packages.ts";

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

export function withExposure(pi: ExtensionAPI, rules: Record<string, Exposure>): ExtensionAPI {
  const policy = new Map(Object.entries(rules));
  return {
    ...pi,
    registerTool(tool) {
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
  const rules = new Map(config.adapters.map((adapter) => [adapter.source, adapter.tools]));
  await loadExtensionPackages({
    pi,
    packages: [...rules.keys()].map((source) => ({ source, enabled: true })),
    agentDir,
    configName: fileName,
    parentPath: fileURLToPath(import.meta.url),
    wrap: (api, source) => withExposure(api, rules.get(source)!),
  });
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
