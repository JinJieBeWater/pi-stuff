import { expect, test } from "vite-plus/test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import toolExposure, { parseExposureConfig, registerAdapters, withExposure } from "../index.ts";

const config = (source: string, tools: Record<string, string> = { fixture_tool: "deferred" }) =>
  parseExposureConfig({ adapters: [{ source, tools }] });
const definition = (name: string, exposure?: string) =>
  ({
    name,
    exposure,
    execute: async () => ({ content: [] }),
    parameters: { type: "object" },
    renderCall: () => ({ render: () => [] }),
  }) as unknown as ToolDefinition;

function collector() {
  const tools: ToolDefinition[] = [],
    commands: string[] = [];
  const pi = {
    registerTool(tool: ToolDefinition) {
      tools.push(tool);
    },
    registerCommand(name: string) {
      commands.push(name);
    },
  } as unknown as ExtensionAPI;
  return { pi, tools, commands };
}

async function fixture(run: (directory: string, source: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "pi-exposure-test-"));
  const source = join(directory, "upstream");
  await mkdir(source);
  await writeFile(
    join(source, "package.json"),
    JSON.stringify({
      name: "fixture-upstream",
      type: "module",
      pi: { extensions: ["./entry.mjs"] },
    }),
  );
  await writeFile(
    join(source, "entry.mjs"),
    'export default function(pi) { pi.registerTool({name:"fixture_tool",execute:async()=>({content:[]}),parameters:{type:"object"}}); pi.registerCommand("fixture-command",{handler:async()=>{}}); }',
  );
  try {
    await run(directory, source);
  } finally {
    await rm(directory, { recursive: true });
  }
}

test("defaults, disabled config and strict validation", () => {
  expect(parseExposureConfig({})).toEqual({ enabled: true, adapters: [] });
  expect(parseExposureConfig({ enabled: false })).toEqual({ enabled: false, adapters: [] });
  for (const value of [
    null,
    [],
    { typo: [] },
    { enabled: 1 },
    { adapters: {} },
    { adapters: null },
    { adapters: [null] },
    { adapters: [{ source: "", tools: {} }] },
    { adapters: [{ source: "x", tools: {} }] },
    { adapters: [{ source: "x", tools: { x: "hidden" } }] },
    { adapters: [{ source: "x", tools: { x: "direct" }, entry: "private-path" }] },
    {
      adapters: [
        { source: "x", tools: { x: "direct" } },
        { source: "x", tools: { y: "direct" } },
      ],
    },
    {
      adapters: [
        { source: "x", tools: { x: "direct" } },
        { source: "y", tools: { x: "direct" } },
      ],
    },
  ])
    expect(() => parseExposureConfig(value)).toThrow("pi-tool-exposure.json");
});

test("registration wrapper preserves implementation and upstream-managed exposure", () => {
  for (const requested of ["direct", "deferred", "model-only"] as const) {
    const { pi, tools } = collector();
    const original = definition("target");
    withExposure(pi, { target: requested }).registerTool(original);
    expect(tools[0]!.exposure).toBe(requested);
    expect(tools[0]!.execute).toBe(original.execute);
    expect(tools[0]!.parameters).toBe(original.parameters);
    expect(tools[0]!.renderCall).toBe(original.renderCall);
  }
  for (const upstream of ["deferred", "hidden", "codemode", "model-only"]) {
    const { pi, tools } = collector();
    const original = definition("target", upstream);
    withExposure(pi, { target: "direct" }).registerTool(original);
    expect(tools[0]).toBe(original);
  }
  const { pi, tools } = collector();
  const original = definition("toString");
  withExposure(pi, { target: "deferred" }).registerTool(original);
  expect(tools[0]).toBe(original);
});

test("one factory can update its tools without losing the exposure policy", () => {
  const { pi, tools } = collector();
  const first = withExposure(pi, { fixture_tool: "deferred" });
  first.registerTool(definition("fixture_tool"));
  const updated = { ...definition("fixture_tool"), description: "updated schema" };
  first.registerTool(updated);
  expect(tools[1]!.description).toBe("updated schema");
  expect(tools[1]!.exposure).toBe("deferred");
});

