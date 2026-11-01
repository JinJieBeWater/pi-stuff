# Development guide

[简体中文](development.md) | [English](development.en.md)

For everyday use, install the Git package as described in the [repository README](../README.en.md#installation). Development uses Bun 1.4.4 for dependencies and Node.js for tools and tests. [`.node-version`](../.node-version) selects Node 24; Node 22.19 is the minimum supported version.

## Setup

```sh
git clone https://github.com/JinJieBeWater/pi-stuff.git
cd pi-stuff
bun install --frozen-lockfile --ignore-scripts
```

Bun workspaces manage packages and their dependencies; Vite+ provides checks and tests. Development versions of Vite+, TypeScript, Node types, and the Pi SDK are declared in the root `package.json` and locked in one `bun.lock`. Install and update dependencies at the root. Installation skips lifecycle scripts; enable Git hooks separately as described below.

The root and all extensions inherit [`packages/config/tsconfig.base.json`](../packages/config/tsconfig.base.json): ES2023, Node types, strict type checking, indexed access checks, and unused declaration checks, with no output files. Node types stay on version 22 to match Pi's minimum runtime. Each `tsconfig.json` defines only its scope. The root covers Vite+ configuration, shared code, and root tests; extensions cover their source and test scripts.

## Validation

Run these commands at the repository root:

| Command               | Checks                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `bun run check`       | Document and code formatting, lint, and type checks for the root and every extension                              |
| `bun run test`        | Default extension tests and root tests for package declarations, resource discovery, and actual extension loading |
| `bun run check-types` | Type checks for the root and every extension only                                                                 |
| `bun run format`      | Format repository files                                                                                           |

Default tests run in Node through Vite+'s built-in Vitest, importing test APIs from `vite-plus/test`. Tests use isolated fixtures or substitutes: they do not call real models, run a real trash command, or move user sessions. Root tests also use temporary Pi configuration and the real `DefaultResourceLoader` and jiti to load every extension.

When multiple `before_agent_start` callbacks process `systemPromptOptions`, integration checks must inspect the final system prompt after all callbacks finish. [Skill discovery with Codex conversion](../packages/pi-skill-discovery/README.en.md) documents load order and checks for the catalog, search, and native registry.

`bun run` only starts repository scripts. Root tests run `vp test run`, discovering `*.test.ts` files. Formatting, lint, and tests share the root [`vite.config.ts`](../vite.config.ts). Type checking runs through `vp exec tsc`, with `vp run` scheduling extension checks from the root script.

To check a single extension, run these commands from its package directory:

```sh
bun run test
bun run check-types
```

Subpackage tests explicitly use the root configuration and current directory, running only that package's `*.test.ts` files. They do not run manual scripts that require a real Herdr instance.

Session move has additional manual checks requiring real Pi and Herdr processes. They are excluded from default tests and CI; see the [testing guide](../packages/pi-herdr-session-move/TESTING.en.md).

Optional Git hooks: run `bun run hooks:setup` at the root. CI runs frozen-lockfile installation, `bun run check`, and `bun run test` on both Node 22.19 and Node 24. See [check.yml](../.github/workflows/check.yml).

## Local loading

After installing development dependencies, add a single local package to Pi from the repository root:

```sh
pi install ./packages/pi-drop-session
```

After changing source, run `/reload` in an idle Pi session or start a new one. When local debugging is finished, run this from the same directory:

```sh
pi remove ./packages/pi-drop-session
```

Pi loads local directories directly, without copying them or installing their dependencies. If the whole Git package is already installed, disable its duplicate entry before enabling a local extension or Skill.

For `show-me` development, symlink the user directory's Skill entry to this repository's `skills/pi/show-me`, and the shared agent entry to `skills/shared/show-me`. Check for existing entries with the same name before replacing anything. See the [Skills guide](../skills/README.en.md) for invocation and drawing dependencies.

## Distribution

The root [package.json](../package.json) declares the extension entries and `skills/pi/show-me` as one Pi Git package. Each extension retains its own manifest. Extensions load TypeScript directly, and Skills read Markdown directly; no bundle is required. `skills/shared/show-me` is for explicit use by other agents and is not registered as a second Pi Skill.

Pi libraries supplied by the host are declared as `peerDependencies` rather than copied as runtime dependencies. The root package declares runtime libraries for the extension collection; each subpackage declares its own runtime libraries. Development and test dependencies are centralized in the root `devDependencies`, and subpackages are developed within this workspace. Root tests cover resource discovery and filtering down to a single entry.

The [personal setup](personal-setup.en.md) is a guide only. Its third-party packages are excluded from root manifest resource discovery and dependency installation.

## Compatibility baseline

Runtime interfaces are validated against the Node host and Pi SDK 1.4. Herdr extensions are checked against native interfaces in legacy TUI 0.9.5, Core 0.1.15, and App 0.1.10. See root `devDependencies` for exact SDK versions. This does not establish compatibility with Bun-compiled Pi or every past and future version.

- Borderless tables depend on Pi's native table layout and fall back to native display when a layout is not recognized.
- `/drop` command lookup targets macOS/Linux. Windows is unsupported and untested.
- Session move keeps the source terminal open to avoid closing unrelated programs. Core launch uses macOS/Linux `/usr/bin/env`; Windows moves are untested.

Each extension's README documents its limits. See the [recovery guide](../packages/pi-herdr-session-move/RECOVERY.en.md) for failed moves.
