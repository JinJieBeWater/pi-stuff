import { afterEach, expect, test } from "vite-plus/test";
import { mkdtemp, readFile, rm, mkdir, writeFile, realpath, chmod, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { canonicalTarget, snapshotSession, relocate, marker } from "../move.ts";
import { acceptHandoff, finishHandoff } from "../receiver.ts";
import { createRuntime, type MoveRuntime } from "../runtime.ts";

const dirs: string[] = [];
const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
afterEach(async () => {
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "pi-move-unit-"));
  dirs.push(dir);
  process.env.PI_CODING_AGENT_DIR = dir;
  const old = join(dir, "old");
  const target = join(dir, "target");
  await mkdir(old);
  await mkdir(target);
  const session = SessionManager.create(old, join(dir, "sessions"));
  const leaf = session.appendMessage({ role: "user", content: "selected branch", timestamp: 1 });
  session.appendMessage({ role: "user", content: "abandoned branch", timestamp: 2 });
  session.branch(leaf);
  let draft = "";
  const ctx = {
    cwd: old,
    sessionManager: session,
    hasPendingMessages: () => false,
    ui: { getEditorText: () => draft },
  };
  return {
    dir,
    old,
    target,
    session,
    ctx,
    leaf,
    setDraft: (value: string) => {
      draft = value;
    },
  };
}

test("absolute existing target; no dependence on the old directory", async () => {
  const f = await fixture();
  await rm(f.old, { recursive: true });
  expect(await canonicalTarget(f.target, f.old)).toBe(await realpath(f.target));
  await expect(canonicalTarget("relative", f.old)).rejects.toThrow("absolute");
  await expect(canonicalTarget(f.target, f.target)).rejects.toThrow("already");
  await expect(canonicalTarget(join(f.dir, "missing"), f.old)).rejects.toThrow();
});

test("snapshot retains the selected leaf, other branches, provenance, and source file", async () => {
  const f = await fixture();
  const source = f.session.getSessionFile()!;
  const before = await readFile(source, "utf8");
  const copy = await snapshotSession(f.session, f.target);
  expect((await stat(copy.file)).mode & 0o777).toBe(0o600);
  const resumed = SessionManager.open(copy.file);
  expect(resumed.getHeader()?.parentSession).toBe(source);
  expect(resumed.getCwd()).toBe(f.target);
  expect(
    resumed
      .getBranch()
      .some(
        (e) =>
          e.type === "message" &&
          e.message.role === "user" &&
          e.message.content === "abandoned branch",
      ),
  ).toBe(false);
  expect(
    resumed
      .getEntries()
      .some(
        (e) =>
          e.type === "message" &&
          e.message.role === "user" &&
          e.message.content === "abandoned branch",
      ),
  ).toBe(true);
  expect(await readFile(source, "utf8")).toBe(before);
});

function tuiRuntime(run: (args: string[]) => Promise<any>, caller = "w1:p1") {
  return createRuntime(
    async (command, args) => {
      expect(command).toBe("herdr");
      return {
        code: 0,
        killed: false,
        stderr: "",
        stdout: JSON.stringify({ result: await run(args) }),
      };
    },
    "/",
    { HERDR_ENV: "1", HERDR_PANE_ID: caller, HERDR_SOCKET_PATH: "/fixture/herdr.sock" },
  )!;
}

async function fakeTransfer(mode = "ready", backend: MoveRuntime["kind"] = "tui") {
  const f = await fixture();
  const calls: string[][] = [];
  const controller = new AbortController();
  let record: any;
  const source = backend === "core" ? "t1" : "w1:p1";
  const target = backend === "core" ? "t2" : "w2:p1";
  const acknowledge = async (args: string[]) => {
    const path = args[args.indexOf("--session-move-handoff") + 1]!;
    record = JSON.parse(await readFile(path, "utf8"));
    if (mode === "ambiguous") throw new Error("start response lost");
    if (mode === "changed-source")
      f.session.appendMessage({ role: "user", content: "new message", timestamp: 3 });
    if (mode === "new-draft") f.setDraft("unsent user input");
    if (mode !== "no-ack")
      await marker(record.directory, "ready", {
        pid: mode === "wrong-pid" ? 999 : 300,
        cwd: record.cwd,
        pane: record.targetPane,
        sessionId: record.targetSessionId,
        sessionFile: record.targetSessionFile,
      });
    if (mode === "aborted-after-start") controller.abort();
  };
  const run = async (args: string[]): Promise<any> => {
    calls.push(args);
    if (args[0] === "pane" && args[1] === "current") return { pane: { pane_id: source } };
    if (args[0] === "pane" && args[1] === "process-info")
      return {
        process_info: {
          shell_pid: 100,
          foreground_process_group_id: 100,
          foreground_processes: [{ pid: args.includes(target) ? 300 : 200 }],
        },
      };
    if (args[0] === "workspace" && args[1] === "create") return { root_pane: { pane_id: target } };
    if (args[0] === "agent" && args[1] === "start") {
      await acknowledge(args);
      return {};
    }
    throw new Error("Unexpected Herdr call " + args.join(" "));
  };
  const runtime: MoveRuntime =
    backend === "tui"
      ? tuiRuntime(run)
      : {
          kind: "core",
          async current() {
            return source;
          },
          async verify(_terminal, pid) {
            if (![200, 300].includes(pid)) throw new Error("wrong process");
          },
          async launch(_agentDir, args, bind) {
            calls.push(args);
            await bind(target);
            await acknowledge(args);
          },
        };
  const execute = () =>
    relocate(f.ctx, f.target, {
      runtime,
      agentDir: f.dir,
      extension: "/extension.ts",
      sourcePid: 200,
      timeout: 20,
      signal: controller.signal,
    });
  return {
    ...f,
    calls,
    runtime,
    execute,
    get record() {
      return record;
    },
  };
}

