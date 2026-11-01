[简体中文](RECOVERY.md) | [English](RECOVERY.en.md)

# Recovering an unfinished session move

Use this procedure when `/session-move` or `herdr_session_move` errors, times out, is blocked by trust, or reports success that does not match the actual state.

Preserve both sessions, drafts, and records first, then choose exactly one side to continue. Do not continue both copies, manually add handshake markers, or delete the failed copy first.

## 1. Locate the move record

Get the record directory from the error. The default location is `$PI_CODING_AGENT_DIR/session-moves/`, or `~/.pi/agent/session-moves/` when that variable is unset. Read `move.json` and note `backend`, `sourcePane`, `sourcePid`, `sourceSessionFile`, `targetPane`, `targetSessionFile`, and the target `cwd`. `sourcePane` / `targetPane` store `t…` addresses in Core and pane IDs in legacy TUI.

These identities must match this request. If `move.json` is missing or damaged, or you cannot identify the request, stay at the source. In Core, use `hc ls` to check terminals that may have been created; in legacy TUI, check the workspace/pane. Core may be interrupted between starting the target and publishing the record; in that case, the target will not automatically resume. If still unsure, report the record path and original error, and stop automatic retries.

## 2. Compare the record with the actual state

| Marker           | What it proves                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `ready.json`     | At write time, the target Pi confirmed the specified session; its `pid` identifies a candidate target process  |
| `committed.json` | The source agreed to hand over; this does not prove the source Pi has exited                                   |
| `completed.json` | The receiver passed source-PID exit and context checks; later checks may still block automatic continuation    |
| `cancelled.json` | This handoff was cancelled; it can coexist with `committed.json`, in which case treat the handoff as cancelled |

Check the actual state using the runtime named in the record. In Core, use `hc get <terminal>` to inspect both addresses, live/finished state, `foreground.pid`, and cwd. In legacy TUI, use `herdr agent get` and `herdr pane process-info`. Also check whether the original `sourcePid` still exists. If a terminal's program or PID has changed, preserve the new occupant as an unrelated process. Markers cannot replace current identity checks.

Classify each side as “this Pi is still running,” “this Pi has exited,” or “cannot confirm.” If either side cannot be confirmed, stop at diagnosis without starting another copy of the task.

## 3. Choose where to continue

| Actual state                                                                  | Next step                                                                                                                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source Pi is still running and has reported cancellation, failure, or timeout | Stay at the source and preserve its new messages and drafts. Do not treat the target copy as the latest working state                                              |
| Source Pi is still running, has not reported failure, and target still waits  | Wait for an explicit outcome of this handoff. Even with a commit, wait for the source to exit. If it stays blocked, report the state without starting another move |
| Source Pi has exited, and target identity and context match                   | Continue at the target. Reuse any existing task or result to avoid duplicate continuation instructions. If handoff is still waiting, wait for an explicit outcome  |
| Both Pi processes from this move have exited                                  | Compare the ends of both session records, choose the file containing the latest work, and restore as below. If unsure, let the user choose                         |

For manual recovery, use Pi's native session entry point without internal handshake arguments:

```sh
pi --session /absolute/path/to/chosen-session.jsonl
```

If the cwd recorded in the chosen session no longer exists, first enter a verified existing working directory, then use `pi --fork /absolute/path/to/chosen-session.jsonl` to create a copy while keeping the original file.

After manual recovery, check cwd, the current tree branch, and the latest task. Confirm that drafts are preserved and the other side is not executing the same task before continuing.

## 4. When another move is needed

First save any new input or results in the candidate target Pi, then exit that candidate normally only if it was created by this attempt and its identity matches. Start a new move from the source only after confirming that the candidate has exited and the source has no unhandled drafts or queued messages. Keep old records and copies for recovery.

Before retrying, the previous candidate process must have exited, source work must be preserved, and no old attempt may have an unknown identity or still be continuing.

See the [usage instructions](README.en.md#usage) for normal invocation and move scope.
