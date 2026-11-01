import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { SessionManager } from "@earendil-works/pi-coding-agent";

const exec = promisify(execFile);
// macOS Unix sockets cannot use Pi's longer redirected TMPDIR paths.
const root = await realpath(await mkdtemp("/tmp/pi-mc-"));
const agentDir = join(root, "pi");
const here = dirname(fileURLToPath(import.meta.url));
const extension = resolve(here, "../index.ts");
const provider = join(here, "provider-fixture.ts");
const hc = await realpath((await exec("which", ["hc"])).stdout.trim());
const node = (await exec("node", ["-p", "process.execPath"])).stdout.trim();
const nativePi = await realpath(
  fileURLToPath(new URL("./cli.js", import.meta.resolve("@earendil-works/pi-coding-agent"))),
);
const env: NodeJS.ProcessEnv = { ...process.env };
for (const key of Object.keys(env))
  if (key.startsWith("HC_") || key.startsWith("HERDR_")) delete env[key];
Object.assign(env, {
  HC_SESSION: "move-e2e-" + process.pid,
  XDG_STATE_HOME: join(root, "state"),
  XDG_CONFIG_HOME: join(root, "config"),
  XDG_DATA_HOME: join(root, "data"),
  PI_CODING_AGENT_DIR: agentDir,
  PATH: dirname(node) + ":" + dirname(hc) + ":" + process.env.PATH,
});
await mkdir(agentDir);
await writeFile(
  join(agentDir, "settings.json"),
  JSON.stringify({
    quietStartup: true,
    packages: [],
    extensions: [provider],
  }),
);
const call = async (args: string[]) => {
  const { stdout } = await exec(hc, args, { cwd: root, env, timeout: 15_000 });
  return JSON.parse(stdout);
};
const json = async (path: string) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
};
async function wait<T>(read: () => Promise<T | undefined | false>, timeout = 60_000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await read();
    if (result) return result as T;
    await delay(50);
  }
  throw new Error("Timed out waiting for the handoff record");
}
let started = false;
try {
  await call(["server", "start"]);
  started = true;
  for (const kind of ["special path ; dollar$", "tool-lifecycle", "trust-blocked"]) {
    const base = join(root, kind);
    const old = join(base, "old");
    const target = join(base, "target with spaces ; $");
    await mkdir(old, { recursive: true });
    await mkdir(target);
    if (kind === "trust-blocked") {
      const local = join(target, ".pi/extensions");
      await mkdir(local, { recursive: true });
      await writeFile(
        join(local, "untrusted.ts"),
        `export default function(){throw new Error("untrusted fixture ran")}`,
      );
    }
    const source = SessionManager.create(old, join(base, "sessions"));
    const selected = source.appendMessage({
      role: "user",
      content: "selected fixture history",
      timestamp: 1,
    });
    source.appendMessage({ role: "user", content: "abandoned fixture history", timestamp: 2 });
    source.branch(selected);
    source.appendCustomEntry("fixture-selected", {});
    if (kind === "tool-lifecycle") source.appendModelChange("move-fixture", "fixture");
    const sourceFile = source.getSessionFile()!;
    const calls = join(base, "calls.jsonl");
    await writeFile(join(agentDir, "fixture.json"), JSON.stringify({ target, calls }));
    const launched = await call([
      "run",
      "--json",
      "--bg",
      "--cwd",
      old,
      "--outlive-parent",
      "--no-notify",
      "--",
      node,
      nativePi,
      "--offline",
      "--no-extensions",
      "--extension",
      extension,
      "--extension",
      provider,
      "--no-skills",
      "--no-prompt-templates",
      "--no-mcp",
      "--no-approve",
      "--session",
      sourceFile,
      kind === "tool-lifecycle" ? "Move this fixture session." : "/session-move " + target,
    ]);
    let record: any;
    try {
      record = await wait(async () => {
        for (const directory of await readdir(join(agentDir, "session-moves")).catch(() => [])) {
          const value = await json(join(agentDir, "session-moves", directory, "move.json"));
          if (value?.sourceSessionFile === sourceFile) return value;
        }
        return undefined;
      }, 15_000);
      const terminal = await wait(
        async () =>
          (await json(
            join(record.directory, kind === "trust-blocked" ? "cancelled.json" : "completed.json"),
          )) || undefined,
      );
      assert.ok(terminal);
      assert.equal(record.backend, "core");
      assert.equal(record.sourcePane, launched.address);
      assert.notEqual(record.targetPane, launched.address);
      if (kind === "trust-blocked") {
        assert.equal(await json(join(record.directory, "committed.json")), undefined);
        assert.doesNotThrow(() => process.kill(record.sourcePid, 0));
      } else {
        assert.throws(() => process.kill(record.sourcePid, 0));
        const ready = await json(join(record.directory, "ready.json"));
        assert.doesNotThrow(() => process.kill(ready.pid, 0));
        const destination = await call(["get", record.targetPane]);
        assert.equal(destination.state, "live");
        assert.equal(destination.foreground.pid, ready.pid);
        const copied = SessionManager.open(record.targetSessionFile);
        assert.equal(copied.getCwd(), target);
        assert.equal(copied.getHeader()?.parentSession, sourceFile);
        assert.ok(
          copied.getEntries().some((e: any) => e.message?.content === "abandoned fixture history"),
        );
        assert.ok(
          !copied.getBranch().some((e: any) => e.message?.content === "abandoned fixture history"),
        );
        if (kind === "tool-lifecycle") {
          const replies: any[] = await wait(async () => {
            const entries = (await readFile(calls, "utf8"))
              .trim()
              .split("\n")
              .map((line) => JSON.parse(line));
            return entries.some((entry: any) => entry.target) ? entries : undefined;
          });
          assert.equal(replies.length, 2);
          assert.equal(replies[0].pid, record.sourcePid);
          assert.equal(replies[1].pid, ready.pid);
          assert.ok(
            replies[1].messages.some(
              (message: any) =>
                message.role === "toolResult" &&
                message.toolCallId === "fixture-move" &&
                !message.isError,
            ),
          );
        }
      }
      console.log("PASS Core:", kind);
    } catch (error) {
      const targets = [launched.address, record?.targetPane].filter(Boolean);
      for (const terminal of targets) {
        const output = await exec(hc, ["read", terminal, "--lines", "20"], { env }).catch(String);
        console.error(
          "Fixture terminal:",
          terminal,
          typeof output === "string" ? output : output.stdout,
        );
      }
      throw error;
    }
  }
  console.log("Core process handoff passed");
} finally {
  if (started) {
    const listing = await call(["ls", "--all"]);
    for (const terminal of listing.terminals) {
      if (terminal.state === "live") await call(["kill", terminal.address]);
      await call(["rm", terminal.address]);
    }
    await call(["server", "stop"]);
  }
  await rm(root, { recursive: true, force: true });
}
