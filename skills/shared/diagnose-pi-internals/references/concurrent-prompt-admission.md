## Procedure

1. Locate installed Pi versions. Search unbundled dist/core/agent-session.js and pi-agent-core/dist/agent.js for the exact error. Use bounded extraction for minified bundles.
2. Correlate reported local time with session JSONL: adjacent new_context, codex-context-window, goal-state iteration, Continue user messages and turn-stats. Check subsequent work before claiming the session stopped.
3. Build an offline createAgentSession harness: empty temporary agentDir, in-memory session/settings, no discovered resources, disabled retry/compaction, dummy provider, gated streamFn with no network. Bind onError and assert exact extensionPath, event and error.
4. Submit two sendUserMessage calls while idle, one with deliverAs followUp, through an async before_agent_start handler. Compare simultaneous calls, each sender alone, and a deferred sender with a fresh isIdle check.
5. For Codex/Goal collisions, exercise installed CodexContextWindowKickoff.continue and GoalRuntime.dispatchContinuationIfSettled with pending fixture state. Bun resolves source .js imports to .ts; NODE_PATH pointing to global Pi node_modules resolves missing peer modules such as pi-tui.
6. Report reproduced mechanism separately from incident attribution. For diagnosis-only requests, propose atomic prompt admission or coordinated continuation ownership without changing installed runtime/extensions. Dispose fixture sessions and remove temporary configuration directories.

## Pitfalls

- Report upstream only after checking earendil-works/pi. The prompt-start race is tracked by open meta-issue #5886 (pkg:agent, pkg:coding-agent) and by closed not_planned #6744; a deterministic two-concurrent-prompt repro is already posted in #5886. A new issue duplicates existing reports.
- #6744 was auto-closed by the new-contributor gate rather than by judgement, and the maintainer response on #5886 is 'It can be fixed with a repro. I have no repro.' A duplicate repro adds nothing; only a new failure shape does.
- Pi 0.85.1 checks isStreaming before asynchronous before_agent_start and sets active in _runAgentPrompt afterwards. Both idle callers can pass; followUp does not prevent this race. The window spans the whole preflight, so real async handlers widen it.
- Removing an extension's stale isIdle gate and always using deliverAs followUp only helps when the competing prompt is already published active. In the same-tick race isStreaming is still false, so the throw remains.
- The full 'Agent is already processing a prompt. Use steer() or followUp()...' error comes from Agent.activeRun; AgentSession's shorter streamingBehavior error is a separate path.
- Extension sendUserMessage is fire-and-forget. Awaiting void or synchronous try/catch cannot catch delayed rejection; _bindExtensionCore reports <runtime>, masking the caller.
- Deferring a sender is a diagnostic control, not a universal timer fix. Production continuation handling must preserve session identity, liveness and queue ownership.

## Verification

1. Simultaneous submissions repeatedly emit the exact error; single-sender controls emit no extension errors.
2. Deferred sender observes busy and skips dispatch in the fixture.
3. Check later session entries before claiming interruption; report production fix as unverified unless applied and tested.
