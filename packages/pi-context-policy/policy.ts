export type WhenEnv = Record<string, string | boolean>;
type Section = { id: string; text: string; whenEnv: WhenEnv };
type Rule<Key extends string> = Record<Key, string> & { whenEnv: WhenEnv };
export type Policy = {
  enabled: boolean;
  sections?: Section[];
  extensions: Rule<"source">[];
  tools: Rule<"name">[];
  skills: Rule<"path">[];
};
export const fileName = "pi-context-policy.json";

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${fileName}: ${label} must be an object`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[], label: string) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw new Error(`${fileName}: unknown ${label} field ${key}`);
}
function conditions(value: unknown): WhenEnv {
  const result = object(value === undefined ? {} : value, "whenEnv");
  for (const [name, expected] of Object.entries(result)) {
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
      (typeof expected !== "string" && typeof expected !== "boolean")
    )
      throw new Error(`${fileName}: whenEnv values must be strings or booleans`);
  }
  return result as WhenEnv;
}
function rules<Key extends "source" | "name" | "path">(
  value: unknown,
  label: string,
  key: Key,
): Rule<Key>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${fileName}: ${label} must be an array`);
  const seen = new Set<string>();
  return value.map((entry) => {
    const rule = object(entry, label);
    keys(rule, [key, "whenEnv"], label);
    const target = rule[key];
    if (
      typeof target !== "string" ||
      !target.trim() ||
      target !== target.trim() ||
      seen.has(target)
    )
      throw new Error(`${fileName}: ${label}.${key} must be a unique nonempty string`);
    seen.add(target);
    return { [key]: target, whenEnv: conditions(rule.whenEnv) } as Rule<Key>;
  });
}

export function parsePolicy(value: unknown): Policy {
  const config = object(value, "config");
  keys(config, ["enabled", "sections", "extensions", "tools", "skills"], "config");
  if (config.enabled !== undefined && typeof config.enabled !== "boolean")
    throw new Error(`${fileName}: enabled must be a boolean`);
  const result: Policy = {
    enabled: config.enabled ?? true,
    extensions: rules(config.extensions, "extensions", "source"),
    tools: rules(config.tools, "tools", "name"),
    skills: rules(config.skills, "skills", "path"),
  };
  if (config.sections === undefined) return result;
  if (!Array.isArray(config.sections)) throw new Error(`${fileName}: sections must be an array`);
  const ids = new Set<string>();
  result.sections = config.sections.map((entry, index): Section => {
    const block = object(entry, `sections[${index}]`);
    keys(block, ["id", "text", "whenEnv"], `sections[${index}]`);
    if (typeof block.id !== "string" || !/^[a-z][a-z0-9_-]*$/.test(block.id) || ids.has(block.id))
      throw new Error(`${fileName}: section id must be a unique lowercase identifier`);
    if (typeof block.text !== "string" || !block.text.trim())
      throw new Error(`${fileName}: section text must be nonempty`);
    ids.add(block.id);
    return { id: block.id, text: block.text, whenEnv: conditions(block.whenEnv) };
  });
  return result;
}

export function matchesEnv(conditions: WhenEnv, env: NodeJS.ProcessEnv): boolean {
  return Object.entries(conditions).every(([name, expected]) => {
    const value = Object.hasOwn(env, name) ? env[name] : undefined;
    return typeof expected === "boolean" ? Boolean(value) === expected : value === expected;
  });
}
