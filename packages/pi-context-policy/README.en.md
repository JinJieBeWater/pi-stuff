[简体中文](README.md) | [English](README.en.md)

# Pi Context Policy

Selects prompt sections and managed extensions, tools, and Skills by environment. Recognizes Herdr Core and legacy Herdr TUI by default and points to their official manuals. Resource management requires explicit configuration.

## Installation

Installed with the [repository Git package](../../README.en.md#installation), with `packages/pi-context-policy/index.ts` as its entry point. Disable it individually with `pi config`; see the repository instructions for updates and removal.

## Default behavior

Without configuration, selects one environment section in this order:

| Environment      | Condition                                                   | Operating instructions                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Herdr Core       | Both `HC_TERMINAL_ID` and `HC_TERMINAL_SOCKET` are nonempty | Use Shepherdr for agent collaboration; read `hc --skill` before terminal operations; confirm `herdr-app` is available and read `herdr-app --skill` before window operations |
| Legacy Herdr TUI | `HERDR_ENV=1` and `HERDR_PANE_ID` is nonempty               | Use Shepherdr for agent collaboration; read `herdr --skill` before terminal or layout operations                                                                            |

Core terminals may inherit legacy `HERDR_*` markers, so only the Core section is injected when both conditions match. Other environments receive no added content. Environment markers identify the backend managing the terminal; they do not prove that a usable desktop window exists.

Manuals come from the installed official CLIs, without needing to load an old Herdr Skill globally. Concurrent orchestration follows Shepherdr's current mode and the user's instructions.

## Configuration

Optional file: `~/.pi/agent/pi-context-policy.json`. When `PI_CODING_AGENT_DIR` is set, the file is read from that directory instead. Configuration is read at load time; run `/reload` or restart after editing it.

For example, replace the default sections with team conventions:

```json
{
  "sections": [
    {
      "id": "team",
      "text": "Use the terminology and conventions in the team documentation.",
      "whenEnv": { "TEAM_WORKSPACE": "1", "TEAM_INSTANCE": true }
    }
  ]
}
```

- `enabled` defaults to `true`. When `sections` is omitted, the default sections are selected in the order above.
- Explicit `sections` replace all default sections. Use `[]` or `{"enabled": false}` to disable them.
- All matching custom sections are added. Core priority applies only to the default rules.
- Use a unique lowercase identifier for `id`. Section keys are `context-policy-<id>` and do not overwrite native sections such as `herdr`.
- All `whenEnv` conditions must match. Strings require an exact match; `true` requires a nonempty variable; `false` requires a missing or empty variable. Omitting conditions always matches.

UTF-8 BOM is supported. Unknown fields, invalid values, malformed JSON, and read errors are reported; defaults apply only when the file does not exist.

## Enable resources by environment

Pi finishes native extension loading before this extension runs, so this extension cannot undo code that has already executed. To manage a resource, disable its native automatic entry point first, then let this extension decide whether to load it. Upstream files are not modified, and dependencies are not installed automatically.

For example, to enable an installed `pi-herdr` only in legacy TUI, first change the package's existing entry in `settings.json` to:

```json
{
  "source": "npm:@ogulcancelik/pi-herdr",
  "extensions": []
}
```

Then configure `pi-context-policy.json`:

```json
{
  "extensions": [
    {
      "source": "npm:@ogulcancelik/pi-herdr",
      "whenEnv": {
        "HERDR_ENV": "1",
        "HERDR_PANE_ID": true,
        "HC_TERMINAL_SOCKET": false
      }
    }
  ]
}
```

Core will not import this package even if it inherits legacy `HERDR_*` markers. Default environment prompts remain active; adding resource rules does not require redefining `sections`.

| Field        | Configuration                                           | Behavior                                                                                                        |
| ------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `extensions` | `[{"source":"installed Pi package", "whenEnv":{...}}]`  | When matched, discovers entry points through the native manifest and runs factories; otherwise, does not import |
| `tools`      | `[{"name":"tool name", "whenEnv":{...}}]`               | Filters managed extensions' `registerTool`; unmatched tools are not registered                                  |
| `skills`     | `[{"path":"Skill directory or file", "whenEnv":{...}}]` | When matched, adds to the skill catalog through native `resources_discover`                                     |

All three default to empty lists. Names match exactly, and each target may appear only once per resource type. Conditions are allow rules: only matches are enabled. Managed tools not listed retain upstream behavior.

Extension sources support installed npm, git, and local package directories. Relative directories resolve against the Pi user directory. First disable the entry point to be managed with `extensions: []` or an equivalent native filter. This extension checks native resolution and physical file paths; the same file cannot load through aliases or another package entry point even when a rule does not match. Choose only one manager per package; do not also load it through `pi-tool-exposure`, project entries, or CLI entries. Missing matched packages, duplicate physical aliases, invalid entry points, or duplicate tool names across factories cause errors. Unmatched packages need not be installed on the current machine. This extension cannot manage itself or a whole package containing its own entry point.

Tool rules control only packages listed in `extensions` above, not host built-in tools or other independently loaded extensions. Tool conditions are determined at load time and also apply to later registrations. Parameters, execution, rendering, and exposure retain upstream definitions. Unmatched tools cannot be called through `tool_search` or Codemode because they are not registered. Disabling a tool alone does not stop its extension's other hooks or commands.

Skills use directory or Markdown file paths; directories must directly contain `SKILL.md`. `~/` is supported; other relative paths resolve against the Pi user directory. First add the corresponding negative path to `skills` in `settings.json`, then configure conditions. For example:

```json
{
  "skills": ["-~/.agents/skills/example-workflow"]
}
```

Corresponding `pi-context-policy.json`:

```json
{
  "skills": [
    {
      "path": "~/.agents/skills/example-workflow",
      "whenEnv": { "EXAMPLE_WORKFLOW": "1" }
    }
  ]
}
```

The negative path must resolve to the same location as the managed path; a missing exclusion causes an error. If a package manifest also provides the Skill, a global negative path cannot disable that entry point. Also set `skills: []` in that package entry, or use an equivalent package-level filter:

```json
{
  "source": "npm:@example/workflows",
  "skills": []
}
```

This extension validates native skill resolution. It reports an error if the same file is still enabled through any global entry point, including physical path aliases. A Skill file is required to exist only when its rule matches. Unmatched Skills are not added to the native catalog, so they do not appear in the system skill catalog, `skill_search`, or native `/skill:name` registration. Project entries, CLI entries, and other copies with the same name must be excluded separately.

Resource conditions apply at startup or `/reload`; running extensions are not hot-unloaded. Restart Pi after environment changes; configuration edits can be applied with `/reload` while idle. `enabled: false` stops this extension's prompt injection and resource loading. Native entry points that were disabled remain disabled.

## Limits

Prompt sections do not install Shepherdr, invoke tools, or grant extra permissions. Resource management executes matching package code with ordinary Pi extension permissions. Environment filtering is not a security sandbox and does not prevent users from reading on-disk Skills through other tools.

## Development

See the [development guide](../../docs/development.en.md#validation) for common commands. Tests cover Core/TUI selection, missing-variable conditions, resource configuration validation, skipping unmatched package imports, initial and later tool registration, and native Skill discovery and exclusion, without connecting to Herdr.
