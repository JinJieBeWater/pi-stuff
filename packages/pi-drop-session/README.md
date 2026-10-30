# pi-drop-session

`/drop` starts a new Pi session, then moves the previous session file to trash. It registers no agent tools.

## Install

Install a trash CLI separately, then install the repository's Git package and select this extension in `pi config`:

```sh
pi install git:github.com/JinJieBeWater/pi-stuff
pi config
```

The default executable is `trash`, found through `PATH`. The Git package contains all seven extensions; see the [repository README](../../README.md#安装) for single-entry filtering, updates and removal. It is not published to npm.

## Configure

Optional file: `~/.pi/agent/pi-drop-session.json`. Pi's native `PI_CODING_AGENT_DIR` override changes this directory. Configuration is read when the extension loads; reload Pi extensions after editing it.

```json
{
  "enabled": true,
  "command": ["trash"],
  "timeoutMs": 5000
}
```

All fields are optional. `enabled` is a boolean and defaults to `true`. `command` is a nonempty array of strings: executable first, then any fixed arguments. The absolute session path is appended as one final argument. `timeoutMs` is an integer from 1 to 60000. UTF-8 BOM is accepted. Unknown fields, invalid values, malformed JSON and read errors are reported; a missing file uses the defaults above.

For another trash program, use e.g. `"command": ["gio", "trash"]`, provided it accepts the session path as its final argument. Executable paths may contain spaces. Relative executable paths containing `/` resolve against the current session directory. Arguments are passed directly, without shell expansion, quoting rules or templates.

## Boundaries

- The command must move files to trash. The extension cannot make an arbitrary configured program safe.
- A filesystem-only executable check runs before changing sessions. A missing or nonexecutable command leaves the current session unchanged. Cancellation or failed session creation never runs the command.
- An unset or empty `PATH` is rejected for bare executable names; configure an explicit executable path instead. Empty entries within a nonempty `PATH` explicitly include the current session directory in the search.
- After replacement, the command runs asynchronously using the fresh Pi context. On failure or timeout there is no permanent-delete fallback. If the old file is already absent, dropping is treated as complete without claiming it reached trash. Otherwise the error suggests `/resume` to reopen the old session.
- Timeout sends `SIGKILL` to the launched process. This does not undo filesystem changes or guarantee termination of its descendants.
- In-memory sessions are left alone. Only the previous session file is passed to the command; linked resources and other sessions are untouched.
- Executable lookup targets macOS/Linux. Windows is not supported or tested. The executable can still change between checking and launching it.

## Test

```sh
bun test
bun run check-types
```

Tests require Node.js on `PATH` for the signal-handling regression. They use isolated temporary session fixtures, command stubs and harmless child processes, not a real trash command or real session files.