test("successful transfer requires an ACK and preserves source; no Git or focus calls", async () => {
  const f = await fakeTransfer();
  const record = await f.execute();
  expect(JSON.parse(await readFile(join(record.directory, "committed.json"), "utf8")).pid).toBe(
    300,
  );
  expect(await readFile(record.sourceSessionFile, "utf8")).toContain("selected branch");
  expect(
    f.calls.some((c) => c.includes("--focus") || c.includes("worktree") || c.includes("close")),
  ).toBe(false);
});

for (const backend of ["tui", "core"] as const) {
  test(backend + ": transfer commits only after target identity and acknowledgment", async () => {
    const f = await fakeTransfer("ready", backend);
    const record = await f.execute();
    expect(record.backend).toBe(backend);
    expect(JSON.parse(await readFile(join(record.directory, "committed.json"), "utf8")).pid).toBe(
      300,
    );
  });
  for (const mode of [
    "no-ack",
    "wrong-pid",
    "ambiguous",
    "changed-source",
    "new-draft",
    "aborted-after-start",
  ]) {
    test(
      backend +
        " " +
        mode +
        ": source stays available; replacement files retained, no commit or close",
      async () => {
        const f = await fakeTransfer(mode, backend);
        await expect(f.execute()).rejects.toThrow();
        expect(await readFile(f.record.sourceSessionFile, "utf8")).toContain("selected branch");
        expect(await readFile(f.record.targetSessionFile, "utf8")).toContain("selected branch");
        expect(await readFile(join(f.record.directory, "cancelled.json"), "utf8")).toBeTruthy();
        await expect(readFile(join(f.record.directory, "committed.json"))).rejects.toThrow();
        expect(f.calls.some((c) => c.includes("close"))).toBe(false);
      },
    );
  }
}

test("cancellation keeps both session files and never commits", async () => {
  const f = await fakeTransfer("no-ack");
  const controller = new AbortController();
  controller.abort();
  await expect(
    relocate(f.ctx, f.target, {
      runtime: f.runtime,
      agentDir: f.dir,
      extension: "/e.ts",
      sourcePid: 200,
      signal: controller.signal,
    }),
  ).rejects.toThrow();
  expect(await readFile(f.session.getSessionFile()!, "utf8")).toContain("selected branch");
});

test("receiver never closes or resumes while source lives, or without commit", async () => {
  const f = await fakeTransfer();
  const record = await f.execute();
  expect(await finishHandoff(record, 300, { alive: () => true, timeout: 10 })).toBe("timeout");
  await rm(join(record.directory, "committed.json"));
  expect(await finishHandoff(record, 300, { alive: () => false, timeout: 10 })).toBe("timeout");
  await writeFile(join(record.directory, "cancelled.json"), "{}");
  expect(await finishHandoff(record, 300)).toBe("cancelled");
});

test("receiver checks private record, cwd, session and actual pane before acknowledging", async () => {
  const f = await fakeTransfer();
  const record = await f.execute();
  await rm(join(record.directory, "ready.json"));
  const targetSession = SessionManager.open(record.targetSessionFile);
  const ctx = { cwd: record.cwd, sessionManager: targetSession };
  const handoff = join(record.directory, "move.json");
  const runtime = tuiRuntime(
    async () => ({ pane: { pane_id: record.targetPane } }),
    record.targetPane,
  );
  expect(await acceptHandoff(ctx, handoff, f.dir, runtime, 300)).toEqual(record);
  await expect(acceptHandoff(ctx, handoff, f.dir, runtime, 301)).rejects.toThrow(
    "different process",
  );
  await expect(acceptHandoff({ ...ctx, cwd: f.old }, handoff, f.dir, runtime, 300)).rejects.toThrow(
    "does not match",
  );
  await chmod(handoff, 0o644);
  await expect(acceptHandoff(ctx, handoff, f.dir, runtime, 300)).rejects.toThrow("private");
});

test("receiver completes only after committed PID match and source exit", async () => {
  const f = await fakeTransfer();
  const record = await f.execute();
  expect(await finishHandoff(record, 300, { alive: () => false })).toBe("completed");
  expect(await readFile(join(record.directory, "completed.json"), "utf8")).toContain("300");
  expect(f.calls.some((c) => c.includes("close"))).toBe(false);
});
