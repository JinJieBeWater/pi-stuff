# Personal setup

[简体中文](personal-setup.md) | [English](personal-setup.en.md)

Checked on 2026-11-01 against local configuration and installed resources: 38 configured packages. Native automatic discovery enables 36 extension entry points; tool adapters load four more, and legacy Herdr TUI also loads one `pi-herdr` entry when its environment conditions match. The entry count includes package changelogs and two local hooks, and excludes host built-in extensions. It is not a count of features or tools.

These third-party packages and local settings are excluded from the default `pi-stuff` installation. See the [configuration archive](../config/README.en.md) for settings, instructions, Shepherdr roles, and todo guidance, and the [maintenance record](local-maintenance-audit-2026-11-01.en.md) for build sources. This page records configured status; what a running session has loaded depends on its last startup or `/reload`.

## This repository and local forks

All [nine extensions in this repository](../README.en.md#extensions) are enabled and loaded from `~/my/pi-stuff/packages/`. The Pi version of `show-me` is loaded through the `~/.pi/agent/skills/show-me` symlink.

| Extension                                                                          | Current source and purpose                                                                                                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [pi-codex-conversion](https://www.npmjs.com/package/@howaboua/pi-codex-conversion) | `~/my/personal/fork/howaboua-pi-stuff/packages/pi-codex-conversion/dist/index.js`; PCC `normal` mode and Codex prompt/tool adaptation |
| [pi-shepherdr](https://www.npmjs.com/package/@howaboua/pi-shepherdr)               | `packages/pi-shepherdr/dist/index.js` in the same fork; persistent, blocking, or asynchronous subagents                               |

`pi-skill-discovery` loads before PCC. A package with the same name left in the npm directory does not mean it is loaded from npm.

## Enabled third-party extension packages

Unless noted otherwise, packages use `npm:` sources with all their extension entries enabled. The [settings snapshot](../config/pi/settings.json) defines the resource filters.

| Package                                                                                  | Purpose and loading notes                                                                                                    |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [pi-permission-system](https://www.npmjs.com/package/@gotgenes/pi-permission-system)     | Permission rules for tools, commands, and file access; currently `yoloMode: true`                                            |
| [pi-cache-hit-predictor](https://www.npmjs.com/package/@howaboua/pi-cache-hit-predictor) | Predict prompt cache hits after switching models or thinking levels                                                          |
| [angristan/pi-extensions](https://github.com/angristan/pi-extensions)                    | Git source; only the five entries listed below are enabled                                                                   |
| [pi-session-naming](https://www.npmjs.com/package/@furbyhaxx/pi-session-naming)          | Session naming, browsing, and management                                                                                     |
| [pi-auto-trees](https://www.npmjs.com/package/@howaboua/pi-auto-trees)                   | Generate branch summaries for incremental long tasks with `/marker` and `/end`                                               |
| [pi-ask](https://www.npmjs.com/package/@howaboua/pi-ask)                                 | Interactive decisions, review routing, and handoff                                                                           |
| [pi-smart-btw](https://www.npmjs.com/package/@howaboua/pi-smart-btw)                     | Ask questions in asynchronous side sessions and explicitly inject results into the main session                              |
| [Ponytail](https://github.com/DietrichGebert/ponytail)                                   | Git source; minimal implementation mode, with only the `ponytail-review` Skill selected                                      |
| [pi-web-access](https://www.npmjs.com/package/pi-web-access)                             | Web search, fetching, PDF, and video analysis                                                                                |
| [pi-autoresearch](https://www.npmjs.com/package/pi-autoresearch)                         | Run and measure experiments, then keep or discard them; includes three Skills                                                |
| [pi-codex-web-run](https://www.npmjs.com/package/@howaboua/pi-codex-web-run)             | Codex web search and navigation                                                                                              |
| [pi-browser](https://www.npmjs.com/package/@howaboua/pi-browser)                         | Control a logged-in browser; installed from a local tarball in the npm directory, with a changelog entry                     |
| [pi-agent-board](https://www.npmjs.com/package/@howaboua/pi-agent-board)                 | Agent message board and read-only viewer, with a changelog entry                                                             |
| [pi-notes-compaction](https://www.npmjs.com/package/@howaboua/pi-notes-compaction)       | Persistent notes and context window transitions; installed from a local tarball in the npm directory, with a changelog entry |
| [pi-unicode-charts](https://www.npmjs.com/package/@howaboua/pi-unicode-charts)           | Terminal bar, line, scatter, sparkline, and heatmap charts; configured at `@0.1.3`                                           |
| [pi-grok](https://github.com/stnly/pi-grok)                                              | Git source; search X through a Grok subscription                                                                             |

Enabled entries from the angristan collection:

- Display: `cached-line-resets`, `code-blocks`.
- Status: `turn-stats`, `working-timer`.
- Sessions: `reload-all`.

`accent-color`, `hyperlinks`, and the upstream `auto-session-title` are disabled. This repository's [pi-auto-session-title](../packages/pi-auto-session-title/README.en.md) generates titles, and [pi-herdr-tab-title](../packages/pi-herdr-tab-title/README.en.md) handles Herdr tab names.

## Packages loaded by managing extensions

These five packages explicitly set `extensions: []` in `settings.json`, disabling native automatic entry points to avoid duplicate registration by their managers. The first four are loaded through the [pi-tool-exposure configuration](../config/pi/pi-tool-exposure.json); `pi-herdr` is loaded by environment through the [pi-context-policy configuration](../config/pi/pi-context-policy.json).

| Package                                                                        | Actual loading and tool exposure configuration                                                                                                                     |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [pi-simplify](https://www.npmjs.com/package/@geminixiang/pi-simplify)          | Loaded by tool adaptation; `simplify_candidates`, `code_smell_scan`, and `code_smell_findings` are `deferred`                                                      |
| [context7-pi](https://www.npmjs.com/package/@upstash/context7-pi)              | Loaded by tool adaptation; `resolve-library-id` and `query-docs` are `deferred`; native discovery still provides the `context7-docs` Skill and one prompt template |
| [rpiv-todo](https://www.npmjs.com/package/@juicesharp/rpiv-todo)               | Loaded by tool adaptation; `todo` is `direct`; [todo guidance](../config/rpiv-todo/config.json) is archived separately                                             |
| [pi-codex-imagegen](https://www.npmjs.com/package/@howaboua/pi-codex-imagegen) | Loaded by tool adaptation; `imagegen` is `deferred`                                                                                                                |
| [pi-herdr](https://www.npmjs.com/package/@ogulcancelik/pi-herdr)               | Loads only when `HERDR_ENV=1`, `HERDR_PANE_ID` is nonempty, and `HC_TERMINAL_SOCKET` is missing or empty: the legacy TUI environment. Does not load in Core        |

`direct` shows the tool definition to the model upfront; `deferred` makes it discoverable through `tool_search` on demand. Tool adaptation still loads extension code at startup. Skills, prompt templates, and host built-in capabilities are counted separately.

## Packages that provide only Skills

| Package                                                                                                                  | Purpose                                                                               |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| [pi-skill-adversarial-qa](https://www.npmjs.com/package/@howaboua/pi-skill-adversarial-qa)                               | Check edge cases and regressions with executable counterexamples                      |
| [pi-skill-agents-md](https://www.npmjs.com/package/@howaboua/pi-skill-agents-md)                                         | Write and maintain scoped AGENTS.md files                                             |
| [pi-skill-anti-ai-copy](https://www.npmjs.com/package/@howaboua/pi-skill-anti-ai-copy)                                   | Preserve the author's voice and remove vague prose                                    |
| [pi-skill-skill-creator](https://www.npmjs.com/package/@howaboua/pi-skill-skill-creator)                                 | Create, validate, and maintain Skills                                                 |
| [pi-skill-harness-and-agent-engineering](https://www.npmjs.com/package/@howaboua/pi-skill-harness-and-agent-engineering) | Harness, tool, instruction, and cache workflows; six Skills                           |
| `~/my/tools/pi-evals`                                                                                                    | A separately maintained local Skill package for eval design, audits, and hillclimbing |

Other Skills in the shared and Pi-specific directories remain maintained at their respective sources. This page does not duplicate the full Skill catalog.

## Locally discovered entries

Two more enabled entries in `~/.pi/agent/extensions/` sit outside the 38 packages above:

- `herdr-agent-state.ts`: agent state integration managed by the Herdr installer.
- `moshi-hooks.ts`: lifecycle event integration generated by Moshi Hook.

Their installers and local environment manage them; their source is not copied into this repository. Native Codemode is enabled in `settings.json`, and PCC uses `normal`. Host capabilities are not counted again as third-party extensions.
