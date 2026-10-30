import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  getMarkdownTheme,
  initTheme,
  type ExtensionAPI,
  type MarkdownTransformContext,
  type MarkdownTransformer,
} from "@earendil-works/pi-coding-agent";
import {
  getCapabilities,
  getOsc8LinkAtColumn,
  Markdown,
  Marked,
  resetCapabilitiesCache,
  setCapabilities,
  stripTerminalSequences,
  visibleWidth,
} from "@earendil-works/pi-tui";
import extension from "../index";

const sample = [
  "| 方案 | 接入方式 | 主要限制 |",
  "| --- | --- | --- |",
  "| Mermaid | 公开 Markdown transformer | 关系图，不适合通用数据绘图 |",
  "| Charts | 同一 assistant 回复 | 数据需保留原值以便核对 |",
].join("\n");

beforeEach(() => initTheme("dark", false));
afterEach(() => resetCapabilitiesCache());

function setup() {
  let transform: MarkdownTransformer | undefined;
  extension({
    registerMarkdownTransformer(handler: MarkdownTransformer) {
      expect(transform).toBeUndefined();
      transform = handler;
    },
  } as ExtensionAPI);
  expect(transform).toBeFunction();
  return (source: string, context: Partial<MarkdownTransformContext> = {}) =>
    transform!(source, {
      messageType: "assistant",
      isStreaming: false,
      availableWidth: 40,
      ...context,
    });
}

function render(source: string, width = 120) {
  return new Markdown(source, 0, 0, getMarkdownTheme()).render(width).map(stripTerminalSequences);
}

test("40, 80 and 120 columns use borderless tables with only one header rule", () => {
  const transform = setup();
  for (const width of [40, 80, 120]) {
    const output = transform(sample, { availableWidth: width });
    expect(output).not.toBe(sample);
    const lines = render(output, width);
    expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
    expect(lines.join("\n")).not.toMatch(/[┌┐└┘├┤┬┴┼│]/);
    expect(lines.filter((line) => /^[─ ]+$/.test(line) && line.includes("─"))).toHaveLength(1);
  }
});

test.each(["user", "assistant-thinking"] as const)(
  "%s remains byte-for-byte unchanged",
  (messageType) => {
    expect(setup()(sample, { messageType })).toBe(sample);
  },
);

test("streaming stays unchanged, completion and interrupted-stream updates can reflow", () => {
  const transform = setup();
  for (let end = 0; end <= sample.length; end++) {
    const partial = sample.slice(0, end);
    expect(transform(partial, { isStreaming: true })).toBe(partial);
  }
  expect(transform(sample, { isStreaming: false })).not.toBe(sample);
  const partialRow = sample + "\n| unfinished |";
  expect(transform(partialRow)).toBe(partialRow);
});

test("small tables also lose the frame, rather than becoming cards", () => {
  const small = "| A | B |\n|---|---|\n| x | y |\n";
  const transform = setup();
  for (const width of [8, 9, 40]) {
    const output = transform(small, { availableWidth: width });
    expect(output).not.toBe(small);
    const text = render(output, width).join("\n");
    expect(text).toContain("A  B");
    expect(text).toContain("x  y");
    expect(text).not.toContain("：");
  }
});

test("there is no 60-column cutoff, while invalid widths remain conservative", () => {
  const wide = "| A | B |\n|---|---|\n| " + "中".repeat(40) + " | data |";
  const transform = setup();
  for (const width of [59, 60, 80, 120])
    expect(transform(wide, { availableWidth: width })).not.toBe(wide);
  for (const width of [0, -1, NaN, Infinity, 1.5]) {
    expect(transform(wide, { availableWidth: width })).toBe(wide);
  }
});

test("Pi Markdown resizes the same source in both directions using its actual content width", () => {
  const transform = setup();
  const seen: number[] = [];
  const component = new Markdown(sample, 2, 0, getMarkdownTheme(), undefined, {
    transform(source, availableWidth) {
      seen.push(availableWidth);
      return transform(source, { availableWidth });
    },
  });
  const first = component.render(44);
  expect(first.join("\n")).not.toContain("│");
  expect(first.every((line) => visibleWidth(line) <= 44)).toBe(true);
  for (const width of [84, 124]) {
    const lines = component.render(width);
    expect(lines.join("\n")).not.toContain("│");
    expect(stripTerminalSequences(lines.join("\n"))).toContain("Mermaid");
    expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
  }
  expect(component.render(44)).toEqual(first);
  expect(seen).toEqual([40, 80, 120, 40]);
  expect(sample).toContain("| Mermaid |");
});

test.each(["dark", "light"])(
  "Pi renders Chinese and emoji without overflow in %s theme",
  (theme) => {
    initTheme(theme, false);
    const source = "| 项目 | 说明 |\n|---|---|\n| 图表👩‍💻🇨🇳 | 测试完成 |\n| Mermaid | 图解正常 |";
    const transformed = setup()(source);
    expect(transformed).not.toBe(source);
    const text = render(transformed, 40);
    expect(text.every((line) => visibleWidth(line) <= 40)).toBe(true);
    expect(text.join("\n")).toContain("图表👩‍💻🇨🇳");
    expect(text.join("\n")).toContain("Mermaid");
  },
);

