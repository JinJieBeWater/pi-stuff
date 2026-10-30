import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath } from "node:fs/promises";
import { openSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { SessionManager } from "@earendil-works/pi-coding-agent";

const exec = promisify(execFile);
const root = await realpath(await mkdtemp(join(tmpdir(), "pi-session-move-e2e-")));
const agentDir = join(root, "pi");
const name = "pi-move-e2e-" + process.pid;
const extension = resolve(dirname(fileURLToPath(import.meta.url)), "../index.ts");
const fixture = join(dirname(fileURLToPath(import.meta.url)), "provider-fixture.ts");
await mkdir(agentDir);
await writeFile(
  join(agentDir, "settings.json"),
  JSON.stringify({ quietStartup: true, packages: [], extensions: [fixture] }),
);
const env: NodeJS.ProcessEnv = {
  ...process.env,
  PI_CODING_AGENT_DIR: agentDir,
  HERDR_CONFIG_PATH: join(root, "herdr.toml"),
};
for (const key of Object.keys(env))
  if (key.startsWith("HERDR_") && key !== "HERDR_CONFIG_PATH")
    delete (env as Record<string, string | undefined>)[key];
process.env.PI_CODING_AGENT_DIR = agentDir;
await writeFile(
  env.HERDR_CONFIG_PATH!,
  'onboarding = false\n[terminal]\ndefault_shell = "/bin/sh"\nshell_mode = "non_login"\n[update]\nversion_check = false\nmanifest_check = false\n',
);
const testBin = join(root, "bin");
await mkdir(testBin);
const actualPi = (await exec("which", ["pi"])).stdout.trim();
await writeFile(
  join(testBin, "pi"),
  '#!/bin/sh\ncase " $* " in *" --session-move-handoff "*) if [ -f "' +
    join(agentDir, "deny-target") +
    '" ]; then echo "fixture target startup failure" >&2; exit 70; fi;; esac\nexec "' +
    actualPi +
    '" "$@"\n',
  { mode: 0o700 },
);
env.PATH = testBin + ":" + env.PATH;
const log = openSync(join(root, "server.log"), "a");
const server = spawn("herdr", ["--session", name, "server"], {
  cwd: root,
  env,
  stdio: ["ignore", log, log],
});
console.log("Isolated test evidence:", root, "session:", name);
const h = async (args: string[]) => {
  const { stdout } = await exec("herdr", ["--session", name, ...args], {
    cwd: root,
    env,
    timeout: 65_000,
  });
  const result = JSON.parse(stdout);
  if (result.error) throw new Error(JSON.stringify(result.error));
  return result.result;
};
async function wait<T>(read: () => Promise<T | undefined | false>, timeout = 60_000): Promise<T> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await read();
    if (value) return value as T;
    await delay(100);
  }
  throw new Error("Timed out");
}
async function json(path: string) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}
async function git(cwd: string, args: string[]) {
  return exec("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd });
}

try {
  await wait(async () => {
    try {
      return await h(["workspace", "list"]);
    } catch {
      return undefined;
    }
  }, 15_000);
  const rows: Record<string, unknown>[] = [];
  for (const kind of [
    "cross-repo",
    "non-git spaces ; dollar$",
    "missing-source",
    "existing-worktree",
    "tool-lifecycle",
    "trust-blocked",
    "failed-start",
  ]) {
    const base = join(root, kind);
    await mkdir(base);
    const old = join(base, "old");
    let target = join(base, "target");
    await mkdir(old);
    await mkdir(target);
    if (kind === "cross-repo") {
      await git(old, ["init", "-q"]);
      await git(target, ["init", "-q"]);
    }
    if (kind === "existing-worktree") {
      const repo = join(base, "repo");
      await mkdir(repo);
      await git(repo, ["init", "-q"]);
      await writeFile(join(repo, "fixture.txt"), "fixture\n");
      await git(repo, ["add", "."]);
      await git(repo, [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "-qm",
        "fixture",
      ]);
      target = join(base, "linked");
      await git(repo, ["worktree", "add", "-qb", "fixture-worktree", target]);
    }
    const source = SessionManager.create(old, join(base, "source-sessions"));
    const selected = source.appendMessage({
      role: "user",
      content: "selected fixture history",
      timestamp: 1,
    });
    source.appendMessage({ role: "user", content: "abandoned fixture history", timestamp: 2 });
    source.branch(selected);
    // Persist the selected cursor as a last entry, as the live Pi will reopen the file.
    source.appendCustomEntry("fixture-selected", {});
    if (kind === "tool-lifecycle") source.appendModelChange("move-fixture", "fixture");
    if (kind === "trust-blocked") {
      const local = join(target, ".pi", "extensions");
      await mkdir(local, { recursive: true });
      await writeFile(
        join(local, "probe.ts"),
        'import {writeFileSync} from "node:fs"; export default function(){writeFileSync(' +
          JSON.stringify(join(base, "untrusted-extension-ran")) +
          ', "bad")}\n',
      );
    }
    const sourceFile = source.getSessionFile()!;
    const created = await h([
      "workspace",
      "create",
      "--cwd",
      old,
      "--label",
      "fixture",
      "--no-focus",
      "--env",
      "PI_CODING_AGENT_DIR=" + agentDir,
    ]);
    const pane = created.root_pane.pane_id;
    const sibling = (
      await h(["pane", "split", pane, "--direction", "down", "--cwd", old, "--no-focus"])
    ).pane;
    const native = await h([
      "agent",
      "start",
      "source-" + rows.length,
      "--kind",
      "pi",
      "--pane",
      pane,
      "--timeout",
      "60000",
      "--",
      "--offline",
      "--no-extensions",
      "--extension",
      extension,
      "--extension",
      fixture,
      "--no-skills",
      "--no-prompt-templates",
      "--no-mcp",
      "--no-approve",
      "--session",
      sourceFile,
    ]);
    assert.ok(native);
    const sourceBefore = await readFile(sourceFile, "utf8");
    if (kind === "missing-source") await rm(old, { recursive: true });
    if (kind === "tool-lifecycle") {
      const info = (await h(["pane", "process-info", "--pane", pane])).process_info;
      await writeFile(
        join(agentDir, "fixture.json"),
        JSON.stringify({
          target,
          sourcePid: info.foreground_process_group_id,
          calls: join(base, "calls.jsonl"),
        }),
      );
    }
    if (kind === "failed-start") await writeFile(join(agentDir, "deny-target"), "fixture");
    await h([
      "agent",
      "prompt",
      pane,
      kind === "tool-lifecycle" ? "Move this fixture session." : "/session-move " + target,
    ]);
    let record: any;
    try {
      record = await wait(async () => {
        for (const dir of await readdir(join(agentDir, "session-moves")).catch(() => [])) {
          const r = await json(join(agentDir, "session-moves", dir, "move.json"));
          if (r?.sourceSessionFile === sourceFile) return r;
        }
        return undefined;
      });
      await wait(async () => {
        const cancelled = await json(join(record.directory, "cancelled.json"));
        if (cancelled) {
          if (kind === "failed-start" || kind === "trust-blocked") return cancelled;
          throw new Error(JSON.stringify(cancelled));
        }
        return await json(join(record.directory, "completed.json"));
      });
    } catch (error) {
      console.error(
        "Source viewport:",
        await h(["pane", "read", pane, "--source", "visible", "--lines", "25"]).catch(String),
      );
      if (record)
        console.error(
          "Target viewport:",
          await h([
            "pane",
            "read",
            record.targetPane,
            "--source",
            "visible",
            "--lines",
            "25",
          ]).catch(String),
        );
      throw error;
    }
    if (kind === "failed-start" || kind === "trust-blocked") {
      assert.doesNotThrow(() => process.kill(record.sourcePid, 0));
      assert.equal(await json(join(record.directory, "committed.json")), undefined);
      assert.equal(await readFile(sourceFile, "utf8"), sourceBefore);
      assert.ok(await readFile(record.targetSessionFile, "utf8"));
      rows.push({
        kind,
        sourcePane: pane,
        targetPane: record.targetPane,
        record: record.directory,
      });
      if (kind === "trust-blocked")
        assert.equal(await json(join(base, "untrusted-extension-ran")), undefined);
      console.log("PASS:", kind, "keeps source alive and both histories; no commit");
      continue;
    }
    const targetSession = SessionManager.open(record.targetSessionFile);
    assert.equal(targetSession.getCwd(), target);
    assert.equal(targetSession.getHeader()?.parentSession, sourceFile);
    if (kind !== "tool-lifecycle") assert.equal(await readFile(sourceFile, "utf8"), sourceBefore);
    assert.ok(
      !targetSession
        .getBranch()
        .some(
          (e) =>
            e.type === "message" &&
            "content" in e.message &&
            String(e.message.content).includes("abandoned"),
        ),
    );
    assert.ok(
      targetSession
        .getEntries()
        .some(
          (e) =>
            e.type === "message" &&
            "content" in e.message &&
            String(e.message.content).includes("abandoned"),
        ),
    );
    assert.ok(await h(["pane", "get", pane]));
    assert.equal((await h(["pane", "get", sibling.pane_id])).pane.tab_id, sibling.tab_id);
    assert.equal((await h(["pane", "get", record.targetPane])).pane.focused, false);
    const ready = await json(join(record.directory, "ready.json"));
    assert.throws(() => process.kill(record.sourcePid, 0));
    assert.doesNotThrow(() => process.kill(ready.pid, 0));
    if (kind === "tool-lifecycle") {
      const calls = await wait(async () => {
        const all = (await readFile(join(base, "calls.jsonl"), "utf8"))
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l));
        return all.some((c) => c.target) ? all : undefined;
      });
      assert.equal(calls.length, 2, "one source turn and one replacement continuation");
      assert.equal(calls[1].sourceAlive, false, "replacement must not run before source exit");
      assert.ok(
        calls[1].messages.some(
          (m: any) => m.role === "toolResult" && m.toolCallId === "fixture-move" && !m.isError,
        ),
      );
    }
    if (kind === "missing-source")
      assert.equal(
        await import("node:fs/promises").then((fs) =>
          fs.stat(old).then(
            () => true,
            () => false,
          ),
        ),
        false,
      );
    rows.push({
      kind,
      sourcePane: pane,
      sibling: sibling.pane_id,
      targetPane: record.targetPane,
      record: record.directory,
    });
    console.log("PASS:", kind, "source exited; history/branch/sibling/focus preserved");
  }
  await writeFile(join(root, "results.json"), JSON.stringify(rows, null, 2));
  console.log("PASS: all isolated native Pi/Herdr moves; only local deterministic model fixture");
} finally {
  await h(["session", "stop", name, "--json"]).catch(() => server.kill("SIGTERM"));
}
