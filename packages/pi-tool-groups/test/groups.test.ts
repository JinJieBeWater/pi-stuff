import { beforeAll, expect, test } from "vite-plus/test";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createWriteToolDefinition,
  initTheme,
  ToolExecutionComponent,
  type ExtensionAPI,
  type SessionEntry,
  type ToolRenderers,
} from "@earendil-works/pi-coding-agent";
import {
  stripTerminalSequences,
  Text,
  type TuiMouseEvent,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { homedir } from "node:os";
import extension from "../index";

const WIDTH = 80;
// Away from the paths the tests use, which would otherwise read as "./…".
const CWD = "/work";
const ui = { requestRender() {} } as never;
const tick = () => new Promise((resolve) => setTimeout(resolve));
const plain = (lines: string[]) => lines.map((line) => stripTerminalSequences(line).trimEnd());

beforeAll(() => initTheme("dark"));

/** Real ToolExecutionComponents behind the real extension, with a scripted session. */
function setup(entries: SessionEntry[], renderers?: ToolRenderers | "none", tool = "bash") {
  const bash = createBashToolDefinition("/tmp") as unknown as ToolRenderers;
  const base = renderers === "none" ? undefined : (renderers ?? bash);
  type Handler = (event: unknown, ctx: unknown) => void;
  const handlers = new Map<string, Handler>();
  let resolver: (name: string, next: () => ToolRenderers | undefined) => ToolRenderers | undefined;
  extension({
    on: (name: string, handler: Handler) => handlers.set(name, handler),
    registerToolRenderer: (value: typeof resolver) => (resolver = value),
  } as unknown as ExtensionAPI);
  const session = { getLeafId: () => String(entries.length), buildContextEntries: () => entries };
  handlers.get("session_start")!({}, { sessionManager: session });
  const definition = () => resolver(tool, () => base);
  const row = (id: string, args: object = { command: `echo ${id}` }) =>
    new ToolExecutionComponent(tool, id, args, {}, definition() as never, ui, CWD);
  /** A row of another tool name, drawn by the same renderer, as a mixed turn would have. */
  const rowOf = (name: string, id: string, args: object, cwd = CWD) =>
    new ToolExecutionComponent(name, id, args, {}, resolver(name, () => base) as never, ui, cwd);
  return {
    row,
    rowOf,
    entries,
    emit: (name: string, event: unknown) => handlers.get(name)?.(event, {}),
    definition,
  };
}

const turn = (...ids: string[]) =>
  ({
    type: "message",
    message: {
      role: "assistant",
      stopReason: "toolUse",
      content: ids.map((id) => ({ type: "toolCall", id, name: "bash", arguments: {} })),
    },
  }) as SessionEntry;
const output = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  details: undefined,
  isError,
  durationMs: 1200,
});
const finish = (row: ToolExecutionComponent, text: string, isError = false) => {
  row.markExecutionStarted();
  row.updateResult(output(text, isError));
};
const isExpandedNatively = (row: ToolExecutionComponent) =>
  (row as unknown as { expanded: boolean }).expanded;
const render = (rows: ToolExecutionComponent[]) => rows.flatMap((row) => plain(row.render(WIDTH)));
/** How many blocks the rows draw in one pass: a block's first row draws it, the rest nothing. */
const blocksOf = (rows: ToolExecutionComponent[]) =>
  rows.map((row) => row.render(WIDTH)).filter((lines) => lines.length > 0).length;
const clickEvent = (y: number, x = 3) =>
  ({ type: "click", button: "left", x, y, width: WIDTH, height: 200 }) as TuiMouseEvent;
/** Clicks the host's line matching `pattern`, as the terminal would, and returns the new screen. */
const clickLine = async (rows: ToolExecutionComponent[], pattern: RegExp, x = 3) => {
  const y = plain(rows[0]!.render(WIDTH)).findIndex((line) => pattern.test(line));
  expect(y, `no line matches ${pattern}`).toBeGreaterThanOrEqual(0);
  const result = rows[0]!.handleMouse(clickEvent(y, x));
  await tick();
  render(rows);
  await tick();
  return { result, screen: render(rows).join("\n") };
};

test("a run of calls renders once: one line each, nothing more until clicked", async () => {
  const { row } = setup([turn("a"), turn("b"), turn("c")]);
  const rows = [row("a"), row("b"), row("c")];
  rows.forEach((r, i) => finish(r, `output ${i}`));
  await tick();

  const lines = render(rows);
  // Pi's spacer, the block's padding, then a table: the tool named once, its calls aligned.
  expect(lines.slice(0, 5)).toEqual([
    "",
    "",
    expect.stringMatching(/^ {3}bash {6}\$ echo a +1\.2s$/),
    expect.stringMatching(/^ {13}\$ echo b +1\.2s$/),
    expect.stringMatching(/^ {13}\$ echo c +1\.2s$/),
  ]);
  expect(blocksOf(rows)).toBe(1);
  const screen = lines.join("\n");
  expect(screen).not.toContain("output");
  expect(screen).not.toContain("✓");

  await tick();
  rows[0]!.render(WIDTH);
  expect(rows[1]!.render(WIDTH)).toEqual([]);
  expect(rows[2]!.render(WIDTH)).toEqual([]);
});

test("an opened call shows its output under its line, without the repeated duration", async () => {
  const { row } = setup([turn("a"), turn("b")]);
  const rows = [row("a"), row("b")];
  rows.forEach((r, i) => finish(r, `output ${i}`));
  await tick();
  const lines = (await clickLine(rows, /echo b/)).screen.split("\n");
  expect(lines.filter((line) => line.includes("echo b"))).toHaveLength(1);
  expect(lines.join("\n")).not.toContain("Took");
  const output = lines.findIndex((line) => line.includes("output 1"));
  // One step in from the call's text, which starts past the name column.
  expect(lines[output]).toMatch(/^ {15}output 1$/);
  expect(lines[output - 1]).toContain("echo b");
});