test("spaces, punctuation and Markdown escapes preserve Pi's actual cell text", () => {
  const value = "1. (a) [draft] ! # + - : ; , = / ? @ {x} \\* \\_ \\~ \\` C:\\temp a  b";
  const source = "| 项目 | 内容 |\n|---|---|\n| API | " + value + " |";
  const transformed = setup()(source, { availableWidth: 300 });
  expect(transformed).not.toBe(source);
  const originalRow = render(source, 300).find((line) => line.includes("API"))!;
  const originalValue = originalRow.split("│")[2].trim();
  expect(originalValue).toContain("a  b");
  expect(originalValue).toContain("C:\\temp");
  expect(render(transformed, 300).join("\n")).toContain(originalValue);
  expect(new Marked().lexer(transformed).some((token) => token.type === "list")).toBe(false);
});

test("empty headers and cells retain their columns and empty data row", () => {
  const source = "| 项目 | | 详细说明 |\n|---|---|---|\n| | | " + "完整内容".repeat(12) + " |";
  const transformed = setup()(source, { availableWidth: 160 });
  expect(transformed).not.toBe(source);
  const text = render(transformed, 160).join("\n");
  expect(text).toContain("项目");
  expect(text).toContain("详细说明");
  expect(text).toContain("完整内容".repeat(12));
  expect(text).not.toContain("│");
});

test.each([
  "**bold**",
  "*emphasis*",
  "~~deleted~~",
  "`code`",
  "[link](https://example.com)",
  "![alt](image.png)",
  "<b>HTML</b>",
  "中*中*文",
  "a_b_c",
  "$x^2$",
  "\\(x\\)",
  "\\[x\\]",
  "&lt; &amp; &#124;",
])("native inline rendering is preserved: %s", (value) => {
  const source = sample.replace("Mermaid", value);
  const transformed = setup()(source, { availableWidth: 500 });
  expect(transformed).not.toBe(source);
  const originalRow = render(source, 500).filter((line) => line.startsWith("│"))[1];
  const originalValue = originalRow.split("│")[1].trim();
  expect(render(transformed, 500).join("\n")).toContain(originalValue);
});

test.each(["a\\|b", "a\tb", "a\x1b[2Jb"])(
  "ambiguous or control-bearing rows remain verbatim: %s",
  (value) => {
    expect(setup()(sample.replace("Mermaid", value))).toBe(sample.replace("Mermaid", value));
  },
);

test.each([
  "| A | B |\n|---|---|\n| one | two | EXTRA MUST NOT DISAPPEAR |",
  "| A | B |\n|---|---|\n| missing |",
  "| A | B |\n|---|---|",
  "| A | B |\n|---|---|\nnot a table row",
  "| A | B |\n|---|\n| one | two |",
  "| A | B |\n|---|---|\n| one | two |\n| broken |",
])("malformed or normalized tables remain unchanged: %s", (source) => {
  expect(setup()(source, { availableWidth: 8 })).toBe(source);
});

test.each([
  "A | B\n---|---\none | two",
  "| A | B\n|---|---\n| one | two",
  "A | B |\n---|---|\none | two |",
  "| A | B |\n|---|---|\n| one | two",
  "| A |\n|---|\n| one |",
])("optional outer pipes and one-column tables use the same borderless layout: %s", (source) => {
  const output = setup()(source, { availableWidth: 80 });
  expect(output).not.toBe(source);
  const text = render(output, 80).join("\n");
  expect(text).toContain("one");
  expect(text).not.toMatch(/[┌┐└┘├┤┬┴┼│]/);
});

test.each([
  (source: string) =>
    source
      .split("\n")
      .map((line) => "> " + line)
      .join("\n"),
  (source: string) =>
    "- item\n\n" +
    source
      .split("\n")
      .map((line) => "  " + line)
      .join("\n"),
  (source: string) =>
    source
      .split("\n")
      .map((line) => "    " + line)
      .join("\n"),
  (source: string) => "```md\n" + source + "\n```",
  (source: string) => "~~~md\n" + source + "\n~~~",
  (source: string) => "```md\n" + source,
])("nested tables and code are never traversed", (wrap) => {
  const source = wrap(sample);
  expect(setup()(source)).toBe(source);
});

test("mixed prose, code, Mermaid and chart fences retain their exact source around a real table", () => {
  const prefix = "正文 | 不是表格\n\n```ts\nconst x = 'a|b';\n```\n\n";
  const suffix =
    "\n\n```mermaid\nflowchart TD\n A --> B\n```\n\n```chart\ntype: bar\nA 2\n```\n\n结束。\n";
  const source = prefix + sample + suffix;
  const transformed = setup()(source);
  expect(transformed).not.toBe(source);
  expect(transformed.startsWith(prefix)).toBe(true);
  expect(transformed.endsWith(suffix)).toBe(true);
});

