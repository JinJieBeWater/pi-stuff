import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export interface MoveRuntime {
  kind: "core" | "tui";
  current(signal?: AbortSignal): Promise<string>;
  verify(terminal: string, pid: number, signal?: AbortSignal): Promise<void>;
  launch(
    agentDir: string,
    args: string[],
    bind: (terminal: string) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<void>;
}

export function createRuntime(
  exec: ExtensionAPI["exec"],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): MoveRuntime | undefined {
  const core = Boolean(env.HC_TERMINAL_SOCKET);
  const caller = core ? env.HC_TERMINAL_ID : env.HERDR_PANE_ID;
  if (
    !caller ||
    (core ? !/^t[0-9a-z]+$/.test(caller) : env.HERDR_ENV !== "1" || !env.HERDR_SOCKET_PATH)
  )
    return;

  const run = async (args: string[], signal?: AbortSignal): Promise<any> => {
    const result = await exec(core ? "hc" : "herdr", args, {
      cwd,
      signal,
      timeout: args[0] === "agent" && args[1] === "start" ? 35_000 : 10_000,
    });
    signal?.throwIfAborted();
    if (result.killed)
      throw new Error("Terminal command timed out; inspect live state before retrying");
    const raw = result.stdout.trim() || result.stderr.trim();
    let response;
    try {
      response = JSON.parse(raw);
    } catch {
      throw new Error("Terminal command returned invalid JSON: " + raw.slice(0, 500));
    }
    if (result.code !== 0 || response?.error)
      throw new Error(response?.error?.message || raw.slice(0, 500));
    const value = core ? response : response?.result;
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Terminal command returned no result");
    return value;
  };

  if (core) {
    const get = async (terminal: string, signal?: AbortSignal) => {
      const value = await run(["get", terminal, "--json"], signal);
      if (value.address !== terminal || value.state !== "live")
        throw new Error("Core terminal identity changed; inspect it before retrying");
      return value;
    };
    return {
      kind: "core",
      async current(signal) {
        await get(caller, signal);
        return caller;
      },
      async verify(terminal, pid, signal) {
        const deadline = Date.now() + 5_000;
        while (true) {
          const foreground = (await get(terminal, signal)).foreground?.pid;
          if (foreground === pid) return;
          // Pi can handle its initial command before Core has sampled its foreground process.
          if (foreground !== undefined || Date.now() >= deadline)
            throw new Error(
              `Core terminal ${terminal}: expected Pi PID ${pid}, foreground PID ${foreground ?? "unknown"}`,
            );
          await delay(50, undefined, { signal });
        }
      },
      async launch(agentDir, args, bind, signal) {
        const token = randomUUID().replaceAll("-", "");
        const result = await run(
          [
            "run",
            "--json",
            "--bg",
            "--cwd",
            cwd,
            "--no-parent",
            "--no-notify",
            "--label",
            `herdr.space=sp${token}`,
            "--label",
            `herdr.tab=tb${token}`,
            "--",
            // shortcut: env is native on macOS/Linux; use Core API env for Windows support.
            "/usr/bin/env",
            ...[
              "HERDR_ENV",
              "HERDR_PANE_ID",
              "HERDR_SOCKET_PATH",
              "HERDR_WORKSPACE_ID",
              "HERDR_TAB_ID",
              "HERDR_SESSION",
              "HERDR_BIN_PATH",
            ].flatMap((name) => ["-u", name]),
            `PI_CODING_AGENT_DIR=${agentDir}`,
            process.execPath,
            process.argv[1]!,
            ...args,
          ],
          signal,
        );
        if (typeof result.address !== "string" || !/^t[0-9a-z]+$/.test(result.address))
          throw new Error("Core returned no local terminal address; inspect its terminals");
        // Core starts Pi before returning its address; the receiver waits for this binding.
        await bind(result.address);
      },
    };
  }

  return {
    kind: "tui",
    async current(signal) {
      const result = await run(["pane", "current", "--current"], signal);
      const pane = result.pane?.pane_id;
      if (typeof pane !== "string" || !pane)
        throw new Error("Herdr did not resolve the caller pane");
      return pane;
    },
    async verify(terminal, pid, signal) {
      const info = (await run(["pane", "process-info", "--pane", terminal], signal)).process_info;
      if (!info?.shell_pid || !info.foreground_processes?.some((p: any) => p.pid === pid))
        throw new Error("Pi is not in the expected Herdr pane; source was not changed");
    },
    async launch(agentDir, args, bind, signal) {
      const result = await run(
        [
          "workspace",
          "create",
          "--cwd",
          cwd,
          "--label",
          basename(cwd),
          "--env",
          `PI_CODING_AGENT_DIR=${agentDir}`,
          "--no-focus",
        ],
        signal,
      );
      const terminal = result.root_pane?.pane_id;
      if (typeof terminal !== "string" || !terminal)
        throw new Error("Herdr returned no dedicated target pane");
      await bind(terminal);
      await run(
        [
          "agent",
          "start",
          "move-" + randomUUID().slice(0, 8),
          "--kind",
          "pi",
          "--pane",
          terminal,
          "--timeout",
          "30000",
          "--",
          ...args,
        ],
        signal,
      );
    },
  };
}
