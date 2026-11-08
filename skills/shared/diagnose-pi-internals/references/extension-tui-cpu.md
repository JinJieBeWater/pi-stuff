## When to Use

Use when interactive Pi sessions consume sustained CPU, become slow as transcript grows, or extensions are suspected of causing TUI performance regressions.

## Procedure

1. Confirm sustained CPU with repeated ps/top samples and capture macOS sample stacks; timer-driven Intl.Segmenter, RegExp, and text wrapping indicate repeated TUI rendering.
2. Copy a representative long session JSONL to /tmp. Never benchmark against the live session file.
3. Build a temporary TUI extension that captures tui through setWidget and calls tui.requestRender() at a fixed interval matching the suspected spinner or animation.
4. Benchmark with --no-extensions for baseline, then load suspect extensions explicitly with -e. Measure process CPU-time delta after startup warmup.
5. Use package-group bisection before testing individual extensions. Compare full discovery, no-extension baseline, and selected extension sets.
6. When group bisection is ambiguous, run Pi through node --cpu-prof in a PTY. Aggregate profile samples and print ancestor chains for top hot nodes to identify exact renderer call paths.
7. Test fixes only in /tmp package copies. For stable historical tool results, prefer width-keyed render output caches cleared by invalidate().
8. Re-run identical render-loop benchmark. Confirm CPU drops near baseline while preserving renderer output and theme invalidation behavior.
9. Clean temporary sessions, profiles, package copies, and benchmark scripts. Do not modify live settings or installed packages without user approval.

## Pitfalls

- Pi's built-in Loader redraws every 80ms; extension cost may be expensive render work rather than extension-owned timer frequency.
- Animated overlays can independently trigger full renders and should be switched to static during isolation.
- A single extension may look cheap alone while full discovery is expensive; profile call stacks instead of relying only on package names.
- Use carriage return, not newline, when submitting commands to Pi through a raw PTY.
- Warm up before measuring; extension loading and session parsing can dominate short samples.
- Turning off custom rendering may fall back to large raw tool output and remain slower than a correct renderer cache.
- Do not infer CPU pressure from load average alone, and do not terminate live Pi sessions during diagnosis.

## Verification

1. No-extension render-loop baseline is recorded on the same copied session and terminal dimensions.
2. Suspect-only benchmark reproduces materially higher CPU than baseline.
3. CPU profile names exact extension renderer and hot utility call chain.
4. Temporary fixed copy reduces CPU materially under identical workload.
5. No benchmark Pi process or /tmp artifact remains after cleanup.
