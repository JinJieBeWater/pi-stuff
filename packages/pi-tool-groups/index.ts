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
  lastStringArg,
  OVERVIEW_SOURCE_LINES,
  pastShown,
  sharedPaths,
  shortenPaths,
  stripTook,
  trimBlank,
  tailLines,
  type Cut,
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
  overview?: {
    args: unknown;
    status: Status;
    expanded: boolean;
    started: boolean | undefined;
    text: string;
  };
  /** The path this call's overview shares with a neighbour, shown as `…/`. */
  cut?: Cut;
  host?: Row;
  // A block's first row's part: the line folding its earlier calls, and what they were.
  earlier: Component;
  hidden: Row[];
  // A run's first row's part: the line standing for a run of reads and searches.
  explore: Component;
  run: Row[];
  /** Where the block's shown lines put the name column, and whether this line names its tool. */
  nameWidth: number;
  showName: boolean;
  // Every member's parts, drawn by its host.
  line: Component;
  output: Box;
  /** The output with its call's status rail on the left. */
  railedOutput: Component;
}

/** What clicks changed in one block. Ctrl+O discards it. */
interface GroupState {
  showEarlier: boolean;
  open: Map<string, boolean>;
  /** Runs of reads and searches opened by a click, by their first call's id. */
  explored: Set<string>;
  atGlobal: boolean;
}

/** One synchronous render pass. Pi renders the whole transcript each frame, hosts before members. */
interface Frame {
  groups?: Map<string, Row[]>;
  /** The running turn's latest calls, parallel ones together. */
  last?: Set<string>;
}

const NOTHING: Component = { render: () => [], invalidate() {} };
const BLANK: Component = { render: () => [""], invalidate() {} };
// The rail's colours: Pi has no running colour of its own, so the theme accent stands in.
const RAILS = { pending: "accent", error: "error", ok: "success" } as const;
const RAIL = "▎";
// The rail's column, and one blank column on the right, as a block's padding.
const RAIL_WIDTH = 2;
/** Calls that only look around: a run of them reads as one line, `read 3 · grep 2`. */
const EXPLORING = new Set(["read", "grep", "find", "ls"]);
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
const RECENT_CALLS = 10;
const LIVE_LINES = 3;
const COLLAPSED_ARGS_CHARS = 100;
// Pi spreads a self-drawn row's lines into a call: past about 120k the stack overflows and Pi exits.
const MAX_ROW_LINES = 50_000;
// Below this, the indents alone can pass the terminal's edge.
const NARROW_WIDTH = 20;
const SCROLLBAR_COLUMNS = 1;

// The name column, then the call's text.
const textColumn = (row: Row) => row.nameWidth + 2;

const statusOf = ({ ctx }: Row): Status =>
  ctx.isPartial ? "pending" : ctx.isError ? "error" : "ok";

/** Several calls' status at once: running while any runs, failed while any failed. */
function statusOfAll(rows: Row[]): Status {
  const statuses = rows.map(statusOf);
  return statuses.includes("pending") ? "pending" : statuses.includes("error") ? "error" : "ok";
}

/** A call's status as a coloured bar at the block's left edge, as Grok Build marks its blocks. */
const railOf = (theme: Theme, status: Status | undefined) =>
  status ? theme.fg(RAILS[status], RAIL) : " ";

