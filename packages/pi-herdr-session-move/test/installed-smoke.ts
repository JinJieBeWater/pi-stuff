import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, realpath } from "node:fs/promises";
import { openSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const exec = promisify(execFile);
const root = await realpath(await mkdtemp(join(tmpdir(), "pi-move-installed-")));
const name = "pi-move-installed-" + process.pid;
const agentDir = getAgentDir();
const env: NodeJS.ProcessEnv = { ...process.env, HERDR_CONFIG_PATH: join(root, "herdr.toml") };
for (const key of Object.keys(env))
  if (key.startsWith("HERDR_") && key !== "HERDR_CONFIG_PATH") delete env[key];
await writeFile(
  env.HERDR_CONFIG_PATH!,
  'onboarding = false\n[terminal]\ndefault_shell = "/bin/sh"\nshell_mode = "non_login"\n[update]\nversion_check = false\nmanifest_check = false\n',
);
const log = openSync(join(root, "server.log"), "a");
const server = spawn("herdr", ["--session", name, "server"], {
  cwd: root,
  env,
  stdio: ["ignore", log, log],
});
const h = async (args: string[]) => {
  const result = await exec("herdr", ["--session", name, ...args], {
    cwd: root,
    env,
    timeout: 20000,
  });
  const raw = result.stdout.trim() || result.stderr.trim();
  if (!raw && args[0] === "pane" && args[1] === "run") return {};
  if (!raw) throw new Error("No CLI response: " + args.join(" "));
  return JSON.parse(raw).result;
};
const quote = (s: string) => "'" + s.replace(/'/g, "'\"'\"'") + "'";
try {
  let online = false;
  for (let i = 0; i < 100 && !online; i++) {
    try {
      online = !!(await h(["workspace", "list"]));
    } catch {
      await delay(100);
    }
  }
  assert.ok(online, "isolated server started");
  const pane = (
    await h([
      "workspace",
      "create",
      "--cwd",
      root,
      "--env",
      "PI_CODING_AGENT_DIR=" + agentDir,
      "--no-focus",
    ])
  ).root_pane.pane_id;
  const output = join(root, "tools.json");
  const inspect = join(dirname(fileURLToPath(import.meta.url)), "inspect-tools.ts");
  await h([
    "pane",
    "run",
    pane,
    [
      "pi",
      "--mode",
      "rpc",
      "--offline",
      "--no-approve",
      "--no-context-files",
      "--no-mcp",
      "--extension",
      inspect,
      "--inspect-tools-file",
      output,
    ]
      .map(quote)
      .join(" ") +
      " >" +
      quote(join(root, "pi.log")) +
      " 2>&1",
  ]);
  let raw: string | undefined;
  for (let i = 0; i < 300 && !raw; i++) {
    raw = await readFile(output, "utf8").catch(() => undefined);
    if (!raw) await delay(100);
  }
  if (!raw)
    throw new Error("Global Pi startup failed: " + (await readFile(join(root, "pi.log"), "utf8")));
  const result = JSON.parse(raw);
  assert.deepEqual(
    result.tools.map((t: any) => t.name),
    ["herdr_session_move"],
  );
  assert.equal(result.tools[0].exposure, "deferred");
  assert.ok(result.commands.some((c: any) => c.name === "session-move"));
  const startup = await readFile(join(root, "pi.log"), "utf8");
  assert.ok(!/error loading extension|extension load error|duplicate tool/i.test(startup), startup);
  console.log(
    "PASS: actual global Pi configuration loads new tool and command, not old jump; evidence:",
    root,
  );
} finally {
  await h(["session", "stop", name, "--json"]).catch(() => server.kill("SIGTERM"));
}