test("a heading bullet gives way to the command beneath it", async () => {
  const twoLines: ToolRenderers = {
    renderCall: () => new Text("• Ran\n  └ cd /repo && make", 0, 0),
    renderResult: () => new Text("out", 0, 0),
  };
  const { row } = setup([turn("a"), turn("b")], twoLines);
  const rows = [row("a"), row("b")];
  rows.forEach((r) => finish(r, "x"));
  await tick();
  expect(render(rows).some((line) => /^ +cd \/repo && make +1\.2s$/.test(line))).toBe(true);
});

test("a single-line bullet call keeps its text", async () => {
  const oneLine: ToolRenderers = {
    renderCall: () => new Text("• Waited for background terminal", 0, 0),
    renderResult: () => new Text("out", 0, 0),
  };
  const { row } = setup([turn("a"), turn("b")], oneLine);
  const rows = [row("a"), row("b")];
  rows.forEach((r) => finish(r, "x"));
  await tick();
  expect(render(rows).join("\n")).toContain("Waited for background terminal");
});

test("an overview drops the repeated tool name and file content, and always shows the duration", async () => {
  const write = createWriteToolDefinition("/tmp") as unknown as ToolRenderers;
  const { row } = setup([turn("a"), turn("b")], write, "write");
  const args = (path: string) => ({ path, content: "file body" });
  const rows = [row("a", args("/tmp/ones/1.txt")), row("b", args("/tmp/ones/2.txt"))];
  rows.forEach((r) => {
    r.markExecutionStarted();
    r.updateResult({ ...output("ok"), durationMs: 3 });
  });
  await tick();
  const lines = render(rows);
  expect(blocksOf(rows)).toBe(1);
  expect(lines.some((line) => /^ {3}write {5}\/tmp\/ones\/1\.txt +0\.0s$/.test(line))).toBe(true);
  expect(lines.some((line) => /^ {13}\/tmp\/ones\/2\.txt +0\.0s$/.test(line))).toBe(true);
  // The content belongs to the call's opened output, not to any overview line.
  expect(lines.join("\n")).not.toContain("file body");
  const opened = (await clickLine(rows, /2\.txt/)).screen.split("\n");
  expect(opened.filter((line) => line.includes("file body"))).toEqual([
    " ".repeat(15) + "file body",
  ]);
});

test("opening a call shows what its call showed past the first paragraph too", async () => {
  const write = createWriteToolDefinition("/tmp") as unknown as ToolRenderers;
  const { row } = setup([turn("a"), turn("b")], write, "write");
  const rows = [
    row("a", { path: "/tmp/a.txt", content: "body a" }),
    row("b", { path: "/tmp/b.txt", content: "body b" }),
  ];
  rows.forEach((r) => finish(r, ""));
  await tick();
  expect(render(rows).join("\n")).not.toContain("body");
  expect((await clickLine(rows, /tmp\/a\.txt/)).screen).toContain("body a");
  expect((await clickLine(rows, /tmp\/a\.txt/)).screen).not.toContain("body a");
});

test("a click on a result inside an open call reaches the result's own handler", async () => {
  const clicks: number[] = [];
  const clickable: ToolRenderers = {
    renderCall: () => new Text("do the thing", 0, 0),
    renderResult: () => ({
      render: () => ["", "first", "second"],
      invalidate() {},
      handleMouse(event: TuiMouseEvent) {
        clicks.push(event.y);
        return { handled: true };
      },
    }),
  };
  const { row } = setup([turn("a"), turn("b")], clickable);
  const rows = [row("a"), row("b")];
  rows.forEach((r) => finish(r, "x"));
  await tick();
  render(rows);
  await tick();
  await clickLine(rows, /do the thing/);
  await clickLine(rows, /second/, 16); // Past the output's indent, on the text itself.
  expect(clicks).toEqual([2]);
});

test("a call's overview shows its path even when the model sent the content first", async () => {
  const write = createWriteToolDefinition("/tmp") as unknown as ToolRenderers;
  const { row } = setup([turn("a"), turn("b")], write, "write");
  const rows = [
    row("a", { content: "file body", path: "/tmp/a.txt" }),
    row("b", { content: "other", path: "/tmp/b.txt" }),
  ];
  rows.forEach((r) => finish(r, ""));
  await tick();
  const line = render(rows).find((text) => text.includes("/tmp/a.txt"));
  expect(line).toMatch(/^ {3}write {5}\/tmp\/a\.txt +1\.2s$/);
  expect(render(rows).join("\n")).not.toContain("file body");
});

test("control codes in arguments and tool output never reach the terminal", async () => {
  const oneWord: ToolRenderers = { renderCall: () => new Text("• Patching", 0, 0) };
  const { row } = setup([turn("a"), turn("b")], oneWord);
  const rows = [row("a", { input: "evil\x1b[2J\x1b]0;pwn\x07 text" }), row("b", { input: "fine" })];
  rows.forEach((r) => finish(r, "out\x1b[2Jput\r\x07"));
  await tick();
  const raw = rows.flatMap((r) => r.render(WIDTH)).join("\n");
  // oxlint-disable-next-line no-control-regex -- matching them is the point
  expect(raw).not.toMatch(/\x1b\[2J|\x1b\]0;|\x07|\r/);
  expect(plain(rows[0]!.render(WIDTH)).join("\n")).toContain("evil text");
});

test("a huge argument stays one short line on a tool with no renderer", async () => {
  const { row } = setup([turn("a")], {});
  const single = row("a", { content: "x ".repeat(500_000) });
  single.setExpanded(false);
  await tick();
  expect(single.render(WIDTH).length).toBeLessThan(10);
  expect(plain(single.render(WIDTH)).join("")).toMatch(/…|\.\.\./);
});

