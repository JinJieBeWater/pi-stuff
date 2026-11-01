# Personal Pi configuration

[简体中文](README.md) | [English](README.en.md)

Checked on 2026-11-01. This archive holds personal configuration from my current macOS installation for comparison and recovery. The Pi Git package does not load it automatically.

`pi/` maps to the Pi user directory, `~/.pi/agent/` by default; `rpiv-todo/` maps to `~/.config/rpiv-todo/`. Home paths use `~/`. Device IDs, the last-read changelog version, audio setup state, and authentication are excluded.

All 31 configuration files and custom resources were checked against the local installation. They match apart from the normalization above and document formatting. There are 38 configured packages and 36 extension entry points enabled by native automatic discovery. Tool adapters load four more entry points, and `pi-herdr` loads only under legacy TUI conditions. See the [personal setup](../docs/personal-setup.en.md) for sources, filters, and managed loading. Entry counts include package changelogs and two locally generated hooks, and exclude host built-in extensions.

## Contents

| File                                                                                                                                                          | Purpose                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [AGENTS.md](pi/AGENTS.md)                                                                                                                                     | Pi-specific collaboration rules                                 |
| [settings.json](pi/settings.json)                                                                                                                             | Package sources, load order, filters, and interface preferences |
| [pi-codex-conversion.json](pi/pi-codex-conversion.json)                                                                                                       | PCC normal mode, prompts, compaction, and voice preferences     |
| [pi-skill-discovery.json](pi/pi-skill-discovery.json), [pi-tool-exposure.json](pi/pi-tool-exposure.json), [pi-context-policy.json](pi/pi-context-policy.json) | Skill visibility, tool exposure, and environment adaptation     |
| [shepherdr/profiles/](pi/shepherdr/profiles/)                                                                                                                 | Six role presets and shared prompts                             |
| [multi-agent-review/](pi/skills/multi-agent-review/)                                                                                                          | Manual review Skill, validation script, and offline tests       |
| [rpiv-todo/config.json](rpiv-todo/config.json)                                                                                                                | Task tracking guidance, without task data                       |

The remaining files store keybindings, the theme, interaction settings, Ponytail, helper models, web fetching, permissions, and a worktree template. Disabled accent-color and MCP configuration, unused model-router configuration, the unmodified voice template, and `/drop` settings equal to the defaults are omitted. `session.titleGeneration` retains only its disabled flag; the extension in this repository generates titles.

Native Codemode is enabled and PCC uses `normal`; they operate at different layers.

JSON fields, commands, and paths retain their original form. Archived instructions, Skills, and role prompts keep the local source text; READMEs and guides provide the bilingual explanations.

## Recovery and maintenance

1. Compare and merge individual files as needed. Use `PI_CODING_AGENT_DIR` if set. This repository, the PCC/Shepherdr fork, and the evaluation Skill live at `~/my/pi-stuff`, `~/my/personal/fork/howaboua-pi-stuff`, and `~/my/tools/pi-evals`. Adjust package paths when changing directories or installation sources. Keep [Skill discovery before PCC](../packages/pi-skill-discovery/README.en.md) in the load order. See [development setup](../docs/development.en.md#setup) for local dependency installation.
2. Supply model definitions and authentication on the target machine. `npmCommand` uses mise and Node 24.13.1; web fetching uses macOS Homebrew curl. Install Skills from their respective sources. The local `show-me` entry is a symlink to this repository's `skills/pi/show-me`.
3. The [permission configuration](pi/extensions/pi-permission-system/config.json) retains `yoloMode: true`. The [worktree template](pi/templates/worktree.json) copies `.env`, links project directories, and installs dependencies. Decide whether these settings fit the target environment.
4. After merging, run `/reload` in an idle session or start a new one, then check tool exposure and the role list. Sync the archive after changing live configuration, continuing to exclude device state, old revisions, and backups. Sessions, logs, caches, and cross-machine sync payloads remain on their machines.

See the [maintenance record](../docs/local-maintenance-audit-2026-11-01.en.md) for custom builds and cross-machine sync tools.

The manual review validator uses Python 3 and runs offline without model calls:

```sh
python3 config/pi/skills/multi-agent-review/tests/test-review-validation.py
```
