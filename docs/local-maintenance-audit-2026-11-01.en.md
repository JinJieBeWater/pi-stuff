# Local Pi maintenance status

[简体中文](local-maintenance-audit-2026-11-01.md) | [English](local-maintenance-audit-2026-11-01.en.md)

Checked on 2026-11-01. See the [repository README](../README.en.md) for extensions and Skills, and the [configuration archive](../config/README.en.md) for personal settings. This page records the sources, deployment differences, and maintenance gaps of implementations outside this repository.

## Local fork and installation sources

Source is maintained at `~/my/personal/fork/howaboua-pi-stuff`, currently at local HEAD `328c437`. This repository stores usage configuration; third-party implementations and build scripts remain in the fork.

| Component        | Current loading source                       | Local changes                                                 |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------- |
| Browser 0.0.13   | Local tarball installed in the npm directory | Load the backend on first use, `84933b1`                      |
| Notes 0.0.13     | Local tarball installed in the npm directory | Node ESM entry and context sharing, `32b7b21`                 |
| Shepherdr 0.2.25 | Fork's `packages/pi-shepherdr/dist/index.js` | Node ESM entry `1ede1a6`, Core agent status summary `328c437` |

The Browser and Notes installation archives come from commit `32b7b21b2036eaba1a68881c8b025f58bf0736aa` and live at `~/.pi/agent/packages/startup-32b7b21-20261101-135354/`. Their `README.md` and `installation.json` record tarballs, hashes, backups, and installation checks from that time. The original record covers three packages; Shepherdr now loads from the local fork and is no longer installed in the npm directory.

Keep both the source commit and installation archive when recovering Browser/Notes. These builds retain the source version numbers, so version numbers alone cannot identify them. Current npm dependencies use `file:` references to the archive; later package updates may overwrite the custom builds. Rebuild with each fork package's `build` / `prepack` scripts. The local Shepherdr `build` produces the `dist/index.js` referenced by the settings.

## Patch deployment differences

| Patch                                                        | Current status                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| Notes/History errors list supported fields for invalid input | Both installed source and `dist/index.js` include `supported fields:` |
| Board description says to reply with `post + thread_id`      | Present in the fork; absent from installed npm 0.0.4                  |

Deployment status is checked against the files actually loaded. A commit in the fork does not mean the local installation uses it.

## Remaining maintenance

- **Cross-machine sync:** `sync.sh` and `self-check.py` remain separately maintained at `~/my/tools/pi-config-sync/`. The script defaults to dry-run and has an allowlist, backups, and host-specific merging. The current allowlist does not cover rpiv-todo. Before using it again, check local package paths and the target machine's deployment method. Keep private payloads outside this repository.
- **Integration checks:** `~/.pi/agent/startup-optimization/` holds local audit scripts. Useful targets remain the final system prompt, Skill discoverability, the todo contract, and tool registration with native Codemode plus PCC normal. Extract checks using this repository's Vite+ tests and isolated fixtures. The old scripts contain hardcoded paths and assertions for the removed `pi-reply-visuals`, so they cannot be treated as the current acceptance suite in full.

This check used current configuration, installed manifests, and source. Startup performance, model calls, and real remote sync were not rerun. Historical checks in installation records do not count as checks passed in this review.