test("native package discovery follows manifest entries without configured source-file paths", async () => {
  await fixture(async (directory, source) => {
    const settings = JSON.stringify({ packages: [{ source, extensions: [] }] });
    await writeFile(join(directory, "settings.json"), settings);
    const first = collector();
    await registerAdapters(first.pi, config(source), directory);
    expect(first.tools.map((tool) => [tool.name, tool.exposure])).toEqual([
      ["fixture_tool", "deferred"],
    ]);
    expect(first.commands).toEqual(["fixture-command"]);
    await mkdir(join(source, "nested"));
    await writeFile(
      join(source, "nested/new-entry.mjs"),
      'export default pi => pi.registerTool({name:"fixture_tool",execute:async()=>({content:[]}),parameters:{type:"object"}});',
    );
    await writeFile(
      join(source, "package.json"),
      JSON.stringify({
        name: "fixture-upstream",
        type: "module",
        pi: { extensions: ["./nested/new-entry.mjs"] },
      }),
    );
    const second = collector();
    await registerAdapters(second.pi, config(source), directory);
    expect(second.tools[0]!.exposure).toBe("deferred");
    expect(await readFile(join(directory, "settings.json"), "utf8")).toBe(settings);
  });
});

test("native autoload must be explicitly disabled, and conflicts fail before factory execution", async () => {
  await fixture(async (directory, source) => {
    for (const entry of [source, { source }, { source, extensions: ["**"] }]) {
      await writeFile(join(directory, "settings.json"), JSON.stringify({ packages: [entry] }));
      const { pi, tools } = collector();
      await expect(registerAdapters(pi, config(source), directory)).rejects.toThrow(
        "extensions: []",
      );
      expect(tools).toEqual([]);
    }
  });
});

test("missing packages, physical aliases, empty manifests and invalid factories fail visibly", async () => {
  await fixture(async (directory, source) => {
    await expect(
      registerAdapters(collector().pi, config(join(directory, "missing")), directory),
    ).rejects.toThrow("install the package directory first");
    const alias = join(directory, "alias");
    await symlink(source, alias, "dir");
    await expect(
      registerAdapters(
        collector().pi,
        parseExposureConfig({
          adapters: [
            { source, tools: { fixture_tool: "direct" } },
            { source: alias, tools: { other: "direct" } },
          ],
        }),
        directory,
      ),
    ).rejects.toThrow("same package");
    await writeFile(
      join(source, "package.json"),
      JSON.stringify({ name: "fixture-upstream", pi: { extensions: [] } }),
    );
    await expect(registerAdapters(collector().pi, config(source), directory)).rejects.toThrow(
      "no package extensions discovered",
    );
    await writeFile(
      join(source, "package.json"),
      JSON.stringify({ name: "fixture-upstream", pi: { extensions: ["./bad.mjs"] } }),
    );
    await writeFile(join(source, "bad.mjs"), 'export default "not a factory";');
    await expect(registerAdapters(collector().pi, config(source), directory)).rejects.toThrow(
      "extension factory",
    );
  });
});

test("different manifest entries cannot silently replace a previously adapted tool", async () => {
  await fixture(async (directory, source) => {
    await writeFile(
      join(source, "second.mjs"),
      'export default pi => pi.registerTool({name:"fixture_tool",execute:async()=>({content:[]}),parameters:{type:"object"}});',
    );
    await writeFile(
      join(source, "package.json"),
      JSON.stringify({
        name: "fixture-upstream",
        pi: { extensions: ["./entry.mjs", "./second.mjs"] },
      }),
    );
    await expect(registerAdapters(collector().pi, config(source), directory)).rejects.toThrow(
      "duplicate adapted tool",
    );
  });
});

test("native entry handles missing config without work and rejects invalid JSON", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-exposure-config-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = directory;
  try {
    const { pi, tools } = collector();
    await toolExposure(pi);
    expect(tools).toEqual([]);
    await writeFile(join(directory, "pi-tool-exposure.json"), "{");
    await expect(toolExposure(pi)).rejects.toThrow();
    await registerAdapters(
      pi,
      { enabled: false, adapters: [{ source: "missing", tools: { missing: "direct" } }] },
      directory,
    );
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(directory, { recursive: true });
  }
});
