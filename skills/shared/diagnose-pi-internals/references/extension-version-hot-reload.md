## When to Use

Use when a Pi extension works before update or fresh startup but fails during `/reload`, especially with missing methods or mismatched call signatures.

## Procedure

1. Record Pi and extension versions plus exact stack location.
2. Compare installed extension files against npm tarball to rule out partial installation.
3. Run fresh isolated Pi with `pi -ne -e <extension-entry> --no-session --offline`; trigger `/reload`.
4. If fresh run passes, reproduce version transition safely in a temporary sibling package: start old version, overwrite temp copy with new version, then `/reload`. Never overwrite installed production copy.
5. Compare old/new call signatures and returned object shapes at failing boundary; identify mixed-version module cache.
6. Stop test Pi process and remove all temporary package copies.

## Pitfalls

- `pi --list-models` does not exercise `session_start` and cannot validate this class of failure.
- `Reloaded...` can print after an extension event handler fails; it is not proof every extension loaded cleanly.
- Do not patch installed extension files before confirming whether process restart resolves stale module state.

## Verification

1. Fresh process starts extension without target error.
2. Fresh process `/reload` completes without target error.
3. Version-transition repro emits exact original error.
4. Temporary test package and process are removed.
