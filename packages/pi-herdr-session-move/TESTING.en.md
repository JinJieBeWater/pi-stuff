[简体中文](TESTING.md) | [English](TESTING.en.md)

# Session move testing

See the [development guide](../../docs/development.en.md#validation) for dependency setup and repository-wide checks. Run all commands below from `packages/pi-herdr-session-move/`.

## Default tests

```sh
bun run test
bun run check-types
```

`bun run test` runs only:

- [unit.test.ts](test/unit.test.ts): target directory validation, session copying, branch and provenance records, and related behavior.
- [lifecycle.test.ts](test/lifecycle.test.ts): tool and command entry points, handoff, cancellation, identity changes, drafts, message queues, and other lifecycle conditions.
- [runtime.test.ts](test/runtime.test.ts): Core/TUI selection, native launch arguments, independent survival after source exit, private terminal binding, and process validation.

Tests run in Node through Vite+'s bundled Vitest. They use temporary files, the real SessionManager and Pi SDK, and replacements for Herdr transport and final model submission. They do not operate on the user's actual terminals or sessions.

## Manual process tests

The following scripts are excluded from default tests and CI. Run them manually in an environment with Pi and Herdr installed separately:

- `node test/e2e.ts`: uses a separately named headless Herdr session, temporary Pi configuration, an offline provider, and Git fixtures. Covers cross-repository moves, pane moves between workspaces, special non-Git paths, deleted source directories, existing worktrees, model tool chains, trust blocks, and target startup failures.
- `node test/core-e2e.ts`: uses a separate `HC_SESSION` and temporary XDG directories to check moves with special paths, tool continuation, target survival, and trust blocks in real Core. Uses the CLI bundled with the project's Pi SDK and local Node, without depending on personal installation paths or starting the App. Cleans up its terminals, Core, and temporary directories when finished.
- `node test/installed-smoke.ts`: reads the machine's actual personal Pi configuration and checks `herdr_session_move`, `/session-move`, and startup errors in a separate headless Herdr session. Requires this extension to be installed and `herdr_worktree_jump` not to be registered at the same time. It is not a general test for arbitrary user configurations.

Scripts stop only the isolated sessions they create. Legacy TUI scripts leave test evidence in temporary directories; inspect and clean it up yourself without committing it to the repository. They do not establish behavior with real LLMs, on every platform, or after power loss.

## Interpreting results

Passing tests does not mean an actual user move has completed. Completion requires confirming that the target session and cwd are correct, the source Pi has exited, and no other side is executing the task again. `staged`, `ready`, or existing handshake files alone are not proof of success.

To recover an unfinished actual move, follow [RECOVERY.en.md](RECOVERY.en.md) to verify identities and sessions. Rerunning test scripts is not a substitute for recovery.