test("no line passes the terminal's edge at any width", async () => {
  const entries = [turn("a"), turn("b"), turn("c")];
  for (const width of [4, 6, 8, 10, 12, 14, 16, 20, 30, 40, 80, 119]) {
    const { row } = setup(entries);
    const rows = [
      row("a", { command: "中文宽字符".repeat(20) }),
      row("b", { command: "🙂emoji🙂".repeat(20) }),
      row("c", { command: `echo${" x".repeat(90)}` }),
    ];
    rows.forEach((r, i) => finish(r, "输出行".repeat(30), i === 0));
    await tick();
    const lines = rows.flatMap((r) => r.render(width));
    expect(Math.max(...lines.map(visibleWidth)), `width ${width}`).toBeLessThanOrEqual(width);
  }
});

test("a call alone opens on a click, without Pi's own toggle, and stays open in a group", async () => {
  const entries = [turn("a")];
  const { row } = setup(entries);
  const first = row("a");
  finish(first, "output a");
  await tick();
  expect(render([first]).join("\n")).not.toContain("output a");
  const { result, screen } = await clickLine([first], /echo a/);
  expect(result?.handled).toBe(true);
  expect(isExpandedNatively(first)).toBe(false);
  expect(screen).toContain("output a");

  entries.push(turn("b"));
  const rows = [first, row("b")];
  finish(rows[1]!, "output b");
  await tick();
  render(rows);
  await tick();
  const grouped = render(rows).join("\n");
  expect(blocksOf(rows)).toBe(1);
  expect(grouped).toContain("output a");
  expect(grouped).not.toContain("output b");
});

test("output that merely starts like a duration is kept", async () => {
  const says = (text: string): ToolRenderers => ({
    renderCall: () => new Text("do it now", 0, 0),
    renderResult: () => new Text(text, 0, 0),
  });
  const { row } = setup([turn("a"), turn("b")], says("real\nTook 3 days"));
  const rows = [row("a"), row("b")];
  rows.forEach((r) => finish(r, "x"));
  await tick();
  expect((await clickLine(rows, /do it now/)).screen).toContain("Took 3 days");
});

test.each([
  [90_000, "1m 30s"],
  [3_725_000, "1h 2m 5s"],
  [1_200, "1.2s"],
])("a %dms call shows %s, and its Took line goes", async (durationMs, shown) => {
  const { row } = setup([turn("a"), turn("b")]);
  const rows = [row("a"), row("b")];
  rows.forEach((r) => {
    r.markExecutionStarted();
    r.updateResult({ ...output("o"), durationMs });
  });
  await tick();
  const lines = render(rows);
  expect(lines.find((line) => line.includes("echo a"))?.endsWith(shown)).toBe(true);
  expect(lines.join("\n")).not.toContain("Took");
});

test("any tool groups the same way, with no per-tool setup", async () => {
  const renderers: ToolRenderers = {
    renderCall: () => new Text("doing something", 0, 0),
    renderResult: () => new Text("out", 0, 0),
  };
  const { row } = setup([turn("a"), turn("b")], renderers, "some_new_tool");
  const rows = [row("a", {}), row("b", {})];
  rows.forEach((r) => finish(r, "x"));
  await tick();
  expect(blocksOf(rows)).toBe(1);
  expect(render(rows).join("\n")).toMatch(/^ {3}some_new_tool  doing something +1\.2s$/m);
});

test("a one-word call falls back to its first string argument, so calls can be told apart", async () => {
  const patching: ToolRenderers = {
    renderCall: () => new Text("• Patching", 0, 0),
    renderResult: () => new Text("", 0, 0),
  };
  const { row } = setup([turn("a"), turn("b")], patching, "apply_patch");
  const patch = (path: string) => ({
    timeoutMs: 5,
    input: `*** Begin Patch\n*** Update File: ${path}`,
  });
  const rows = [row("a", patch("a.ts")), row("b", patch("b.ts"))];
  rows.forEach((r) => finish(r, "x"));
  await tick();
  const lines = render(rows);
  expect(
    lines.some((line) =>
      /^ {3}apply_patch  \*\*\* Begin Patch \*\*\* Update File: a\.ts +1\.2s$/.test(line),
    ),
  ).toBe(true);
  expect(lines.join("\n")).not.toContain("Patching");
});

test("a one-word call with no string argument keeps its word, then the tool name", async () => {
  const word: ToolRenderers = { renderCall: () => new Text("Working", 0, 0) };
  const { row } = setup([turn("a"), turn("b")], word);
  const rows = [row("a", { count: 1 }), row("b", { count: 2 })];
  rows.forEach((r) => r.markExecutionStarted());
  await tick();
  expect(render(rows).some((line) => /^ {3}bash {6}Working$/.test(line))).toBe(true);

  const empty: ToolRenderers = { renderCall: () => new Text("", 0, 0) };
  const second = setup([turn("a"), turn("b")], empty);
  const bare = [second.row("a", {}), second.row("b", {})];
  bare.forEach((r) => r.markExecutionStarted());
  await tick();
  expect(render(bare).some((line) => /^ {13}bash$/.test(line))).toBe(true);
});

test("re-rendering keeps the original renderer's component instead of falling back", async () => {
  const { row } = setup([turn("a"), turn("b")]);
  const rows = [row("a"), row("b")];
  rows.forEach((r) => finish(r, "first"));
  rows[1]!.updateResult(output("second"));
  await tick();
  const lines = (await clickLine(rows, /echo b/)).screen;
  expect(lines).toContain("second");
  expect(lines).toContain("echo b");
  expect(lines).not.toMatch(/^\s*bash\s*$/m);
});

test("a host still running reports progress while later calls finish", async () => {
  const { row } = setup([turn("a", "b", "c")]);
  const rows = [row("a"), row("b"), row("c")];
  finish(rows[1]!, "b done");
  finish(rows[2]!, "c done");
  await tick();
  expect(render(rows).join("\n")).toMatch(/^ {3}bash {6}\$ echo a$/m);

  finish(rows[0]!, "a failed", true);
  await tick();
  const lines = render(rows).join("\n");
  expect(lines).toMatch(/^ {3}bash {6}\$ echo a +✗ 1\.2s$/m);
});