/** `tool count` per tool, in order of first appearance: `bash 6, read 2`. */
function countsOf(rows: Row[], theme: Theme, separator: string): string {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
  return [...counts]
    .map(
      ([name, count]) =>
        `${theme.fg("toolTitle", theme.bold(name))} ${theme.fg("muted", String(count))}`,
    )
    .join(theme.fg("dim", separator));
}

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
  const { args, expanded, executionStarted: started } = row.ctx;
  const status = statusOf(row);
  const cached = row.overview;
  if (
    cached &&
    cached.args === args &&
    cached.status === status &&
    cached.expanded === expanded &&
    cached.started === started
  ) {
    return cached.text;
  }
  // Before the model writes anything to show, a renderer's placeholder ("$ ...") says nothing.
  if (!started && !lastStringArg(args).trim()) {
    row.overview = { args, status, expanded, started, text: "" };
    return "";
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
  row.overview = { args, status, expanded, started, text: oneLine };
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

/**
 * The tail of what the model is writing, as plain text: drawing it through its tool would
 * highlight the whole argument every frame. A short one starts past what its overview shows whole.
 */
function writtenLines(row: Row, width: number, lineWidth: number): string[] {
  const text = lastStringArg(row.ctx.args);
  const overview = stripTerminalSequences(row.line.render(lineWidth)[0] ?? "");
  const shown = (line: string) =>
    overview.includes(shortenPaths(line.trim().replace(/\s+/g, " "), row.ctx.cwd));
  // The overview is made from the first few lines, so only those can be on screen already.
  const start = pastShown(text, shown, OVERVIEW_SOURCE_LINES);
  return tailLines(text.slice(start), LIVE_LINES).map((line) => {
    const plain = stripTerminalSequences(line.slice(0, width * 2))
      .replace(/\t/g, "  ")
      .replace(CONTROL_CHARS, "");
    return liveLine(row.theme.fg("muted", plain), width);
  });
}

/**
 * One line as one row, in its own colours: cut rather than wrapped, and without the spaces a
 * renderer pads it with, which would otherwise count as content to cut.
 */
function liveLine(line: string, width: number): string {
  const content = visibleWidth(stripTerminalSequences(line).trimEnd());
  return content > width ? fit(line, width, "…") : fit(line, content, "");
}

/**
 * The latest few lines of a call's output, or else of what the model is writing. Drawn wide, so a
 * long line is its start cut short, not its last wrapped pieces starting mid-sentence.
 */
function liveLines(row: Row, width: number, lineWidth: number): string[] {
  const all = row.result?.render(OVERVIEW_RENDER_WIDTH) ?? [];
  const output = stripTook(all, row.ctx.durationMs).filter((line) => !isBlank(line));
  const lines =
    output.length > 0
      ? output.slice(-LIVE_LINES).map((line) => liveLine(line, width))
      : writtenLines(row, width, lineWidth);
  // Always the same height, so the chat never moves as output comes, ends, or passes to the next call.
  return [...lines, ...Array<string>(LIVE_LINES - lines.length).fill("")];
}

/** A call's opened content. A click anywhere on it closes it, unless the result takes the click. */
function outputOf(row: Row, close: () => void): Component {
  let resultOffset = 0;
  const forward = (event: TuiMouseEvent) => {
    // Live lines are a tail of the result, not where its own coordinates put them.
    if (!row.full) return undefined;
    const y = event.y - resultOffset;
    const x = event.x - GUTTER_WIDTH;
    if (y < 0 || x < 0) return undefined;
    return row.result?.handleMouse?.({ ...event, x, y, width: event.width - GUTTER_WIDTH });
  };
  return {
    invalidate: () => row.result?.invalidate?.(),
    handleMouse(event) {
      const inner = forward(event);
      if (inner || event.type !== "click" || event.button !== "left") return inner;
      close();
      return { handled: true };
    },
    render(outer) {
      const width = Math.max(1, outer - GUTTER_WIDTH);
      // One step further in than its call, so output never reads as another call ("$ vp exec tsc").
      const gutter = " ".repeat(GUTTER_WIDTH);
      // Open without a click: the call is running, or the turn's latest. The output box pads both
      // sides by the text column, and the line spans them.
      if (!row.full) {
        return liveLines(row, width, outer + 2 * textColumn(row)).map((line) => gutter + line);
      }
      const rest = callBody(row, row.fullCall?.render(width) ?? []);

      const all = row.result?.render(width) ?? [];
      const leading = all.findIndex((line) => !isBlank(line));
      const result = stripTook(trimBlank(all), row.ctx.durationMs);
      // The result's own coordinates start above its first shown line.
      resultOffset = rest.length - Math.max(leading, 0);
      const body = trimBlank(result);
      const gap = rest.length > 0 && body.length > 0 ? [""] : [];
      resultOffset += gap.length;
      return [...rest, ...gap, ...body].map((line) => `${gutter}${line}`);
    },
  };
}

/** `content` with its call's status rail on the left and a blank column on the right. */
function railed(row: Row, content: Component): Component {
  return {
    invalidate: () => content.invalidate(),
    handleMouse: (event) =>
      content.handleMouse?.({ ...event, x: event.x - 1, width: event.width - RAIL_WIDTH }),
    render(width) {
      const rail = railOf(row.theme, statusOf(row));
      return content.render(Math.max(1, width - RAIL_WIDTH)).map((line) => rail + line);
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
  /** How many calls the chat had when the running turn began; none while no turn runs. */
  let turnStart: number | undefined;
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
      if (!row) {
        run = [];
        continue;
      }
      // Pi draws images under the row, outside the renderer, so a row showing one is a block alone:
      // its picture then follows its own line.
      const image = row.hasImage && row.ctx.showImages;
      // Calls with nothing drawn between them share one block, whatever their tools.
      if (layout.breaks.has(id) || image) run = [];
      run.push(row);
      groups.set(id, run);
      if (image) run = [];
    }
    frame.groups = groups;
    // The model's thinking and text below keep them: only its next call, anything else, or the
    // turn's end folds them, so the chat grows through a turn and shrinks once, after it.
    const ownTurn =
      turnStart !== undefined && layout.order.length - layout.lastCalls.length >= turnStart;
    frame.last = new Set(ownTurn ? layout.lastCalls : []);
    return groups;
  }

  // Ctrl+O flips every row. One expanded row is only a click from before it joined the group.
  const isGloballyExpanded = (host: Row) => host.group.every((row) => row.ctx.expanded);

  function stateOf(host: Row): GroupState {
    let state = states.get(host.id);
    const atGlobal = isGloballyExpanded(host);
    if (state?.atGlobal !== atGlobal) {
      state = { showEarlier: false, open: new Map(), explored: new Set(), atGlobal };
      states.set(host.id, state);
    }
    return state;
  }

  const openedByClick = (row: Row) =>
    row.host !== undefined && stateOf(row.host).open.get(row.id) === true;

  const isLast = (row: Row) => {
    currentGroups();
    return frame.last?.has(row.id) === true;
  };

  // Only a click opens in full. A running call shows the tail of its progress, kept once it ends
  // while it is still the turn's latest.
  const isOpen = (member: Row, state: GroupState) =>
    state.open.get(member.id) ?? (statusOf(member) === "pending" || isLast(member));

  /** `▸ 8 more · bash 6, read 2`: how many calls fold away, and what they were. */
  function earlierLines(host: Row, width: number): string[] {
    const { theme, hidden } = host;
    const marker = stateOf(host).showEarlier ? "▾" : "▸";
    const label = `${theme.fg("muted", `${marker} ${hidden.length} more`)}${theme.fg("dim", " · ")}`;
    return [` ${fit(label + countsOf(hidden, theme, ", "), width - RAIL_WIDTH)}`];
  }

  /** `read 3 · grep 2`, the run's failures and its time on the right. */
  function exploreLines(first: Row, width: number): string[] {
    const { theme, run } = first;
    const status = statusOfAll(run);
    const durations = run.map((row) => row.ctx.durationMs);
    const total = durations.every((ms) => ms !== undefined)
      ? theme.fg("muted", formatDuration(durations.reduce((sum, ms) => sum + ms!, 0)))
      : "";
    const marks = [status === "error" ? theme.fg("error", "✗") : "", total].filter(Boolean);
    const right = marks.length > 0 ? `  ${marks.join(" ")}` : "";
    const room = Math.max(1, width - RAIL_WIDTH - visibleWidth(right));
    const left = fit(countsOf(run, theme, " · "), room, "…", true);
    return [`${railOf(theme, status)}${fit(left + right, width - RAIL_WIDTH, "")}`];
  }

  function lineOf(row: Row, outer: number): string[] {
    const { theme } = row;
    const width = Math.max(1, outer - RAIL_WIDTH);
    const ms = row.ctx.durationMs;
    // On the right, so a call ending shifts nothing. A running call needs no mark: it has no
    // duration yet, and its rail says it runs.
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
    return [`${railOf(theme, statusOf(row))}${fit(`${name}  ${text}${duration}`, width, "")}`];
  }

  function draw(row: Row, box: Box, children: (Component | undefined)[], width: number): string[] {
    row.drawnBox = box;
    setChildren(box, children);
    return box.render(width);
  }

  // Exactly as its tool draws it: for Ctrl+O, and for calls that cannot be drawn as one line.
  function drawNative(row: Row, width: number): string[] {
    if (!row.selfFramed) {
      const { theme } = row;
      row.native.setBgFn((text) => theme.bg(BACKGROUNDS[statusOf(row)], text));
      padX(row.native, row.ctx.outputPad);
      return draw(row, row.native, [row.call, row.result], width);
    }
    row.drawnBox = row.bare;
    setChildren(row.bare, [row.call, row.result]);
    return row.bare.render(width);
  }

  // Output lines up under its call's text; a self-framed call pads itself.
  const openAt = (row: Row) =>
    padX(row.output, textColumn(row) - (row.selfFramed ? row.ctx.outputPad : 0));

  /** The block as units: each run of two or more reads and searches is one, any other call one. */
  function unitsOf(block: Row[]): Row[][] {
    const units: Row[][] = [];
    for (const row of block) {
      const unit = units.at(-1);
      const exploring = EXPLORING.has(row.name);
      if (unit && exploring && EXPLORING.has(unit[0]!.name)) unit.push(row);
      else units.push([row]);
    }
    return units;
  }

  function groupChildren(host: Row, block: Row[]): (Component | undefined)[] {
    const state = stateOf(host);
    // Ctrl+O: every call as its tool draws it, a blank line apart as Pi spaces them.
    if (isGloballyExpanded(host)) {
      return block.flatMap((member, i) => [i > 0 ? BLANK : undefined, member.call, member.result]);
    }
    const units = unitsOf(block);
    // Failures and running calls stay visible however old they are.
    const older = new Set(
      units.filter(
        (unit, i) => i < units.length - RECENT_CALLS && unit.every((row) => statusOf(row) === "ok"),
      ),
    );
    host.hidden = [...older].flat();
    const shownUnits = units.filter((unit) => state.showEarlier || !older.has(unit));
    // A closed run shows its line alone, and the progress of any call in it running or just done,
    // so a call joining a run never shrinks the chat.
    const folded = (unit: Row[]) => unit.length > 1 && !state.explored.has(unit[0]!.id);
    const lineShown = shownUnits.flatMap((unit) => (folded(unit) ? [] : unit));
    const nameWidth = Math.max(MIN_NAME_WIDTH, ...lineShown.map((row) => row.name.length));
    // Only lines on screen: a path shortened against a hidden call would never be seen in full.
    // Running calls take no part, so a call starting next to finished ones leaves their lines be.
    const cuts = new Map(
      sharedPaths(
        lineShown.map((row) => (statusOf(row) === "pending" ? "" : overviewText(row))),
      ).map((cut, i) => [lineShown[i]!, cut]),
    );
    const children: Component[] = older.size > 0 ? [host.earlier] : [];
    let previous: string | undefined;
    for (const unit of shownUnits) {
      if (unit.length > 1) {
        unit[0]!.run = unit;
        children.push(unit[0]!.explore);
        previous = undefined;
      }
      for (const member of unit) {
        member.nameWidth = nameWidth;
        openAt(member);
        if (folded(unit)) {
          if (!state.open.has(member.id) && isOpen(member, state))
            children.push(member.railedOutput);
          continue;
        }
        member.showName = previous !== member.name;
        member.cut = cuts.get(member);
        previous = member.name;
        children.push(member.line);
        if (isOpen(member, state)) children.push(member.railedOutput);
      }
    }
    return children;
  }

  // Pi's "auto" scrollbar overlays the transcript's last column rather than taking one, so a
  // block stops short of it: the bar never hides a duration or a native frame's edge.
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
    const line = fit(" ".repeat(row.ctx.outputPad) + notice, width, "...", true);
    // On a native frame's background; a block has none.
    const last = row.drawnBox === row.native ? theme.bg(BACKGROUNDS[statusOf(row)], line) : line;
    return [...lines.slice(0, MAX_ROW_LINES), last];
  }

  function drawRow(row: Row, width: number): string[] {
    const group = currentGroups().get(row.id);
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
    // No background: user messages alone wear one. Each call's rail marks its status instead, in
    // the column Pi pads with; Ctrl+O's native views have no rail and keep that padding.
    padX(row.box, isGloballyExpanded(row) ? row.ctx.outputPad : 0);
    const lines = draw(row, row.box, groupChildren(row, group), width);
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
      const setOpen = (open: (state: GroupState) => boolean) =>
        change((state) => {
          state.open.set(created.id, open(state));
          // Draw it again, expanded or not, through its own renderers.
          created.ctx.invalidate();
        });
      // A line showing a preview (running, or the turn's latest) opens in full, not closed.
      const toggle = setOpen((state) => state.open.get(created.id) !== true);
      const close = setOpen(() => false);
      const created: Row = {
        id: ctx.toolCallId,
        name,
        ctx,
        theme,
        hasImage: false,
        box: new Box(0, 0),
        native: new Box(1, 1),
        bare: new Box(0, 0),
        selfFramed,
        revision: 0,
        group: [],
        hidden: [],
        run: [],
        nameWidth: 0,
        showName: true,
        full: false,
        output: new Box(0, 0),
        railedOutput: NOTHING,
        earlier: clickableLines(
          (width) => {
            const { hidden } = created;
            return `${width}|${stateOf(created).showEarlier}|${hidden.map((row) => row.name).join()}`;
          },
          (width) => earlierLines(created, width),
          change((state) => {
            state.showEarlier = !state.showEarlier;
          }),
        ),
        // Keyed by every call in the run, so a call joining, ending or failing redraws it.
        explore: clickableLines(
          (width) => {
            const parts = created.run.map(
              (row) => `${row.id}:${statusOf(row)}:${row.ctx.durationMs}`,
            );
            return `${width}|${parts.join()}`;
          },
          (width) => exploreLines(created, width),
          change((state) => {
            if (!state.explored.delete(created.id)) state.explored.add(created.id);
          }),
        ),
        line: clickableLines(
          (width) => {
            const { cut, nameWidth, showName } = created;
            return `${width}|${created.revision}|${cut?.start}-${cut?.end}|${nameWidth}|${showName}`;
          },
          (width) => lineOf(created, width),
          toggle,
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
      created.output.addChild(outputOf(created, close));
      created.railedOutput = railed(created, created.output);
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
  pi.on("agent_start", () => {
    turnStart = currentLayout().order.length;
  });
  pi.on("agent_end", () => {
    streaming = undefined;
    turnStart = undefined;
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
