[简体中文](README.md) | [English](README.en.md)

# Pi Skill Discovery

Shows only configured core Skills in the system prompt's catalog. Other Skills available for automatic model invocation can be found on demand with the read-only `skill_search` tool. Only catalog metadata is reduced: native Skill registrations and bodies stay intact, and explicit `/skill:name` calls are unaffected.

## Installation

Installed with the [repository Git package](../../README.en.md#installation), with `packages/pi-skill-discovery/index.ts` as its entry point. Disable it individually with `pi config`; see the repository instructions for updates and removal.

## Usage

The model can search by task keywords or Skill name, then read the original `SKILL.md` at the returned path. Ordinary questions do not require a search.

```text
skill_search({"query":"task keywords or Skill name"})
```

`query` must be `1..256` characters; no extra parameters are accepted. Blank input or input without words fails. The result contains:

- `matches`: each item's `name`, `description`, and original file `path`, without the Skill body.
- `truncated`: whether additional lexical matches were not returned.

Skills marked `disable-model-invocation` are neither shown nor searched. Their native registrations remain intact.

## Configuration

Optional file: `~/.pi/agent/pi-skill-discovery.json`. When `PI_CODING_AGENT_DIR` is set, the file is read from that directory instead. Configuration is read at load time; run `/reload` or restart after editing it.

```json
{
  "coreSkills": [],
  "maxResults": 5
}
```

| Field        | Default | Meaning                                                          |
| ------------ | ------- | ---------------------------------------------------------------- |
| `enabled`    | `true`  | Whether to reduce the catalog and register the search tool       |
| `coreSkills` | `[]`    | Skill names to keep visible, with exact, case-sensitive matching |
| `maxResults` | `5`     | Maximum results per call, an integer in `1..20`                  |

**The default core list is empty; all Skills available for automatic model invocation are found on demand.** Names must be nonempty, unique, and free of leading or trailing whitespace. UTF-8 BOM is supported. Unknown fields, invalid values, malformed JSON, and read errors are reported; defaults apply only when the file does not exist.

## Using with Codex conversion

In the prompt-building flow of Pi 1.4.0 and `@howaboua/pi-codex-conversion` 4.0.7, this extension must handle `before_agent_start` first: it filters the skill list before Codex conversion generates the catalog.

In `packages` in the user `settings.json`, place the entry containing this extension before Codex conversion. The example below shows the relative order for the whole repository Git package. Move existing entries, preserving other packages and entry-point filters:

```json
{
  "packages": ["git:github.com/JinJieBeWater/pi-stuff", "npm:@howaboua/pi-codex-conversion"]
}
```

When loading the local subpackage separately, also put that entry before Codex conversion. Then run `/reload` in an idle session or restart.

This version of Codex conversion renders the received skill list into a catalog string inside its callback. If it runs first, later changes to `options.skills` filter the list while leaving the full catalog in the final prompt.

After changing configuration, package order, or related versions, check that:

- After all `before_agent_start` callbacks run, the catalog names in the final system prompt exactly match the discovered core Skills allowed for automatic model invocation.
- When non-core Skills exist, `skill_search` can find Skills outside the catalog that allow automatic model invocation.
- The native Skill registry remains complete.

In one offline comparison using those versions, 13 of 83 Skills available for automatic model invocation were configured as core. Reordering reduced the local catalog count from 7,961 to 1,172 tokens. These counts are an example; validate against your own configuration.

## Limits

- Search matches names and descriptions locally using NFKC normalization, lowercasing, `Intl.Segmenter` tokenization, and weighted substring scores. Exact name matches rank first; ties sort by name.
- Does not translate queries, infer synonyms, perform semantic routing, or execute Skills. For cross-language searches, use original names or words found in descriptions.
- Catalog snapshots refresh before each agent turn, are isolated by session and working directory, and are cleared when the session closes. Direct calls report an unavailable catalog before the first turn or after changing directories before starting a new turn.

## Development

See the [development guide](../../docs/development.en.md#validation) for common commands. Package tests use temporary configuration and synthetic Skill catalogs, without model requests.