test("clicking a line opens only that call, even mid-run, and clicking again closes it", async () => {
  const { row } = setup([turn("a"), turn("b"), turn("c")]);
  const rows = [row("a"), row("b"), row("c")];
  finish(rows[0]!, "output a");
  rows[1]!.markExecutionStarted();
  finish(rows[2]!, "output c");
  await tick();
  render(rows);
  await tick();

  const opened = await clickLine(rows, /echo a/);
  expect(opened.result?.handled).toBe(true);
  expect(isExpandedNatively(rows[0]!)).toBe(false);
  expect(opened.screen).toContain("output a");
  expect(opened.screen).not.toContain("output c");

  const closed = await clickLine(rows, /echo a/);
  expect(closed.screen).not.toContain("output a");
});

test("a running call shows its output, and closes once it finishes", async () => {
  const { row } = setup([turn("a"), turn("b")]);
  const rows = [row("a"), row("b")];
  finish(rows[0]!, "output a");
  rows[1]!.markExecutionStarted();
  rows[1]!.updateResult({ content: [{ type: "text", text: "progress" }], isError: false }, true);
  await tick();
  expect(render(rows).join("\n")).toContain("progress");

  finish(rows[1]!, "progress done");
  await tick();
  render(rows);
  await tick();
  expect(render(rows).join("\n")).not.toContain("progress");
});

test("a click on output or padding changes nothing and never reaches Pi's row toggle", async () => {
  const { row } = setup([turn("a"), turn("b")]);
  const rows = [row("a"), row("b")];
  rows.forEach((r, i) => finish(r, `output ${i}`));
  await tick();
  const before = (await clickLine(rows, /echo b/)).screen;
  const { result, screen } = await clickLine(rows, /output 1/);
  expect(result?.handled).toBe(true);
  expect(screen).toBe(before);
  expect(isExpandedNatively(rows[0]!)).toBe(false);
});

test("Ctrl+O shows every call in full and discards earlier clicks", async () => {
  const { row } = setup([turn("a"), turn("b")]);
  const rows = [row("a"), row("b")];
  rows.forEach((r, i) => finish(r, `output ${i}`));
  await tick();
  expect((await clickLine(rows, /echo a/)).screen).toContain("output 0");

  rows.forEach((r) => r.setExpanded(true));
  await tick();
  const full = render(rows).join("\n");
  expect(full).toContain("output 0");
  expect(full).toContain("output 1");
  expect(full).toContain("Took");

  rows.forEach((r) => r.setExpanded(false));
  await tick();
  render(rows);
  await tick();
  const reset = render(rows).join("\n");
  expect(reset).not.toContain("output 0");
  expect(reset).not.toContain("output 1");
});

const longRun = async (size: number, failing?: number) => {
  const ids = Array.from({ length: size }, (_, i) => `c${i}`);
  const { row } = setup(ids.map((id) => turn(id)));
  const rows = ids.map((id) => row(id));
  rows.forEach((r, i) => finish(r, `output ${i}`, i === failing));
  await tick();
  return rows;
};

test("a long group shows its latest five calls, counting the rest", async () => {
  const lines = render(await longRun(20)).join("\n");
  expect(lines).toContain("▸ 15 earlier");
  expect(lines).not.toContain("echo c14");
  for (const id of ["c15", "c16", "c17", "c18", "c19"]) expect(lines).toContain(`echo ${id}`);
  expect(lines).not.toContain("output");
});

test("a group of exactly five has nothing to hide", async () => {
  const lines = render(await longRun(5)).join("\n");
  expect(lines).not.toContain("earlier");
  expect(lines).toContain("echo c0");
});

test("an old failure stays visible when its neighbours collapse", async () => {
  const lines = render(await longRun(20, 2)).join("\n");
  expect(lines).toContain("▸ 14 earlier");
  expect(lines).toMatch(/echo c2.*✗/);
});

test("clicking the earlier line reveals every call as one line, then hides them again", async () => {
  const rows = await longRun(20);
  const all = await clickLine(rows, /15 earlier/);
  expect(all.screen).toContain("▾ 15 earlier");
  expect(all.screen).toContain("echo c0");
  expect(all.screen).not.toContain("output 0");

  const recent = await clickLine(rows, /15 earlier/);
  expect(recent.screen).toContain("▸ 15 earlier");
  expect(recent.screen).not.toContain("echo c0");
});

test("a call opened among the earlier ones stays open across hiding them", async () => {
  const rows = await longRun(20);
  await clickLine(rows, /15 earlier/);
  expect((await clickLine(rows, /echo c3\b/)).screen).toContain("output 3");
  expect((await clickLine(rows, /15 earlier/)).screen).not.toContain("output 3");
  expect((await clickLine(rows, /15 earlier/)).screen).toContain("output 3");
});

const script = Array.from({ length: 40 }, (_, i) => `echo line${i}`).join("\n");

test("a call alone is one line, named, and opens on a click", async () => {
  const { row } = setup([turn("a")]);
  const single = row("a", { command: script });
  finish(single, "done");
  await tick();
  const lines = render([single]).filter((line) => line.trim());
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(/^ {3}bash {6}\$ echo line0 echo line1 echo line2 +1\.2s$/);
  expect((await clickLine([single], /echo line0/)).screen).toContain("done");

  single.setExpanded(true);
  await tick();
  expect(render([single]).join("\n")).toContain("echo line39");
});

test("a call alone ends its line with the duration; Ctrl+O brings back Pi's own view", async () => {
  const { row } = setup([turn("a")]);
  const single = row("a", { command: "echo hi" });
  finish(single, "hi");
  await tick();
  expect(render([single]).filter((line) => line.trim())).toEqual([
    expect.stringMatching(/^ {3}bash {6}\$ echo hi +1\.2s$/),
  ]);
  const opened = (await clickLine([single], /echo hi/)).screen;
  expect(opened).toMatch(/^ {15}hi$/m);
  expect(opened).not.toContain("Took");

  single.setExpanded(true);
  await tick();
  expect(render([single]).join("\n")).toContain("Took 1.2s");
});

