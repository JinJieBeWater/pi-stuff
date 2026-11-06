import { expect, test } from "vite-plus/test";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { layoutOf, withStreaming } from "../layout";

const assistant = (
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"] = "toolUse",
) => ({ role: "assistant", content, stopReason }) as AssistantMessage;
const call = (id: string) => ({ type: "toolCall", id, name: "bash", arguments: {} }) as const;
const text = (value: string) => ({ type: "text", text: value }) as const;
const thinking = (value: string) => ({ type: "thinking", thinking: value }) as const;
const message = (value: unknown) => ({ type: "message", message: value }) as SessionEntry;
const turn = (...content: AssistantMessage["content"]) => message(assistant(content));

test("consecutive tool messages stay adjacent across their results", () => {
  const layout = layoutOf([
    turn(call("a")),
    message({ role: "toolResult", toolCallId: "a" }),
    turn(call("b"), call("c")),
  ]);
  expect(layout.order).toEqual(["a", "b", "c"]);
  expect([...layout.breaks]).toEqual(["a"]);
});

test.each([
  ["thinking", turn(thinking("plan"), call("b"))],
  ["text", turn(text("note"), call("b"))],
  ["thinking after the call, which Pi still draws above it", turn(call("b"), thinking("plan"))],
  ["a length stop", message(assistant([call("b")], "length"))],
])("%s breaks before the message's first tool call", (_name, entry) => {
  expect(layoutOf([turn(call("a")), entry]).breaks.has("b")).toBe(true);
});

test("text between two calls of one message does not split them, since Pi draws it above both", () => {
  const layout = layoutOf([turn(call("a"), text("note"), call("b"))]);
  expect(layout.breaks.has("b")).toBe(false);
});

test("blank thinking and text draw nothing, so they do not break", () => {
  const layout = layoutOf([turn(call("a")), turn(thinking(" \n"), text("  "), call("b"))]);
  expect(layout.breaks.has("b")).toBe(false);
});

test.each<[string, SessionEntry]>([
  ["a user message", message({ role: "user", content: "hi" })],
  ["a ! command", message({ role: "bashExecution", command: "ls" })],
  ["a compaction", { type: "compaction" } as SessionEntry],
  ["a branch summary", { type: "branch_summary" } as SessionEntry],
  ["a shown custom message", { type: "custom_message", display: true } as SessionEntry],
  ["an aborted message without tools", message(assistant([], "aborted"))],
  ["an errored message without tools", message(assistant([], "error"))],
  ["a text-only message", turn(text("done"))],
])("%s breaks the next call", (_name, entry) => {
  expect(layoutOf([turn(call("a")), entry, turn(call("b"))]).breaks.has("b")).toBe(true);
});

test.each<[string, SessionEntry]>([
  ["a hidden custom message", { type: "custom_message", display: false } as SessionEntry],
  ["an extension state entry", { type: "custom" } as SessionEntry],
  ["a model change", { type: "model_change" } as SessionEntry],
  ["a system message", message({ role: "system", content: "x" })],
])("%s draws nothing and does not break", (_name, entry) => {
  expect(layoutOf([turn(call("a")), entry, turn(call("b"))]).breaks.has("b")).toBe(false);
});

test("a streaming message is appended without touching the persisted layout", () => {
  const persisted = layoutOf([turn(call("a"))]);
  const merged = withStreaming(persisted, assistant([thinking("hm"), call("b")]));
  expect(merged.order).toEqual(["a", "b"]);
  expect(merged.breaks.has("b")).toBe(true);
  expect(persisted.order).toEqual(["a"]);
});

test("a streaming message already persisted is not added twice", () => {
  const persisted = layoutOf([turn(call("a"))]);
  expect(withStreaming(persisted, assistant([call("a")]))).toBe(persisted);
});
