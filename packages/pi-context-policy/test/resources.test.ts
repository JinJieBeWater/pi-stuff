import { expect, test } from "vite-plus/test";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  createAgentSession,
  createToolSearchExtension,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import contextPolicy from "../index.ts";
import skillDiscovery from "../../pi-skill-discovery/index.ts";
import { matchesEnv, parsePolicy } from "../policy.ts";
import { registerResources } from "../resources.ts";

async function fixture(
  run: (directory: string, source: string, skillPath: string) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "pi-policy-resources-"));
  const source = join(directory, "upstream");
  const skillPath = join(directory, "skills", "fixture-workflow");
  await mkdir(source);
  await mkdir(skillPath, { recursive: true });
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
    `
    import { writeFileSync } from "node:fs";
    writeFileSync(new URL("./imported", import.meta.url), "loaded");
    export default function(pi) {
      const tool = name => ({name, label:name, description:name, parameters:{type:"object"}, execute:async()=>({content:[],details:{ran:true}})});
      pi.registerTool(tool("always_tool"));
      pi.registerTool({...tool("conditional_tool"),exposure:"deferred"});
      pi.registerCommand("fixture-command", {handler:async()=>{}});
      pi.on("session_start", () => pi.registerTool({...tool("conditional_tool"),exposure:"deferred"}));
    }
  `,
  );
  await writeFile(
    join(skillPath, "SKILL.md"),
    "---\nname: fixture-workflow\ndescription: Fixture workflow\n---\nFixture body.\n",
  );
  await writeFile(
    join(directory, "settings.json"),
    JSON.stringify({
      packages: [{ source, extensions: [] }],
      skills: [`-${skillPath}`],
    }),
  );
  try {
    await run(directory, source, skillPath);
  } finally {
    await rm(directory, { recursive: true });
  }
}

function collector() {
  const tools: ToolDefinition[] = [],
    commands: string[] = [];
  const handlers = new Map<string, ((...args: any[]) => any)[]>();
  const pi = {
    registerTool(tool: ToolDefinition) {
      tools.push(tool);
    },
    registerCommand(name: string) {
      commands.push(name);
    },
    on(name: string, handler: (...args: any[]) => any) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
  } as unknown as ExtensionAPI;
  return { pi, tools, commands, handlers };
}

test("environment conditions support exact values, presence and absence without inherited properties", () => {
  for (const value of [undefined, "", "0", "1"]) {
    expect(matchesEnv({ CORE: true }, { CORE: value })).toBe(Boolean(value));
    expect(matchesEnv({ CORE: false }, { CORE: value })).toBe(!value);
    expect(matchesEnv({ CORE: "1" }, { CORE: value })).toBe(value === "1");
  }
  expect(matchesEnv({ TUI: "1", CORE: false }, { TUI: "1", CORE: "socket" })).toBe(false);
  expect(matchesEnv({ TUI: "1", CORE: false }, { TUI: "1" })).toBe(true);
  const inherited = Object.create({ CORE: "socket" });
  expect(matchesEnv({ CORE: true }, inherited)).toBe(false);
  expect(matchesEnv({ CORE: false }, inherited)).toBe(true);
});

test("resource rules reject malformed targets, duplicates, unknown fields and invalid conditions", () => {
  for (const [field, key] of [
    ["extensions", "source"],
    ["tools", "name"],
    ["skills", "path"],
  ] as const) {
    for (const entries of [
      null,
      {},
      [null],
      [{}],
      [{ [key]: "" }],
      [{ [key]: " padded " }],
      [{ [key]: "x", extra: 1 }],
      [{ [key]: "x", whenEnv: null }],
      [{ [key]: "x", whenEnv: { FLAG: 0 } }],
      [{ [key]: "x" }, { [key]: "x" }],
    ]) {
      expect(() => parsePolicy({ [field]: entries })).toThrow("pi-context-policy.json");
    }
  }
  expect(
    parsePolicy({ extensions: [{ source: "missing", whenEnv: { CORE: false } }] }).extensions,
  ).toEqual([{ source: "missing", whenEnv: { CORE: false } }]);
});

