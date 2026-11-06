/**
 * What this extension assumes of Pi beyond its documented API. When an upgrade breaks one of
 * these, the name says which assumption went, before any display test fails for no clear reason.
 */
import { beforeAll, expect, test } from "vite-plus/test";
import {
  createBashToolDefinition,
  initTheme,
  ToolExecutionComponent,
  type ToolRenderers,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  ScrollView,
  stripTerminalSequences,
  Text,
  truncateToWidth,
  type Component,
} from "@earendil-works/pi-tui";
import { stripTook } from "../text";

const ui = { requestRender() {} } as never;

beforeAll(() => initTheme("dark"));

test("Pi renders a TUI row's call once before execution starts, which HTML export never does", () => {
  const seen: boolean[] = [];
  const renderers: ToolRenderers = {
    renderCall: (_args, _theme, context) => {
      seen.push(context.executionStarted);
      return new Text("call", 0, 0);
    },
  };
  const row = new ToolExecutionComponent("t", "id", {}, {}, renderers as never, ui, "/work");
  row.markExecutionStarted();
  expect(seen[0]).toBe(false);
  expect(seen.at(-1)).toBe(true);
});

test("Pi's transcript renders every row, top to bottom, in one synchronous pass", () => {
  const order: number[] = [];
  const row = (i: number): Component => ({
    render: () => {
      order.push(i);
      return [`row ${i}`];
    },
    invalidate() {},
  });
  const transcript = new Container();
  for (let i = 0; i < 200; i++) transcript.addChild(row(i));
  // Rows far outside any viewport still render: a group's members rely on their host going first.
  new ScrollView(transcript, { follow: "end" }).render(80);
  expect(order).toEqual(Array.from({ length: 200 }, (_, i) => i));
});

test("Pi's shell results end with a Took line, which the overview's duration replaces", () => {
  const bash = createBashToolDefinition("/work") as unknown as ToolRenderers;
  const row = new ToolExecutionComponent(
    "bash",
    "id",
    { command: "ls" },
    {},
    bash as never,
    ui,
    "/work",
  );
  row.markExecutionStarted();
  row.updateResult({
    content: [{ type: "text", text: "out" }],
    isError: false,
    durationMs: 1200,
  } as never);
  const lines = row.render(80).filter((line) => stripTerminalSequences(line).trim());
  const stripped = stripTook(lines, 1200);
  expect(stripped.length).toBeLessThan(lines.length);
  expect(stripTerminalSequences(lines.at(-1)!).trim()).toBe("Took 1.2s");
});

test("pi-tui closes a cut line with a full reset, which fit swaps for one that keeps the background", () => {
  expect(truncateToWidth(`\x1b[31m${"x".repeat(20)}`, 5, "…")).toContain("\x1b[0m");
});
