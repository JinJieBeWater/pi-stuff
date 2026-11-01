import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import type {
  ExtensionAPI,
  ExtensionContext,
  MarkdownTransformContext,
  MarkdownTransformer,
  SessionStartEvent,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Markdown,
  type MarkdownTheme,
  resetCapabilitiesCache,
  setCapabilities,
  stripTerminalSequences,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { getMarkdownTheme, initTheme } from "@earendil-works/pi-coding-agent";
import extension from "../index";

beforeEach(() => initTheme("dark", false));
afterEach(() => resetCapabilitiesCache());

function setup() {
  let transform: MarkdownTransformer;
  let start: (event: SessionStartEvent, ctx: ExtensionContext) => unknown;
  extension({
    registerMarkdownTransformer(handler: MarkdownTransformer) {
      transform = handler;
    },
    on(event: string, handler: typeof start) {
      if (event === "session_start") start = handler;
    },
  } as unknown as ExtensionAPI);
  return {
    render(markdown: string, context: Partial<MarkdownTransformContext> = {}) {
      return transform(markdown, {
        messageType: "assistant",
        isStreaming: false,
        availableWidth: 160,
        ...context,
      });
    },
    start(ui: { theme: Pick<Theme, "fg" | "getFgAnsi"> }) {
      start({ type: "session_start", reason: "startup" }, { ui } as ExtensionContext);
    },
  };
}

test.each(["user", "assistant"] as const)(
  "passes non-Mermaid %s messages through without normalization",
  (messageType) => {
    const source = "# Heading\r\n\r\nRead [Pi][docs].\r\n\r\n[docs]: https://pi.dev\r\n";
    expect(setup().render(source, { messageType })).toBe(source);
  },
);

test.each([
  ["```MeRmAiD", "```"],
  ["~~~mermaid", "~~~"],
  ["````mermaid", "````"],
  ["``` MERMAID extra", "```"],
])("still renders Mermaid with fence %s", (opening, closing) => {
  const source = `${opening}\nflowchart TD\n  A[Start] --> B[Done]\n${closing}`;
  const rendered = setup().render(source);
  expect(rendered).toContain("Start");
  expect(rendered).not.toContain("flowchart TD");
});

test("renders pie charts through the registered Markdown transformer", () => {
  const { render } = setup();
  const source = '```mermaid\npie\n  title Pets\n  "Dogs" : 4\n```';
  const rendered = render(source);
  expect(rendered).toContain("Pets");
  expect(rendered).toContain("Dogs");
  expect(rendered).toContain("████");
  expect(rendered).not.toContain("```mermaid");
});

test("history painted before session_start keeps its colors across cached and fresh redraws", () => {
  initTheme("dark", false);
  const harness = setup();
  const markdownTheme = {
    ...getMarkdownTheme(),
    code: (text: string) => `\x1b[31m${text}\x1b[39m`,
  };
  const source =
    "```mermaid\nflowchart TD\n  A[OldProbe]:::hot --> B[PlainProbe]\n  classDef hot fill:#f96,color:#000\n```";
  const component = new Markdown(source, 0, 0, markdownTheme, undefined, {
    transform: (markdown, availableWidth) => harness.render(markdown, { availableWidth }),
  });
  const first = component.render(100).join("\n");
  // oxlint-disable-next-line no-control-regex -- Assert against intentional ANSI escape sequences.
  expect(first).not.toMatch(/\x1b\[31m[^\x1b\n]*OldProbe/);
  expect(first).toContain("\x1b[38;2;0;0;0;48;2;255;153;102m");

  harness.start({
    theme: { getFgAnsi: () => "\x1b[38;5;45m", fg: (_color: string, text: string) => text },
  });
  expect(component.render(100).join("\n")).toBe(first);
  component.invalidate();
  expect(component.render(100).join("\n")).toBe(first);
});

test("uses the current Pi theme and honors author styles", () => {
  const harness = setup();
  const source =
    "```mermaid\nflowchart LR\n  A[Hot]:::highlight --> B[Plain]\n  classDef highlight fill:#f96,stroke:#333,color:#000,font-weight:bold\n```";
  const rendered = harness.render(source);
  expect(rendered).toContain("\x1b[1;38;2;51;51;51;48;2;255;153;102m");
  expect(rendered).toContain("\x1b[1;38;2;0;0;0;48;2;255;153;102m");
  expect(rendered).not.toContain("```mermaid");

  initTheme("light", false);
  const light = harness.render(source);
  expect(light).not.toBe(rendered);
  expect(light).toContain("\x1b[1;38;2;0;0;0;48;2;255;153;102m");
});

test("links only node labels and respects terminal hyperlink capabilities", () => {
  const harness = setup();
  const source =
    '```mermaid\nflowchart TD\n  A[Docs] --> B[Done]\n  click A "https://example.com/docs"\n```';
  const opener = "\x1b]8;;https://example.com/docs\x1b\\";
  setCapabilities({ images: null, trueColor: true, hyperlinks: true });
  const linked = harness.render(source);
  expect(linked.split(opener)).toHaveLength(2);
  const label = linked.split(opener)[1]!.split("\x1b]8;;\x1b\\")[0]!;
  expect(stripTerminalSequences(label)).toBe("Docs");

  setCapabilities({ images: null, trueColor: true, hyperlinks: false });
  const unlinked = harness.render(source);
  expect(unlinked).not.toContain("\x1b]8;;");
  expect(unlinked).not.toContain("https://example.com/docs");
  expect(unlinked).toContain("Docs");
});

test.each([
  ["flowchart TD\n  A[Start] --> B[Done]", "Start"],
  ["stateDiagram-v2\n  [*] --> Ready", "Ready"],
  ["classDiagram\n  class Account", "Account"],
  ["erDiagram\n  USER ||--o{ ORDER : places", "ORDER"],
  ["sequenceDiagram\n  Alice->>Bob: Hello", "Hello"],
  ["mindmap\n  root((Plan))\n    Build\n    Test", "Build"],
  ["timeline\n  title Plan\n  2026 : Build", "Build"],
  ['gitGraph\n  commit id: "initial"', "initial"],
])("renders supported syntax: %s", (diagram, label) => {
  const rendered = setup().render(`\`\`\`mermaid\n${diagram}\n\`\`\``);
  expect(rendered).not.toContain("```mermaid");
  expect(rendered).toContain(label);
});

test("leaves other Markdown, nested diagrams and thinking blocks unchanged", () => {
  const { render } = setup();
  for (const source of [
    "# Heading\n\nOrdinary **text** and [link](https://example.com).\n",
    "```typescript\nconst x = 1;\n```\n",
    "> ```mermaid\n> flowchart TD\n>   A --> B\n> ```\n",
    "- Item\n\n  ```mermaid\n  flowchart TD\n    A --> B\n  ```\n",
  ])
    expect(render(source)).toBe(source);
  const diagram = "```mermaid\nflowchart TD\n  A --> B\n```";
  expect(render(diagram, { messageType: "assistant-thinking" })).toBe(diagram);
  expect(render(diagram, { messageType: "user" })).not.toContain("```mermaid");
});

test("keeps unsupported, empty and oversized diagrams as source and rerenders after resize", () => {
  const { render } = setup();
  for (const source of [
    "```mermaid\ngantt\n  title Plan\n```",
    "```mermaid\n```",
    "```mermaid\nflowchart TD\n !\n```",
  ]) {
    expect(render(source)).toBe(source);
  }
  const source = "```mermaid\nflowchart LR\n  A[Start] --> B[Done]\n```";
  expect(render(source, { availableWidth: 10 })).toBe(source);
  expect(render(source, { availableWidth: 100 })).not.toContain("```mermaid");
});

test("renders incomplete streaming blocks but keeps final partial-render warnings", () => {
  const { render } = setup();
  const incomplete = "```mermaid\nflowchart TD\n  A[Start] --> B[Done";
  const streaming = render(incomplete, { isStreaming: true });
  expect(streaming).not.toContain("```mermaid");
  expect(streaming).not.toContain("Mermaid diagram not rendered");
  expect(streaming).toContain("Start");

  const source = "```mermaid\nflowchart LR\n  A --> B\n  broken !\n  other ?\n```";
  const final = render(`${source}\nFollowing text`);
  expect(final).toContain(source);
  expect(final).toContain('Mermaid diagram not rendered: dropped, expected a link: "!"');
  expect(final).toContain("(+1 more)");
  expect(final).toContain("  \nFollowing text");
});

test("preserves diagram labels and geometry through Pi's actual Markdown component", () => {
  const identity = (text: string) => text;
  const theme: MarkdownTheme = {
    heading: identity,
    link: identity,
    linkUrl: identity,
    code: identity,
    codeBlock: identity,
    codeBlockBorder: identity,
    quote: identity,
    quoteBorder: identity,
    hr: identity,
    listBullet: identity,
    bold: identity,
    italic: identity,
    strikethrough: identity,
    underline: identity,
  };
  const { render } = setup();
  const source =
    'Before\n\n```mermaid\nflowchart TD\n  A["`edge` 中文 👩‍💻"] --> B["two `` ticks"]\n```\n\nAfter';
  const component = new Markdown(source, 0, 0, theme, undefined, {
    transform: (markdown, availableWidth) => render(markdown, { availableWidth }),
  });
  const lines = component.render(100);
  const text = lines.join("\n");
  expect(text).toContain("`edge` 中文 👩‍💻");
  expect(text).toContain("two `` ticks");
  expect(text).toContain("Before");
  expect(text).toContain("After");
  expect(text).not.toContain("flowchart TD");
  expect(lines.every((line) => visibleWidth(line) <= 100)).toBe(true);
  component.invalidate();
  expect(component.render(10).join("\n")).toContain("flowchart");
});

test("does not emit terminal controls supplied inside a node label", () => {
  const source = '```mermaid\nflowchart TD\n  A["Safe \x1b[2J label"]\n```';
  expect(setup().render(source)).not.toContain("\x1b[2J");
});