test("unmatched extensions are not imported, and may be absent on this machine", async () => {
  await fixture(async (directory, source) => {
    const c = collector();
    const config = parsePolicy({
      extensions: [
        { source, whenEnv: { ENABLED: true } },
        { source: join(directory, "not-installed"), whenEnv: { ENABLED: true } },
      ],
    });
    await registerResources(c.pi, config, directory, {});
    expect(c.tools).toEqual([]);
    expect(c.commands).toEqual([]);
    expect(c.handlers.size).toBe(0);
    await expect(access(join(source, "imported"))).rejects.toThrow();
  });
});

test("tool rules filter initial and later registrations without changing allowed definitions", async () => {
  await fixture(async (directory, source) => {
    const config = parsePolicy({
      extensions: [{ source }],
      tools: [{ name: "conditional_tool", whenEnv: { TOOL: "1" } }],
    });
    const disabled = collector();
    await registerResources(disabled.pi, config, directory, {});
    expect(disabled.tools.map((tool) => tool.name)).toEqual(["always_tool"]);
    expect(disabled.commands).toEqual(["fixture-command"]);
    await disabled.handlers.get("session_start")![0]!();
    expect(disabled.tools.map((tool) => tool.name)).toEqual(["always_tool"]);
    const enabled = collector();
    await registerResources(enabled.pi, config, directory, { TOOL: "1" });
    expect(enabled.tools.map((tool) => [tool.name, tool.exposure])).toEqual([
      ["always_tool", undefined],
      ["conditional_tool", "deferred"],
    ]);
    const tool = enabled.tools[1]!;
    expect(tool.parameters).toEqual({ type: "object" });
    expect((await tool.execute("fixture", {}, undefined, undefined, {} as any)).details).toEqual({
      ran: true,
    });
    await enabled.handlers.get("session_start")![0]!();
    expect(enabled.tools.at(-1)?.exposure).toBe("deferred");
  });
});

test("native entry must be disabled even when the environment does not match", async () => {
  await fixture(async (directory, source) => {
    for (const entry of [source, { source }, { source, extensions: ["**"] }]) {
      await writeFile(join(directory, "settings.json"), JSON.stringify({ packages: [entry] }));
      await expect(
        registerResources(
          collector().pi,
          parsePolicy({
            extensions: [{ source, whenEnv: { ENABLED: true } }],
          }),
          directory,
          {},
        ),
      ).rejects.toThrow("extensions: []");
      await expect(access(join(source, "imported"))).rejects.toThrow();
    }
  });
});

test("unmatched source aliases still require the native extension entry to be disabled", async () => {
  await fixture(async (directory, source) => {
    await writeFile(join(directory, "settings.json"), JSON.stringify({ packages: [source] }));
    const alias = join(directory, "alias");
    await symlink(source, alias, "dir");
    for (const target of [`${source}/.`, alias]) {
      await expect(
        registerResources(
          collector().pi,
          parsePolicy({
            extensions: [{ source: target, whenEnv: { ENABLED: true } }],
          }),
          directory,
          {},
        ),
      ).rejects.toThrow("extensions: []");
    }
    await expect(access(join(source, "imported"))).rejects.toThrow();
  });
});

