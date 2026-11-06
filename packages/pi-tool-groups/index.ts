import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderers,
} from "@earendil-works/pi-coding-agent";
import {
  Box,
  stripTerminalSequences,
  Text,
  visibleWidth,
  type Component,
  type TuiMouseEvent,
} from "@earendil-works/pi-tui";
import { layoutOf, withStreaming, type Layout } from "./layout";
import {
  CONTROL_CHARS,
  firstParagraph,
  firstStringArg,
  fit,
  formatDuration,
  isBlank,
  sharedPaths,
  shortenPaths,
  stripTook,
  trimBlank,
  type Cut,
  capLines,
} from "./text";

type Status = "pending" | "error" | "ok";
type ToolRenderContext = Parameters<NonNullable<ToolRenderers["renderCall"]>>[2];

interface Row {
  id: string;
  name: string;
  ctx: ToolRenderContext;
  theme: Theme;
  call?: Component;
  /** The call drawn expanded, for a line opened by a click: the full command, script or file. */
  fullCall?: Component;
  /** Opened by a click, so its content shows whole rather than as a preview. */
  full: boolean;
  result?: Component;
  hasImage: boolean;
  box: Box;
  /** Pi's own padded frame, for a call drawn as its tool draws it. */
  native: Box;
  /** For a tool that draws its own frame, standing alone: adds nothing around it. */
  bare: Box;
  selfFramed: boolean;
  /** The box last drawn, which clicks go through. */
  drawnBox?: Box;
  view: Component;
  coveredIn?: Frame;
  /** Bumped by every Pi update of this row, so cached lines know when they went stale. */
  revision: number;
  /** The block of adjacent calls this row last drew in, and its run of same-name calls. */
  group: Row[];
  overview?: { args: unknown; status: Status; expanded: boolean; text: string };
  /** The path this call's overview shares with a neighbour, shown as `…/`. */
  cut?: Cut;
  host?: Row;
  // A block's first row's part: the line folding its earlier calls.
  earlier: Component;
  olderCount: number;
  /** Where the block's shown lines put the name column, and whether this line names its tool. */
  nameWidth: number;
  showName: boolean;
  // Every member's parts, drawn by its host.
  line: Component;
  output: Box;
}

/** What clicks changed in one block. Ctrl+O discards it. */
interface GroupState {
  showEarlier: boolean;
  open: Map<string, boolean>;
  atGlobal: boolean;
}

/** One synchronous render pass. Pi renders the whole transcript each frame, hosts before members. */
interface Frame {
  groups?: Map<string, Row[]>;
}

const NOTHING: Component = { render: () => [], invalidate() {} };
const BLANK: Component = { render: () => [""], invalidate() {} };
const BACKGROUNDS = {
  pending: "toolPendingBg",
  error: "toolErrorBg",
  ok: "toolSuccessBg",
} as const;
const FALLBACK_PREVIEW_LINES = 10;
const OVERVIEW_RENDER_WIDTH = 1000;
const GUTTER_WIDTH = 2;
// Wide enough for the common tools (bash, read, edit, codemode), so their blocks line up with
// each other; a block with a longer name widens on its own.
const MIN_NAME_WIDTH = 8;
const RECENT_CALLS = 5;
const COLLAPSED_ARGS_CHARS = 100;
// Terminal cells are about 2.5 times as tall as wide, so 3 columns match the block's one row above and below.
const BLOCK_PADDING_X = 3;
// Pi spreads a self-drawn row's lines into a call: past about 120k the stack overflows and Pi exits.
const MAX_ROW_LINES = 50_000;
// Below this, the indents alone can pass the terminal's edge.
const NARROW_WIDTH = 20;
const SCROLLBAR_COLUMNS = 1;

// The name column, then the call's text.
const textColumn = (row: Row) => row.nameWidth + 2;

const statusOf = ({ ctx }: Row): Status =>
  ctx.isPartial ? "pending" : ctx.isError ? "error" : "ok";

