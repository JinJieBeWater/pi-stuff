import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  AssistantMessageComponent,
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

function assistantMessage(text: string): Parameters<AssistantMessageComponent["updateContent"]>[0] {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-completions",
    provider: "openai",
    model: "fixture",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 0,
  };
}

test("40, 80 and 120 columns use a heavy header rule and thin data rules without a frame", () => {
  const transform = setup();
  for (const width of [40, 80, 120]) {
    const output = transform(sample, { availableWidth: width });
    expect(output).not.toBe(sample);
    const lines = render(output, width);
    expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
    expect(lines.join("\n")).not.toMatch(/[┌┐└┘├┤┬┴┼│]/);
    const rules = lines.filter((line) => /^[━─ ]+$/.test(line) && /[━─]/.test(line));
    expect(rules).toHaveLength(2);
    expect(rules[0].trimEnd()).toMatch(/^━+(?:  ━+)*$/);
    expect(rules[1]).toBe(rules[0].replaceAll("━", "─"));
    expect(rules[0].trimEnd().split("  ")).toHaveLength(3);
    const content = lines.filter((line) => line.trim());
    expect(content[0]).not.toMatch(/^[━─ ]+$/);
    expect(content.at(-1)).not.toMatch(/^[━─ ]+$/);
  }
});

test.each(["user", "assistant-thinking"] as const)(
  "%s remains byte-for-byte unchanged",
  (messageType) => {
    const transform = setup();
    for (const isStreaming of [true, false])
      expect(transform(sample, { messageType, isStreaming })).toBe(sample);
  },
);

test("streaming formats the header and unfinished final row without changing final validation", () => {
  const transform = setup();
  const header = sample.split("\n").slice(0, 2).join("\n");
  const firstRow = sample.split("\n").slice(0, 3).join("\n");
  for (const source of [header, firstRow, sample, sample + "\n| unfinished |"])
    expect(transform(source, { isStreaming: true })).not.toBe(source);
  for (const source of [header, sample + "\n| unfinished |"])
    expect(transform(source, { isStreaming: false })).toBe(source);
  for (const source of [firstRow, sample, sample + "\n\nStill generating."])
    expect(transform(source, { isStreaming: true })).toBe(transform(source));
});

test("Pi Markdown updates table styling before streaming ends", () => {
  const transform = setup();
  let isStreaming = true;
  const component = new Markdown("", 2, 0, getMarkdownTheme(), undefined, {
    transform(source, availableWidth) {
      return transform(source, { isStreaming, availableWidth });
    },
  });
  let streamed: string[] = [];
  for (const source of [
    sample.split("\n").slice(0, 3).join("\n"),
    sample,
    sample + "\n\nStill generating.",
  ]) {
    component.setText(source);
    streamed = component.render(84);
    const plain = streamed.map(stripTerminalSequences).join("\n");
    expect(plain).not.toMatch(/[┌┐└┘├┤┬┴┼│]/);
    expect(plain).toContain("━");
    expect(plain).toContain("Mermaid");
    expect(streamed.every((line) => visibleWidth(line) <= 84)).toBe(true);
  }
  expect(streamed.map(stripTerminalSequences).join("\n")).toContain("Still generating.");
  isStreaming = false;
  component.invalidate();
  expect(component.render(84)).toEqual(streamed);
});

