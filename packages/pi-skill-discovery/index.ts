import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { getAgentDir, type ExtensionAPI, type Skill } from "@earendil-works/pi-coding-agent";

function loadConfig() {
  const path = join(getAgentDir(), "pi-skill-discovery.json");
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { enabled: true, coreSkills: [] as string[], maxResults: 5 };
    }
    throw error;
  }

  const invalid = (message: string): never => {
    throw new Error(`Invalid skill discovery config at ${path}: ${message}`);
  };
  let value: unknown;
  try {
    value = JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    return invalid("expected valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalid("expected an object");
  }
  const config = value as Record<string, unknown>;
  for (const key of Object.keys(config)) {
    if (!["enabled", "coreSkills", "maxResults"].includes(key)) {
      return invalid(`unknown field: ${key}`);
    }
  }
  if ("enabled" in config && typeof config.enabled !== "boolean") {
    return invalid("enabled must be a boolean");
  }
  const coreSkills = "coreSkills" in config ? config.coreSkills : [];
  if (
    !Array.isArray(coreSkills) ||
    coreSkills.some((name) => typeof name !== "string" || !name.trim() || name !== name.trim())
  ) {
    return invalid(
      "coreSkills must be an array of non-empty skill names without surrounding whitespace",
    );
  }
  if (new Set(coreSkills).size !== coreSkills.length) {
    return invalid("coreSkills must not contain duplicate names");
  }
  const maxResults = "maxResults" in config ? config.maxResults : 5;
  if (
    typeof maxResults !== "number" ||
    !Number.isInteger(maxResults) ||
    maxResults < 1 ||
    maxResults > 20
  ) {
    return invalid("maxResults must be an integer from 1 to 20");
  }
  return { enabled: config.enabled !== false, coreSkills: coreSkills as string[], maxResults };
}

const SEARCH_GUIDANCE =
  "Handle ordinary questions directly. For non-core specialized workflows, first call skill_search with task keywords or a skill name, then read the matching original SKILL.md before following it. Search is lexical; it does not run skills.";
const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
const normalize = (text: string) => text.normalize("NFKC").toLowerCase();

function searchSkills(skills: Skill[], query: string, maxResults: number) {
  const phrase = normalize(query.trim());
  const terms = [
    ...new Set(
      [...segmenter.segment(phrase)].filter((part) => part.isWordLike).map((part) => part.segment),
    ),
  ];
  if (!terms.length) throw new Error("query must contain task keywords or a skill name");
  const ranked = skills
    .map((skill) => {
      const name = normalize(skill.name);
      const description = normalize(skill.description);
      let score =
        name === phrase ? 100 : name.includes(phrase) ? 16 : description.includes(phrase) ? 8 : 0;
      for (const term of terms)
        score += name.includes(term) ? 3 : description.includes(term) ? 1 : 0;
      return { skill, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name, "en"));
  return {
    matches: ranked.slice(0, maxResults).map(({ skill }) => ({
      name: skill.name,
      description: skill.description,
      path: skill.filePath,
    })),
    truncated: ranked.length > maxResults,
  };
}

export default function skillDiscovery(pi: ExtensionAPI) {
  const config = loadConfig();
  if (!config.enabled) return;
  const coreSkills = new Set(config.coreSkills);
  const catalogues = new Map<string, { cwd: string; skills: Skill[] }>();

  pi.on("before_agent_start", (event, ctx) => {
    const options = event.systemPromptOptions;
    const eligible = options.skills.filter((skill) => !skill.disableModelInvocation);
    catalogues.set(ctx.sessionManager.getSessionId(), { cwd: ctx.cwd, skills: eligible });
    options.skills = eligible.filter((skill) => coreSkills.has(skill.name));
    if (!options.promptGuidelines.includes(SEARCH_GUIDANCE))
      options.promptGuidelines.push(SEARCH_GUIDANCE);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    catalogues.delete(ctx.sessionManager.getSessionId());
  });

  pi.registerTool({
    name: "skill_search",
    label: "Skill Search",
    description:
      "Find reusable workflows by task keywords or skill name; return original SKILL.md paths using lexical matching",
    exposure: "direct",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    parameters: Type.Object(
      { query: Type.String({ minLength: 1, maxLength: 256 }) },
      { additionalProperties: false },
    ),
    outputSchema: Type.Object(
      {
        matches: Type.Array(
          Type.Object(
            {
              name: Type.String(),
              description: Type.String(),
              path: Type.String(),
            },
            { additionalProperties: false },
          ),
          { maxItems: config.maxResults },
        ),
        truncated: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    async execute(_id, { query }, _signal, _onUpdate, ctx) {
      const catalogue = catalogues.get(ctx.sessionManager.getSessionId());
      if (!catalogue || catalogue.cwd !== ctx.cwd)
        throw new Error(
          "Skill catalogue unavailable for this session and working directory; start a new user turn and retry",
        );
      const result = searchSkills(catalogue.skills, query, config.maxResults);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        details: undefined,
      };
    },
  });
}