test("a call alone still running has no mark and no duration yet", async () => {
  const { row } = setup([turn("a")]);
  const single = row("a", { command: "sleep 9" });
  single.markExecutionStarted();
  await tick();
  expect(render([single]).find((line) => line.includes("sleep 9"))).toMatch(
    /^ {3}bash {6}\$ sleep 9$/,
  );
});

test("opened content one line over the limit shows that line instead of a count", async () => {
  const write = createWriteToolDefinition("/tmp") as unknown as ToolRenderers;
  const { row } = setup([turn("a")], write, "write");
  const single = row("a", { path: "/tmp/a.txt", content: "a\nb\nc" });
  finish(single, "");
  await tick();
  const screen = (await clickLine([single], /a\.txt/)).screen;
  expect(screen).toMatch(/^ {15}c$/m);
  expect(screen).not.toContain("more lines");
});

test("a clicked call shows its content in full, without repeating its title", async () => {
  const write = createWriteToolDefinition("/tmp") as unknown as ToolRenderers;
  const { row } = setup([turn("a"), turn("b")], write, "write");
  const body = Array.from({ length: 40 }, (_, i) => `body${i}`).join("\n");
  const rows = [
    row("a", { path: "/tmp/a.txt", content: "x" }),
    row("b", { path: "/tmp/b.txt", content: body }),
  ];
  rows.forEach((r) => finish(r, ""));
  await tick();
  const screen = (await clickLine(rows, /b\.txt/)).screen;
  expect(screen).toContain("body0");
  expect(screen).toContain("body39");
  expect(screen).not.toContain("more lines");
  expect(screen.match(/b\.txt/g)).toHaveLength(1);
});

const longOutput = Array.from({ length: 30 }, (_, i) => `out${i}`).join("\n");

test("a clicked call shows its whole command and all of its output", async () => {
  const { row } = setup([turn("a"), turn("b")]);
  const rows = [row("a"), row("b", { command: "echo one\necho two\necho three" })];
  rows.forEach((r) => finish(r, longOutput));
  await tick();
  const screen = (await clickLine(rows, /echo one/)).screen;
  for (const line of ["echo two", "echo three", "out0", "out29"]) expect(screen).toContain(line);
  expect(screen).not.toMatch(/earlier lines|more lines/);

  // Closed again, it goes back to one line.
  const closed = (await clickLine(rows, /echo one/)).screen;
  expect(closed).not.toContain("out29");
});

test("a running call opens on its own only as a preview of its progress", async () => {
  const { row } = setup([turn("a"), turn("b")]);
  const rows = [row("a"), row("b")];
  finish(rows[0]!, "x");
  rows[1]!.markExecutionStarted();
  rows[1]!.updateResult({ content: [{ type: "text", text: longOutput }], isError: false }, true);
  await tick();
  render(rows);
  await tick();
  const screen = render(rows).join("\n");
  expect(screen).toContain("out29");
  expect(screen).not.toContain("out0\n");
});

test("a path every overview shares is shortened, so the part that differs shows", async () => {
  const base = "/Users/someone/projects/a-rather-long-name/mods";
  const { row } = setup([turn("a"), turn("b"), turn("c")], edit(), "edit");
  const rows = ["one/main.js", "two/main.js", "three/check.cjs"].map((file, i) =>
    row("abc"[i]!, editArgs(`${base}/${file}`)),
  );
  rows.forEach(finishEdit);
  await tick();
  const lines = render(rows);
  for (const file of ["one/main.js", "two/main.js", "three/check.cjs"]) {
    expect(
      lines.some((line) => new RegExp(`  …/${file.replace(".", "\\.")} +1\\.2s$`).test(line)),
    ).toBe(true);
  }
  expect(lines.join("\n")).not.toContain("a-rather-long-name");
});

test("a shared path inside a command keeps what comes before it", async () => {
  const dir = "/Users/someone/worktrees/Engineer/tools/quantity";
  const { row } = setup([turn("a"), turn("b")]);
  const rows = [
    row("a", { command: `cd ${dir}/server && make` }),
    row("b", { command: `cd ${dir}/client && test` }),
  ];
  rows.forEach((r) => finish(r, "x"));
  await tick();
  const lines = render(rows);
  expect(lines.some((line) => /  \$ cd …\/server && make +1\.2s$/.test(line))).toBe(true);
  expect(lines.some((line) => /  \$ cd …\/client && test +1\.2s$/.test(line))).toBe(true);
});

test("one unrelated call does not stop its neighbours from shortening", async () => {
  const dir = "/Users/someone/worktrees/Engineer/tools/quantity";
  const { row } = setup([turn("a"), turn("b"), turn("c")]);
  const rows = [
    row("a", { command: "ssh kvm uptime" }),
    row("b", { command: `cd ${dir}/server && make` }),
    row("c", { command: `cd ${dir}/client && test` }),
  ];
  rows.forEach((r) => finish(r, "x"));
  await tick();
  const screen = render(rows).join("\n");
  expect(screen).toContain("$ ssh kvm uptime");
  expect(screen).toContain("$ cd …/server && make");
  expect(screen).toContain("$ cd …/client && test");
});

test("a directory that tells a call from one neighbour stays, even if the other shares it", async () => {
  const base = "/Users/someone/projects/a-rather-long-name/mods";
  const files = ["agents/main.js", "menu/main.js", "menu/check.cjs", "spaces/main.js"];
  const { row } = setup(
    files.map((_, i) => turn(`r${i}`)),
    edit(),
    "edit",
  );
  const rows = files.map((file, i) => row(`r${i}`, editArgs(`${base}/${file}`)));
  rows.forEach(finishEdit);
  await tick();
  const screen = render(rows).join("\n");
  for (const file of files) expect(screen).toContain(`…/${file}`);
});

