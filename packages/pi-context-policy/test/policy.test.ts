import { expect, test } from "vite-plus/test";
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
  for (const env of [
    { HERDR_ENV: "1", HERDR_PANE_ID: "fixture" },
    { HC_TERMINAL_ID: "fixture", HC_TERMINAL_SOCKET: "/fixture/core.sock" },
  ]) {
    expect(harness({ enabled: false }, env)()).toEqual({});
    expect(harness({ sections: [] }, env)()).toEqual({});
  }
});

test("legacy defaults require both environment conditions and preserve native sections", () => {
  for (const flag of [undefined, "0", "1"])
    for (const pane of [undefined, "", "fixture"]) {
      const result = harness({}, { HERDR_ENV: flag, HERDR_PANE_ID: pane })({ herdr: "native" });
      expect(result.herdr).toBe("native");
      expect(Object.keys(result)).toEqual(
        flag === "1" && pane ? ["herdr", "context-policy-herdr-tui"] : ["herdr"],
      );
    }
});

test("Core defaults require both terminal identity and socket", () => {
  for (const terminal of [undefined, "", "fixture"])
    for (const socket of [undefined, "", "/fixture/core.sock"]) {
      const result = harness({}, { HC_TERMINAL_ID: terminal, HC_TERMINAL_SOCKET: socket })();
      expect(Object.keys(result)).toEqual(terminal && socket ? ["context-policy-herdr-core"] : []);
    }
});

test("Core takes precedence over inherited legacy markers on each turn", () => {
  const env: NodeJS.ProcessEnv = {
    HC_TERMINAL_ID: "fixture",
    HC_TERMINAL_SOCKET: "/fixture/core.sock",
    HERDR_ENV: "1",
    HERDR_PANE_ID: "legacy",
  };
  const apply = harness({}, env);
  expect(Object.keys(apply())).toEqual(["context-policy-herdr-core"]);
  delete env.HC_TERMINAL_SOCKET;
  expect(Object.keys(apply())).toEqual(["context-policy-herdr-tui"]);
});

test("configured sections use a private namespace, preserve other sections and are idempotent", () => {
  const apply = harness(
    {
      sections: [
        { id: "team", text: "Use the documented team conventions." },
        { id: "second", text: "second configured section" },
      ],
    },
    {
      HERDR_ENV: "1",
      HERDR_PANE_ID: "legacy",
      HC_TERMINAL_ID: "fixture",
      HC_TERMINAL_SOCKET: "/fixture/core.sock",
    },
  );
  const sections = apply({ herdr: "host instructions", preamble: "native preamble" });
  expect(sections).toEqual({
    herdr: "host instructions",
    preamble: "native preamble",
    "context-policy-team": "Use the documented team conventions.",
    "context-policy-second": "second configured section",
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
    { sections: [{ id: "x", text: "x", whenEnv: { FEATURE: 0 } }] },
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
  expect(
    harness(
      {},
      Object.create({ HC_TERMINAL_ID: "fixture", HC_TERMINAL_SOCKET: "/fixture/core.sock" }),
    )(),
  ).toEqual({});
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
