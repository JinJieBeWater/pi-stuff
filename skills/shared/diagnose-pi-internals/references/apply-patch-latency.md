## When to Use

Use when a Pi apply_patch tool appears stuck, takes a long time, frequently reports expected-line mismatches, or partially edits multi-file patches.

## Procedure

1. Parse recent session JSONL files and pair assistant apply_patch tool calls with toolResult entries by toolCallId.
2. Measure separately: previous entry to finalized tool call (model generation and argument streaming), tool call to toolResult (queue plus execution), and failure to next successful patch (recovery cost).
3. Normalize error categories: expected-lines mismatch, patch parse/format, missing path, partial failure, native binary, aborted, and missing result.
4. Bucket failure rates by patch byte size and file-action count to quantify whether large multi-file patches are the risk factor.
5. Inspect renderer timing semantics. Check whether the UI shows Patching before argsComplete, which can mislabel model generation as tool execution.
6. Inspect file mutation queues for timeout behavior and compare their suspected delay against observed tool-call-to-result durations.
7. Reproduce out-of-order hunks in one temp file. Verify a monotonic search cursor rejects a later hunk targeting earlier lines.
8. Reproduce multi-file partial failure. Verify earlier files remain modified when a later action fails.
9. Inspect matching tolerance. Record whether only exact, trimEnd, or trim matches are accepted and whether content changes are semantic mismatches.
10. Report generation latency, actual execution latency, failure distribution, retry amplification, and exact implementation seams separately.

## Pitfalls

- Session JSONL contains branches; unmatched tool calls may be abandoned branch entries, not hung child processes.
- Previous-entry-to-call time can include model reasoning and tool-argument streaming; do not label it native patch execution.
- A Patching label before argsComplete is UX timing, not proof file mutation started.
- Multi-file patch failures may be non-atomic; never retry the whole patch without checking which files already changed.
- File mutation queues may lack timeout, but do not blame queueing when tool-call-to-result p95 is only milliseconds.
- Expected-line mismatch is often stale context or out-of-order hunks, not binary failure.
- Run destructive reproductions only in a temporary directory and clean it afterward.

## Verification

1. Tool calls and results are paired by exact toolCallId.
2. Generation and execution latency distributions are reported separately.
3. At least one dominant failure category is quantified.
4. Out-of-order hunk failure is reproduced in a temporary fixture.
5. Multi-file partial mutation is reproduced and resulting file contents are verified.
6. Temporary fixtures are removed.
