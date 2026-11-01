# pi-stuff

[简体中文](README.md) | [English](README.en.md)

My [Pi](https://github.com/earendil-works/pi) extensions, custom Skills, and personal configuration.

[Extensions](#extensions) · [Custom Skills](#custom-skills) · [Personal setup](docs/personal-setup.en.md) · [Configuration archive](config/README.en.md) · [Installation](#installation) · [Development](docs/development.en.md)

## Extensions

| Extension                                                            | Purpose                                                                             |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [pi-lovely-mermaid](packages/pi-lovely-mermaid/README.en.md)         | Render Mermaid as terminal text diagrams that follow the current theme              |
| [pi-borderless-tables](packages/pi-borderless-tables/README.en.md)   | Display aligned tables without borders                                              |
| [pi-herdr-session-move](packages/pi-herdr-session-move/README.en.md) | Move the current Pi conversation to another existing directory                      |
| [pi-herdr-tab-title](packages/pi-herdr-tab-title/README.en.md)       | Sync Pi tab names in Herdr Core/App and the legacy TUI                              |
| [pi-auto-session-title](packages/pi-auto-session-title/README.en.md) | Maintain session titles with language selection, custom prompts, and model fallback |
| [pi-drop-session](packages/pi-drop-session/README.en.md)             | Start a new session and send the previous session file to the trash                 |
| [pi-context-policy](packages/pi-context-policy/README.en.md)         | Select prompts, managed extensions, tools, and Skills for the current environment   |
| [pi-tool-exposure](packages/pi-tool-exposure/README.en.md)           | Adjust tool exposure and find entry points through native package discovery         |
| [pi-skill-discovery](packages/pi-skill-discovery/README.en.md)       | Configure a core catalog and find other Skills on demand                            |

## Custom Skills

| Skill                                     | Purpose                                                       |
| ----------------------------------------- | ------------------------------------------------------------- |
| [show-me (Pi)](skills/pi/show-me)         | Choose between code sketches, native Mermaid/charts, and HTML |
| [show-me (shared)](skills/shared/show-me) | A version for explicit invocation by other agents             |

The Pi package registers only the Pi version. The shared version is excluded from Pi package discovery. See the [Skills guide](skills/README.en.md) for invocation, dependencies, and attribution.

## Installation

Install Pi and Git first. Pi downloads the source and installs runtime dependencies; there is no need to clone the repo, install Bun, or build it manually:

```sh
pi install git:github.com/JinJieBeWater/pi-stuff
pi config
```

By default, Pi discovers all nine extensions above and the Pi version of `show-me`. It does not install the third-party projects in the [personal setup](docs/personal-setup.en.md). Disable unwanted entries in `pi config`. Run `/reload` in an existing session or start a new one.

Loading this Git package alongside local entries for the same extensions or Skill causes duplicate registration. Choose one source for each entry.

## Selecting extensions

You can also edit this package's existing entry in `packages` in the Pi user directory's `settings.json`. For example, load only `/drop` and disable this package's Skills, leaving other package entries as they are:

```json
{
  "source": "git:github.com/JinJieBeWater/pi-stuff",
  "extensions": ["packages/pi-drop-session/index.ts"],
  "skills": []
}
```

Omitting `extensions` or `skills` loads all entries of that type; `[]` disables that type. Run `/reload` or start a new session after editing.

## Configuration

- [Mermaid](packages/pi-lovely-mermaid/README.en.md): set Pi's `markdown.mermaid` to `off` before enabling this extension, so native rendering does not consume the code blocks first.
- [Session move](packages/pi-herdr-session-move/README.en.md): supports Herdr Core and the legacy TUI through their respective native runtime interfaces.
- [Tab titles](packages/pi-herdr-tab-title/README.en.md): Core requires a Herdr App connected to the terminal; the legacy TUI uses its own socket.
- [Automatic titles](packages/pi-auto-session-title/README.en.md): continues to read `auto-session-title.json`. Disable the extension with the same name in other packages before enabling it.
- [`/drop`](packages/pi-drop-session/README.en.md): requires a trusted trash command; by default it looks for `trash` on `PATH`.
- [Skill discovery](packages/pi-skill-discovery/README.en.md): the core list is empty by default, so all Skills eligible for automatic invocation are found on demand. Native `/skill:name` commands still work.

Configurable extensions read their JSON files from the Pi user directory, `~/.pi/agent/` by default, respecting `PI_CODING_AGENT_DIR`. These files are optional. Each extension's README documents its defaults, fields, and limits. Run `/reload` or start a new session after editing JSON.

The [configuration archive](config/README.en.md) separately stores my local settings, instructions, role presets, and todo guidance. Compare and merge what you need; the archive is excluded from the default installation.

## Update

```sh
pi update git:github.com/JinJieBeWater/pi-stuff
```

Run `/reload` or start a new session afterward. Packages installed with `@tag` or `@commit` stay on that reference rather than automatically switching to a newer version.

## Uninstall

```sh
pi remove git:github.com/JinJieBeWater/pi-stuff
```

This removes the entire package. Use `pi config` to disable individual entries. User JSON configuration is kept separately. Run `/reload` or start a new session after removal.

This repository has no npm release. See the [development guide](docs/development.en.md) for source development, local installation, the compatibility baseline, and testing.

## License

No repository-wide open-source license has been assigned yet. Automatic titles are adapted from angristan/pi-extensions; see the [extension README](packages/pi-auto-session-title/README.en.md#source-and-license) for attribution and its MIT license. Mermaid attribution and licenses are in [third-party-notices.md](packages/pi-lovely-mermaid/third-party-notices.md). The HumanLayer origin and MIT license for `show-me` are documented in the [Skills guide](skills/README.en.md#source-and-license). Dependencies retain their own licenses.
