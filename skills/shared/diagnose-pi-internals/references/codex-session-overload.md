## When to Use

Use when Pi using openai-codex repeatedly reports overloaded or WebSocket errors, especially when /new or a fresh Pi process works.

## Procedure

1. Parse recent ~/.pi/agent/sessions/**/*.jsonl assistant messages; count errorMessage values and capture timestamps, session IDs, context usage, and diagnostics.
2. Compare failing and successful sessions in the same minute. Concurrent successes falsify account-wide quota or universal backend outage; lower-context failures alongside higher-context successes falsify simple context overflow.
3. Inspect the first failure in each streak. A provider_transport_failure diagnostic with configuredTransport auto followed by overloaded errors indicates WebSocket failure then session-scoped fallback behavior.
4. Inspect installed openai-codex-responses.js and current settings. Confirm transport mode, session-id/prompt_cache_key use, cached WebSocket behavior, runtime, and HTTP_PROXY/HTTPS_PROXY presence.
5. Recommend /clone for immediate recovery because it preserves active branch while allocating a new session ID. Recommend transport=sse plus Pi restart when WebSocket instability or proxy mismatch is implicated.
6. Treat retry settings as alarm amplification only; reducing retries lowers repeated messages but does not fix transport or session affinity.

## Pitfalls

- Do not infer overload from file size or context tokens alone; compare simultaneous calls across sessions.
- Do not treat Pi/Herdr “Waiting for model” duration as one uninterrupted provider request. One turn can contain many successful tool-call round trips; reconstruct timestamps from JSONL first.
- Do not call every overloaded response a local false alarm. Message is emitted by Codex backend, but session affinity or failed transport transition can make it session-specific.
- Node WebSocket proxy behavior may differ from HTTP fetch proxy behavior; inspect installed implementation rather than assuming HTTP_PROXY covers WSS.
- Do not delete old sessions; /clone is safer and preserves context.

## Verification

1. A deterministic JSONL parser reproduces exact 'Our servers are currently overloaded' events and their preceding diagnostics.
2. Same-minute timeline shows whether other sessions succeed during failing session streak.
3. After /clone or SSE configuration plus restart, repeated prompts no longer enter WebSocket-error-to-overloaded streaks.