function fallbackCall(name: string, args: unknown, theme: Theme, expanded: boolean): Component {
  const json = JSON.stringify(args, null, expanded ? 2 : undefined) ?? "";
  const shown =
    !expanded && json.length > COLLAPSED_ARGS_CHARS
      ? `${json.slice(0, COLLAPSED_ARGS_CHARS - 3)}...`
      : json;
  const title = theme.fg("toolTitle", theme.bold(name));
  return new Text(`${title}${expanded ? "\n" : " "}${theme.fg("muted", shown)}`, 0, 0);
}

function fallbackResult(
  content: readonly { type: string; text?: string }[],
  theme: Theme,
  expanded: boolean,
): Component {
  const lines = stripTerminalSequences(
    content.flatMap((part) => (part.type === "text" ? (part.text ?? "") : [])).join("\n"),
  ).replace(CONTROL_CHARS, "");
  const all = lines ? lines.split("\n") : [];
  const shown = expanded ? all : all.slice(0, FALLBACK_PREVIEW_LINES);
  const rest = all.length - shown.length;
  const text = shown.map((line) => theme.fg("toolOutput", line)).join("\n");
  return new Text(text + (rest ? theme.fg("muted", `\n... (${rest} more lines)`) : ""), 0, 0);
}

/** The overview before any shortening, kept until the call's arguments or status change. */
function overviewText(row: Row): string {
  const { args, expanded } = row.ctx;
  const status = statusOf(row);
  const cached = row.overview;
  if (cached && cached.args === args && cached.status === status && cached.expanded === expanded) {
    return cached.text;
  }
  // Wide enough that a long first line stays one line instead of wrapping into pieces.
  const call = firstParagraph(row.call?.render(OVERVIEW_RENDER_WIDTH) ?? []);
  const prefix = `${row.name} `;
  const text = !call.includes(" ")
    ? // One word ("Patching", "Ran") cannot tell calls apart; what they were asked to do can.
      firstStringArg(args) || call || row.name
    : call.toLowerCase().startsWith(prefix.toLowerCase())
      ? call.slice(prefix.length)
      : call;
  // One line: runs of spaces inside the call (indented code, aligned columns) would only waste it.
  const oneLine = shortenPaths(text.replace(/\s+/g, " "), row.ctx.cwd);
  row.overview = { args, status, expanded, text: oneLine };
  return oneLine;
}

/**
 * A call's content as its tool draws it. A title ("edit path" set off by a blank line, codemode's
 * bare name) and a lone line both repeat the overview.
 */
function callBody(row: Row, rendered: string[]): string[] {
  const lines = trimBlank(rendered);
  const setOff = lines.length > 1 && isBlank(lines[1]!);
  const named = stripTerminalSequences(lines[0] ?? "").trim() === row.name;
  const body = trimBlank(setOff || named ? lines.slice(1) : lines);
  return !setOff && body.length === 1 ? [] : body;
}

/** A running call cut short, starting past what its overview line already shows whole. */
function previewCall(row: Row, width: number, lineWidth: number): string[] {
  const body = callBody(row, row.call?.render(width) ?? []);
  const line = stripTerminalSequences(row.line.render(lineWidth)[0] ?? "");
  const seen = body.findIndex((text) => !line.includes(stripTerminalSequences(text).trim()));
  return seen < 0 ? [] : capLines(body.slice(seen), row.theme, width);
}

