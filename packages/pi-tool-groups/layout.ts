import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

/** Tool calls in chat order, and those with something visible right above them. */
export interface Layout {
  order: string[];
  breaks: Set<string>;
  pendingBreak: boolean;
}

function addAssistant(layout: Layout, message: AssistantMessage): void {
  const calls = message.content.flatMap((block) => (block.type === "toolCall" ? [block] : []));
  // Pi draws a message's text and thinking above all of its tool rows, whatever the block order.
  const hasVisibleBlock = message.content.some(
    (block) =>
      (block.type === "text" && block.text.trim()) ||
      (block.type === "thinking" && block.thinking.trim()),
  );
  const hasVisibleStop =
    message.stopReason === "length" ||
    (calls.length === 0 && (message.stopReason === "aborted" || message.stopReason === "error"));
  if (hasVisibleBlock || hasVisibleStop) layout.pendingBreak = true;
  for (const call of calls) {
    if (layout.pendingBreak) layout.breaks.add(call.id);
    layout.pendingBreak = false;
    layout.order.push(call.id);
  }
}

// shortcut: custom entries with an entry renderer, cache-miss notices and transient status lines
// are not in this model, so a group can draw across them. Content stays intact; only its position
// moves. Upgrade if Pi exposes the chat's real adjacency.
export function layoutOf(entries: SessionEntry[]): Layout {
  const layout: Layout = { order: [], breaks: new Set(), pendingBreak: true };
  for (const entry of entries) {
    if (entry.type === "message") {
      const { message } = entry;
      if (message.role === "assistant") addAssistant(layout, message);
      else if (message.role === "custom") layout.pendingBreak ||= message.display;
      else if (message.role !== "toolResult" && message.role !== "system") {
        layout.pendingBreak = true;
      }
    } else if (entry.type === "custom_message") {
      layout.pendingBreak ||= entry.display;
    } else if (
      entry.type === "compaction" ||
      entry.type === "branch_summary" ||
      (entry.type === "usage" && entry.kind === "cache_warm")
    ) {
      layout.pendingBreak = true;
    }
  }
  return layout;
}

/** Add the message still streaming. It stays until persisted, because Pi persists after message_end. */
export function withStreaming(layout: Layout, message: AssistantMessage): Layout {
  const first = message.content.find((block) => block.type === "toolCall");
  if (first && layout.order.includes(first.id)) return layout;
  const merged = { ...layout, order: [...layout.order], breaks: new Set(layout.breaks) };
  addAssistant(merged, message);
  return merged;
}
