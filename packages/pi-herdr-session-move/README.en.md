[简体中文](README.md) | [English](README.en.md)

# Pi Herdr Session Move

Moves the current Pi conversation to an existing directory on the same machine. The target can be another repository, an existing worktree, or a non-Git directory. Moving also works when the source cwd has been moved or deleted.

## Installation

Installed with the [repository Git package](../../README.en.md#installation), with `packages/pi-herdr-session-move/index.ts` as its entry point. Disable it individually with `pi config`; see the repository instructions for updates and removal.

Herdr Core (`hc`) or legacy Herdr TUI (`herdr`) must be installed separately. Core's `HC_TERMINAL_SOCKET` takes priority and requires a complete `HC_TERMINAL_ID`. Legacy TUI uses `HERDR_ENV=1`, `HERDR_PANE_ID`, and `HERDR_SOCKET_PATH`. See the [compatibility baseline](../../docs/development.en.md#compatibility-baseline) for supported versions.

## Usage

1. **Prepare**: save editor drafts, handle queued messages, and finish background tasks that still need the original directory. Write any in-process state you need to preserve to files. Preparation is complete when no drafts, queued messages, or unfinished tasks depending on the original directory remain.
2. **Invoke**: manually enter `/session-move /absolute/target/directory`. Enter paths containing spaces as-is, without shell quotes. When delegating to an agent, explicitly ask it to move the current session and call `herdr_session_move` separately. See the [tool registration](index.ts) for parameters and invocation conditions. If the entry point is not loaded yet, run `/reload` in an idle session.
3. **Verify**: the move is complete only when the target confirms success, its cwd is correct, and the original Pi has exited. The command entry point stops at the target input box. The model tool hands over after the current run settles, then resumes at the target after the original Pi exits. `staged`, `ready`, or a move notification at the source is not sufficient proof of completion.

For errors, timeouts, trust-blocked startup, or notifications that disagree with the actual state, follow the [recovery procedure](RECOVERY.en.md) to decide where to continue and whether retrying is safe.

## Limits

- Moves the persisted conversation, preserving the currently selected tree branch, other branches, and provenance. The original session file stays in place.
- TS notebooks, extension memory, temporary CLI flags, and background processes do not move with the session. The target project uses its own configuration and trust settings.
- Each move uses a dedicated target location and handles only the current Pi. Code, Git branches, worktrees, and the source directory stay unchanged. Legacy TUI creates a workspace/pane without taking focus. Core creates a terminal that can survive independently, carrying new space/tab labels for an App connected to that Core; moving also works without the App running.
- The Core target waits for the source to publish a private handoff record containing the exact terminal address. The source Pi may exit only after the session and target process are confirmed. The target is not cleaned up when the source exits.
- The source terminal is retained. In legacy TUI, a shell remains after the original Pi exits. In Core, if Pi is the terminal's main process, a finished terminal record remains. Automatically closing the source terminal would still leave a window in which a new program could be closed by mistake.

## Development

See the [development guide](../../docs/development.en.md#validation) for common commands. The [testing notes](TESTING.en.md) cover default tests, manual checks requiring real processes, and unverified areas. See the [recovery notes](RECOVERY.en.md) for failed moves.
