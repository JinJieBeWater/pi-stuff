import { afterEach, expect, test, vi } from "vite-plus/test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { EventEmitter } from "node:events";
import net from "node:net";
import herdrTabTitle from "../index.ts";

const space = "sp" + "1".repeat(32);
const tab = "tb" + "2".repeat(32);
const coreEnv = { HC_TERMINAL_SOCKET: "/core.sock", HC_TERMINAL_ID: "t19" };
const tuiEnv = {
  HERDR_ENV: "1",
  HERDR_SOCKET_PATH: "/tui.sock",
  HERDR_PANE_ID: "pane-tui",
  HERDR_TAB_ID: "tab-tui",
};
type Dependencies = NonNullable<Parameters<typeof herdrTabTitle>[1]>;
type Handler = (event: { name?: string }, ctx: ExtensionContext) => unknown;
const socket = { dev: 1, ino: 2, isSocket: () => true };

function fixture(env: NodeJS.ProcessEnv = coreEnv, overrides: Dependencies = {}) {
  const handlers = new Map<string, Handler>();
  const calls: { command: string; args: string[] }[] = [];
  const requests: { params: { tab_id: string; label: string } }[] = [];
  const fs = { value: socket, paths: [] as string[] };
  const responses = {
    pane: { pane_id: "pane-tui", tab_id: "tab-tui" } as unknown,
    target: {
      address: "t19",
      state: "live",
      labels: { "herdr.space": space, "herdr.tab": tab },
    } as unknown,
    world: {
      spaces: [
        {
          id: space,
          machine: null,
          tabs: [{ id: tab, terminals: [{ terminal: "t19" }] }],
        },
      ],
    } as unknown,
  };
  const defaultExec: ExtensionAPI["exec"] = async (command, args) => {
    calls.push({ command, args });
    const value =
      command === "herdr"
        ? { result: { pane: responses.pane } }
        : command === "hc"
          ? responses.target
          : args[0] === "ls"
            ? responses.world
            : {};
    return { code: 0, killed: false, stdout: JSON.stringify(value), stderr: "" };
  };
  let exec = defaultExec;
  const pi = {
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    getSessionName: () => "  initial session  ",
    exec: (...args: Parameters<ExtensionAPI["exec"]>) => exec(...args),
  } as unknown as ExtensionAPI;
  herdrTabTitle(pi, {
    env,
    sendRequest: async (request) => {
      requests.push(request);
    },
    statSocket: async (path) => {
      fs.paths.push(path);
      return fs.value;
    },
    ...overrides,
  });
  const emit = async (event: string, name?: string, mode = "tui") => {
    await handlers.get(event)?.({ name }, { mode } as ExtensionContext);
  };
  return {
    emit,
    calls,
    requests,
    responses,
    fs,
    handlers,
    setExec: (replacement: ExtensionAPI["exec"]) => {
      exec = replacement;
    },
    resetExec: () => {
      exec = defaultExec;
    },
    renames: () => calls.filter((call) => call.args[0] === "do"),
  };
}

test("Core verifies this terminal and local layout before renaming the exact tab", async () => {
  const f = fixture();
  await f.emit("session_start");
  await f.emit("session_info_changed", "  renamed session  ");
  expect(f.calls.filter((call) => call.command === "hc")).toEqual([
    { command: "hc", args: ["get", "t19", "--json"] },
    { command: "hc", args: ["label", "t19", "pi.session=initial session"] },
    { command: "hc", args: ["get", "t19", "--json"] },
    { command: "hc", args: ["label", "t19", "pi.session=renamed session"] },
  ]);
  expect(
    f.renames().map((call) => [call.command, ...call.args.slice(0, 2), JSON.parse(call.args[2]!)]),
  ).toEqual([
    ["herdr-app", "do", "tab.rename", { id: tab, name: "initial session" }],
    ["herdr-app", "do", "tab.rename", { id: tab, name: "renamed session" }],
  ]);
  expect(f.fs.paths).toHaveLength(4);
  expect(f.requests).toHaveLength(0);
});

test("TUI keeps its explicit socket tab_id/label protocol", async () => {
  const f = fixture(tuiEnv);
  await f.emit("session_start");
  await f.emit("session_info_changed", "  中文标题  ");
  expect(f.requests.map((request) => request.params)).toEqual([
    { tab_id: "tab-tui", label: "initial session" },
    { tab_id: "tab-tui", label: "中文标题" },
  ]);
  expect(f.calls).toEqual([
    { command: "herdr", args: ["pane", "current", "--current"] },
    { command: "herdr", args: ["pane", "current", "--current"] },
  ]);
  expect(f.fs.paths).toEqual([]);
});

test("a moved TUI pane updates its live tab instead of the inherited tab", async () => {
  const f = fixture(tuiEnv);
  f.responses.pane = { pane_id: "moved-pane", tab_id: "moved-tab" };
  await f.emit("session_info_changed", "moved session");
  expect(f.requests.map((request) => request.params)).toEqual([
    { tab_id: "moved-tab", label: "moved session" },
  ]);
});