test("a path is never shortened against a call hidden among the earlier ones", async () => {
  const ids = Array.from({ length: 7 }, (_, i) => `c${i}`);
  const { row } = setup(ids.map((id) => turn(id)));
  const long = "/Users/someone/very/long/shared/path";
  const rows = ids.map((id, i) => row(id, { command: i < 3 ? `cat ${long}/${id}` : `echo ${id}` }));
  rows.forEach((r) => finish(r, "x"));
  await tick();
  // c0 and c1 hide among the earlier calls; c2 is the oldest one shown, so its path stays whole.
  const screen = render(rows).join("\n");
  expect(screen).toContain(`$ cat ${long}/c2`);
});

test("a shared path under the working directory shortens from its ./, leaving no stray dot", async () => {
  const { row } = setup([turn("a"), turn("b")]);
  const dir = `${CWD}/packages/pi-tool-groups`;
  const rows = [
    row("a", { command: `cat ${dir}/index.ts` }),
    row("b", { command: `cat ${dir}/layout.ts` }),
  ];
  rows.forEach((r) => finish(r, "x"));
  await tick();
  const screen = render(rows).join("\n");
  expect(screen).toContain("$ cat …/index.ts");
  expect(screen).toContain("$ cat …/layout.ts");
  expect(screen).not.toContain(".…");
});

test("a short shared path stays, and calls with nothing in common are untouched", async () => {
  const { row } = setup([turn("a"), turn("b"), turn("c")]);
  const rows = [
    row("a", { command: "cat /tmp/x/a.txt" }),
    row("b", { command: "cat /tmp/x/b.txt" }),
    row("c", { command: "ls /var" }),
  ];
  rows.forEach((r) => finish(r, "x"));
  await tick();
  const screen = render(rows).join("\n");
  expect(screen).toContain("$ cat /tmp/x/a.txt");
  expect(screen).not.toContain("…/");
});

test("a cut-off overview keeps the group's background to the end of the line", async () => {
  const { row } = setup([turn("a"), turn("b")]);
  const rows = [row("a", { command: `echo ${"x".repeat(200)}` }), row("b")];
  rows.forEach((r) => finish(r, "x"));
  await tick();
  const line = rows[0]!.render(WIDTH).find((text) => text.includes("xxx"))!;
  expect(stripTerminalSequences(line)).toContain("…");
  // A full reset would end the background before the duration.
  expect(line).not.toContain("\x1b[0m");
});

test("an overview folds runs of whitespace into one space", async () => {
  const { row } = setup([turn("a"), turn("b")]);
  const rows = [row("a", { command: "echo a          b" }), row("b")];
  rows.forEach((r) => finish(r, "x"));
  await tick();
  expect(render(rows).join("\n")).toContain("$ echo a b ");
});

test("adjacent calls of different tools share one block, as one aligned table", async () => {
  const { row, rowOf } = setup([turn("a"), turn("b"), turn("c"), turn("d"), turn("e")]);
  const rows = [
    row("a", { command: "git status" }),
    rowOf("codemode", "b", { command: "cat /tmp/notes.md" }),
    row("c", { command: "make" }),
    row("d", { command: "make test" }),
    rowOf("read", "e", { command: "cat /tmp/other.md" }),
  ];
  rows.forEach((r, i) => finish(r, `output ${i}`, i === 4));
  await tick();
  const lines = render(rows).filter((line) => line.trim());
  // Every call's text starts in one column, past the widest name; a failure is only its mark.
  expect(lines).toEqual([
    expect.stringMatching(/^ {3}bash {6}\$ git status +1\.2s$/),
    expect.stringMatching(/^ {3}codemode  \$ cat \/tmp\/notes\.md +1\.2s$/),
    expect.stringMatching(/^ {3}bash {6}\$ make +1\.2s$/),
    expect.stringMatching(/^ {13}\$ make test +1\.2s$/),
    expect.stringMatching(/^ {3}read {6}\$ cat \/tmp\/other\.md +✗ 1\.2s$/),
  ]);
  expect(blocksOf(rows)).toBe(1);

  // Opened output lines up under the call's text.
  const opened = (await clickLine(rows, /make test/)).screen.split("\n");
  expect(opened[opened.findIndex((line) => line.includes("make test")) + 1]).toBe(
    " ".repeat(15) + "output 3",
  );
});

test("a block's background stays the same when a call in it fails", async () => {
  const { row } = setup([turn("a"), turn("b")]);
  const ok = [row("a"), row("b")];
  ok.forEach((r) => finish(r, "x"));
  const failed = setup([turn("a"), turn("b")]);
  const bad = [failed.row("a"), failed.row("b")];
  finish(bad[0]!, "x");
  finish(bad[1]!, "x", true);
  await tick();
  const background = (line: string) => line.slice(0, line.indexOf(" "));
  expect(background(bad[0]!.render(WIDTH)[1]!)).toBe(background(ok[0]!.render(WIDTH)[1]!));
});

test("Ctrl+O in a mixed block shows every call as its tool draws it", async () => {
  const { row, rowOf } = setup([turn("a"), turn("b"), turn("c")]);
  const rows = [row("a"), row("b"), rowOf("read", "c", { path: "/tmp/x.md" })];
  rows.forEach((r, i) => finish(r, `output ${i}`));
  rows.forEach((r) => r.setExpanded(true));
  await tick();
  const screen = render(rows).join("\n");
  expect(blocksOf(rows)).toBe(1);
  for (const i of [0, 1, 2]) expect(screen).toContain(`output ${i}`);
});

test("every block puts its name column at the same width", async () => {
  const thinking = {
    type: "message",
    message: {
      role: "assistant",
      stopReason: "toolUse",
      content: [
        { type: "text", text: "next" },
        { type: "toolCall", id: "c", name: "bash", arguments: {} },
      ],
    },
  } as SessionEntry;
  const { row, rowOf } = setup([turn("a"), turn("b"), thinking]);
  const rows = [
    row("a", { command: "ls" }),
    rowOf("codemode", "b", { command: "x" }),
    row("c", { command: "pwd" }),
  ];
  rows.forEach((r) => finish(r, "x"));
  await tick();
  const lines = render(rows);
  expect(lines.find((line) => line.includes("$ ls"))).toMatch(/^ {3}bash {6}\$ ls/);
  // A block of bash alone still leaves room for the widest name elsewhere.
  expect(lines.find((line) => line.includes("$ pwd"))).toMatch(/^ {3}bash {6}\$ pwd/);
});

