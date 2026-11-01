import { getMarkdownTheme, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  Markdown,
  Marked,
  sliceByColumn,
  stripTerminalSequences,
  truncateToWidth,
  type Tokens,
  visibleWidth,
} from "@earendil-works/pi-tui";

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

function renderTable(
  table: Tokens.Table,
  width: number,
  definitions: string,
  isStreaming: boolean,
  isLastToken: boolean,
): string {
  const columns = table.header.length;
  if (columns === 0 || (table.rows.length === 0 && !isStreaming)) return table.raw;

  const rows = [table.header, ...table.rows];
  // oxlint-disable-next-line no-control-regex -- Reject control-bearing cells before rendering.
  if (rows.some((row) => row.some((cell) => /[\u0000-\u001f\u007f-\u009f]/.test(cell.text))))
    return table.raw;
  const lines = table.raw.replace(/\n+$/, "").split("\n");
  // Marked pads missing cells and discards extra ones; validate its raw rows before trusting them.
  if (lines.length !== rows.length + 1 || table.raw.includes("\\|")) return table.raw;
  for (const [i, line] of lines.entries()) {
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
    // Pi trims terminal newlines; only the streaming message's final row may lack cells.
    const partial = isStreaming && isLastToken && i === lines.length - 1 && i > 1;
    if (cells.length > columns || (cells.length < columns && !partial)) return table.raw;
    if (i === 1) continue;
    const row = rows[i === 0 ? 0 : i - 1]!;
    if (row.length !== columns || row.some((cell, j) => cell.text !== (cells[j]?.trim() ?? "")))
      return table.raw;
  }

  const theme = getMarkdownTheme();
  // Removing the outer frame and using two-space gutters returns columns + 3 cells to content.
  const layout = new Markdown(`${table.raw}\n\n${definitions}`, 0, 0, theme).render(
    width + columns + 3,
  );
  const top = stripTerminalSequences(layout[0] ?? "").trimEnd();
  // shortcut: recognize Pi 1.4's frame; retain native rendering if its layout changes.
  if (!/^┌─+(?:┬─+)*┐$/.test(top)) return table.raw;
  const boundaries = Array.from(top.matchAll(/[┌┬┐]/g), (match) => match.index!);
  if (boundaries.length !== columns + 1) return table.raw;
  const widths = boundaries.slice(0, -1).map((start, i) => boundaries[i + 1]! - start - 3);
  const output: string[] = [];
  let headerRule = false;
  for (const line of layout.slice(1)) {
    const plain = stripTerminalSequences(line).trimEnd();
    if (!plain || /^└─+(?:┴─+)*┘$/.test(plain)) continue;
    if (/^├─+(?:┼─+)*┤$/.test(plain)) {
      const rule = headerRule ? "─" : "━";
      output.push(theme.codeBlockBorder(widths.map((width) => rule.repeat(width)).join("  ")));
      headerRule = true;
      continue;
    }
    if (boundaries.some((column) => stripTerminalSequences(sliceByColumn(line, column, 1)) !== "│"))
      return table.raw;
    // Consume boundary-closing ANSI along with the native right padding, then drop that space.
    const cells = widths.map((width, i) => {
      const cell = sliceByColumn(line, boundaries[i]! + 2, width + 1).replace(/ $/, "");
      const padding = Math.max(
        0,
        width - visibleWidth(stripTerminalSequences(cell).replace(/ +$/, "")),
      );
      const left =
        table.align[i] === "right"
          ? padding
          : table.align[i] === "center"
            ? Math.floor(padding / 2)
            : 0;
      // Pi 1.4 lays out all cells left-aligned; move only padding and keep ANSI/link closures.
      return left ? " ".repeat(left) + truncateToWidth(cell, width - left, "") : cell;
    });
    output.push(cells.map((cell) => theme.codeBlock(cell)).join("  "));
  }
  if (!headerRule) return table.raw;
  return `\n\n${output.map(codeSpan).join("  \n")}\n\n`;
}

export default function borderlessTables(pi: ExtensionAPI) {
  pi.registerMarkdownTransformer((markdown, context) => {
    if (context.messageType !== "assistant" || !markdown.includes("|")) return markdown;
    if (!Number.isSafeInteger(context.availableWidth) || context.availableWidth < 1)
      return markdown;
    const tokens = parser.lexer(markdown);
    // Lexer normalization (e.g. CRLF) must never rewrite unrelated source.
    if (tokens.map((token) => token.raw).join("") !== markdown) return markdown;
    const definitions: string[] = [];
    parser.walkTokens(tokens, (token) => {
      if (token.type === "def") definitions.push(token.raw);
    });
    return tokens
      .map((token, index) =>
        token.type === "table"
          ? renderTable(
              token as Tokens.Table,
              context.availableWidth,
              definitions.join("\n"),
              context.isStreaming,
              index === tokens.length - 1,
            )
          : token.raw,
      )
      .join("");
  });
}
