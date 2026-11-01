import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import dropSession from "../index.ts";

type Run = NonNullable<Parameters<typeof dropSession>[1]>;
type Handler = (args: string, ctx: ExtensionCommandContext) => Promise<void>;
type NewSessionOptions = NonNullable<Parameters<ExtensionCommandContext["newSession"]>[0]>;
type FreshContext = Parameters<NonNullable<NewSessionOptions["withSession"]>>[0];
let directory: string;
let oldFile: string;
let originalPath: string | undefined;
let originalAgentDir: string | undefined;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "pi-drop-session-"));
  oldFile = join(directory, "old session.jsonl");
  writeFileSync(oldFile, "fixture session");
  originalPath = process.env.PATH;
  originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PATH = directory;
  process.env.PI_CODING_AGENT_DIR = directory;
});

afterEach(() => {
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  rmSync(directory, { recursive: true, force: true });
});

function configure(value: unknown) {
  writeFileSync(join(directory, "pi-drop-session.json"), JSON.stringify(value));
}

function executable(name = "trash") {
  const file = join(directory, name);
  writeFileSync(file, "fixture executable; only used with a stub");
  chmodSync(file, 0o700);
  return file;
}

function setup(
  options: {
    run?: Run;
    real?: boolean;
    cancelled?: boolean;
    failCreation?: boolean;
    sessionFile?: string | null;
  } = {},
) {
  let handler: Handler | undefined;
  let replaced = false;
  let switches = 0;
  const events: string[] = [];
  const calls: Parameters<Run>[] = [];
  const notices: { context: string; text: string; level: string }[] = [];
  const ui = (context: string) => ({
    notify(text: string, level: string) {
      notices.push({ context, text, level });
    },
  });
  const run: Run = async (...args) => {
    events.push("run");
    calls.push(args);
    await options.run?.(...args);
  };
  // Only registerCommand exists: registering a tool or hook would fail this stub.
  dropSession(
    {
      registerCommand(name, command) {
        expect(name).toBe("drop");
        expect(handler).toBeUndefined();
        handler = command.handler;
      },
    } as ExtensionAPI,
    options.real ? undefined : run,
  );
  const ctx = new Proxy(
    {
      cwd: directory,
      ui: ui("old"),
      sessionManager: {
        getSessionFile() {
          events.push("file");
          return options.sessionFile === undefined ? oldFile : options.sessionFile;
        },
      },
      async waitForIdle() {
        events.push("idle");
      },
      async newSession(optionsForSession: NewSessionOptions) {
        switches++;
        events.push("new");
        expect(calls).toHaveLength(0);
        if (options.failCreation) throw new Error("fixture creation failed");
        if (options.cancelled) return { cancelled: true };
        replaced = true;
        await optionsForSession.withSession?.({ ui: ui("fresh") } as FreshContext);
        return { cancelled: false };
      },
    },
    {
      get(target, key, receiver) {
        if (replaced) throw new Error(`stale context access: ${String(key)}`);
        return Reflect.get(target, key, receiver);
      },
    },
  ) as unknown as ExtensionCommandContext;
  return {
    invoke: () => handler!("", ctx),
    registered: () => !!handler,
    switches: () => switches,
    calls,
    notices,
    events,
  };
}

test("missing config uses native agent-dir override, PATH lookup, defaults and a fresh context", async () => {
  const command = executable();
  const state = setup();
  await state.invoke();
  expect(state.calls).toEqual([[command, [oldFile], 5000]]);
  expect(state.events).toEqual(["idle", "file", "new", "run"]);
  expect(state.notices).toEqual([
    {
      context: "fresh",
      text: `Session moved to trash: ${oldFile}`,
      level: "info",
    },
  ]);
  expect(readFileSync(oldFile, "utf8")).toBe("fixture session");
});

test("disabled configuration registers nothing", () => {
  configure({ enabled: false });
  expect(setup().registered()).toBe(false);
});

test.each(["missing", "not executable", "directory"])(
  "%s dependency never changes the session",
  async (kind) => {
    if (kind === "not executable") chmodSync(executable(), 0o600);
    if (kind === "directory") mkdirSync(join(directory, "trash"));
    const state = setup();
    await state.invoke();
    expect(state.switches()).toBe(0);
    expect(state.calls).toHaveLength(0);
    expect(state.notices[0]).toMatchObject({ context: "old", level: "error" });
    expect(state.notices[0]!.text).toContain("not executable");
    expect(existsSync(oldFile)).toBe(true);
  },
);

