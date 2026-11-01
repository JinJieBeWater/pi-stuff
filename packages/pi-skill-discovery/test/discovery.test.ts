import { afterEach, expect, test } from "vite-plus/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateToolArguments } from "@earendil-works/pi-ai";
import {
  DefaultResourceLoader,
  ExtensionRunner,
  SessionManager,
  SettingsManager,
  type ExtensionToolContext,
  type ModelRegistry,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import skillDiscovery from "../index.ts";

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const directories: string[] = [];
afterEach(async () => {
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function temp() {
  const directory = await mkdtemp(join(tmpdir(), "pi-skill-discovery-"));
  directories.push(directory);
  return directory;
}

const skill = (name: string, description: string, disableModelInvocation = false): Skill => ({
  name,
  description,
  disableModelInvocation,
  filePath: `/fixture-skills/${name}/SKILL.md`,
  baseDir: `/fixture-skills/${name}`,
  sourceInfo: {
    path: `/fixture-skills/${name}`,
    source: "fixture",
    scope: "temporary",
    origin: "top-level",
  },
});
type SearchResult = {
  matches: { name: string; description: string; path: string }[];
  truncated: boolean;
};

async function fixture(config?: string, nativeSkills: Skill[] = []) {
  const directory = await temp();
  process.env.PI_CODING_AGENT_DIR = directory;
  if (config !== undefined) await writeFile(join(directory, "pi-skill-discovery.json"), config);
  const loader = new DefaultResourceLoader({
    cwd: directory,
    agentDir: directory,
    settingsManager: SettingsManager.inMemory({}),
    noExtensions: true,
    noSkills: true,
    noThemes: true,
    noPromptTemplates: true,
    noContextFiles: true,
    extensionFactories: [skillDiscovery],
    skillsOverride: () => ({ skills: nativeSkills, diagnostics: [] }),
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  let sessionId = "session-a";
  let cwd = directory;
  // Only session identity and cwd are used; no model runtime or credentials are created.
  const context = () =>
    ({ cwd, sessionManager: { getSessionId: () => sessionId } }) as ExtensionToolContext;
  const runner = new ExtensionRunner(
    loaded.extensions,
    loaded.runtime,
    directory,
    SessionManager.inMemory(directory),
    {} as ModelRegistry,
  );
  runner.createContext = context;
  runner.onError((error) => {
    throw new Error(JSON.stringify(error));
  });
  const definition = loaded.extensions
    .flatMap((extension) => [...extension.tools.values()])
    .map((tool) => tool.definition)
    .find((tool) => tool.name === "skill_search");
  return {
    directory,
    loader,
    definition,
    errors: loaded.errors,
    async prepare(skills = loader.getSkills().skills, promptGuidelines: string[] = []) {
      return (
        await runner.emitBeforeAgentStart(
          { messageType: "user", prompt: "fixture" },
          { cwd, skills, promptGuidelines },
        )
      ).systemPromptOptions;
    },
    async search(query: string): Promise<SearchResult> {
      if (!definition) throw new Error("skill_search not registered");
      const result = await definition.execute(
        "fixture-search",
        { query },
        undefined,
        undefined,
        context(),
      );
      const text = result.content.find((item) => item.type === "text");
      if (!text || text.type !== "text") throw new Error("missing search text");
      expect(JSON.parse(text.text)).toEqual(result.structuredContent);
      return result.structuredContent as SearchResult;
    },
    switchSession(id: string) {
      sessionId = id;
    },
    changeCwd(path: string) {
      cwd = path;
    },
    shutdown: () => runner.emit({ type: "session_shutdown", reason: "quit" }),
  };
}

test("missing config defaults to all skills on demand, without changing the native registry", async () => {
  const native = [
    skill("alpha-workflow", "Create summaries"),
    skill("beta-workflow", "Edit diagrams"),
  ];
  const original = structuredClone(native);
  const f = await fixture(undefined, native);
  expect(f.errors).toEqual([]);
  const prepared = await f.prepare();
  expect(prepared.skills).toEqual([]);
  expect(f.loader.getSkills().skills).toEqual(original);
  expect(native).toEqual(original);
  expect((await f.search("alpha-workflow")).matches[0]?.name).toBe("alpha-workflow");
  expect(f.definition?.exposure).toBe("direct");
  expect(f.definition?.annotations).toEqual({
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  });
  expect(prepared.promptGuidelines.join(" ")).toContain("Handle ordinary questions directly");
  const refreshed = await f.prepare(native, prepared.promptGuidelines);
  expect(refreshed.promptGuidelines).toEqual(prepared.promptGuidelines);
});

test("BOM config selects core metadata; manual-only skills remain native but never searchable", async () => {
  const native = [
    skill("alpha-core", "Core workflow"),
    skill("beta-core", "Second core workflow"),
    skill("gamma-demand", "Make a diagram"),
    skill("delta-manual", "Private diagram workflow", true),
  ];
  const original = structuredClone(native);
  const f = await fixture(
    '\uFEFF{"coreSkills":["beta-core","delta-manual"],"maxResults":2}',
    native,
  );
  expect(f.errors).toEqual([]);
  expect((await f.prepare()).skills.map((item) => item.name)).toEqual(["beta-core"]);
  expect(native).toEqual(original);
  expect(f.loader.getSkills().skills).toEqual(original);
  expect((await f.search("alpha-core")).matches[0]?.name).toBe("alpha-core");
  expect(await f.search("delta-manual")).toEqual({ matches: [], truncated: false });
  expect(await f.search("diagram")).toEqual({
    matches: [
      {
        name: "gamma-demand",
        description: "Make a diagram",
        path: "/fixture-skills/gamma-demand/SKILL.md",
      },
    ],
    truncated: false,
  });
});

test("empty config uses defaults and enabled false leaves prompt and tools untouched", async () => {
  const defaults = await fixture("{}");
  expect(defaults.errors).toEqual([]);
  await defaults.prepare(
    Array.from({ length: 6 }, (_, i) => skill(`report-${i}`, "Generate reports")),
  );
  expect((await defaults.search("report")).matches).toHaveLength(5);
  const native = [skill("alpha-workflow", "Example")];
  const disabled = await fixture('{"enabled":false}', native);
  expect(disabled.errors).toEqual([]);
  expect(disabled.definition).toBeUndefined();
  const prompt = await disabled.prepare();
  expect(prompt.skills).toEqual(native);
  expect(prompt.promptGuidelines).toEqual([]);
});

test("invalid configuration reports the config path and reason instead of silently defaulting", async () => {
  const invalid: [string, string][] = [
    ["{", "valid JSON"],
    ["null", "object"],
    ["[]", "object"],
    ["true", "object"],
    ['{"extra":true}', "unknown field: extra"],
    ['{"enabled":0}', "enabled must be a boolean"],
    ['{"coreSkills":null}', "array"],
    ['{"coreSkills":[""]}', "non-empty"],
    ['{"coreSkills":["   "]}', "non-empty"],
    ['{"coreSkills":[1]}', "non-empty"],
    ...[" alpha", "alpha ", "\talpha", "alpha\u00a0"].map(
      (name) =>
        [JSON.stringify({ coreSkills: [name] }), "without surrounding whitespace"] as [
          string,
          string,
        ],
    ),
    ['{"coreSkills":["alpha","alpha"]}', "duplicate"],
    ...[0, 21, 1.5, null, "5"].map(
      (value) =>
        [JSON.stringify({ maxResults: value }), "integer from 1 to 20"] as [string, string],
    ),
  ];
  for (const [config, reason] of invalid) {
    const f = await fixture(config);
    expect(f.definition).toBeUndefined();
    expect(f.errors).toHaveLength(1);
    expect(f.errors[0]?.error).toContain(join(f.directory, "pi-skill-discovery.json"));
    expect(f.errors[0]?.error).toContain(reason);
  }
});

test("non-ENOENT configuration read errors are not swallowed", async () => {
  const directory = await temp();
  process.env.PI_CODING_AGENT_DIR = directory;
  await mkdir(join(directory, "pi-skill-discovery.json"));
  expect(() => skillDiscovery({} as Parameters<typeof skillDiscovery>[0])).toThrow(/EISDIR/);
});

test("refreshes the complete eligible catalogue each turn and isolates session and cwd", async () => {
  const f = await fixture();
  expect(f.errors).toEqual([]);
  await expect(f.search("alpha")).rejects.toThrow("catalogue unavailable");
  await f.prepare([skill("alpha", "First workflow")]);
  f.switchSession("session-b");
  f.changeCwd(join(f.directory, "project-b"));
  await expect(f.search("alpha")).rejects.toThrow("catalogue unavailable");
  await f.prepare([skill("beta", "Second workflow")]);
  expect((await f.search("alpha")).matches).toEqual([]);
  f.switchSession("session-a");
  await expect(f.search("alpha")).rejects.toThrow("catalogue unavailable");
  f.changeCwd(f.directory);
  expect((await f.search("alpha")).matches[0]?.name).toBe("alpha");
  await f.prepare([skill("gamma", "Replacement workflow"), skill("alpha", "Now manual", true)]);
  expect((await f.search("alpha")).matches).toEqual([]);
  await f.shutdown();
  await expect(f.search("gamma")).rejects.toThrow("catalogue unavailable");
  f.switchSession("session-b");
  f.changeCwd(join(f.directory, "project-b"));
  expect((await f.search("beta")).matches[0]?.name).toBe("beta");
  f.changeCwd(join(f.directory, "project-c"));
  await f.prepare([skill("delta", "Different directory")]);
  f.changeCwd(join(f.directory, "project-b"));
  await expect(f.search("beta")).rejects.toThrow("catalogue unavailable");
});

test("bounds results, ranks exact names first, sorts ties, and normalizes width and case", async () => {
  for (const maxResults of [1, 3, 20]) {
    const f = await fixture(JSON.stringify({ maxResults }));
    await f.prepare(
      Array.from({ length: 21 }, (_, i) =>
        skill(`report-${String(i).padStart(2, "0")}`, "Report workflow"),
      ).reverse(),
    );
    const result = await f.search("report");
    expect(result.matches).toHaveLength(maxResults);
    expect(result.truncated).toBe(true);
    expect(result.matches[0]?.name).toBe("report-00");
    expect((await f.search("ＲＥＰＯＲＴ-２０")).matches[0]?.name).toBe("report-20");
    expect(f.definition?.outputSchema).toMatchObject({
      properties: { matches: { maxItems: maxResults } },
    });
  }
});

test("rejects empty and non-word queries; schema restricts length and extra fields", async () => {
  const f = await fixture();
  await f.prepare([skill("alpha", "Example workflow")]);
  for (const query of ["", "   ", "***", "😀"]) {
    await expect(f.search(query)).rejects.toThrow("query must contain task keywords");
  }
  const definition = f.definition!;
  const invalid: Record<string, string | number>[] = [
    { query: "" },
    { query: "a".repeat(257) },
    { query: "alpha", limit: 1 },
    {},
  ];
  for (const args of invalid) {
    expect(() =>
      validateToolArguments(definition, {
        type: "toolCall",
        id: "fixture",
        name: "skill_search",
        arguments: args,
      }),
    ).toThrow();
  }
  for (const query of ["a", "a".repeat(256)]) {
    expect(
      validateToolArguments(definition, {
        type: "toolCall",
        id: "fixture",
        name: "skill_search",
        arguments: { query },
      }),
    ).toEqual({ query });
  }
});

test("matches multilingual literal words but does not translate or infer semantic synonyms", async () => {
  const f = await fixture();
  await f.prepare([
    skill("diagram-workflow", "绘制流程图"),
    skill("summary-workflow", "Summarize a document"),
    skill("x", "A short name"),
  ]);
  expect((await f.search("流程图")).matches[0]?.name).toBe("diagram-workflow");
  expect((await f.search("x")).matches[0]?.name).toBe("x");
  expect(await f.search("flowchart")).toEqual({ matches: [], truncated: false });
  expect(await f.search("condense")).toEqual({ matches: [], truncated: false });
  expect(await f.search("zzqvunmatched")).toEqual({ matches: [], truncated: false });
});
