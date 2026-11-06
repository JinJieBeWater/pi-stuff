[简体中文](README.md) | [English](README.en.md)

# Pi Tool Groups

Every tool call shows as one overview line: what it did, whether it worked, how long it took. Calls with nothing written between them share one block, laid out as a table: tool names in one aligned column, named once per run of the same tool. Content (output, diffs, file bodies) waits for a click; a call still running shows a short preview, which folds as soon as it ends; a click shows it whole. Display only; sessions, tool results and model context are untouched. Works with any tool, with no per-tool setup.

```text
▸ 1 earlier
bash      $ git status --short                               0.1s
read      …/pi-tool-groups/README.md                         0.0s
bash      $ git clone https://example.com/repo.git         ✗ 0.0s
          $ cd …/server && make                              1.9s
          $ cd …/client && make test                         4.2s
codemode  const p = "…/index.ts"; await tools.edit(…         1.4s
```

A block shows its latest 5 calls. Failed calls (`✗` before the duration) and running ones (no duration yet, the block in its running background) never collapse, and never turn the block red; success has no mark. Paths in overviews read one way: the working directory as `.`, home as `~`; a long path neighbouring lines share shows as `…/`. The name column is at least 8 characters wide, so blocks of the common tools line up with each other.

## Install

Installed with the [repository Git package](../../README.en.md#install); the entry point is `packages/pi-tool-groups/index.ts`. Disable it alone with `pi config`; see the repository README for updating and removal. No configuration needed. `/reload` or restart after loading or disabling it.

To try it without installing, in a new window:

```sh
pi -e ~/my/pi-stuff/packages/pi-tool-groups/index.ts
```

## Usage

In fullscreen mode, what you click is what changes, even while a group runs:

| Click         | Effect                              |
| ------------- | ----------------------------------- |
| A call's line | Opens or closes that call's content |
| `▸ N earlier` | Shows or hides older calls          |

A call you click open shows everything one step further in than its call, uncut: the whole command or script, all of its output, `write`'s file and `edit`'s diff. A running call opens on its own only as a preview of its latest output, and closes when it ends. `Ctrl+O` still shows every call in full, a call alone as Pi draws it, and discards earlier clicks.

## Grouping rules

Consecutive calls share a block, whatever their tools. These break a block:

- Non-empty thinking or text
- User messages, `!` commands, visible custom messages, compaction and branch summaries
- Messages cut off by length; aborted or errored messages without tool calls
- Calls whose result has an image, which stay alone so the image stays in place

## Limits

- Boundaries come from session content, which does not include extension-drawn entries, cache-miss notices or transient status lines. A group can span them: nothing is lost, but its content appears above them.
- Tools not yet registered keep their display. So does a call whose result has an image, since images are drawn outside the renderer and cannot fold away.
- Regular mode has no mouse, so content is only reachable with `Ctrl+O`; this extension suits fullscreen mode.
- Collapse state does not survive a restart. Calls inside codemode stay inside their parent.
- HTML export is not grouped.
- Do not combine with `@tian.zuo/pi-compact-output`, which also changes tool display.