function outputOf(row: Row): Component {
  let resultOffset = 0;
  return {
    invalidate: () => row.result?.invalidate?.(),
    handleMouse(event) {
      const y = event.y - resultOffset;
      const x = event.x - GUTTER_WIDTH;
      if (y < 0 || x < 0) return undefined;
      return row.result?.handleMouse?.({ ...event, x, y, width: event.width - GUTTER_WIDTH });
    },
    render(outer) {
      const width = Math.max(1, outer - GUTTER_WIDTH);
      // The output box pads both sides by the text column, and the line spans them.
      const rest = row.full
        ? callBody(row, row.fullCall?.render(width) ?? [])
        : previewCall(row, width, outer + 2 * textColumn(row));

      const all = row.result?.render(width) ?? [];
      const leading = all.findIndex((line) => !isBlank(line));
      const result = stripTook(trimBlank(all), row.ctx.durationMs);
      // The result's own coordinates start above its first shown line.
      resultOffset = rest.length - Math.max(leading, 0);
      // One step further in than its call, so output never reads as another call ("$ vp exec tsc").
      const gutter = " ".repeat(GUTTER_WIDTH);
      const body = trimBlank(result);
      const gap = rest.length > 0 && body.length > 0 ? [""] : [];
      resultOffset += gap.length;
      return [...rest, ...gap, ...body].map((line) => `${gutter}${line}`);
    },
  };
}

/** Lines cached until `keyOf` changes, so Box can reuse its own cache every frame. */
function clickableLines(
  keyOf: (width: number) => string,
  lines: (width: number) => string[],
  onClick: () => void,
): Component {
  let cache: { key: string; lines: string[] } | undefined;
  return {
    invalidate() {
      cache = undefined;
    },
    handleMouse(event) {
      if (event.type !== "click" || event.button !== "left") return undefined;
      onClick();
      return { handled: true };
    },
    render(width) {
      const key = keyOf(width);
      if (cache?.key !== key) cache = { key, lines: lines(width) };
      return cache.lines;
    },
  };
}

const paddings = new WeakMap<Box, number>();

/** setPaddingX only on change: it drops the box's line cache. */
function padX(box: Box, padding: number): void {
  if (paddings.get(box) === padding) return;
  paddings.set(box, padding);
  box.setPaddingX(padding);
}

function setChildren(box: Box, children: (Component | undefined)[]): void {
  const shown = children.filter((child) => child !== undefined);
  if (shown.length === box.children.length && shown.every((c, i) => c === box.children[i])) return;
  box.clear();
  for (const child of shown) box.addChild(child);
}

function attempt(render: () => Component, fallback: () => Component): Component {
  try {
    return render();
  } catch {
    return fallback();
  }
}

