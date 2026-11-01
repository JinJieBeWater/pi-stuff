import { SessionManager, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { MoveRuntime } from "./runtime.ts";

type Context = Pick<ExtensionContext, "cwd" | "sessionManager" | "hasPendingMessages"> & {
  ui: Pick<ExtensionContext["ui"], "getEditorText">;
};
export type MoveRecord = {
  backend: MoveRuntime["kind"];
  directory: string;
  cwd: string;
  sourcePid: number;
  sourcePane: string;
  sourceSessionId: string;
  sourceSessionFile: string;
  targetPane: string;
  targetSessionId: string;
  targetSessionFile: string;
  resume: boolean;
};
export type Ready = {
  pid: number;
  cwd: string;
  pane: string;
  sessionId: string;
  sessionFile: string;
};

export function conversationLeaf(session: Context["sessionManager"]) {
  // Background state advances the raw leaf without changing the conversation.
  return (
    session
      .getBranch()
      .findLast(
        (entry) =>
          entry.type !== "custom" &&
          entry.type !== "session_info" &&
          entry.type !== "label" &&
          entry.type !== "usage",
      )?.id ?? null
  );
}

export async function canonicalTarget(cwd: string, current: string): Promise<string> {
  if (!isAbsolute(cwd)) throw new Error("cwd must be an absolute directory path");
  const target = await realpath(cwd);
  if (!(await stat(target)).isDirectory()) throw new Error("cwd must be a directory");
  const source = await realpath(current).catch(() => resolve(current));
  if (target === source) throw new Error("Pi is already in this directory");
  return target;
}

export async function snapshotSession(session: Context["sessionManager"], cwd: string) {
  const source = session.getSessionFile();
  if (!source) throw new Error("This session is not persisted; there is nothing to move");
  // forkFrom writes synchronously; restrict permissions before any transcript bytes exist.
  const mask = process.umask(0o077);
  let copy: SessionManager;
  try {
    copy = SessionManager.forkFrom(source, cwd);
  } finally {
    process.umask(mask);
  }
  const leaf = session.getLeafId();
  if (leaf) copy.branch(leaf);
  else copy.resetLeaf();
  copy.appendCustomEntry("herdr-session-move", { source, leaf });
  const file = copy.getSessionFile()!;
  await chmod(file, 0o600);
  return { file, id: copy.getSessionId() };
}

export async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function marker(directory: string, name: string, value: unknown) {
  const temporary = join(directory, "." + name + "-" + randomUUID());
  try {
    await writeFile(temporary, JSON.stringify(value) + "\n", { mode: 0o600, flag: "wx" });
    await link(temporary, join(directory, name + ".json"));
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function relocate(
  ctx: Context,
  target: string,
  options: {
    runtime: MoveRuntime;
    agentDir: string;
    extension: string;
    sourcePid: number;
    resume?: boolean;
    signal?: AbortSignal;
    timeout?: number;
  },
): Promise<MoveRecord> {
  const { runtime, signal } = options;
  signal?.throwIfAborted();
  const cwd = await canonicalTarget(target, ctx.cwd);
  const sourceSessionFile = ctx.sessionManager.getSessionFile();
  if (!sourceSessionFile)
    throw new Error("This session is not persisted; there is nothing to move");
  await stat(sourceSessionFile);
  if (ctx.hasPendingMessages()) throw new Error("Queued messages must finish before moving");
  if (ctx.ui.getEditorText().trim()) throw new Error("Keep or send the editor draft before moving");
  const sourceSessionId = ctx.sessionManager.getSessionId();
  const leaf = conversationLeaf(ctx.sessionManager);
  const sourcePane = await runtime.current(signal);
  await runtime.verify(sourcePane, options.sourcePid, signal);
  await mkdir(join(options.agentDir, "session-moves"), { recursive: true, mode: 0o700 });
  const root = await realpath(join(options.agentDir, "session-moves"));
  const directory = await mkdtemp(join(root, "move-"));
  let targetPane: string | undefined;
  try {
    const copy = await snapshotSession(ctx.sessionManager, cwd);
    const record = {
      backend: runtime.kind,
      directory,
      cwd,
      sourcePid: options.sourcePid,
      sourcePane,
      sourceSessionId,
      sourceSessionFile,
      targetPane: "",
      targetSessionId: copy.id,
      targetSessionFile: copy.file,
      resume: options.resume ?? false,
    };
    const handoff = join(directory, "move.json");
    await runtime.launch(
      options.agentDir,
      ["--extension", options.extension, "--session", copy.file, "--session-move-handoff", handoff],
      async (terminal) => {
        targetPane = terminal;
        record.targetPane = terminal;
        await marker(directory, "move", record);
      },
      signal,
    );
    const deadline = Date.now() + (options.timeout ?? 30_000);
    let ready: Ready | undefined;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      ready = await readJson<Ready>(join(directory, "ready.json"));
      if (ready) break;
      await delay(10, undefined, { signal });
    }
    if (
      !ready ||
      ready.cwd !== cwd ||
      ready.sessionId !== copy.id ||
      ready.sessionFile !== copy.file ||
      ready.pane !== targetPane ||
      !Number.isSafeInteger(ready.pid) ||
      ready.pid <= 0
    ) {
      throw new Error("Replacement did not acknowledge the expected session and directory");
    }
    await runtime.verify(record.targetPane, ready.pid, signal);
    const checkSource = () => {
      signal?.throwIfAborted();
      if (
        ctx.sessionManager.getSessionId() !== sourceSessionId ||
        conversationLeaf(ctx.sessionManager) !== leaf ||
        ctx.hasPendingMessages() ||
        ctx.ui.getEditorText().trim()
      ) {
        throw new Error(
          "The source session changed during handoff; its new work or draft was kept here",
        );
      }
    };
    checkSource();
    signal?.throwIfAborted();
    await marker(directory, "committed", { pid: ready.pid });
    checkSource();
    return record;
  } catch (error) {
    await marker(directory, "cancelled", { error: String(error) }).catch(() => undefined);
    throw new Error(
      `Move stopped; source and any replacement files were retained. Inspect ${directory}` +
        (targetPane ? ` and pane ${targetPane}` : "") +
        ` before retrying. ${String(error)}`,
    );
  }
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    return true;
  }
}
