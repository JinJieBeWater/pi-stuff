# pi-herdr-theme

Makes Pi's colors follow the Herdr App theme, including its 16-color palette.

Inside Herdr, Pi's `system` theme asks Herdr Core for colors, but Core does not know Herdr App's palette and answers with its own defaults, so hues drift. This extension reads the colors Herdr App actually draws with (what the theme file sets, plus what Herdr derives for the rest) and generates `~/.pi/agent/themes/herdr.json` with the same algorithm Pi uses for `system`. When a theme file has terminal colors only, Pi and Herdr still share one accent, grey and selection.

- The colors come from [`t3-theme-export`](https://github.com/JinJieBeWater/herdr-t3/tree/main/extras/mods/t3-theme-export), an optional extra of [Herdr T3](https://github.com/JinJieBeWater/herdr-t3) and this extension's Herdr half; install it in Herdr as [its notes](https://github.com/JinJieBeWater/herdr-t3#theme-export-for-pi) say. Whenever the colors Herdr shows change (a pick in Settings, a layout's theme, the system's light or dark mode, a built-in preset), it writes them to `~/.cache/herdr-app-theme.json`. This extension only watches that file, so every Pi reads the same input. Without the file, the current colors stay. The two only share that path and its `{ name, light, colors }` format, so change them together.
- Panels stay near grey: a finished tool uses Herdr's `selected` color (flattened onto the background when translucent), and errors and messages keep only a faint hue. Color is left to text.
- Text accents match Herdr: headings use `solid`; accents, list bullets and Mermaid arrows use `accent`; grey text uses `muted`/`dim`; warnings use `blocked`; success and rules take palette colors as they are.
- Inline code falls back to the theme's `accent`, as Codex does; when that accent is too close to the link blue, it keeps the palette's magenta so code does not read as a link.
- Set `"theme": "herdr"` in `settings.json`.
- Pi hot-reloads the regenerated file without `/reload`.

Pick another theme and remove this package from `packages` to restore the previous look.