export default function (pi: ExtensionAPI) {
  // Weak: Pi drops a row's component when it rebuilds or leaves the chat, and the row must go too.
  // Its component keeps it alive through rowsByState, keyed by the component's own state.
  const rows = new Map<string, WeakRef<Row>>();
  const forget = new FinalizationRegistry<string>((id) => {
    // A rebuild may have put a newer row under the same id.
    if (rows.get(id)?.deref()) return;
    rows.delete(id);
    states.delete(id);
  });
  const rowsByState = new WeakMap<object, Row>();
  const states = new Map<string, GroupState>();
  let session: ExtensionContext["sessionManager"] | undefined;
  let persisted: { leaf: string | null; layout: Layout } | undefined;
  let streaming: AssistantMessage | undefined;
  let frame: Frame = {};
  let frameEnding = false;

  // Every append, /tree and compaction moves the leaf, so it alone keeps the layout current.
  function currentLayout(): Layout {
    const leaf = session?.getLeafId() ?? null;
    if (persisted?.leaf !== leaf) {
      persisted = { leaf, layout: layoutOf(session?.buildContextEntries() ?? []) };
    }
    const layout = persisted?.layout ?? layoutOf([]);
    return streaming ? withStreaming(layout, streaming) : layout;
  }

  function currentGroups(): Map<string, Row[]> {
    if (!frameEnding) {
      frameEnding = true;
      queueMicrotask(() => {
        frame = {};
        frameEnding = false;
      });
    }
    if (frame.groups) return frame.groups;
    const groups = new Map<string, Row[]>();
    const layout = currentLayout();
    let run: Row[] = [];
    for (const id of layout.order) {
      const row = rows.get(id)?.deref();
      // Pi draws images outside the renderer, so a row showing one cannot be hidden.
      if (!row || (row.hasImage && row.ctx.showImages)) {
        run = [];
        continue;
      }
      // Calls with nothing drawn between them share one block, whatever their tools.
      if (layout.breaks.has(id)) run = [];
      run.push(row);
      groups.set(id, run);
    }
    frame.groups = groups;
    return groups;
  }

  // Ctrl+O flips every row. One expanded row is only a click from before it joined the group.
  const isGloballyExpanded = (host: Row) => host.group.every((row) => row.ctx.expanded);

  function stateOf(host: Row): GroupState {
    let state = states.get(host.id);
    const atGlobal = isGloballyExpanded(host);
    if (state?.atGlobal !== atGlobal) {
      state = { showEarlier: false, open: new Map(), atGlobal };
      states.set(host.id, state);
    }
    return state;
  }

  const openedByClick = (row: Row) =>
    row.host !== undefined && stateOf(row.host).open.get(row.id) === true;

  // Only a click opens in full; a running call shows a preview of its progress, gone when it ends.
  // Content otherwise waits for a click.
  const isOpen = (member: Row, state: GroupState) =>
    state.open.get(member.id) ?? statusOf(member) === "pending";

  function earlierLines(host: Row, width: number): string[] {
    const marker = stateOf(host).showEarlier ? "▾" : "▸";
    return [fit(host.theme.fg("muted", `${marker} ${host.olderCount} earlier`), width)];
  }

  function lineOf(row: Row, width: number): string[] {
    const { theme } = row;
    const ms = row.ctx.durationMs;
    // On the right, so the left edge matches the block's right edge and a call ending shifts nothing.
    // A running call needs no mark: it has no duration yet, and the block has its running background.
    const status = [
      statusOf(row) === "error" ? theme.fg("error", "✗") : "",
      ms === undefined ? "" : theme.fg("muted", formatDuration(ms)),
    ].filter(Boolean);
    const duration = status.length > 0 ? `  ${status.join(" ")}` : "";
    const label = row.showName ? row.name : "";
    const room = Math.max(1, width - textColumn(row) - visibleWidth(duration));
    const full = overviewText(row);
    const { cut } = row;
    const shortened = cut ? `${full.slice(0, cut.start)}…/${full.slice(cut.end)}` : full;
    // Like a table: a tool's consecutive calls name it once.
    const name = theme.fg("toolTitle", theme.bold(label.padEnd(row.nameWidth)));
    const text = fit(theme.fg("muted", shortened), room, "…", true);
    return [fit(`${name}  ${text}${duration}`, width, "")];
  }

  function draw(
    row: Row,
    box: Box,
    status: Status,
    children: (Component | undefined)[],
    width: number,
    padding: number,
  ): string[] {
    const { theme } = row;
    row.drawnBox = box;
    box.setBgFn((text) => theme.bg(BACKGROUNDS[status], text));
    padX(box, padding);
    setChildren(box, children);
    return box.render(width);
  }

  // Exactly as its tool draws it: for Ctrl+O, and for calls that cannot be drawn as one line.
  function drawNative(row: Row, width: number): string[] {
    if (!row.selfFramed) {
      return draw(row, row.native, statusOf(row), [row.call, row.result], width, row.ctx.outputPad);
    }
    row.drawnBox = row.bare;
    setChildren(row.bare, [row.call, row.result]);
    return row.bare.render(width);
  }

  // Output lines up under its call's text; a self-framed call pads itself.
  const openAt = (row: Row) =>
    padX(row.output, textColumn(row) - (row.selfFramed ? row.ctx.outputPad : 0));

  function groupChildren(host: Row, block: Row[]): Component[] {
    const state = stateOf(host);
    // Ctrl+O: every call as its tool draws it, a blank line apart as Pi spaces them.
    if (isGloballyExpanded(host)) {
      return block
        .flatMap((member, i) => [i > 0 ? BLANK : undefined, member.call, member.result])
        .filter((child) => child !== undefined);
    }
    // Failures and running calls stay visible however old they are.
    const older = new Set(
      block.filter((row, i) => i < block.length - RECENT_CALLS && statusOf(row) === "ok"),
    );
    host.olderCount = older.size;
    const shown = block.filter((row) => state.showEarlier || !older.has(row));
    const nameWidth = Math.max(MIN_NAME_WIDTH, ...shown.map((row) => row.name.length));
    // Only lines on screen: a path shortened against a hidden call would never be seen in full.
    const cuts = sharedPaths(shown.map(overviewText));
    const children: Component[] = older.size > 0 ? [host.earlier] : [];
    shown.forEach((member, i) => {
      member.nameWidth = nameWidth;
      member.showName = shown[i - 1]?.name !== member.name;
      member.cut = cuts[i];
      openAt(member);
      children.push(member.line);
      if (isOpen(member, state)) children.push(member.output);
    });
    return children;
  }

  // Pi's "auto" scrollbar overlays the transcript's last column rather than taking one, so a
  // block's background stops short of it and the bar shows over blank space.
  const usable = (width: number) => (width > NARROW_WIDTH ? width - SCROLLBAR_COLUMNS : width);

  function renderRow(row: Row, width: number): string[] {
    const inner = usable(width);
    const pad = " ".repeat(width - inner);
    const lines = capRow(row, drawRow(row, inner), inner);
    return pad ? lines.map((line) => line + pad) : lines;
  }

  // Reached only by asking for a call in full: a click or Ctrl+O.
  function capRow(row: Row, lines: string[], width: number): string[] {
    if (lines.length <= MAX_ROW_LINES) return lines;
    const { theme } = row;
    const notice = theme.fg("muted", `… (${lines.length - MAX_ROW_LINES} more lines not drawn)`);
    const indented = " ".repeat(BLOCK_PADDING_X) + notice;
    const last = theme.bg(BACKGROUNDS[statusOf(row)], fit(indented, width, "...", true));
    return [...lines.slice(0, MAX_ROW_LINES), last];
  }

  function drawRow(row: Row, width: number): string[] {
    const group = currentGroups().get(row.id);
    // A row showing an image is not in any group: Pi draws images outside the renderer.
    if (!group) return drawNative(row, width);
    if (group[0] !== row) {
      // An unmounted host (a stale layout, say) draws nothing, so its members must stay visible.
      return row.coveredIn === frame ? [] : drawNative(row, width);
    }
    for (const member of group) {
      member.coveredIn = frame;
      member.host = row;
      member.group = group;
    }
    // Ctrl+O on a call alone shows it as Pi would, frame and all.
    if (group.length === 1 && row.ctx.expanded) return drawNative(row, width);
    // One background for the block; a failure shows as its line's ✗, not a red block.
    const status = group.some((member) => statusOf(member) === "pending") ? "pending" : "ok";
    const lines = draw(row, row.box, status, groupChildren(row, group), width, BLOCK_PADDING_X);
    return width < NARROW_WIDTH ? lines.map((line) => fit(line, width, "")) : lines;
  }

  function clickRow(row: Row, event: TuiMouseEvent) {
    const width = usable(event.width);
    if (event.x >= width) return undefined;
    const inner = row.drawnBox?.handleMouse({ ...event, width });
    if (inner || event.type !== "click" || event.button !== "left") return inner;
    const group = currentGroups().get(row.id);
    // Pi's own click-to-expand would flip this row alone; only rows drawn natively keep it.
    const ours = group?.[0] === row && (group.length > 1 || !row.ctx.expanded);
    return ours ? { handled: true } : undefined;
  }

  function rowFor(
    name: string,
    ctx: ToolRenderContext,
    theme: Theme,
    selfFramed: boolean,
  ): Row | undefined {
    let row = rowsByState.get(ctx.state);
    if (!row) {
      // A TUI row first renders from its constructor, before execution. HTML export never does.
      if (ctx.executionStarted !== false) return undefined;
      const change = (update: (state: GroupState, host: Row) => void) => () => {
        const host = created.host ?? created;
        update(stateOf(host), host);
        host.ctx.invalidate();
      };
      const created: Row = {
        id: ctx.toolCallId,
        name,
        ctx,
        theme,
        hasImage: false,
        box: new Box(1, 1),
        native: new Box(1, 1),
        bare: new Box(0, 0),
        selfFramed,
        revision: 0,
        group: [],
        olderCount: 0,
        nameWidth: 0,
        showName: true,
        full: false,
        output: new Box(0, 0),
        earlier: clickableLines(
          (width) => `${width}|${stateOf(created).showEarlier}|${created.olderCount}`,
          (width) => earlierLines(created, width),
          change((state) => {
            state.showEarlier = !state.showEarlier;
          }),
        ),
        line: clickableLines(
          (width) => {
            const { cut, nameWidth, showName } = created;
            return `${width}|${created.revision}|${cut?.start}-${cut?.end}|${nameWidth}|${showName}`;
          },
          (width) => lineOf(created, width),
          change((state) => {
            state.open.set(created.id, !isOpen(created, state));
            // Draw it again, expanded or not, through its own renderers.
            created.ctx.invalidate();
          }),
        ),
        view: {
          render: (width) => renderRow(created, width),
          handleMouse: (event) => clickRow(created, event),
          invalidate() {
            created.call?.invalidate();
            created.result?.invalidate();
            created.box.invalidate();
          },
        },
      };
      created.output.addChild(outputOf(created));
      row = created;
      rowsByState.set(ctx.state, row);
      rows.set(ctx.toolCallId, new WeakRef(row));
      forget.register(row, ctx.toolCallId);
    }
    row.ctx = ctx;
    row.theme = theme;
    row.revision++;
    return row;
  }

  pi.on("session_start", (_event, ctx) => {
    session = ctx.sessionManager;
    persisted = undefined;
  });
  pi.on("message_update", (event) => {
    if (event.message.role === "assistant") streaming = event.message;
  });
  pi.on("agent_end", () => {
    streaming = undefined;
  });

  pi.registerToolRenderer((name, next) => {
    const original = next();
    // Unknown tools keep Pi's raw view.
    if (!original) return original;
    // Pi's own edit draws its frame; alone it keeps it, in a group the group's frame holds it.
    const selfFramed = original.renderShell === "self";
    const renderers: ToolRenderers = {
      renderShell: "self",
      renderCall(args, theme, ctx) {
        const row = rowFor(name, ctx, theme, selfFramed);
        const render = (context: ToolRenderContext) => {
          const fallback = () => fallbackCall(name, args, theme, context.expanded);
          return attempt(() => original.renderCall?.(args, theme, context) ?? fallback(), fallback);
        };
        if (!row) return render(ctx);
        // Pi hands back what we returned, which the original renderer must never receive.
        row.call = render({ ...ctx, lastComponent: row.call });
        // The collapsed call stays too: the overview line is made from it.
        row.full = openedByClick(row);
        if (row.full) {
          row.fullCall = render({ ...ctx, expanded: true, lastComponent: row.fullCall });
        }
        return row.view;
      },
      renderResult(result, options, theme, ctx) {
        const row = rowFor(name, ctx, theme, selfFramed);
        // A line opened by a click shows its whole result, as Ctrl+O would.
        const full = row !== undefined && openedByClick(row);
        const shown = full ? { ...options, expanded: true } : options;
        const fallback = () => fallbackResult(result.content, theme, shown.expanded);
        const render = (context: ToolRenderContext) =>
          attempt(
            () => original.renderResult?.(result, shown, theme, context) ?? fallback(),
            fallback,
          );
        if (!row) return render(ctx);
        row.hasImage = result.content.some((part) => part.type === "image");
        row.result = render({ ...ctx, expanded: shown.expanded, lastComponent: row.result });
        return NOTHING;
      },
    };
    return renderers;
  });
}
