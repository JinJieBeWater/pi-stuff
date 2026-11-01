import { afterEach, expect, test } from "vite-plus/test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import sessionMove from "../index.ts";
import { marker, readJson } from "../move.ts";

const cleanups: (() => Promise<void>)[] = [];
const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const runtimeEnv = [
  "HERDR_ENV",
  "HERDR_PANE_ID",
  "HERDR_SOCKET_PATH",
  "HC_TERMINAL_ID",
  "HC_TERMINAL_SOCKET",
];
const originalRuntimeEnv = Object.fromEntries(runtimeEnv.map((key) => [key, process.env[key]]));
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  for (const key of runtimeEnv) {
    if (originalRuntimeEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalRuntimeEnv[key];
  }
});
async function temp() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "pi-move-lifecycle-")));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("marker publication is atomic for concurrent readers and never overwrites", async () => {
  const dir = await temp();
  const path = join(dir, "committed.json");
  const value = { payload: "x".repeat(2 * 1024 * 1024) };
  const writer = marker(dir, "committed", value);
  let observed;
  while (!observed) observed = await readJson<typeof value>(path);
  await writer;
  expect(observed.payload.length).toBe(value.payload.length);
  await expect(marker(dir, "committed", { payload: "replacement" })).rejects.toThrow();
  expect((await readJson<typeof value>(path))?.payload.length).toBe(value.payload.length);
});

test("concurrent marker readers never observe an empty publication", async () => {
  const dir = await temp();
  for (let batch = 0; batch < 10; batch++)
    await Promise.all(
      Array.from({ length: 100 }, async (_, i) => {
        const name = "ready-" + batch + "-" + i;
        const outcomes = await Promise.allSettled([
          marker(dir, name, { pid: i }),
          readJson(join(dir, name + ".json")),
        ]);
        for (const outcome of outcomes) if (outcome.status === "rejected") throw outcome.reason;
      }),
    );
});

async function receiverFixture(backend: "tui" | "core" = "tui") {
  const root = await temp();
  process.env.PI_CODING_AGENT_DIR = root;
  for (const key of runtimeEnv) delete process.env[key];
  if (backend === "core") {
    process.env.HC_TERMINAL_ID = "t2";
    process.env.HC_TERMINAL_SOCKET = "/fixture/core.sock";
  } else {
    process.env.HERDR_ENV = "1";
    process.env.HERDR_PANE_ID = "w2:p1";
    process.env.HERDR_SOCKET_PATH = "/fixture/herdr.sock";
  }
  const directory = join(root, "session-moves", "move-fixture");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const manager = SessionManager.create(root, join(root, "sessions"));
  const first = manager.appendMessage({
    role: "user",
    content: "original user task",
    timestamp: 1,
  });
  manager.appendMessage({ role: "user", content: "preserved context", timestamp: 2 });
  const record = {
    backend,
    directory,
    cwd: root,
    sourcePid: 2_000_000_000,
    sourcePane: backend === "core" ? "t1" : "w1:p1",
    sourceSessionId: "source",
    sourceSessionFile: join(root, "source.jsonl"),
    targetPane: backend === "core" ? "t2" : "w2:p1",
    targetSessionId: manager.getSessionId(),
    targetSessionFile: manager.getSessionFile(),
    resume: true,
  };
  const handoff = join(directory, "move.json");
  await writeFile(handoff, JSON.stringify(record), { mode: 0o600 });
  let resumed = false;
  let draft = "";
  const notices: string[] = [];
  const loader = new DefaultResourceLoader({
    cwd: root,
    agentDir: root,
    noExtensions: true,
    noSkills: true,
    noThemes: true,
    noContextFiles: true,
    noPromptTemplates: true,
    extensionFactories: [
      (pi) => {
        pi.exec = async () => ({
          code: 0,
          killed: false,
          stderr: "",
          stdout: JSON.stringify(
            backend === "core"
              ? { address: record.targetPane, state: "live" }
              : { result: { pane: { pane_id: record.targetPane } } },
          ),
        });
        pi.sendUserMessage = () => {
          resumed = true;
        };
        sessionMove(pi);
      },
    ],
  });
  await loader.reload();
  loader.getExtensions().runtime.flagValues.set("session-move-handoff", handoff);
  const modelRuntime = await ModelRuntime.create({
    authPath: join(root, "auth.json"),
    modelsPath: null,
    modelsStorePath: join(root, "model-cache"),
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  const { session } = await createAgentSession({
    cwd: root,
    agentDir: root,
    resourceLoader: loader,
    modelRuntime,
    sessionManager: manager,
    noTools: "all",
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
  });
  cleanups.push(async () => {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
  });
  await session.bindExtensions({
    uiContext: {
      notify(s: string) {
        notices.push(s);
      },
      setEditorText(s: string) {
        draft = s;
      },
      getEditorText() {
        return draft;
      },
      setStatus() {},
    } as any,
  });
  return {
    directory,
    manager,
    first,
    session,
    notices,
    get resumed() {
      return resumed;
    },
  };
}

for (const backend of ["tui", "core"] as const) {
  test(
    backend + ": real Pi rejects tree navigation, switching and forking while receiving",
    async () => {
      const f = await receiverFixture(backend);
      const leaf = f.manager.getLeafId();
      expect((await f.session.navigateTree(f.first, { summarize: false })).cancelled).toBe(true);
      expect(
        (await f.session.extensionRunner.emit({ type: "session_before_switch", reason: "new" }))
          ?.cancel,
      ).toBe(true);
      expect(
        (
          await f.session.extensionRunner.emit({
            type: "session_before_fork",
            entryId: f.first,
            position: "at",
          })
        )?.cancel,
      ).toBe(true);
      expect(f.manager.getLeafId()).toBe(leaf);
      await marker(f.directory, "committed", { pid: process.pid });
      for (let i = 0; i < 30 && !f.resumed; i++) await delay(10);
      expect(f.resumed).toBe(true);
      expect(f.manager.buildSessionContext().messages.length).toBe(2);
    },
  );
}

test("out-of-band target branch drift refuses continuation and completion", async () => {
  const f = await receiverFixture();
  f.manager.branch(f.first);
  await marker(f.directory, "committed", { pid: process.pid });
  await delay(100);
  expect(f.resumed).toBe(false);
  expect(await readJson(join(f.directory, "completed.json"))).toBeUndefined();
  expect(f.notices.some((s) => s.includes("changed"))).toBe(true);
});