test.each([
  "| A | B |\n|---|---|\n| x | y |\n| z | next |\n| last | row |",
  sample,
  [
    "| 项目 | 状态 | 耗时 | 说明 |",
    "| :--- | :---: | ---: | :--- |",
    "| 配置加载 | 完成 | 12 ms | 读取本地配置 |",
    "| 数据校验 | 完成 | 86 ms | 检查必填字段与数据格式 |",
    "| 表格渲染 | 进行中 | 128 ms | 较长的说明会随终端宽度自动换行 |",
    "| 结果保存 | 等待 | — | 渲染结束后写入文件 |",
  ].join("\n"),
  "A | B\n---|---\none | two\nthree | four",
  "A | B\n---|---\n#x | y",
  "| H |\n|---|\n| one |\n| two |",
])("Pi assistant never restores the native frame at any streaming prefix: %s", (source) => {
  const transform = setup();
  const component = new AssistantMessageComponent(
    undefined,
    false,
    getMarkdownTheme(),
    undefined,
    0,
    [transform],
  );
  const headerEnd = source.indexOf("\n", source.indexOf("\n") + 1);
  for (const width of [40, 80, 120]) {
    for (let end = headerEnd; end <= source.length; end++) {
      const partial = source.slice(0, end);
      component.updateContent(assistantMessage(partial), true);
      const lines = component.render(width);
      const plain = lines.map(stripTerminalSequences).join("\n");
      expect(plain).toContain("━");
      expect(plain).not.toMatch(/[┌┐└┘├┤┬┴┼│]/);
      expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
      const nativeRows = render(partial, 1000).filter((line) => line.startsWith("│"));
      const actual = render(
        transform(partial, { isStreaming: true, availableWidth: 1000 }),
        1000,
      ).join("\n");
      for (const row of nativeRows)
        for (const cell of row.split("│").slice(1, -1))
          if (cell.trim()) expect(actual).toContain(cell.trim());
    }
  }
  const streamed = component.render(120);
  component.updateContent(assistantMessage(source), false);
  expect(component.render(120)).toEqual(streamed);
});

test("Pi assistant trims terminal newlines, so only the streaming message tail may lack columns", () => {
  const source = "| A | B |\n|---|---|\n| missing |\n";
  const transform = setup();
  const seen: string[] = [];
  const component = new AssistantMessageComponent(
    undefined,
    false,
    getMarkdownTheme(),
    undefined,
    0,
    [
      (text, context) => {
        seen.push(text);
        return transform(text, context);
      },
    ],
  );
  for (const text of [source.trimEnd(), source]) {
    expect(render(transform(text, { isStreaming: true })).join("\n")).toContain("━");
    component.updateContent(assistantMessage(text), true);
    expect(component.render(80).map(stripTerminalSequences).join("\n")).toContain("━");
    expect(seen.at(-1)).toBe(source.trimEnd());
  }
  component.updateContent(assistantMessage(source + "|"), true);
  expect(component.render(80).map(stripTerminalSequences).join("\n")).toContain("┌");
  component.updateContent(assistantMessage(source), false);
  expect(component.render(80).map(stripTerminalSequences).join("\n")).toContain("┌");
});

