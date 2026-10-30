import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  marker,
  processAlive,
  readJson,
  type MoveRecord,
  type Ready,
  type RunHerdr,
} from "./move.ts";

export async function acceptHandoff(
  ctx: Pick<ExtensionContext, "cwd" | "sessionManager">,
  handoff: string,
  agentDir: string,
  run: RunHerdr,
  pid: number,
): Promise<MoveRecord> {
  const root = await realpath(join(agentDir, "session-moves"));
  const file = await realpath(handoff);
  const directory = dirname(file);
  const info = await stat(file);
  const dirInfo = await stat(directory);
  if (
    dirname(directory) !== root ||
    file !== join(directory, "move.json") ||
    (info.mode & 0o077) !== 0 ||
    (dirInfo.mode & 0o077) !== 0 ||
    (process.getuid && (info.uid !== process.getuid() || dirInfo.uid !== process.getuid()))
  ) {
    throw new Error("Handoff must be a private record inside the Pi session-moves directory");
  }
  const record = await readJson<MoveRecord>(file);
  if (
    !record ||
    record.directory !== directory ||
    !isAbsolute(record.sourceSessionFile) ||
    !Number.isSafeInteger(record.sourcePid) ||
    record.sourcePid <= 0 ||
    record.sourcePid === pid ||
    typeof record.sourcePane !== "string" ||
    !record.sourcePane ||
    typeof record.resume !== "boolean" ||
    record.cwd !== (await realpath(ctx.cwd)) ||
    record.targetSessionId !== ctx.sessionManager.getSessionId() ||
    record.targetSessionFile !== ctx.sessionManager.getSessionFile()
  ) {
    throw new Error("Handoff does not match this process, session, and directory");
  }
  const pane = (await run(["pane", "current", "--current"])).pane?.pane_id;
  if (pane !== record.targetPane || pane === record.sourcePane)
    throw new Error("Handoff target pane does not match");
  const ready: Ready = {
    pid,
    cwd: record.cwd,
    pane,
    sessionId: record.targetSessionId,
    sessionFile: record.targetSessionFile,
  };
  const existing = await readJson<Ready>(join(directory, "ready.json"));
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(ready))
      throw new Error("A different process already accepted this handoff");
  } else await marker(directory, "ready", ready);
  return record;
}

export async function finishHandoff(
  record: MoveRecord,
  pid: number,
  options: {
    signal?: AbortSignal;
    alive?: (pid: number) => boolean;
    timeout?: number;
    checkTarget?: () => void;
  } = {},
): Promise<"completed" | "cancelled" | "timeout"> {
  const deadline = Date.now() + (options.timeout ?? 60_000);
  while (Date.now() < deadline) {
    options.signal?.throwIfAborted();
    if (await readJson(join(record.directory, "cancelled.json"))) return "cancelled";
    const commit = await readJson<{ pid: number }>(join(record.directory, "committed.json"));
    if (commit && commit.pid !== pid) throw new Error("Handoff committed to a different process");
    if (commit && !(options.alive ?? processAlive)(record.sourcePid)) {
      options.checkTarget?.();
      await marker(record.directory, "completed", { pid });
      return "completed";
    }
    await delay(25, undefined, { signal: options.signal });
  }
  return "timeout";
}