test("an unresolved TUI pane never falls back to the inherited tab", async () => {
  const f = fixture(tuiEnv);
  f.responses.pane = {};
  await f.emit("session_info_changed", "unresolved session");
  expect(f.requests).toHaveLength(0);
});

test("Core takes priority in mixed environments and never falls back to a stale TUI tab", async () => {
  const f = fixture({ ...coreEnv, ...tuiEnv });
  await f.emit("session_start");
  expect(f.renames()).toHaveLength(1);
  expect(f.requests).toHaveLength(0);
  f.responses.world = {};
  await f.emit("session_info_changed", "no target");
  expect(f.renames()).toHaveLength(1);
  expect(f.requests).toHaveLength(0);
  const incomplete = fixture({ ...tuiEnv, HC_TERMINAL_SOCKET: "/core.sock" });
  await incomplete.emit("session_start");
  expect(incomplete.requests).toHaveLength(0);
  expect(incomplete.calls).toHaveLength(0);
});

for (const mode of ["rpc", "print"]) {
  test(`Pi ${mode} mode does not touch either backend`, async () => {
    for (const env of [coreEnv, tuiEnv]) {
      const f = fixture(env);
      await f.emit("session_start", undefined, mode);
      await f.emit("session_info_changed", "title", mode);
      expect(f.calls).toHaveLength(0);
      expect(f.requests).toHaveLength(0);
      expect(f.fs.paths).toHaveLength(0);
    }
  });
}

test("unhosted, empty names and incomplete backend identities are ignored", async () => {
  for (const env of [{}, { HERDR_ENV: "1" }, { ...coreEnv, HC_TERMINAL_ID: "other/t19" }]) {
    const f = fixture(env);
    await f.emit("session_start");
    expect(f.handlers.size).toBe(0);
  }
  for (const env of [coreEnv, tuiEnv]) {
    const f = fixture(env);
    await f.emit("session_info_changed", "  ");
    await f.emit("session_info_changed");
    expect(f.calls).toHaveLength(0);
    expect(f.requests).toHaveLength(0);
  }
});

test("headless Core, missing App socket and non-sockets safely skip", async () => {
  for (const statSocket of [
    async () => {
      throw new Error("ENOENT");
    },
    async () => ({ ...socket, isSocket: () => false }),
  ]) {
    const f = fixture({ ...coreEnv, ...tuiEnv }, { statSocket });
    await f.emit("session_start");
    expect(f.calls).toHaveLength(0);
    expect(f.requests).toHaveLength(0);
  }
});

test("Core target mismatches, missing layout labels and worker-only appearances cannot rename", async () => {
  for (const target of [
    {},
    { address: "t20", state: "live", labels: { "herdr.space": space, "herdr.tab": tab } },
    { address: "t19", state: "finished", labels: { "herdr.space": space, "herdr.tab": tab } },
    { address: "t19", state: "live", labels: {} },
    { address: "t19", state: "live", labels: { "herdr.space": space, "herdr.tab": "tab" } },
  ]) {
    const f = fixture();
    f.responses.target = target;
    await f.emit("session_start");
    expect(f.renames()).toHaveLength(0);
  }
  const f = fixture();
  f.responses.world = {
    spaces: [
      {
        id: space,
        machine: null,
        tabs: [
          {
            id: tab,
            terminals: [{ terminal: "t20", sub_agents: ["t19"] }],
          },
        ],
      },
    ],
  };
  await f.emit("session_start");
  expect(f.renames()).toHaveLength(0);
});

test("in a shared tab only the first agent renames it, while every agent labels its own terminal", async () => {
  const world = (terminals: unknown[]) => ({
    spaces: [{ id: space, machine: null, tabs: [{ id: tab, terminals }] }],
  });
  const later = fixture();
  later.responses.world = world([
    { terminal: "t20", status: "working" },
    { terminal: "t19", status: "idle" },
  ]);
  await later.emit("session_info_changed", "second agent");
  expect(later.renames()).toHaveLength(0);
  expect(later.calls).toContainEqual({
    command: "hc",
    args: ["label", "t19", "pi.session=second agent"],
  });

  const first = fixture();
  first.responses.world = world([
    { terminal: "t19", status: "working" },
    { terminal: "t20", status: "idle" },
  ]);
  await first.emit("session_info_changed", "first agent");
  expect(first.renames().map((call) => JSON.parse(call.args[2]!).name)).toEqual(["first agent"]);

  const afterShell = fixture();
  afterShell.responses.world = world([
    { terminal: "t20", status: null },
    { terminal: "t19", status: null },
  ]);
  await afterShell.emit("session_start");
  expect(afterShell.renames()).toHaveLength(1);
});

test("an unverified Core target never labels a terminal", async () => {
  const f = fixture();
  f.responses.target = {
    address: "t20",
    state: "live",
    labels: { "herdr.space": space, "herdr.tab": tab },
  };
  await f.emit("session_start");
  expect(f.calls.filter((call) => call.args[0] === "label")).toHaveLength(0);
});