test("paths read one way: the working directory as ., home as ~", async () => {
  const home = homedir();
  const cwd = `${home}/proj`;
  const { rowOf } = setup([turn("a"), turn("b"), turn("c")]);
  const rows = [
    rowOf("bash", "a", { command: `cd ${cwd}/packages && ls ${home}/notes` }, cwd),
    rowOf("bash", "b", { command: "cat ~/proj/README.md ~/project-x" }, cwd),
    rowOf("bash", "c", { command: `ls ${cwd}` }, cwd),
  ];
  rows.forEach((r) => finish(r, "x"));
  await tick();
  const screen = render(rows).join("\n");
  expect(screen).toContain("$ cd ./packages && ls ~/notes");
  expect(screen).toContain("$ cat ./README.md ~/project-x");
  expect(screen).toMatch(/\$ ls \. +1\.2s$/m);
});

test("a block leaves the last column unpainted, for Pi's scrollbar to sit over", async () => {
  const { row } = setup([turn("a"), turn("b")]);
  const rows = [row("a"), row("b")];
  rows.forEach((r) => finish(r, "x"));
  await tick();
  const lines = rows[0]!.render(WIDTH);
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines.filter((text) => text)) {
    expect(visibleWidth(line)).toBe(WIDTH);
    // The background ends, then one plain space.
    expect(line.endsWith("\x1b[49m ")).toBe(true);
  }
});

test("a block leaves the same padding on its left and right", async () => {
  const { row } = setup([turn("a")]);
  const single = row("a", { command: "echo a" });
  finish(single, "x");
  await tick();
  const line = stripTerminalSequences(
    single.render(WIDTH).find((text) => text.includes("echo a")) ?? "",
  );
  expect(line.startsWith("   bash")).toBe(true);
  // The right padding, then the column left for the scrollbar.
  expect(line.endsWith("1.2s    ")).toBe(true);
});

test("a running script shows a short preview past its overview, and folds when it ends", async () => {
  const script = Array.from({ length: 20 }, (_, i) => `line${i}`);
  // As codemode: a bare name, then the script directly, in a preview of its own when collapsed.
  const renderers: ToolRenderers = {
    renderCall: (_args, _theme, ctx) =>
      new Text(
        ["codemode", ...(ctx.expanded ? script : [...script.slice(0, 8), "(12 more)"])].join("\n"),
        0,
        0,
      ),
  };
  const { row } = setup([turn("a")], renderers, "codemode");
  const single = row("a", {});
  single.markExecutionStarted();
  await tick();
  render([single]);
  await tick();
  const lines = render([single]).map((line) => line.trim());
  expect(lines).not.toContain("codemode");
  // line0 and line1 are the overview, so the preview starts after them.
  expect(lines).not.toContain("line0");
  expect(lines).toContain("line2");
  expect(lines).toContain("line3");
  expect(lines).not.toContain("line4");
  expect(lines.join("\n")).toContain("more lines, click to open");

  finish(single, "");
  await tick();
  render([single]);
  await tick();
  expect(render([single]).join("\n")).not.toContain("line2");
});

test("a preview keeps a line the overview had to cut short", async () => {
  const long = "x".repeat(WIDTH);
  const renderers: ToolRenderers = {
    renderCall: () => new Text(`codemode\n${long}\nsecond`, 0, 0),
  };
  const { row } = setup([turn("a")], renderers, "codemode");
  const single = row("a", {});
  single.markExecutionStarted();
  await tick();
  render([single]);
  await tick();
  const screen = render([single]).join("\n");
  expect(screen).toContain("x".repeat(WIDTH / 2));
  expect(screen).toContain("second");
});

test("a call draws itself expanded only once a click opens it", async () => {
  let expanded = 0;
  const renderers: ToolRenderers = {
    renderCall: (_args, _theme, ctx) => {
      if (ctx.expanded) expanded++;
      return new Text("$ echo a", 0, 0);
    },
    renderResult: (_result, options) => {
      if (options.expanded) expanded++;
      return new Text("x", 0, 0);
    },
  };
  const { row } = setup([turn("a"), turn("b")], renderers);
  const rows = [row("a"), row("b")];
  finish(rows[0]!, "x");
  rows[1]!.markExecutionStarted();
  rows[1]!.updateResult(output("x"), true);
  await tick();
  render(rows);
  await tick();
  render(rows);
  expect(expanded).toBe(0);
});

test("an opened call far too long to draw is cut, rather than overflowing Pi's stack", async () => {
  const body = Array.from({ length: 130_000 }, (_, i) => `line${i}`);
  const renderers: ToolRenderers = {
    renderCall: () => new Text("flood go", 0, 0),
    renderResult: (_result, options) => ({
      render: () => (options.expanded ? body : body.slice(-3)),
      invalidate() {},
    }),
  };
  const { row } = setup([turn("a")], renderers, "flood");
  const single = row("a", {});
  finish(single, "x");
  await tick();
  const { screen } = await clickLine([single], /flood +go/);
  expect(screen.split("\n").length).toBeLessThan(50_100);
  expect(screen).toContain("more lines not drawn");
});

test("a break in the layout splits the run", async () => {
  const thinking = {
    type: "message",
    message: {
      role: "assistant",
      stopReason: "toolUse",
      content: [
        { type: "thinking", thinking: "hm" },
        { type: "toolCall", id: "c", name: "bash", arguments: {} },
      ],
    },
  } as SessionEntry;
  const { row } = setup([turn("a"), turn("b"), thinking, turn("d")]);
  const rows = [row("a"), row("b"), row("c"), row("d")];
  rows.forEach((r, i) => finish(r, `output ${i}`));
  await tick();
  const lines = render(rows).join("\n");
  expect(blocksOf(rows)).toBe(2);
  expect(lines).toContain("echo b");
  expect(lines).toContain("echo d");
});

