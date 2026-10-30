# Pi Skill Discovery

Advertise only configured core skills in Pi's system prompt. Other eligible skills remain available through the read-only `skill_search` tool, which returns their names, descriptions and original `SKILL.md` paths—not their bodies. Read the matching file before following its workflow. Ordinary questions do not require a search.

The plugin changes prompt metadata only. It leaves Pi's native skill registry and explicit `/skill:name` invocation intact. Skills marked `disable-model-invocation` are never advertised or included in search.

## Install

Install the repository's Git package, then select this extension in `pi config`:

```sh
pi install git:github.com/JinJieBeWater/pi-stuff
pi config
```

The package contains all seven extensions. See the [repository README](../../README.md#安装) for single-entry filtering, updates and removal.

## Configuration

Create `pi-skill-discovery.json` in Pi's agent directory, resolved by `getAgentDir()`. Pi's native `PI_CODING_AGENT_DIR` override applies.

```json
{
  "coreSkills": [],
  "maxResults": 5
}
```

- `coreSkills`: unique, non-empty skill names without surrounding whitespace, matched exactly. Defaults to `[]`, so all eligible skills are discovered on demand.
- `maxResults`: integer from 1 to 20. Defaults to `5`.
- `enabled`: optional boolean, default `true`. Set `false` to disable the plugin's prompt changes and tool registration.

A missing file uses the defaults. UTF-8 BOMs are accepted. Invalid JSON, unknown fields and invalid values report an error; other file-read errors are not ignored. Configuration is read when the extension loads; reload Pi's extensions after editing it.

## Search limits

`skill_search({"query":"task keywords or skill name"})` accepts 1–256 characters and no extra fields. Blank or non-word queries fail. Results contain `matches` (`name`, `description`, `path`) and `truncated`, which indicates more lexical matches exist beyond the configured limit.

Search runs locally over skill names and descriptions using NFKC normalization, lowercasing, `Intl.Segmenter` word boundaries and weighted substring matches. Exact names rank first; equal scores sort by name. It does not translate queries, infer synonyms, route semantically or execute skills. Use words present in the skill metadata, particularly when searching across languages.

The eligible catalogue refreshes before every agent turn, is isolated by session and working directory, and is cleared for a session when it shuts down. Search before the first turn, or after changing directory without a new turn, reports an unavailable catalogue.

## Development

After workspace dependencies are installed, run `bun test` and `bun run check-types` in this package. Tests use temporary configuration and synthetic skills; they make no model requests.
