[简体中文](README.md) | [English](README.en.md)

# Pi Tool Groups

Every tool call shows as one overview line: what it did, whether it worked, how long it took. Calls with nothing written between them share one block, laid out as a table: tool names in one aligned column, named once per run of the same tool; a run of `read`, `grep`, `find` and `ls` calls folds further into one line, such as `read 3 · grep 1`. Content (output, diffs, file bodies) waits for a click; a call still running shows its latest 3 lines, which fold when the turn ends; a click shows it whole. Display only; sessions, tool results and model context are untouched. Works with any tool, with no per-tool setup.

```text
▸ 8 more · bash 6, read 2
▎read 3 · grep 1                                             0.2s
▎bash      $ git clone https://example.com/repo.git        ✗ 0.0s
▎          $ cd …/server && make                             1.9s
▎          $ cd …/client && make test                        4.2s
▎codemode  const p = "…/index.ts"; await tools.edit(…        1.4s
```

A block shows its latest 10 calls (a folded run of reads and searches counts as one), the older ones folded into a line that says what they were, such as `▸ 8 more · bash 6, read 2`. Failed calls (`✗` before the duration) and running ones (no duration yet) never collapse. Blocks wear no background; your messages alone do. A rail on each call's left marks its status: green done, red failed, the theme accent while running. The rail sits in the column Pi pads with, so tool names start in the same column as messages. Paths in overviews read one way: the working directory as `.`, home as `~`; a long path neighbouring lines share shows as `…/`. Running calls take no part, so one starting does not change the lines beside it. The name column is at least 8 characters wide, so blocks of the common tools line up with each other.

## Install

Installed with the [repository Git package](../../README.en.md#install); the entry point is `packages/pi-tool-groups/index.ts`. Disable it alone with `pi config`; see the repository README for updating and removal. No configuration needed. `/reload` or restart after loading or disabling it.

To try it without installing, in a new window:

```sh
pi -e ~/my/pi-stuff/packages/pi-tool-groups/index.ts
```

## Usage

In fullscreen mode, what you click is what changes, even while a group runs:

| Click             | Effect                                          |
| ----------------- | ----------------------------------------------- |
| A call's line     | Shows its whole content; again closes it        |
| Open content      | Closes that call                                |
| `read 3 · grep 1` | Shows or hides each of those reads and searches |
| `▸ N more`        | Shows or hides older calls                      |

A call you click open shows everything one step further in than its call, uncut: the whole command or script, all of its output, `write`'s file and `edit`'s diff. A running call shows its latest 3 lines on its own: the end of its output, or before there is any, the end of the argument the model is writing. Output keeps its tool's colours, arguments are plain text; one row per line, a long line cut short rather than wrapped. The region is always 3 lines tall; a folded run of reads and searches still shows it for the call running or just done in it, so a read joining a run never shrinks the chat. Once the call ends it stays on the last 3 lines of the final output; the model's thinking and text leave it be, and its next call closes it and takes over those 3 lines; calls sent in parallel stay and close together. So a turn in progress only ever grows the chat, which shrinks once, when the turn ends (or you send a message). `Ctrl+O` still shows every call in full, a call alone as Pi draws it, and discards earlier clicks.

## Grouping rules

Consecutive calls share a block, whatever their tools. These break a block:

- Non-empty thinking or text
- User messages, `!` commands, visible custom messages, compaction and branch summaries
- Messages cut off by length; aborted or errored messages without tool calls
- Calls whose result has an image, which form a block alone so the image follows their line

## Limits

- Boundaries come from session content, which does not include extension-drawn entries, cache-miss notices or transient status lines. A group can span them: nothing is lost, but its content appears above them.
- Tools not yet registered keep their display. A call's images are drawn outside the renderer, so they always show under its line and do not fold away.
- Regular mode has no mouse, so content is only reachable with `Ctrl+O`; this extension suits fullscreen mode.
- Collapse state does not survive a restart. Calls inside codemode stay inside their parent.
- HTML export is not grouped.
- Do not combine with `@tian.zuo/pi-compact-output`, which also changes tool display.
