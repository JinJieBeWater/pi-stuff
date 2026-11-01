[简体中文](README.md) | [English](README.en.md)

# Pi Drop Session

Run `/drop` manually to open a new session, then send the old session file to the trash. No agent tool is registered.

## Installation

Installed with the [repository Git package](../../README.en.md#installation), with `packages/pi-drop-session/index.ts` as its entry point. Disable it individually with `pi config`; see the repository instructions for updates and removal.

## Usage

First install a trusted trash command. By default, the extension uses `trash` from `PATH`. In Pi, enter:

```text
/drop
```

The extension checks that the program is executable before requesting a new session. It does not call the trash command if the program is missing, the request is cancelled, or creating the new session fails. Sessions that exist only in memory are left alone.

If trashing fails or times out, the extension never falls back to permanent deletion. If the old file still exists, it suggests restoring the old session with `/resume`. If the file is already gone, it reports completion without claiming that the file necessarily reached the trash.

## Configuration

Optional file: `~/.pi/agent/pi-drop-session.json`. When `PI_CODING_AGENT_DIR` is set, the file is read from that directory instead. Configuration is read at load time; run `/reload` or restart after editing it.

```json
{
  "enabled": true,
  "command": ["trash"],
  "timeoutMs": 5000
}
```

| Field       | Default     | Meaning                                                        |
| ----------- | ----------- | -------------------------------------------------------------- |
| `enabled`   | `true`      | Whether to register `/drop`                                    |
| `command`   | `["trash"]` | Nonempty string array: the program followed by fixed arguments |
| `timeoutMs` | `5000`      | Timeout in milliseconds, an integer in `1..60000`              |

All fields are optional. The session file's absolute path is appended as the final separate argument. For example, use `"command": ["gio", "trash"]` if that program accepts this argument order. Program paths may contain spaces; relative paths containing `/` are resolved against the current session directory.

Arguments are passed directly to the program without a shell, variable expansion, or command-template substitution. UTF-8 BOM is supported. Unknown fields, invalid values, malformed JSON, and read errors are reported; defaults apply only when the file does not exist.

## Limits

- Intended for macOS/Linux. Windows is unsupported and untested.
- The configured program must be trusted and actually move files to the trash. The extension cannot make an arbitrary external command safe or guarantee atomic file operations.
- Only the old session file path is passed to the program. Associated resources and other sessions are not trashed.
- Bare command names require a set, nonempty `PATH`; otherwise, configure an explicit program path. Empty entries within a nonempty `PATH` search the current directory as usual. The program can still be replaced between the check and execution.
- On timeout, `SIGKILL` is sent to the launched process. This does not undo file operations or guarantee termination of all descendant processes.

## Development

See the [development guide](../../docs/development.en.md#validation) for common commands. Package tests use temporary session files, command stubs, and harmless child processes without invoking real trash commands. Signal-handling regression tests require Node.js on `PATH`.