test("a top-level skill exclusion does not suffice while a package skill entry remains enabled", async () => {
  await fixture(async (directory, source) => {
    const packageSkill = join(source, "skills", "package-workflow");
    await mkdir(packageSkill, { recursive: true });
    await writeFile(
      join(packageSkill, "SKILL.md"),
      "---\nname: package-workflow\ndescription: Package workflow\n---\nPackage body.\n",
    );
    await writeFile(
      join(source, "package.json"),
      JSON.stringify({
        pi: { extensions: ["./entry.mjs"], skills: ["./skills/package-workflow"] },
      }),
    );
    const config = parsePolicy({ skills: [{ path: packageSkill, whenEnv: { ENABLED: true } }] });
    await writeFile(
      join(directory, "settings.json"),
      JSON.stringify({
        packages: [{ source, extensions: [] }],
        skills: [`-${packageSkill}`],
      }),
    );
    await expect(registerResources(collector().pi, config, directory, {})).rejects.toThrow(
      "native skill",
    );
    await writeFile(
      join(directory, "settings.json"),
      JSON.stringify({
        packages: [{ source, extensions: [], skills: [] }],
        skills: [`-${packageSkill}`],
      }),
    );
    const disabled = collector();
    await registerResources(disabled.pi, config, directory, {});
    expect(disabled.handlers.has("resources_discover")).toBe(false);
    const enabled = collector();
    await registerResources(enabled.pi, config, directory, { ENABLED: "1" });
    expect(await enabled.handlers.get("resources_discover")![0]!()).toEqual({
      skillPaths: [packageSkill],
    });
  });
});

test("skill handoff requires a native exclusion; inactive paths may be missing", async () => {
  await fixture(async (directory, _source, skillPath) => {
    const config = parsePolicy({ skills: [{ path: skillPath, whenEnv: { SKILL: true } }] });
    await writeFile(join(directory, "settings.json"), "{}");
    await expect(registerResources(collector().pi, config, directory, {})).rejects.toThrow(
      "exclude the native skill path",
    );
    await writeFile(
      join(directory, "settings.json"),
      JSON.stringify({ skills: [`-${skillPath}`] }),
    );
    const c = collector();
    await registerResources(c.pi, config, directory, {});
    expect(c.handlers.has("resources_discover")).toBe(false);
    await rm(skillPath, { recursive: true });
    await registerResources(c.pi, config, directory, {});
    await expect(registerResources(c.pi, config, directory, { SKILL: "1" })).rejects.toThrow();
  });
});

test("self loading and duplicate normalized skill paths fail before factory execution", async () => {
  await fixture(async (directory, source, skillPath) => {
    await expect(
      registerResources(
        collector().pi,
        parsePolicy({ skills: [{ path: skillPath }, { path: `${skillPath}/.` }] }),
        directory,
        {},
      ),
    ).rejects.toThrow("duplicate skill path");
    await writeFile(
      join(source, "package.json"),
      JSON.stringify({
        pi: { extensions: ["./entry.mjs", fileURLToPath(new URL("../index.ts", import.meta.url))] },
      }),
    );
    await expect(
      registerResources(collector().pi, parsePolicy({ extensions: [{ source }] }), directory, {}),
    ).rejects.toThrow("cannot manage its own extension");
    await expect(access(join(source, "imported"))).rejects.toThrow();
  });
});

test("disabled policy performs no loading and orphan tool rules fail visibly", async () => {
  const c = collector();
  await registerResources(
    c.pi,
    parsePolicy({
      enabled: false,
      extensions: [{ source: "missing" }],
      skills: [{ path: "missing" }],
    }),
  );
  expect(c.handlers.size).toBe(0);
  await expect(
    registerResources(c.pi, parsePolicy({ tools: [{ name: "unmanaged" }] })),
  ).rejects.toThrow("require managed extensions");
});

