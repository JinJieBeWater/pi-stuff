# pi-herdr-theme

Makes Pi's colors follow the Herdr App theme, including its 16-color palette.

Inside Herdr, Pi's `system` theme asks Herdr Core for colors. Herdr App tells Core its foreground, background and cursor colors but not its 16-color palette, so Core answers palette queries with its own defaults and hues drift. This extension reads the colors Herdr App actually draws with (what the theme file sets, plus what Herdr derives for the rest) and generates `~/.pi/agent/themes/herdr.json` with the same algorithm Pi uses for `system`. When a theme file has terminal colors only, Pi and Herdr still share one accent, grey and selection.

- The colors come from [`t3-theme-export`](https://github.com/JinJieBeWater/herdr-t3/tree/main/extras/mods/t3-theme-export), an optional extra of [Herdr T3](https://github.com/JinJieBeWater/herdr-t3) and this extension's Herdr half; install it in Herdr as [its notes](https://github.com/JinJieBeWater/herdr-t3#theme-export-for-pi) say. Whenever the colors Herdr shows change (a pick in Settings, a layout's theme, the system's light or dark mode, a built-in preset), it writes them to `~/.cache/herdr-app-theme.json`; it only runs in a layout that has its block, so another layout leaves Pi's colors as they were. This extension only watches that file, so every Pi reads the same input. Without the file, the current colors stay. The two only share that path and its `{ name, colors }` format, so change them together.
- Panels stay near grey: a finished tool uses Herdr's `selected` color, and errors and messages keep only a faint hue. Color is left to text.
- Text accents match Herdr: headings use `solid`; accents, list bullets and Mermaid arrows use `accent`; grey text uses `muted`/`dim`; rules, success and strings take palette colors as they are. A text color that would be hard to read on the terminal's background keeps the generator's color: some palette colors on a light background, or `win98`, whose panels differ from its terminal. Warnings always use the generator's yellow, because `blocked` is red in a theme with terminal colors only and would read as an error.
- Inline code falls back to the theme's `accent`, as Codex does; when that accent is too close to the link blue, it keeps the palette's magenta so code does not read as a link.
- Herdr's colors can be translucent and Pi's can't, so translucent ones are flattened onto the background first.
- Set `"theme": "herdr"` in `settings.json`.
- Pi hot-reloads the regenerated file without `/reload`. The first time is the exception: if `herdr.json` doesn't exist when Pi starts, Pi falls back to `system` and doesn't watch the file, so restart it or run `/reload` once the export exists.
- If generating fails, Pi says why, once.

Pick another theme and remove this package from `packages` to restore the previous look.
