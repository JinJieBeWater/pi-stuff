---
name: "diagnose-pi-internals"
description: "Diagnose Pi runtime faults, not project code. Use for apply_patch latency or mismatch, old-session Codex overload, admission errors, extension TUI CPU or reload failures, tool-schema drift, overlay-blocked mode switching, and todo loss or rollback after session replay. Read the matching reference."
version: 13
created: "2026-10-02"
updated: "2026-10-07"
---

## Reference map

Symptom lives inside Pi itself (tools, TUI, extension host, session admission), not in the repository under work.

| Situation / symptom                                                        | Reference                                    |
| -------------------------------------------------------------------------- | -------------------------------------------- |
| apply_patch slow, partial, or mismatched                                   | `references/apply-patch-latency.md`          |
| Codex `overloaded` alarms on old sessions only                             | `references/codex-session-overload.md`       |
| `<runtime>` already-processing on a concurrent prompt                      | `references/concurrent-prompt-admission.md`  |
| TUI CPU pegged while idle                                                  | `references/extension-tui-cpu.md`            |
| extension broken after a package update or `/reload`                       | `references/extension-version-hot-reload.md` |
| tool argument dropped, strict downgraded, or a failure reported as success | `references/tool-schema-drift.md`            |
| mode switching refused while an overlay is open                            | `references/tui-mode-overlay-block.md`       |
| todo tasks disappear, revert or reuse IDs after replay                     | `references/todo-codemode-replay.md`         |

## Procedure

1. Read the matching reference and follow its checks instead of improvising.
2. Gather the smallest reproducible evidence before changing anything.
3. Confirm the fix against the reference's stated success condition.

## Verification

The reference's success condition holds, and the original symptom no longer reproduces.

## Pitfalls

- Pi virtual models default undeclared contextWindow/maxTokens to 0 (unknown). Native footer may consequently show 0.0%/0 before first physical response. Check installed docs/virtual-models.md, native FooterComponent and virtual-model examples. Do not substitute candidate minima for an unknown selected-model capacity merely to improve display: declaring virtual limits also changes initial compaction. Prefer hiding unknown display fields while retaining known stats and native model identifiers. Declare limits only when an actual virtual budget is part of the intended design. After a successful physical response, native Pi uses its real limits.
- For virtual-router latency, distinguish user→persisted pi.virtual-model-state, provider request→first output, and footer-update time. A message's timestamp can be response-object creation before HTTP, while message entry timestamp is completion; neither is first-token time. Inspect installed metric hooks: average TTFT may cover several physical responses and exclude routing. OpenAI-completions can emit stream start only after HTTP response, so a message_start-driven footer may show selection late. Historical session logs without phase timings cannot attribute quota/auth/classifier fractions. Startup-only prefetch does not help a first prompt after the cache TTL; do not add polling or weaken TTL/protection without explicit policy change.
- Native partial stream messages may omit thinkingLevel until the agent annotates the final result. Preserve the already determined route effort for the same provider/model rather than labeling it off or dropping it; explicit final metadata takes precedence. Invalidate display context caches when transitioning from a pending route to a started response. Measure routing phases with a monotonic clock and record native custom entries via appendEntry, excluded from model context. Omit unexecuted phases and never record prompts, auth secrets or quota response bodies.
- Benchmark cold virtual routing with a fresh extension quota cache for every sample; repeated user routes often hit cached usage, and forced refresh may coalesce inflight work. Fresh quota cache does not imply cold TLS, auth, catalog, or CLI startup. When parallelizing identity-dependent billing, use unscoped responses only after authoritative personal-scope confirmation, reread explicit organization scope, and revoke held old-scope snapshots on scope changes. Independently validate all fulfilled payloads and prioritize hard errors over transient failures, including identity/billing cross-failures. Regression-test late results after cancellation, generation invalidation, and credential changes. Optimize dependency edges, not arbitrary await counts: a usage summary needing identity and subscription period can overlap independent credits, but all final responses must still be validated before eligibility. Newly overlapping summary hard errors or malformed successful payloads must beat a concurrent credits 5xx. Use gated tests to prove overlap and no premature dispatch; non-contemporaneous live network samples may get slower despite a correctly shortened dependency graph, so report actual results without claiming a speedup or resampling until favorable.
- For event-driven quota warmup, use native onTerminalInput only in TUI and return undefined: observe text/paste without consuming, retaining or forwarding it. Use native keyboard parsing to reject navigation, control events and key releases. Reserve per-provider background work before awaiting auth, not only before HTTP; rapid keystrokes otherwise create auth storms. Failure cooldown applies to background events only, not dispatch fallback. Internal fetch failures must not prematurely discard the background reservation/cooldown, while explicit consumption invalidation must revoke held snapshots and supersede late old jobs. Mark actually used subscriptions dirty at turn end without network. Preserve multiple pi.on handlers in test doubles so adding warmup does not silently replace native-footer lifecycle synchronization.
- For high usage plus Nothing to compact, reproduce prepareCompaction on the saved active branch offline. Compare usage-anchored tokens with cut-point estimates excluding system messages and count sidecar refs. Isolate the same native ImageContent, persisted sidecar content, and context-rehydrated messages through the real extension handlers: if only persisted refs fail, the storage/context projection mismatch exists without a custom compactor. Manual compact aborts before preparation; an undefined preparation prevents session_before_compact hooks, so aborted can be a rollover side effect. Separately capture custom compactor onPayload with a fake stream and forbidden network to test explicit-image parity; this proves request construction, not server quality or opaque checkpoint contents. Preserve session/sidecars and recover into a fresh session from durable notes when authorized; verify new session/model, actual work progress, artifact hashes and explicit parent delivery rather than assuming fresh-session lineage survived. Lower keepRecentTokens only in memory to diagnose preparation, not as proof of a successful remedy. Obtain authorization before changing global budgets, unloading sidecar support, restarting user agents, or making paid summaries.