test.each([
  "| A | B |\n|---|---|\n| missing |\n\nAfter.",
  "| A | B |\n|---|---|\n| missing |\n| x | y |",
  "| A | B |\n|---|---|\n| x | y | extra",
  "| A | B |\n|---|\n| x | y",
])("streaming never relaxes validation outside the unfinished last row: %s", (source) => {
  expect(setup()(source, { isStreaming: true })).toBe(source);
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

test("Markdown alignment controls text and numbers without changing their values", () => {
  const source = [
    "| Left | Center | Right |",
    "| :--- | :---: | ---: |",
    "| x | y | 1 |",
    "| wide | middle | 12345 |",
    "| | | **+102%** |",
  ].join("\n");
  const lines = render(setup()(source, { availableWidth: 80 }), 80).map((line) => line.trimEnd());
  expect(lines).toContain(["x   ", "  y   ", "    1"].join("  "));
  expect(lines).toContain(["wide", "middle", "12345"].join("  "));
  expect(lines).toContain(["    ", "      ", "+102%"].join("  "));
});

test.each([":---:", "---:"])("%s alignment preserves Unicode cell whitespace", (alignment) => {
  const transform = setup();
  for (const space of ["\u3000", "\u00a0"]) {
    const source = `| H | B |\n| ${alignment} | --- |\n| \`x${space}\` | Y |`;
    const lines = render(transform(source, { availableWidth: 80 }), 80);
    const header = lines.find((line) => line.includes("H"))!;
    const row = lines.find((line) => line.includes("x"))!;
    expect(row).toContain(`x${space}`);
    expect(visibleWidth(row.slice(0, row.indexOf("Y")))).toBe(
      visibleWidth(header.slice(0, header.indexOf("B"))),
    );
  }
});

test.each(["dark", "light"])("aligned cells retain the next cell's %s theme color", (theme) => {
  initTheme(theme, false);
  const transform = setup();
  for (const alignment of ["---:", ":---:"]) {
    const source = `| Header | Next |\n| ${alignment} | --- |\n| x | Y |`;
    const output = transform(source, { availableWidth: 80 });
    const row = new Markdown(output, 0, 0, getMarkdownTheme())
      .render(80)
      .find((line) => stripTerminalSequences(line).includes("Y"))!;
    const color = getMarkdownTheme().codeBlock("Y").split("Y")[0];
    expect(row.slice(0, row.indexOf("Y")).endsWith(color)).toBe(true);
  }
});

test.each(["dark", "light"])("aligned wrapping preserves wide text in %s theme", (theme) => {
  initTheme(theme, false);
  const letters = "abcdefghijklmnopqrstuvwxyz".repeat(2);
  const source = `| 项目 | 内容 | 得分 |\n| :---: | ---: | ---: |\n| 👩‍💻🇨🇳 | **${letters}** | 7 |\n| 测试 | 说明 | 123 |`;
  const transform = setup();
  for (const width of [24, 40, 80]) {
    const output = transform(source, { availableWidth: width });
    expect(output).not.toBe(source);
    const lines = render(output, width);
    expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
    expect(lines.filter((line) => /^[━─ ]+$/.test(line) && /[━─]/.test(line))).toHaveLength(2);
    for (const emoji of ["👩‍💻", "🇨🇳"]) expect(lines.join("\n")).toContain(emoji);
    expect(lines.join("").match(/[a-z]/g)?.join("")).toBe(letters);
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
    const transform = setup();
    for (const isStreaming of [true, false]) {
      for (const source of [sample.replace("Mermaid", value), sample + "\n| " + value])
        expect(transform(source, { isStreaming })).toBe(source);
    }
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

test.each(["---", "---:", ":---:"])(
  "%s alignment keeps hyperlinks inside their cell",
  (alignment) => {
    setCapabilities({ ...getCapabilities(), hyperlinks: true });
    const source = `| Header |\n|${alignment}|\n| [x](https://example.com) |\n| y |`;
    const output = setup()(source, { availableWidth: 80 });
    const lines = new Markdown(output, 0, 0, getMarkdownTheme()).render(80);
    const x = lines.find((line) => stripTerminalSequences(line).trim() === "x")!;
    const y = lines.find((line) => stripTerminalSequences(line).trim() === "y")!;
    const column = stripTerminalSequences(x).indexOf("x");
    expect(getOsc8LinkAtColumn(x, column)).toBe("https://example.com");
    for (const line of lines.filter((line) => line !== x)) {
      for (let i = 0; i < visibleWidth(line); i++)
        expect(getOsc8LinkAtColumn(line, i)).toBeUndefined();
    }
    expect(y).toBeDefined();
  },
);

test.each(["---", "---:", ":---:"])(
  "%s alignment keeps header bold out of plain data",
  (alignment) => {
    const output = setup()(`| Header |\n|${alignment}|\n| x |\n| **y** |`, { availableWidth: 80 });
    const lines = new Markdown(output, 0, 0, getMarkdownTheme()).render(80);
    const header = lines.find((line) => stripTerminalSequences(line).trim() === "Header")!;
    const x = lines.find((line) => stripTerminalSequences(line).trim() === "x")!;
    const y = lines.find((line) => stripTerminalSequences(line).trim() === "y")!;
    expect(header).toContain(getMarkdownTheme().bold("Header"));
    expect(x).not.toContain("\x1b[1m");
    expect(y.includes("\x1b[1m")).toBe(getMarkdownTheme().bold("y").includes("\x1b[1m"));
  },
);

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
