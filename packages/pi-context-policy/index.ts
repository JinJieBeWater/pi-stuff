import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Section = { id: string; text: string; whenEnv: Record<string, string | true> };
export type Policy = { enabled: boolean; sections: Section[] };
const fileName = "pi-context-policy.json";

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${fileName}: ${label} must be an object`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[], label: string) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw new Error(`${fileName}: unknown ${label} field ${key}`);
}
export function parsePolicy(value: unknown): Policy {
  const config = object(value, "config");
  keys(config, ["enabled", "sections"], "config");
  if (config.enabled !== undefined && typeof config.enabled !== "boolean")
    throw new Error(`${fileName}: enabled must be a boolean`);
  const entries =
    config.sections === undefined
      ? [
          {
            id: "herdr",
            text: "你当前运行在 Herdr 中，自动识别可以并发的任务，通过 Shepherdr 进行并发。",
            whenEnv: { HERDR_ENV: "1", HERDR_PANE_ID: true },
          },
        ]
      : config.sections;
  if (!Array.isArray(entries)) throw new Error(`${fileName}: sections must be an array`);
  const ids = new Set<string>();
  const sections = entries.map((entry, index): Section => {
    const block = object(entry, `sections[${index}]`);
    keys(block, ["id", "text", "whenEnv"], `sections[${index}]`);
    if (typeof block.id !== "string" || !/^[a-z][a-z0-9_-]*$/.test(block.id) || ids.has(block.id))
      throw new Error(`${fileName}: section id must be a unique lowercase identifier`);
    if (typeof block.text !== "string" || !block.text.trim())
      throw new Error(`${fileName}: section text must be nonempty`);
    const conditions = object(block.whenEnv === undefined ? {} : block.whenEnv, "whenEnv");
    for (const [name, expected] of Object.entries(conditions)) {
      if (
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
        (typeof expected !== "string" && expected !== true)
      )
        throw new Error(`${fileName}: whenEnv values must be strings or true`);
    }
    ids.add(block.id);
    return { id: block.id, text: block.text, whenEnv: conditions as Section["whenEnv"] };
  });
  return { enabled: config.enabled ?? true, sections };
}

export function registerPolicy(
  pi: ExtensionAPI,
  config: Policy,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!config.enabled || !config.sections.length) return;
  pi.on("before_agent_start", (event) => {
    for (const block of config.sections) {
      const matches = Object.entries(block.whenEnv).every(
        ([name, expected]) =>
          Object.hasOwn(env, name) &&
          (expected === true ? Boolean(env[name]) : env[name] === expected),
      );
      if (matches) event.systemPromptOptions.sections[`context-policy-${block.id}`] = block.text;
    }
  });
}

export default async function contextPolicy(pi: ExtensionAPI) {
  let value: unknown = {};
  try {
    value = JSON.parse(
      (await readFile(join(getAgentDir(), fileName), "utf8")).replace(/^\uFEFF/, ""),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  registerPolicy(pi, parsePolicy(value));
}
