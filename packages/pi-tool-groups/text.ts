/** Text from tool renderers and arguments, made into one overview line: pure, so testable alone. */
import { stripTerminalSequences, truncateToWidth } from "@earendil-works/pi-tui";
import { homedir } from "node:os";

export const OVERVIEW_SOURCE_LINES = 3;
// Shorter shared paths are cheap enough to keep.
const MIN_SHARED_PATH = 16;
const HOME = homedir();
// A running call's content past its first line (write's file) is previewed in this many.
const ARG_OVERVIEW_CHARS = 500;
const BULLET = /^[•●]/;
const LEADING_MARKS = /^[•●└├│─\s]+/;
// Pi's shell renderers end with this exact form, which only repeats the group's duration column.
const DURATION_LINE = /^Took (?:\d+h )?(?:\d+m )?\d+(?:\.\d+)?s$/;
// Tool output and model-written arguments must not reach the terminal as control codes.
// oxlint-disable-next-line no-control-regex -- matching them is the point
export const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f]/g;

/**
 * The call's first paragraph. Content follows a blank line (write), and a bullet line above more
 * text is only a heading ("• Ran", then "└ cmd").
 */
export function firstParagraph(rendered: string[]): string {
  const plain = rendered.map((line) => stripTerminalSequences(line).trim());
  const start = plain.findIndex(Boolean);
  const source = start < 0 ? [] : plain.slice(start, start + OVERVIEW_SOURCE_LINES);
  const end = source.indexOf("");
  const paragraph = end < 0 ? source : source.slice(0, end);
  const hasHeading = paragraph.length > 1 && BULLET.test(paragraph[0]!);
  return (hasHeading ? paragraph.slice(1) : paragraph).join(" ").replace(LEADING_MARKS, "");
}

export function firstStringArg(args: unknown): string {
  const values = args && typeof args === "object" ? Object.values(args) : [];
  const value = values.find((item) => typeof item === "string" && item.trim()) as
    | string
    | undefined;
  return stripTerminalSequences(value?.slice(0, ARG_OVERVIEW_CHARS) ?? "")
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The last string in the arguments, in the order the model writes them: the one it is writing. */
export function lastStringArg(args: unknown): string {
  if (typeof args === "string") return args;
  const values = Array.isArray(args)
    ? args
    : args && typeof args === "object"
      ? Object.values(args)
      : [];
  for (let i = values.length - 1; i >= 0; i--) {
    const found = lastStringArg(values[i]);
    if (found) return found;
  }
  return "";
}

/** Where `text` goes past its first lines that `shown` says are on screen already, checking at most `limit`. */
export function pastShown(text: string, shown: (line: string) => boolean, limit: number): number {
  let offset = 0;
  for (let i = 0; i < limit && offset < text.length; i++) {
    const newline = text.indexOf("\n", offset);
    const end = newline < 0 ? text.length : newline;
    const line = text.slice(offset, end);
    if (line.trim() && !shown(line)) break;
    offset = end + 1;
  }
  return Math.min(offset, text.length);
}

/** The last `count` lines with content, found from the end so a huge text is never split whole. */
export function tailLines(text: string, count: number): string[] {
  const lines: string[] = [];
  let end = text.length;
  while (lines.length < count && end > 0) {
    const start = text.lastIndexOf("\n", end - 1) + 1;
    const line = text.slice(start, end);
    if (line.trim()) lines.unshift(line);
    end = start - 1;
  }
  return lines;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces a directory wherever it appears whole, not as the start of a longer name. */
function replaceDir(text: string, dir: string, by: string): string {
  return text.replace(new RegExp(`${escapeRegExp(dir)}(?![\\w.-])`, "g"), by);
}

/**
 * One spelling per path: the working directory as `.`, home as `~`, whichever form the call
 * used. Otherwise the same directory reads three ways in three tools.
 */
export function shortenPaths(text: string, cwd: string): string {
  let out = text;
  if (cwd && cwd !== "/" && cwd !== HOME) {
    out = replaceDir(out, cwd, ".");
    if (cwd.startsWith(`${HOME}/`)) out = replaceDir(out, `~${cwd.slice(HOME.length)}`, ".");
  }
  return HOME && HOME !== "/" ? replaceDir(out, HOME, "~") : out;
}

export type Cut = { start: number; end: number };

/** The directories two overviews both start with, if long enough to be worth hiding. */
function sharedPath(a: string, b: string | undefined): Cut | undefined {
  if (b === undefined) return undefined;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const common = a.slice(0, i);
  // From a leading ./ or ~/ too, or the cut would leave a stray "." before its "…/".
  const start = common.search(/(?<![\w.-])(?:\.{1,2}|~)?\//);
  const end = common.lastIndexOf("/") + 1;
  return start >= 0 && end - start >= MIN_SHARED_PATH ? { start, end } : undefined;
}

/**
 * What each overview shares with a neighbour, which only pushes what differs past the edge:
 * `~/proj/mods/a.js`, `~/proj/mods/b.js` become `…/a.js`, `…/b.js`. Neighbours rather than the
 * whole group, so one unrelated call does not stop the rest from shortening; the shorter of the
 * two, so a directory that tells this call from the other neighbour stays.
 */
export function sharedPaths(texts: string[]): (Cut | undefined)[] {
  return texts.map((text, i) => {
    const before = sharedPath(text, texts[i - 1]);
    const after = sharedPath(text, texts[i + 1]);
    if (!before || !after) return before ?? after;
    return after.end < before.end ? after : before;
  });
}

/** The same form as Pi's own "Took" lines. */
export function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  if (minutes < 60) return `${minutes}m ${whole % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ${whole % 60}s`;
}

// truncateToWidth closes what it cuts with a full reset, which would also end a group's background.
const FULL_RESET = "\x1b[0m";
const RESET_KEEPING_BACKGROUND = "\x1b[22;23;24;27;29;39m";

/** truncateToWidth that leaves the surrounding background in place. */
export function fit(text: string, width: number, ellipsis = "...", pad = false): string {
  return truncateToWidth(text, width, ellipsis, pad).replaceAll(
    FULL_RESET,
    RESET_KEEPING_BACKGROUND,
  );
}

export const isBlank = (line: string) => !stripTerminalSequences(line).trim();

/** Lines without a closing "Took …" line and the blank lines around it, if there is one. */
export function stripTook(lines: string[], durationMs: number | undefined): string[] {
  let end = lines.length;
  while (end > 0 && isBlank(lines[end - 1]!)) end--;
  const last = lines[end - 1];
  if (
    durationMs === undefined ||
    !last ||
    !DURATION_LINE.test(stripTerminalSequences(last).trim())
  ) {
    return lines;
  }
  end--;
  while (end > 0 && isBlank(lines[end - 1]!)) end--;
  return lines.slice(0, end);
}

/** Without blank lines at either end. */
export function trimBlank(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && isBlank(lines[start]!)) start++;
  while (end > start && isBlank(lines[end - 1]!)) end--;
  return lines.slice(start, end);
}
