## When to Use

Use when Pi reports “Close active overlays before changing TUI mode”, especially with persistent cosmetic or status overlay extensions.

## Procedure

1. Inspect `settings.json` package filters and run `pi list` to locate loaded extension roots.
2. Search loaded extension entrypoints for `showOverlay()`, `ctx.ui.custom(..., { overlay: true })`, and session-start widget hosts that create overlays.
3. Inspect Pi `interactive-mode.js`: runtime mode switching rejects when `renderer.hasOverlayEntries` is true.
4. Inspect pi-tui overlay semantics: `setHidden(true)` leaves overlay entry registered; only handle `hide()` removes it.
5. Identify always-mounted overlays separately from transient command/dialog overlays. Recommend startup `pi --tui-mode fullscreen` as lowest-risk bypass, or temporarily disable/unmount persistent overlay extensions before runtime switching.

## Pitfalls

- Do not assume invisible or `setHidden(true)` overlays are inactive; `hasOverlayEntries` counts stack entries, not visible overlays.
- Commands that only hide or stop animation do not remove overlay entries.
- Do not blame settings selector itself unless it was created with overlay mode; regular custom UI is not an overlay entry.

## Verification

1. Run a minimal pi-tui harness showing that shown and hidden overlays both keep `hasOverlayEntries: true`, while `handle.hide()` changes it to false.
2. Confirm enabled extension entrypoints call `showOverlay()` during `session_start` or widget mounting.
3. After disable/unmount or fullscreen startup, confirm no warning appears and TUI mode is fullscreen.
