import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";

type Config = { enabled: boolean; command: string[]; timeoutMs: number };

function readConfig(agentDir: string): Config {
  const file = join(agentDir, "pi-drop-session.json");
  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { enabled: true, command: ["trash"], timeoutMs: 5000 };
    throw error;
  }
  const invalid = (reason: string): never => {
    throw new Error(`${file}: ${reason}`);
  };
  let value: unknown;
  try {
    value = JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    return invalid("invalid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid("expected a configuration object");
  const config = value as Record<string, unknown>;
  for (const key of Object.keys(config)) {
    if (!["enabled", "command", "timeoutMs"].includes(key)) return invalid(`unknown field ${key}`);
  }
  if ("enabled" in config && typeof config.enabled !== "boolean")
    return invalid("enabled must be a boolean");
  if (
    "command" in config &&
    (!Array.isArray(config.command) ||
      config.command.length === 0 ||
      config.command.some((arg) => typeof arg !== "string" || arg.includes("\0")) ||
      !config.command[0].trim())
  )
    return invalid(
      "command must be a nonempty argv array with a nonempty executable and no NUL bytes",
    );
  if (
    "timeoutMs" in config &&
    (typeof config.timeoutMs !== "number" ||
      !Number.isInteger(config.timeoutMs) ||
      config.timeoutMs < 1 ||
      config.timeoutMs > 60_000)
  )
    return invalid("timeoutMs must be an integer from 1 to 60000");
  return {
    enabled: (config.enabled as boolean | undefined) ?? true,
    command: (config.command as string[] | undefined) ?? ["trash"],
    timeoutMs: (config.timeoutMs as number | undefined) ?? 5000,
  };
}

function findExecutable(command: string, cwd: string): string {
  let candidates: string[];
  if (command.includes("/")) {
    candidates = [resolve(cwd, command)];
  } else {
    const searchPath = process.env.PATH;
    if (!searchPath)
      throw new Error("PATH is unset or empty; configure an explicit executable path");
    candidates = searchPath.split(delimiter).map((dir) => resolve(cwd, dir, command));
  }
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch (error) {
      if (!["ENOENT", "ENOTDIR", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? ""))
        throw error;
    }
  }
  throw new Error(`Executable not found or not executable: ${command}`);
}

async function runCommand(file: string, args: string[], timeoutMs: number): Promise<void> {
  await promisify(execFile)(file, args, {
    timeout: timeoutMs,
    killSignal: "SIGKILL",
    encoding: "utf8",
    shell: false,
  });
}

export default function dropSession(pi: ExtensionAPI, run: typeof runCommand = runCommand) {
  const config = readConfig(getAgentDir());
  if (!config.enabled) return;

  pi.registerCommand("drop", {
    description: "Move the current session to trash and start a new one",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      const sessionFile = ctx.sessionManager.getSessionFile();
      if (!sessionFile) {
        ctx.ui.notify("Nothing to drop (in-memory session)", "warning");
        return;
      }
      let executable: string;
      try {
        executable = findExecutable(config.command[0], ctx.cwd);
      } catch (error) {
        ctx.ui.notify(`Drop not started: ${String(error)}`, "error");
        return;
      }
      // An absolute operand cannot be mistaken for a leading-dash option.
      const oldFile = resolve(ctx.cwd, sessionFile);
      const result = await ctx.newSession({
        withSession: async (nextCtx) => {
          try {
            await run(executable, [...config.command.slice(1), oldFile], config.timeoutMs);
          } catch (error) {
            try {
              statSync(oldFile);
            } catch (fileError) {
              if ((fileError as NodeJS.ErrnoException).code === "ENOENT") {
                nextCtx.ui.notify(`Drop complete; session file already absent: ${oldFile}`, "info");
                return;
              }
            }
            const detail = (error instanceof Error ? error.message : String(error)).slice(0, 300);
            nextCtx.ui.notify(
              `Drop failed: ${detail}. No delete fallback was attempted. Use /resume to reopen the old session: ${oldFile}`,
              "error",
            );
            return;
          }
          nextCtx.ui.notify(`Session moved to trash: ${oldFile}`, "info");
        },
      });
      if (result.cancelled) ctx.ui.notify("Drop cancelled", "info");
    },
  });
}
