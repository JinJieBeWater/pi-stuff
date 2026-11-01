import { expect, test } from "vite-plus/test";
import { chmod, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createRuntime } from "../runtime.ts";
import { marker } from "../move.ts";
import { acceptHandoff } from "../receiver.ts";

const core = { HC_TERMINAL_ID: "t1", HC_TERMINAL_SOCKET: "/fixture/core.sock" };
const tui = { HERDR_ENV: "1", HERDR_PANE_ID: "w1:p1", HERDR_SOCKET_PATH: "/fixture/herdr.sock" };

function host(respond: (args: string[]) => unknown, env = core) {
  const calls: { command: string; args: string[] }[] = [];
  const runtime = createRuntime(
    async (command, args) => {
      calls.push({ command, args });
      return { code: 0, killed: false, stderr: "", stdout: JSON.stringify(respond(args)) };
    },
    "/target with spaces ; $",
    env,
  );
  return { runtime, calls };
}

test("Core takes precedence, and partial Core identity never falls back to an inherited TUI", () => {
  expect(host(() => ({}), { ...tui, ...core }).runtime?.kind).toBe("core");
  expect(
    host(() => ({}), { ...tui, HC_TERMINAL_SOCKET: core.HC_TERMINAL_SOCKET } as any).runtime,
  ).toBeUndefined();
  expect(host(() => ({}), {} as any).runtime).toBeUndefined();
  expect(host(() => ({}), tui as any).runtime?.kind).toBe("tui");
});

test("TUI resolves a moved caller alias to its live pane and still verifies the Pi PID", async () => {
  const f = host(
    (args) => ({
      result:
        args[1] === "current"
          ? { pane: { pane_id: "w2:p2" } }
          : { process_info: { shell_pid: 10, foreground_processes: [{ pid: 42 }] } },
    }),
    tui as any,
  );
  expect(await f.runtime!.current()).toBe("w2:p2");
  await f.runtime!.verify("w2:p2", 42);
  await expect(f.runtime!.verify("w2:p2", 43)).rejects.toThrow("expected");
});

test("Core validates its address, live state and exact foreground Pi PID", async () => {
  const f = host(() => ({ address: "t1", state: "live", foreground: { pid: 42 } }));
  expect(await f.runtime!.current()).toBe("t1");
  await f.runtime!.verify("t1", 42);
  await expect(f.runtime!.verify("t1", 43)).rejects.toThrow("foreground");
  await expect(f.runtime!.verify("t2", 42)).rejects.toThrow("identity");
  const finished = host(() => ({ address: "t1", state: "finished", foreground: { pid: 42 } }));
  await expect(finished.runtime!.current()).rejects.toThrow("identity");
});

test("Pi's initial command waits for Core's foreground sample without accepting another process", async () => {
  let reads = 0;
  const f = host(() => ({
    address: "t1",
    state: "live",
    foreground: ++reads < 3 ? null : { pid: 42 },
  }));
  await f.runtime!.verify("t1", 42);
  expect(reads).toBe(3);
});

test("Core launch creates an independent terminal, does not submit input and binds its address", async () => {
  const f = host(() => ({ address: "t2" }));
  let bound = "";
  await f.runtime!.launch("/private pi", ["--session", "/private pi/session.jsonl"], async (id) => {
    bound = id;
  });
  expect(bound).toBe("t2");
  expect(f.calls).toHaveLength(1);
  const call = f.calls[0]!;
  expect(call.command).toBe("hc");
  expect(call.args).toContain("--bg");
  expect(call.args).toContain("--no-parent");
  expect(call.args).toContain("--no-notify");
  expect(call.args[call.args.indexOf("--cwd") + 1]).toBe("/target with spaces ; $");
  expect(call.args).toContain("PI_CODING_AGENT_DIR=/private pi");
  expect(call.args).toContain("HERDR_ENV");
  expect(call.args).not.toContain("send");
  await expect(
    host(() => ({ address: "other/t2" })).runtime!.launch("/pi", [], async () => {}),
  ).rejects.toThrow("address");
});

test("native command failures, malformed responses and cancelled operations stay failures", async () => {
  for (const result of [
    { code: 1, killed: false, stderr: '{"error":{"message":"denied"}}', stdout: "" },
    { code: 0, killed: true, stderr: "", stdout: "{}" },
    { code: 0, killed: false, stderr: "", stdout: "not JSON" },
    { code: 0, killed: false, stderr: "", stdout: "null" },
  ]) {
    const runtime = createRuntime(async () => result, "/", core)!;
    await expect(runtime.current()).rejects.toThrow();
  }
  const aborted = AbortSignal.abort();
  await expect(
    host(() => ({ address: "t1", state: "live" })).runtime!.current(aborted),
  ).rejects.toThrow();
});

test("Core receiver waits for the source to publish its private binding, then checks backend and terminal", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "pi-move-binding-")));
  try {
    const directory = join(root, "session-moves", "move-fixture");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const manager = SessionManager.create(root, join(root, "sessions"));
    manager.appendMessage({ role: "user", content: "fixture", timestamp: 1 });
    const record = {
      backend: "core",
      directory,
      cwd: root,
      sourcePid: 123,
      sourcePane: "t1",
      sourceSessionId: "source",
      sourceSessionFile: join(root, "source.jsonl"),
      targetPane: "t2",
      targetSessionId: manager.getSessionId(),
      targetSessionFile: manager.getSessionFile(),
      resume: true,
    };
    const runtime = host(() => ({ address: "t2", state: "live" }), {
      ...core,
      HC_TERMINAL_ID: "t2",
    }).runtime!;
    const handoff = join(directory, "move.json");
    const accepting = acceptHandoff(
      { cwd: root, sessionManager: manager },
      handoff,
      root,
      runtime,
      456,
    );
    await marker(directory, "move", record);
    expect((await accepting).targetPane).toBe("t2");
    await expect(
      acceptHandoff(
        { cwd: root, sessionManager: manager },
        handoff,
        root,
        { ...runtime, kind: "tui" },
        456,
      ),
    ).rejects.toThrow("does not match");
    await chmod(handoff, 0o644);
    await expect(
      acceptHandoff({ cwd: root, sessionManager: manager }, handoff, root, runtime, 456),
    ).rejects.toThrow("private");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
