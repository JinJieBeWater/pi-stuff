# Todo changes disappear after session replay

Use when Pi tasks vanish, completed tasks revert, or task IDs repeat after compaction, tree navigation or session restoration. Diagnose host task persistence, not product Job storage.

## Establish ownership and timeline

1. Identify the loaded todo extension and version from settings and its package. Locate the live session file by current entries; a resumed controller may now use a different JSONL from an older checkpoint.
2. Extract only task mutations, direct todo snapshots and lifecycle entries around the loss. Record IDs, parent IDs and timestamps. Follow the active parent chain instead of treating all JSONL branches as one timeline.
3. Inspect the extension's replay function and the host's nested-tool persistence. A successful tool response proves a live mutation, not a durable snapshot.

## Verified failure mechanism

Observed with `@juicesharp/rpiv-todo@2.12.0`: `state/replay.ts` accepts only direct `toolResult` messages whose `toolName` is `todo` and `details` contains `tasks` plus `nextId`. `index.ts` replaces live state with that replay on session start, compact and tree events.

Pi's nested-tool recorder intentionally omits nested result bodies. A Codemode call to `tools.todo` changes the live store, while the outer result records arguments and status but not the snapshot replay requires. Later replay restores the last direct todo snapshot: newer tasks disappear, statuses revert and `nextId` rolls back.

The observed parent session contained successful nested create/update operations, a subsequent compaction, then a direct list exactly equal to the older snapshot. Replaying the actual active branch through the installed function reproduced both the lost task and reverted status. Do not attribute a different historical loss to compaction without its own event evidence.

## Verify without changing the user's tasks

- Import the installed pure reducer, response-envelope builder and replay function into an isolated script.
- Positive control: create a synthetic task and replay a direct todo result carrying its real `details`; task and `nextId` survive.
- Negative control: replay an outer Codemode result with nested call metadata but no todo snapshot; state returns to the prior snapshot, updating the lost ID fails, and a new create reuses the ID.
- Reconstruct the captured real branch at the replay event and compare its returned snapshot with the first observed post-event list. Save filtered evidence to a new path; do not mutate session files or the live parent store to manufacture a reproduction.

## Containment and repair boundary

Until the extension is fixed, invoke the top-level `todo` tool directly for durable mutations. Direct results provide the snapshot current replay consumes. Confirm a direct update survives replay; notes are recovery evidence, not a persistence fix.

The lasting fix belongs in the todo extension's write/replay path: persist session-scoped state independently of outer tool-result delivery, then restore it through branch semantics. Cover direct and nested calls, compaction, restart, branching and child-session isolation. Obtain approval before editing installed host packages or reloading an active session; recording this diagnosis does not authorize repair.
