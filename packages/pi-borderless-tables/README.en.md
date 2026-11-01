[简体中文](README.md) | [English](README.en.md)

# Pi Borderless Tables

Displays ordinary assistant tables as aligned, borderless tables: two spaces between columns, segmented heavy rules `━` below the header, and thin rules `─` between data rows, with no outer border or vertical rules. Header text is bold, and colors follow the Pi theme. This only changes the display; it does not rewrite session text or model context, or call a model.

## Installation

Installed with the [repository Git package](../../README.en.md#installation), with `packages/pi-borderless-tables/index.ts` as its entry point. Disable it individually with `pi config`; see the repository instructions for updates and removal.

No extra configuration is needed. It does not change settings for Mermaid, chart, or code-block extensions. After enabling or disabling it, run `/reload` or restart Pi.

## Usage

Example display:

```text
Item  Status       Notes
━━━━  ━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
API   Done         Auth API tests pass; ready for staging
────  ───────────  ─────────────────────────────────────
UI    In progress  Check mobile layout and keyboard use
```

Column alignment follows Markdown: `---` / `:---` align left, `:---:` centers, and `---:` aligns right. Numeric columns also follow only these markers; they are not automatically aligned or colored by increases and decreases. Use `**bold**` to highlight values.

The source message remains a standard Markdown table. Pi's native `/copy` copies the source of the latest assistant reply without display rules, ANSI sequences, or line encoding added by this extension; Pi's native handling of leading and trailing whitespace still applies. The command copies the entire reply, not just one table. Selecting text on screen copies the displayed text. The extension does not monitor or automatically write to the clipboard.

## Limits

- Supports both streaming and completed assistant replies. Styling starts as soon as the header structure is complete; the last row of a streaming message may temporarily lack later columns and remains borderless as more text arrives. User and thinking messages are unchanged.
- Uses the same style at all normal content widths. Resizing reflows at the current width without switching to cards. Pi's native table layout wraps long text, with no rules inside wrapped rows or below the final row.
- Reuses the public `Markdown` layout, inline formatting, math, wide-character, and link handling, then removes structural borders at column positions. Header emphasis and hyperlinks in capable terminals are preserved. Characters such as `│` within content are not removed globally.
- Handles only top-level tables recognized by Marked, with at least one column. Completed tables need at least one data row; streaming tables may contain only a header. Outer `|` characters are optional. Except for a data row at the end of a streaming message, headers, separator rows, and data rows must have matching column counts. Empty headers and values are preserved.
- A streaming final row may display missing columns as empty, but excess content is never truncated. Pi strips trailing message whitespace, so the extension cannot tell whether the final row has ended with a newline. Full validation resumes when another row or block appears, or generation stops. Other tables with missing or excess columns, escaped pipes, control characters, or structures that cannot be confirmed losslessly keep their source. If lexer normalization such as CRLF handling changes the source, the entire reply is left unchanged.
- Does not convert nested tables or change ordinary prose, code, Mermaid, chart, or adjacent indented code, lists, and paragraphs. Reference links in tables reuse definitions from the entire message, including definitions inside blockquotes.
- Recognizes Pi's native table layout in the [compatibility baseline](../../docs/development.en.md#compatibility-baseline). Falls back to native display when border structures change or cannot be recognized at very narrow widths. Border removal is not guaranteed for every malformed or extremely narrow table.

## Development

See the [development guide](../../docs/development.en.md#validation) for common commands. To also run rendering tests with color, use this package directory:

```sh
FORCE_COLOR=3 bun run test
```

Tests use public `registerMarkdownTransformer`, real Pi `Markdown`, and `AssistantMessageComponent`. They cover 40/80/120 columns, resizing in both directions, heavy header and thin data rules, left/right/center alignment, Chinese/English/emoji, empty values, equivalent rendering of inline formatting/whitespace/punctuation/escapes, border characters in content, clickable links, column-mismatch fallback, adjacent block boundaries, mixed Mermaid/chart content, stable styling and preserved cell content during character-by-character streaming, host trimming of trailing whitespace, consistent completed output, message types, and dark/light themes.

Package tests do not start a real model or fullscreen session, or verify other extensions' load order and every export path.