test("native discovery exposes only matching skills and tools after a fresh load", async () => {
  await fixture(async (directory, source, skillPath) => {
    const before = await readFile(join(directory, "settings.json"), "utf8");
    const keys = ["PI_CODING_AGENT_DIR", "PI_POLICY_FIXTURE_ENABLED", "PI_POLICY_FIXTURE_TOOL"];
    const previous = keys.map((key) => process.env[key]);
    await writeFile(
      join(directory, "pi-context-policy.json"),
      JSON.stringify({
        sections: [],
        extensions: [{ source, whenEnv: { PI_POLICY_FIXTURE_ENABLED: true } }],
        tools: [{ name: "conditional_tool", whenEnv: { PI_POLICY_FIXTURE_TOOL: true } }],
        skills: [{ path: skillPath, whenEnv: { PI_POLICY_FIXTURE_ENABLED: true } }],
      }),
    );
    await writeFile(
      join(directory, "pi-skill-discovery.json"),
      JSON.stringify({ coreSkills: ["fixture-workflow"] }),
    );
    try {
      for (const [enabled, toolEnabled] of [
        [false, false],
        [true, false],
        [true, true],
      ] as const) {
        process.env.PI_CODING_AGENT_DIR = directory;
        process.env.PI_POLICY_FIXTURE_ENABLED = enabled ? "1" : "";
        process.env.PI_POLICY_FIXTURE_TOOL = toolEnabled ? "1" : "";
        const loader = new DefaultResourceLoader({
          cwd: directory,
          agentDir: directory,
          noExtensions: true,
          noThemes: true,
          noPromptTemplates: true,
          noContextFiles: true,
          extensionFactories: [contextPolicy, skillDiscovery, createToolSearchExtension()],
        });
        await loader.reload();
        const loaded = loader.getExtensions();
        expect(loaded.errors).toEqual([]);
        expect(loader.getSkills().skills.map((skill) => skill.name)).not.toContain(
          "fixture-workflow",
        );
        const baseline = loader
          .getSkills()
          .skills.map((skill) => skill.filePath)
          .toSorted();
        const modelRuntime = await ModelRuntime.create({
          authPath: join(directory, "auth.json"),
          modelsPath: null,
          modelsStorePath: join(directory, "model-cache"),
          allowModelNetwork: false,
          refreshOnCreate: false,
        });
        const { session } = await createAgentSession({
          cwd: directory,
          agentDir: directory,
          resourceLoader: loader,
          modelRuntime,
          sessionManager: SessionManager.inMemory(directory),
          settingsManager: SettingsManager.inMemory({}),
          noTools: "builtin",
        });
        try {
          const errors: unknown[] = [];
          session.extensionRunner.onError((error) => errors.push(error));
          await session.bindExtensions({});
          expect(
            loader
              .getSkills()
              .skills.filter((skill) => skill.name === "fixture-workflow")
              .map((skill) => skill.name),
          ).toEqual(enabled ? ["fixture-workflow"] : []);
          expect(
            loader
              .getSkills()
              .skills.filter((skill) => skill.name !== "fixture-workflow")
              .map((skill) => skill.filePath)
              .toSorted(),
          ).toEqual(baseline);
          expect(session.getAllTools().some((tool) => tool.name === "always_tool")).toBe(enabled);
          expect(session.getAllTools().some((tool) => tool.name === "conditional_tool")).toBe(
            toolEnabled,
          );
          const runner = session.extensionRunner;
          const prepared = await runner.emitBeforeAgentStart(
            { messageType: "user", prompt: "fixture" },
            {
              cwd: directory,
              skills: loader.getSkills().skills,
              selectedTools: session.getActiveToolNames(),
            },
          );
          expect(prepared.systemPromptOptions.skills.map((skill) => skill.name)).toEqual(
            enabled ? ["fixture-workflow"] : [],
          );
          const ctx = runner.createToolContext("fixture", undefined);
          const skillResult = await runner
            .getToolDefinition("skill_search")!
            .execute("fixture", { query: "fixture-workflow" }, undefined, undefined, ctx);
          expect(
            (skillResult.structuredContent as { matches: { name: string }[] }).matches
              .filter((skill) => skill.name === "fixture-workflow")
              .map((skill) => skill.name),
          ).toEqual(enabled ? ["fixture-workflow"] : []);
          await runner
            .getToolDefinition("tool_search")!
            .execute("fixture", { query: "conditional_tool" }, undefined, undefined, ctx);
          expect(session.getActiveToolNames().includes("conditional_tool")).toBe(toolEnabled);
          expect(errors).toEqual([]);
        } finally {
          await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
          session.dispose();
        }
      }
    } finally {
      keys.forEach((key, i) => {
        if (previous[i] === undefined) delete process.env[key];
        else process.env[key] = previous[i];
      });
    }
    expect(await readFile(join(directory, "settings.json"), "utf8")).toBe(before);
  });
});