test("a following paragraph or heading keeps its original block boundary", () => {
  const suffix = "# Following\n\nUntouched paragraph.";
  const transformed = setup()(sample + "\n" + suffix);
  expect(transformed).not.toContain("| Mermaid |");
  expect(transformed.endsWith(suffix)).toBe(true);
  const tokens = new Marked().lexer(transformed);
  expect(tokens.some((token) => token.type === "heading" && token.text === "Following")).toBe(true);
});

test("block boundaries preserve a preceding literal backslash", () => {
  const literal = "Intro " + String.fromCharCode(92);
  const source = literal + "\n" + sample;
  expect(render(source, 160).join("\n")).toContain(literal);
  const transformed = setup()(source);
  expect(transformed).not.toBe(source);
  expect(render(transformed, 160).join("\n")).toContain(literal);
});

test.each([
  ["indented code", '\n\n    const value = "**keep**";'],
  ["tab-indented code", '\n\n\tconst value = "**keep**";'],
  ["same-marker list", "\n\n- Outside item"],
  ["empty same-marker list", "\n\n-\n- Outside item"],
  ["terminal empty same-marker item", "\n\n-"],
])("block boundaries preserve following %s", (_name, suffix) => {
  const source = sample + suffix;
  const transformed = setup()(source);
  expect(transformed).not.toBe(source);
  expect(transformed.endsWith(suffix)).toBe(true);
  const original = new Marked()
    .lexer(source)
    .filter((token) => token.type === "code" || token.type === "list");
  const result = new Marked()
    .lexer(transformed)
    .filter((token) => token.type === "code" || token.type === "list");
  expect(result).toEqual(original);
});

test("table punctuation inside cells is not mistaken for the structural frame", () => {
  const value = "│ ┌─┬┐ ├─┼┤ └─┴┘";
  const source = `| A | B |\n|---|---|\n| literal | ${value} |`;
  const output = setup()(source, { availableWidth: 160 });
  expect(output).not.toBe(source);
  expect(render(output, 160).join("\n")).toContain(value);
});

test("cell hyperlinks survive the borderless layout", () => {
  setCapabilities({ ...getCapabilities(), hyperlinks: true });
  const source = "| A | B |\n|---|---|\n| Docs | [Pi](https://example.com/docs) |";
  const output = setup()(source, { availableWidth: 80 });
  expect(output).not.toBe(source);
  expect(new Markdown(output, 0, 0, getMarkdownTheme()).render(80).join("\n")).toContain(
    "\x1b]8;;https://example.com/docs",
  );
});

test("a cell's hyperlink does not leak into the next data row", () => {
  setCapabilities({ ...getCapabilities(), hyperlinks: true });
  const source = "| H |\n|---|\n| [x](https://example.com) |\n| y |";
  const output = setup()(source, { availableWidth: 80 });
  const lines = new Markdown(output, 0, 0, getMarkdownTheme()).render(80);
  const x = lines.find((line) => stripTerminalSequences(line).trim() === "x")!;
  const y = lines.find((line) => stripTerminalSequences(line).trim() === "y")!;
  expect(getOsc8LinkAtColumn(x, 0)).toBe("https://example.com");
  expect(getOsc8LinkAtColumn(y, 0)).toBeUndefined();
});

test("the header's bold style does not leak into plain data", () => {
  const output = setup()("| H |\n|---|\n| x |", { availableWidth: 80 });
  const lines = new Markdown(output, 0, 0, getMarkdownTheme()).render(80);
  const x = lines.find((line) => stripTerminalSequences(line).trim() === "x")!;
  expect(x).not.toContain("\x1b[1m");
});

test.each(["before", "after", "quoted"])(
  "reference definitions %s the table retain their native link meaning",
  (placement) => {
    setCapabilities({ ...getCapabilities(), hyperlinks: true });
    const table = "| H |\n|---|\n| [x][r] |";
    const definition = "[r]: https://example.com";
    const source =
      placement === "before"
        ? definition + "\n\n" + table
        : table + "\n\n" + (placement === "quoted" ? "> " : "") + definition;
    const original = new Markdown(source, 0, 0, getMarkdownTheme())
      .render(80)
      .find((line) => stripTerminalSequences(line).includes("│ x │"))!;
    expect(getOsc8LinkAtColumn(original, 2)).toBe("https://example.com");
    const output = setup()(source, { availableWidth: 80 });
    expect(output).not.toBe(source);
    const x = new Markdown(output, 0, 0, getMarkdownTheme())
      .render(80)
      .find((line) => stripTerminalSequences(line).trim() === "x");
    expect(x).toBeDefined();
    expect(getOsc8LinkAtColumn(x!, 0)).toBe("https://example.com");
  },
);

test("untouched prose and lexer-normalized inputs are byte-for-byte unchanged", () => {
  for (const source of [
    "# Text\n\n- no table\n\ninline `a|b` and **bold**\n",
    sample.replaceAll("\n", "\r\n"),
    "Read [Pi][docs].\n\n[docs]: https://pi.dev\n",
  ])
    expect(setup()(source)).toBe(source);
});
