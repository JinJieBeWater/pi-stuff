import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { stat } from "node:fs/promises";
import net from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

interface HerdrRequest {
  id: string;
  method: "tab.rename";
  params: { tab_id: string; label: string };
}

interface RuntimeDependencies {
  env?: NodeJS.ProcessEnv;
  sendRequest?: (request: HerdrRequest) => Promise<void>;
  statSocket?: (path: string) => Promise<{ dev: number; ino: number; isSocket(): boolean }>;
}

function createSocketSender(endpoint: string) {
  const attempt = (request: HerdrRequest, timeoutMs: number): Promise<boolean> =>
    new Promise((resolve) => {
      let finished = false;
      let response = "";
      const socket = net.createConnection(endpoint);
      const timer = setTimeout(() => finish(false), timeoutMs);
      timer.unref?.();
      const finish = (delivered: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(delivered);
      };
      socket.on("error", () => finish(false));
      socket.on("close", () => finish(false));
      socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
      socket.on("data", (chunk) => {
        response += chunk.toString();
        const newline = response.indexOf("\n");
        if (newline < 0) return;
        try {
          finish(!JSON.parse(response.slice(0, newline))?.error);
        } catch {
          finish(false);
        }
      });
    });
  return async (request: HerdrRequest) => {
    if (await attempt(request, 500)) return;
    await attempt(request, 1500);
  };
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export default function herdrTabTitle(pi: ExtensionAPI, deps: RuntimeDependencies = {}) {
  const env = deps.env ?? process.env;
  const core = Boolean(env.HC_TERMINAL_SOCKET);
  const terminal = env.HC_TERMINAL_ID;
  const socketPath = env.HERDR_SOCKET_PATH;
  const paneId = env.HERDR_PANE_ID;
  if (
    core
      ? !terminal || !/^t[0-9a-z]+$/.test(terminal)
      : env.HERDR_ENV !== "1" || !socketPath || !paneId
  )
    return;

  const appSocket = join(
    env.HERDR_APP_HOME || join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "herdr-app"),
    "herdr-app.sock",
  );
  const statSocket = deps.statSocket ?? stat;
  const sendRequest = core
    ? undefined
    : (deps.sendRequest ??
      createSocketSender(
        process.platform === "win32" ? `\\\\.\\pipe\\${socketPath}` : socketPath!,
      ));
  let sequence = 0;
  let pending = Promise.resolve();
  let closed = false;

  const json = async (command: string, args: string[]) => {
    const result = await pi.exec(command, args, { timeout: 3000 });
    if (result.code !== 0 || result.killed) throw new Error("Herdr command failed");
    const value: unknown = JSON.parse(result.stdout);
    if (object(value).error) throw new Error("Herdr command returned an error");
    return value;
  };

  const renameCore = async (title: string, current: () => boolean) => {
    const original = await statSocket(appSocket);
    if (!original.isSocket()) return;
    const target = object(await json("hc", ["get", terminal!, "--json"]));
    const labels = object(target.labels);
    const space = labels["herdr.space"];
    const tab = labels["herdr.tab"];
    if (
      target.address !== terminal ||
      target.state !== "live" ||
      typeof space !== "string" ||
      !/^sp[0-9a-f]{32}$/.test(space) ||
      typeof tab !== "string" ||
      !/^tb[0-9a-f]{32}$/.test(tab)
    )
      return;
    const world = object(await json("herdr-app", ["ls"]));
    if (!Array.isArray(world.spaces)) return;
    const matches = world.spaces.flatMap((value) => {
      const entry = object(value);
      if (entry.machine !== null || entry.id !== space || !Array.isArray(entry.tabs)) return [];
      return entry.tabs.filter((value) => {
        const entry = object(value);
        return (
          entry.id === tab &&
          Array.isArray(entry.terminals) &&
          entry.terminals.some((value) => object(value).terminal === terminal)
        );
      });
    });
    if (matches.length !== 1 || !current()) return;
    const latest = await statSocket(appSocket);
    if (
      !latest.isSocket() ||
      latest.dev !== original.dev ||
      latest.ino !== original.ino ||
      !current()
    )
      return;
    await json("herdr-app", ["do", "tab.rename", JSON.stringify({ id: tab, name: title })]);
  };

  const rename = (rawTitle: unknown) => {
    const request = ++sequence;
    const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
    const current = () => !closed && request === sequence;
    pending = pending
      .then(async () => {
        if (!title || !current()) return;
        if (core) await renameCore(title, current);
        else {
          const response = object(await json("herdr", ["pane", "current", "--current"]));
          const pane = object(object(response.result).pane);
          if (
            typeof pane.pane_id !== "string" ||
            !pane.pane_id ||
            typeof pane.tab_id !== "string" ||
            !pane.tab_id ||
            !current()
          )
            return;
          await sendRequest!({
            id: `pi-session-title:${request}`,
            method: "tab.rename",
            params: { tab_id: pane.tab_id, label: title },
          });
        }
      })
      .catch(() => {
        // Title synchronization is best effort; a failed backend must not interrupt Pi.
      });
    return pending;
  };

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode === "tui") await rename(pi.getSessionName());
  });
  pi.on("session_info_changed", async (event, ctx) => {
    if (ctx.mode === "tui") await rename(event.name);
  });
  pi.on("session_shutdown", () => {
    closed = true;
    sequence++;
  });
}
