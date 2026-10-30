import {
  getMarkdownTheme,
  getSelectListTheme,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { getCapabilities, Marked } from "@earendil-works/pi-tui";
import { type MermaidArt, render, toAnsi } from "lovely-mermaid";

const parser = new Marked();

function codeSpan(line: string): string {
  const content = line || "\u00a0";
  const longestRun = Math.max(
    0,
    ...Array.from(content.matchAll(/`+/g), (match) => match[0].length),
  );
  const fence = "`".repeat(longestRun + 1);
  const padding = content.startsWith("`") || content.endsWith("`") ? " " : "";
  return `${fence}${padding}${content}${padding}${fence}`;
}

function themedLines(art: MermaidArt): string[] {
  // Reload paints history before session_start; these public helpers already see the live theme.
  const markdownTheme = getMarkdownTheme();
  const selectTheme = getSelectListTheme();
  const foreground = (colorize: (text: string) => string) =>
    colorize("\0").split("\0", 1)[0].slice(2, -1);
  const hyperlinks = getCapabilities().hyperlinks;
  const displayArt: MermaidArt = {
    ...art,
    styled: art.styled.map((row) =>
      row.map((span) => {
        if (span.href === undefined || (hyperlinks && span.role === "text")) return span;
        const unlinked = { ...span };
        delete unlinked.href;
        return unlinked;
      }),
    ),
  };
  return toAnsi(displayArt, {
    border: foreground(markdownTheme.codeBlockBorder),
    text: foreground(markdownTheme.codeBlock),
    edge: foreground(selectTheme.selectedText),
    edgeLabel: foreground(markdownTheme.codeBlock),
    title: `1;${foreground(selectTheme.selectedText)}`,
  });
}

export default function lovelyMermaid(pi: ExtensionAPI) {
  let ui: ExtensionContext["ui"] | undefined;
  pi.on("session_start", (_event, ctx) => {
    ui = ctx.ui;
  });
  pi.registerMarkdownTransformer((markdown, context) => {
    if (context.messageType === "assistant-thinking" || !/mermaid/i.test(markdown)) return markdown;
    return parser
      .lexer(markdown)
      .map((token) => {
        if (
          token.type !== "code" ||
          token.lang?.trim().split(/\s+/, 1)[0]?.toLowerCase() !== "mermaid"
        ) {
          return token.raw;
        }
        const art = render(token.text);
        if (!art || art.width > context.availableWidth) return token.raw;
        if (!context.isStreaming && art.warnings.length > 0) {
          const suffix = art.warnings.length > 1 ? ` (+${art.warnings.length - 1} more)` : "";
          const warning = `Mermaid diagram not rendered: ${art.warnings[0]}${suffix}`;
          return `${token.raw}\n${codeSpan(ui ? ui.theme.fg("warning", warning) : warning)}  \n`;
        }
        const lines = themedLines(art);
        return `${lines.map(codeSpan).join("  \n")}\n`;
      })
      .join("");
  });
}
