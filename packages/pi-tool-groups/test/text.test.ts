import { homedir } from "node:os";
import { expect, test } from "vite-plus/test";
import {
  firstParagraph,
  firstStringArg,
  formatDuration,
  lastStringArg,
  pastShown,
  sharedPaths,
  shortenPaths,
  stripTook,
  tailLines,
  trimBlank,
} from "../text";

test("the last string argument is the one the model is writing, however deep", () => {
  expect(lastStringArg({ path: "/a", content: "body" })).toBe("body");
  expect(lastStringArg({ command: "ls", timeout: 30 })).toBe("ls");
  expect(
    lastStringArg({ path: "/a", edits: [{ oldText: "x", newText: "y" }, { oldText: "z" }] }),
  ).toBe("z");
  expect(lastStringArg({ count: 3, empty: "" })).toBe("");
  expect(lastStringArg(undefined)).toBe("");
});

test("tail lines skip blank ones", () => {
  expect(tailLines("a\nb\n\nc\nd\n", 3)).toEqual(["b", "c", "d"]);
  expect(tailLines("a\n\nb", 3)).toEqual(["a", "b"]);
  expect(tailLines("", 3)).toEqual([]);
  expect(tailLines("\n\n", 3)).toEqual([]);
});

test("past the shown lines: only leading ones, blank ones too, at most the limit", () => {
  const shown = (line: string) => "a b".includes(line.trim());
  expect(pastShown("a\n\nb\nc\nb", shown, 5)).toBe("a\n\nb\n".length);
  expect(pastShown("c\na", shown, 5)).toBe(0);
  expect(pastShown("a\nb", shown, 5)).toBe(3);
  expect(pastShown("a\nb\nc", shown, 1)).toBe(2);
});

const home = homedir();

test.each([
  [[`cd ${home}/proj/pkg`], "cd ./pkg"],
  [["cat ~/proj/a ~/project-x"], "cat ./a ~/project-x"],
  [[`ls ${home}/proj`], "ls ."],
  [[`ls ${home}/other ${home}`], "ls ~/other ~"],
])("shortenPaths(%j) reads %j", ([text], expected) => {
  expect(shortenPaths(text!, `${home}/proj`)).toBe(expected);
});

test("shortenPaths leaves paths alone when the working directory is home or root", () => {
  expect(shortenPaths(`ls ${home}/x`, home)).toBe("ls ~/x");
  expect(shortenPaths("ls /tmp/x", "/")).toBe("ls /tmp/x");
});

test("sharedPaths cuts a long common directory, from its ./ if it has one", () => {
  const [a, b] = sharedPaths([
    "cat ./packages/tool-groups/a.ts",
    "cat ./packages/tool-groups/b.ts",
  ]);
  expect(a).toEqual({ start: 4, end: 27 });
  expect(b).toEqual(a);
  expect(sharedPaths(["cat /tmp/x/a", "cat /tmp/x/b"])).toEqual([undefined, undefined]);
});

test.each([
  [1200, "1.2s"],
  [90_000, "1m 30s"],
  [3_725_000, "1h 2m 5s"],
])("formatDuration(%d) is %s, as Pi writes it", (ms, shown) => {
  expect(formatDuration(ms)).toBe(shown);
});

test("firstParagraph stops at a blank line, skips a bullet heading and drops a lone bullet", () => {
  expect(firstParagraph(["write /a", "", "body"])).toBe("write /a");
  expect(firstParagraph(["• Ran", "  └ cd /repo"])).toBe("cd /repo");
  expect(firstParagraph(["• Waited for terminal"])).toBe("Waited for terminal");
});

test("firstStringArg takes the first non-empty string, one line, without control codes", () => {
  expect(firstStringArg({ n: 1, empty: " ", input: "a\n\x1b[2Jb\x07  c" })).toBe("a b c");
  expect(firstStringArg({ n: 1 })).toBe("");
});

test("stripTook drops only a closing Took line in Pi's exact form", () => {
  expect(stripTook(["out", "", "Took 1.2s", ""], 1200)).toEqual(["out"]);
  expect(stripTook(["out", "Took 3 days"], 1200)).toEqual(["out", "Took 3 days"]);
  expect(stripTook(["out", "Took 1.2s"], undefined)).toEqual(["out", "Took 1.2s"]);
  expect(trimBlank(["", "a", "", "b", " "])).toEqual(["a", "", "b"]);
});
