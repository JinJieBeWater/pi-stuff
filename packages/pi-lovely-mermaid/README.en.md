[简体中文](README.md) | [English](README.en.md)

# Pi Lovely Mermaid

Uses `lovely-mermaid` to display Mermaid code blocks in Pi chat as terminal character diagrams. Follows the Pi theme and preserves author-defined node styles and hyperlinks supported by the terminal. No extra tool calls from the model are needed.

## Installation

Installed with the [repository Git package](../../README.en.md#installation), with `packages/pi-lovely-mermaid/index.ts` as its entry point. Disable it individually with `pi config`; see the repository instructions for updates and removal.

## Configuration

Before enabling it, merge the following into Pi's `settings.json` to disable native Mermaid rendering:

```json
{
  "markdown": {
    "mermaid": "off"
  }
}
```

Run `/reload` in existing Pi sessions to apply the change. The native transformer runs before extensions, so project settings must also keep `markdown.mermaid` set to `off`. This setting controls only native rendering; the extension keeps rendering while enabled.

## Usage

Send a message containing a Mermaid code block such as `flowchart TD`. Both user and assistant messages are rendered; thinking blocks are unchanged. Rendering updates when the window or theme changes. Hyperlinks apply only to node text and depend on terminal capability detection.

Text and borders use the current Pi theme's code-block colors, with accent-colored connections. Author-defined node styles take precedence.

## Limits

- Ordinary messages without Mermaid keywords pass through unchanged, skipping Markdown parsing.
- Handles only top-level Mermaid code blocks, matching the current native implementation.
- Diagrams that are too wide or unsupported keep their source. The extension does not add scrolling, zooming, or width-based reflow.
- Attempts to render during streaming. If the parser reports warnings after completion, the source and warnings are displayed so content that could not be drawn is not hidden.
- Changes only the interactive chat display, without rewriting sessions, model context, or HTML exports.

To restore native rendering, disable the extension in `pi config`, set `markdown.mermaid` back to `streaming`, and run `/reload`.

## Development

See the [development guide](../../docs/development.en.md#validation) for common commands. Tests use the public Markdown transformer and real Pi `Markdown` to check rendering, streaming fallback, themes, widths, and control-character handling without model requests.

## Sources

The integration follows [Pi PR #8158](https://github.com/earendil-works/pi/pull/8158), and Markdown line encoding follows Pi's approach. The renderer comes from [lovely-mermaid](https://github.com/xl0/lovely-mermaid), using its published version without changing upstream files. See [third-party notices](third-party-notices.md) for licenses and attribution.