test("same terminal address on another layout or machine is insufficient", async () => {
  const valid = { id: space, machine: null, tabs: [{ id: tab, terminals: [{ terminal: "t19" }] }] };
  for (const spaces of [
    [{ ...valid, id: "sp" + "3".repeat(32) }],
    [{ ...valid, machine: "remote" }],
    [{ ...valid, machine: undefined }],
    [{ ...valid, tabs: [{ id: "tb" + "4".repeat(32), terminals: [{ terminal: "t19" }] }] }],
    [{ ...valid, tabs: [{ id: tab, terminals: [{ terminal: "t20" }] }] }],
    [valid, valid],
  ]) {
    const f = fixture();
    f.responses.world = { spaces };
    await f.emit("session_start");
    expect(f.renames()).toHaveLength(0);
  }
});

test("App socket replacement blocks rename and respects native App home selection", async () => {
  let reads = 0;
  const f = fixture(
    { ...coreEnv, HERDR_APP_HOME: "/custom/app" },
    {
      statSocket: async (path) => {
        expect(path).toBe("/custom/app/herdr-app.sock");
        return { ...socket, ino: ++reads };
      },
    },
  );
  await f.emit("session_start");
  expect(f.renames()).toHaveLength(0);
});

for (const failure of ["reject", "code", "killed", "json", "error"]) {
  test(`command ${failure} is contained and later updates can recover`, async () => {
    const f = fixture();
    f.setExec(async () => {
      if (failure === "reject") throw new Error("not running");
      return {
        code: failure === "code" ? 1 : 0,
        killed: failure === "killed",
        stdout: failure === "json" ? "invalid" : '{"error":"not available"}',
        stderr: "",
      };
    });
    await f.emit("session_start");
    expect(f.renames()).toHaveLength(0);
    f.resetExec();
    await f.emit("session_info_changed", "recovered");
    expect(f.renames().map((call) => JSON.parse(call.args[2]!).name)).toEqual(["recovered"]);
  });
}

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("an older Core lookup cannot rename after a newer title arrives", async () => {
  const entered = gate();
  const blocked = gate();
  let reads = 0;
  const f = fixture(coreEnv, {
    statSocket: async () => {
      if (++reads === 1) {
        entered.release();
        await blocked.promise;
      }
      return socket;
    },
  });
  const first = f.emit("session_info_changed", "old");
  await entered.promise;
  const second = f.emit("session_info_changed", "new");
  blocked.release();
  await Promise.all([first, second]);
  expect(f.renames().map((call) => JSON.parse(call.args[2]!).name)).toEqual(["new"]);
});

test("TUI deliveries serialize and a failed delivery does not block newer names", async () => {
  const entered = gate();
  const blocked = gate();
  const names: string[] = [];
  const f = fixture(tuiEnv, {
    sendRequest: async (request) => {
      names.push(request.params.label);
      if (names.length === 1) {
        entered.release();
        await blocked.promise;
        throw new Error("lost");
      }
    },
  });
  const first = f.emit("session_info_changed", "old");
  await entered.promise;
  const second = f.emit("session_info_changed", "new");
  expect(names).toEqual(["old"]);
  blocked.release();
  await Promise.all([first, second]);
  expect(names).toEqual(["old", "new"]);
});

test("shutdown invalidates queued and in-flight lookups", async () => {
  const entered = gate();
  const blocked = gate();
  const f = fixture(coreEnv, {
    statSocket: async () => {
      entered.release();
      await blocked.promise;
      return socket;
    },
  });
  const first = f.emit("session_start");
  await entered.promise;
  await f.emit("session_shutdown");
  blocked.release();
  await first;
  await f.emit("session_info_changed", "after shutdown");
  expect(f.renames()).toHaveLength(0);
});

afterEach(() => vi.restoreAllMocks());

test("native TUI sender retries a failed connection and writes the explicit protocol", async () => {
  const endpoints: unknown[] = [];
  const writes: string[] = [];
  vi.spyOn(net, "createConnection").mockImplementation(((endpoint: unknown) => {
    endpoints.push(endpoint);
    const fake = new EventEmitter() as EventEmitter & {
      write(text: string): void;
      destroy(): void;
    };
    fake.destroy = () => {};
    fake.write = (text) => {
      writes.push(text);
      fake.emit("data", Buffer.from('{"result":'));
      fake.emit("data", Buffer.from("{}}\n"));
    };
    queueMicrotask(() =>
      fake.emit(endpoints.length === 1 ? "error" : "connect", new Error("lost")),
    );
    return fake as net.Socket;
  }) as typeof net.createConnection);
  const f = fixture(tuiEnv, { sendRequest: undefined });
  await f.emit("session_start");
  expect(endpoints).toEqual(["/tui.sock", "/tui.sock"]);
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0]!)).toMatchObject({
    method: "tab.rename",
    params: { tab_id: "tab-tui", label: "initial session" },
  });
});