test("PATH lookup skips a nonexecutable candidate and invokes the checked absolute path", async () => {
  const first = join(directory, "first");
  mkdirSync(first);
  writeFileSync(join(first, "trash"), "not executable");
  process.env.PATH = `${first}:${directory}`;
  const command = executable();
  const state = setup();
  await state.invoke();
  expect(state.calls[0]![0]).toBe(command);
});

test.each([undefined, ""])("PATH=%j never guesses the current directory", async (path) => {
  executable();
  if (path === undefined) delete process.env.PATH;
  else process.env.PATH = path;
  const state = setup();
  await state.invoke();
  expect(state.switches()).toBe(0);
  expect(state.calls).toHaveLength(0);
  expect(state.notices[0]).toMatchObject({ context: "old", level: "error" });
  expect(state.notices[0]!.text).toContain("PATH is unset or empty");
  expect(existsSync(oldFile)).toBe(true);
});

test("an explicit executable path works without PATH", async () => {
  const command = executable();
  configure({ command: [command] });
  delete process.env.PATH;
  const state = setup();
  await state.invoke();
  expect(state.calls[0]![0]).toBe(command);
});

test("an explicit empty entry in a nonempty PATH still searches the current directory", async () => {
  const command = executable();
  process.env.PATH = `${join(directory, "missing")}:`;
  const state = setup();
  await state.invoke();
  expect(state.calls[0]![0]).toBe(command);
});

test("relative executable with spaces, prefix argv and leading-dash session paths stay literal", async () => {
  const command = executable("trash tool");
  const operand = "-old session;$(touch injected).jsonl";
  writeFileSync(join(directory, operand), "fixture");
  configure({ command: ["./trash tool", "--flag", "", "$(touch injected)"], timeoutMs: 42 });
  const state = setup({ sessionFile: operand });
  await state.invoke();
  expect(state.calls).toEqual([
    [command, ["--flag", "", "$(touch injected)", join(directory, operand)], 42],
  ]);
  expect(existsSync(join(directory, "injected"))).toBe(false);
});

test("an in-memory session does not start a new session or require trash", async () => {
  const state = setup({ sessionFile: null });
  await state.invoke();
  expect(state.switches()).toBe(0);
  expect(state.notices[0]!.level).toBe("warning");
});

test("cancelling creation keeps the old session and never runs trash", async () => {
  executable();
  const state = setup({ cancelled: true });
  await state.invoke();
  expect(state.calls).toHaveLength(0);
  expect(state.notices).toEqual([{ context: "old", text: "Drop cancelled", level: "info" }]);
  expect(existsSync(oldFile)).toBe(true);
});

test("creation failure propagates without trashing the old session", async () => {
  executable();
  const state = setup({ failCreation: true });
  await expect(state.invoke()).rejects.toThrow("fixture creation failed");
  expect(state.calls).toHaveLength(0);
  expect(existsSync(oldFile)).toBe(true);
});

test("command failure uses the fresh context and gives recovery instructions without deleting", async () => {
  executable();
  const state = setup({
    run: async () => {
      throw new Error("fixture failure");
    },
  });
  await state.invoke();
  expect(state.notices[0]).toMatchObject({ context: "fresh", level: "error" });
  expect(state.notices[0]!.text).toContain("fixture failure");
  expect(state.notices[0]!.text).toContain("/resume");
  expect(state.notices[0]!.text).toContain(oldFile);
  expect(existsSync(oldFile)).toBe(true);
});

test.each(["already absent", "moved before failure"])(
  "%s session file makes command failure an idempotent completion, not a false /resume hint",
  async (kind) => {
    executable();
    if (kind === "already absent") rmSync(oldFile);
    const state = setup({
      run: async () => {
        if (kind === "moved before failure") rmSync(oldFile);
        throw new Error("fixture command failed after file disappeared");
      },
    });
    await state.invoke();
    expect(state.switches()).toBe(1);
    expect(state.calls).toHaveLength(1);
    expect(state.notices[0]).toMatchObject({ context: "fresh", level: "info" });
    expect(state.notices[0]!.text).toContain("already absent");
    expect(state.notices[0]!.text).not.toContain("/resume");
    expect(existsSync(oldFile)).toBe(false);
  },
);

test.each(
  [
    null,
    [],
    true,
    { extra: true },
    { enabled: "false" },
    { command: [] },
    { command: "trash" },
    { command: [""] },
    { command: [" "] },
    { command: ["trash", 1] },
    { command: ["trash\0"] },
    { command: ["trash", "\0"] },
    { timeoutMs: 0 },
    { timeoutMs: -1 },
    { timeoutMs: 1.5 },
    { timeoutMs: 60_001 },
    { timeoutMs: "5000" },
  ].map((value) => [value]),
)("invalid configuration %j reports its file instead of registering", (value) => {
  configure(value);
  expect(() => setup()).toThrow("pi-drop-session.json:");
});