test("a row with an image stands alone so its picture stays in place", async () => {
  const { row } = setup([turn("a"), turn("b"), turn("c")]);
  const rows = [row("a"), row("b"), row("c")];
  finish(rows[0]!, "a out");
  rows[1]!.markExecutionStarted();
  rows[1]!.updateResult({
    content: [{ type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" }],
    isError: false,
  });
  finish(rows[2]!, "c out");
  await tick();
  const lines = render(rows).join("\n");
  expect(lines).not.toContain("calls");
  // The calls on either side stand alone as one line each; the image row is Pi's own.
  expect(lines).toMatch(/bash {6}\$ echo a/);
  expect(lines).toMatch(/bash {6}\$ echo c/);
  expect(lines).toContain("$ echo b");
});

test("members stay visible when their host is not mounted", async () => {
  const { row } = setup([turn("a"), turn("b"), turn("c")]);
  row("a"); // Registered, but never rendered: a rebuild dropped it from the chat.
  const members = [row("b"), row("c")];
  members.forEach((r, i) => finish(r, `output ${i}`));
  await tick();
  const lines = render(members).join("\n");
  expect(lines).toContain("output 0");
  expect(lines).toContain("output 1");
});

test("a streaming call joins the group before it is persisted, and survives persistence", async () => {
  const entries = [turn("a")];
  const { row, emit } = setup(entries);
  const message = {
    role: "assistant",
    stopReason: "toolUse",
    content: [{ type: "toolCall", id: "b", name: "bash", arguments: {} }],
  };
  emit("message_update", { message });
  const rows = [row("a"), row("b")];
  finish(rows[0]!, "a out");
  await tick();
  expect(blocksOf(rows)).toBe(1);

  entries.push(turn("b"));
  await tick();
  expect(blocksOf(rows)).toBe(1);

  emit("agent_end", {});
  await tick();
  expect(blocksOf(rows)).toBe(1);
});

test("HTML export gets the original components, never an empty row", () => {
  const { definition } = setup([turn("a"), turn("b")]);
  const context = {
    toolCallId: "b",
    executionStarted: true,
    state: {},
    expanded: false,
    invalidate() {},
    lastComponent: undefined,
    args: { command: "echo b" },
  } as never;
  const renderers = definition()!;
  const theme = {
    fg: (_c: string, value: string) => value,
    bold: (value: string) => value,
  } as never;
  expect(
    plain(renderers.renderCall!({ command: "echo b" }, theme, context).render(WIDTH)).join(""),
  ).toContain("echo b");
  const result = renderers.renderResult!(
    output("b out"),
    { expanded: false, isPartial: false },
    theme,
    context,
  );
  expect(plain(result.render(WIDTH)).join("\n")).toContain("b out");
});

test("tools without renderers get Pi-like fallbacks and still group", async () => {
  const { row } = setup([turn("a"), turn("b")], {});
  const rows = [row("a"), row("b")];
  rows.forEach((r, i) => finish(r, `output ${i}`));
  await tick();
  expect(blocksOf(rows)).toBe(1);
  expect((await clickLine(rows, /echo a/)).screen).toContain("output 0");
});

test("a throwing renderer falls back rather than surfacing in the row", async () => {
  const broken: ToolRenderers = {
    renderCall() {
      throw new Error("boom");
    },
    renderResult: (result) => new Text(String(result.content.length), 0, 0),
  };
  const { row } = setup([turn("a")], broken);
  const single = row("a");
  finish(single, "x");
  await tick();
  expect(render([single]).join("\n")).toContain("bash");
});

test("unknown tools keep Pi's raw view", () => {
  expect(setup([], "none").definition()).toBeUndefined();
});

const edit = () => createEditToolDefinition("/tmp") as unknown as ToolRenderers;
const diff = Array.from({ length: 40 }, (_, i) => `+${i + 1} changed${i}`).join("\n");
const editArgs = (path: string) => ({ path, edits: [{ oldText: "a", newText: "b" }] });
const finishEdit = (row: ToolExecutionComponent) => {
  row.markExecutionStarted();
  row.updateResult({ ...output("ok"), details: { diff } });
};

test("a self-framed call alone is one line too, and opens to its whole content", async () => {
  const { row } = setup([turn("a")], edit(), "edit");
  const single = row("a", editArgs("/tmp/a.txt"));
  finishEdit(single);
  await tick();
  const lines = render([single]).filter((line) => line.trim());
  expect(lines).toEqual([expect.stringMatching(/^ {3}edit {6}\/tmp\/a\.txt +1\.2s$/)]);

  const screen = (await clickLine([single], /a\.txt/)).screen;
  expect(screen).toContain("changed0");
  expect(screen).toContain("changed39");
  expect(screen).not.toContain("more lines");

  // Ctrl+O shows exactly what Pi draws without the extension.
  single.setExpanded(true);
  const native = new ToolExecutionComponent(
    "edit",
    "n",
    editArgs("/tmp/a.txt"),
    {},
    edit() as never,
    ui,
    "/tmp",
  );
  finishEdit(native);
  native.setExpanded(true);
  await tick();
  expect(render([single])).toEqual(plain(native.render(WIDTH)));
});

test("consecutive self-framed calls group like any other tool", async () => {
  const { row } = setup([turn("a"), turn("b")], edit(), "edit");
  const rows = [row("a", editArgs("/tmp/a.txt")), row("b", editArgs("/tmp/b.txt"))];
  rows.forEach(finishEdit);
  await tick();
  const lines = render(rows);
  expect(blocksOf(rows)).toBe(1);
  expect(lines.some((line) => /^ {3}edit {6}\/tmp\/a\.txt +1\.2s$/.test(line))).toBe(true);
  expect(lines.join("\n")).not.toContain("changed0");
  expect(rows[1]!.render(WIDTH)).toEqual([]);
  const opened = (await clickLine(rows, /a\.txt/)).screen.split("\n");
  expect(opened.filter((line) => line.includes("changed0"))).toHaveLength(1);
  expect(opened.join("\n")).toContain("changed39");
});
