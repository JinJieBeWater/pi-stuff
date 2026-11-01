[简体中文](README.md) | [English](README.en.md)

# Pi Tool Exposure

Adjusts tool exposure for installed Pi packages through configuration. Uses Pi's native package discovery to resolve manifests, without hardcoded extension paths, upstream source changes, or automatic package installation.

## Installation

Installed with the [repository Git package](../../README.en.md#installation), with `packages/pi-tool-exposure/index.ts` as its entry point. Disable it individually with `pi config`; see the repository instructions for updates and removal.

## Configuration

There are no adapter rules by default, so the extension takes no action. The optional file is `~/.pi/agent/pi-tool-exposure.json`; when `PI_CODING_AGENT_DIR` is set, it is read from that directory instead. Configuration is read at load time; run `/reload` or restart after editing it.

Package and tool names below are placeholders; replace them with actual names from installed packages.

1. Edit the target package's existing entry in `packages` in the user `settings.json` to disable its native extension entry points and prevent duplicate registration:

```json
{
  "source": "npm:@example/pi-tools",
  "extensions": []
}
```

2. Add an adapter rule to `pi-tool-exposure.json` so this extension discovers and loads the target package's entry points:

```json
{
  "adapters": [{ "source": "npm:@example/pi-tools", "tools": { "lookup": "deferred" } }]
}
```

`enabled` defaults to `true`; set it to `false` to disable adaptation. `adapters` defaults to `[]`. Each `source` supports Pi npm, git, and local package directories; relative directories resolve against the Pi user directory. `tools` is a nonempty mapping from tool names to exposure modes.

| Exposure     | Meaning                                                                              |
| ------------ | ------------------------------------------------------------------------------------ |
| `direct`     | Declared to the model when active; also available for nested tool calls              |
| `deferred`   | Definition is not shown upfront; discovered and activated through host `tool_search` |
| `model-only` | Declared to the model when active; unavailable for nested tool calls                 |

Sources and tool names must not be duplicated or have leading or trailing whitespace. UTF-8 BOM is supported. Unknown fields, invalid values, malformed JSON, and read errors are reported; defaults apply only when the file does not exist.

To stop using an adapter, disable this extension, restore the target package's original entry-point filters, and run `/reload`. This extension does not edit settings for you. Do not load an adapted package again through project configuration.

## Limits

- Adaptation happens when factories are called, wrapping `registerTool` to set exposure. Native entry-point filtering is required. Duplicate packages, entry points, or tool names across factories cause errors.
- Supports `direct`, `deferred`, and `model-only`. Overrides only unspecified/direct exposure, preserving other explicit upstream policies. Execution functions, parameter validation, and rendering are unchanged.
- Entry points still load at startup. `deferred` delays displaying tool definitions, not module loading. Discovery depends on host capabilities such as `tool_search`; other harnesses need separate validation.
- Tool names match exactly, and nonexistent tools are not created automatically. Check configuration after upstream renames. Later registrations through a captured adapter API are supported, but registrations from other factories or MCP are not managed.
- MCP tools use native `mcp.json` exposure/toolExposure settings. This plugin is not a security sandbox; configured packages retain ordinary Pi extension execution permissions.

## Development

See the [development guide](../../docs/development.en.md#validation) for common commands. Package tests use isolated package fixtures and registration stubs without installing real upstream packages or calling models.