test("malformed JSON is visible and non-missing read errors propagate", () => {
  const file = join(directory, "pi-drop-session.json");
  writeFileSync(file, "{");
  expect(() => setup()).toThrow("invalid JSON");
  rmSync(file);
  mkdirSync(file);
  expect(() => setup()).toThrow();
});

test("a UTF-8 BOM is accepted without losing configuration values", async () => {
  executable();
  writeFileSync(join(directory, "pi-drop-session.json"), '\uFEFF{"timeoutMs":42}');
  const state = setup();
  await state.invoke();
  expect(state.calls[0]![2]).toBe(42);
});

test.each([1, 60_000])("timeout limit %i is accepted", async (timeoutMs) => {
  executable();
  configure({ timeoutMs });
  const state = setup();
  await state.invoke();
  expect(state.calls[0]![2]).toBe(timeoutMs);
});

function script(body: string) {
  const file = join(directory, "fixture child.js");
  writeFileSync(file, body);
  return file;
}

test("real execFile passes shell syntax literally and awaits successful completion", async () => {
  const output = join(directory, "arguments.json");
  const marker = join(directory, "should-not-exist");
  const literal = `$(touch ${marker}); echo unwanted`;
  configure({
    command: [
      process.execPath,
      script(
        "require('node:fs').writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)))",
      ),
      output,
      literal,
    ],
  });
  const state = setup({ real: true });
  await state.invoke();
  expect(JSON.parse(readFileSync(output, "utf8"))).toEqual([literal, oldFile]);
  expect(existsSync(marker)).toBe(false);
  expect(state.notices[0]).toMatchObject({ context: "fresh", level: "info" });
});

test("a real nonzero subprocess preserves the old fixture and reports stderr", async () => {
  configure({
    command: [process.execPath, script("console.error('fixture child failed'); process.exit(7)")],
  });
  const state = setup({ real: true });
  await state.invoke();
  expect(state.notices[0]).toMatchObject({ context: "fresh", level: "error" });
  expect(state.notices[0]!.text).toContain("fixture child failed");
  expect(state.notices[0]!.text).toContain("/resume");
  expect(existsSync(oldFile)).toBe(true);
});

test("a real subprocess times out without a delete fallback", async () => {
  configure({ command: [process.execPath, script("setInterval(() => {}, 1000)")], timeoutMs: 100 });
  const state = setup({ real: true });
  const started = Date.now();
  await state.invoke();
  expect(Date.now() - started).toBeLessThan(3000);
  expect(state.notices[0]).toMatchObject({ context: "fresh", level: "error" });
  expect(state.notices[0]!.text).toContain("/resume");
  expect(existsSync(oldFile)).toBe(true);
});

test("timeout forcibly stops a Node process that ignores SIGTERM", async () => {
  const node = execFileSync("node", ["-p", "process.execPath"], {
    encoding: "utf8",
    env: { ...process.env, PATH: originalPath },
  }).trim();
  const pidFile = join(directory, "stubborn-child.pid");
  configure({
    command: [
      node,
      script(
        [
          'process.on("SIGTERM", () => {});',
          'require("node:fs").writeFileSync(process.argv[2], String(process.pid));',
          "setInterval(() => {}, 1000);",
        ].join("\n"),
      ),
      pidFile,
    ],
    timeoutMs: 250,
  });
  const state = setup({ real: true });
  let settled = false;
  const invocation = state.invoke().finally(() => {
    settled = true;
  });
  let guard: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      invocation,
      new Promise<never>((_resolve, reject) => {
        guard = setTimeout(() => reject(new Error("timeout did not terminate the child")), 1500);
      }),
    ]);
    expect(existsSync(pidFile)).toBe(true);
    expect(state.notices[0]).toMatchObject({ context: "fresh", level: "error" });
    expect(state.notices[0]!.text).toContain("/resume");
    expect(readFileSync(oldFile, "utf8")).toBe("fixture session");
  } finally {
    clearTimeout(guard);
    if (!settled && existsSync(pidFile)) {
      try {
        process.kill(Number(readFileSync(pidFile, "utf8")), "SIGKILL");
      } catch (error) {
        expect((error as NodeJS.ErrnoException).code).toBe("ESRCH");
      }
    }
    await invocation;
  }
});
