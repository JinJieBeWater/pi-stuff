import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import contextPolicy, { parsePolicy, registerPolicy } from "../index.ts";

function harness(value: unknown, env: NodeJS.ProcessEnv = {}) {
  let handler: ((event: any) => void) | undefined;
  registerPolicy(
    {
      on(name: string, callback: typeof handler) {
        expect(name).toBe("before_agent_start");
        handler = callback;
      },
    } as unknown as ExtensionAPI,
    parsePolicy(value),
    env,
  );
  return (sections: Record<string, string> = {}) => {
    const event = { systemPromptOptions: { sections } };
    handler?.(event);
    return event.systemPromptOptions.sections;
  };
}

test("outside Herdr, disabled and empty policies do nothing", () => {
  expect(harness({})({ existing: "keep" })).toEqual({ existing: "keep" });
  expect(harness({ enabled: false, sections: [{ id: "x", text: "unused" }] })()).toEqual({});
  const env = { HERDR_ENV: "1", HERDR_PANE_ID: "fixture" };
  expect(harness({ enabled: false }, env)()).toEqual({});
  expect(harness({ sections: [] }, env)()).toEqual({});
});

test("defaults describe Herdr and Shepherdr only when both environment conditions match", () => {
  for (const flag of [undefined, "0", "1"])
    for (const pane of [undefined, "", "fixture"]) {
      const result = harness({}, { HERDR_ENV: flag, HERDR_PANE_ID: pane })({ herdr: "native" });
      expect(result.herdr).toBe("native");
      if (flag === "1" && pane)
        expect(result["context-policy-herdr"]).toBe(
          "你当前运行在 Herdr 中，自动识别可以并发的任务，通过 Shepherdr 进行并发。",
        );
      else expect(result["context-policy-herdr"]).toBeUndefined();
    }
});

test("configured sections use a private namespace, preserve other sections and are idempotent", () => {
  const apply = harness(
    { sections: [{ id: "team", text: "Use the documented team conventions." }] },
    { HERDR_ENV: "1", HERDR_PANE_ID: "fixture" },
  );
  const sections = apply({ herdr: "host instructions", preamble: "native preamble" });
  expect(sections).toEqual({
    herdr: "host instructions",
    preamble: "native preamble",
    "context-policy-team": "Use the documented team conventions.",
  });
  expect(apply(sections)).toEqual(sections);
});

test("all environment conditions must match; true means nonempty, strings compare exactly", () => {
  const config = {
    sections: [
      { id: "conditional", text: "conditional text", whenEnv: { FEATURE: "1", INSTANCE: true } },
    ],
  };
  for (const flag of [undefined, "0", "1"])
    for (const instance of [undefined, "", "fixture"]) {
      const result = harness(config, { FEATURE: flag, INSTANCE: instance })();
      expect(Boolean(result["context-policy-conditional"])).toBe(flag === "1" && Boolean(instance));
    }
  const env = { FEATURE: "0", INSTANCE: "fixture" };
  const apply = harness(config, env);
  expect(apply()).toEqual({});
  env.FEATURE = "1";
  expect(apply()["context-policy-conditional"]).toBe("conditional text");
});

test("invalid shapes, unknown fields, duplicate ids and malformed conditions fail visibly", () => {
  for (const value of [
    null,
    [],
    { enable: true },
    { enabled: "yes" },
    { sections: {} },
    { sections: null },
    { sections: [null] },
    { sections: [{ id: "Bad", text: "x" }] },
    { sections: [{ id: "x", text: "" }] },
    { sections: [{ id: "x", text: "x", extra: 1 }] },
    { sections: [{ id: "x", text: "x", whenEnv: null }] },
    { sections: [{ id: "x", text: "x", whenEnv: { FEATURE: false } }] },
    { sections: [{ id: "x", text: "x", whenEnv: { "bad=name": "1" } }] },
    {
      sections: [
        { id: "x", text: "a" },
        { id: "x", text: "b" },
      ],
    },
  ])
    expect(() => parsePolicy(value)).toThrow("pi-context-policy.json");
});

test("inherited object properties are not environment variables", () => {
  const apply = harness(
    { sections: [{ id: "own", text: "restricted", whenEnv: { constructor: true } }] },
    {},
  );
  expect(apply()).toEqual({});
  const env: NodeJS.ProcessEnv = {};
  Object.defineProperty(env, "constructor", { value: "configured", enumerable: true });
  expect(
    harness(
      { sections: [{ id: "own", text: "restricted", whenEnv: { constructor: true } }] },
      env,
    )()["context-policy-own"],
  ).toBe("restricted");
});

test("native entry reads only the configured agent directory; missing file uses defaults, malformed file fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-context-policy-test-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = directory;
  let count = 0;
  const pi = {
    on() {
      count++;
    },
  } as unknown as ExtensionAPI;
  try {
    await contextPolicy(pi);
    expect(count).toBe(1);
    await writeFile(
      join(directory, "pi-context-policy.json"),
      '\uFEFF{"sections":[{"id":"sample","text":"configured"}]}',
    );
    await contextPolicy(pi);
    expect(count).toBe(2);
    await writeFile(join(directory, "pi-context-policy.json"), "{");
    await expect(contextPolicy(pi)).rejects.toThrow();
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(directory, { recursive: true });
  }
});
