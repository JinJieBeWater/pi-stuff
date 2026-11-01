import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fileName, matchesEnv, parsePolicy, type Policy } from "./policy.ts";
import { registerResources } from "./resources.ts";

export { parsePolicy, type Policy } from "./policy.ts";
const defaultSections: NonNullable<Policy["sections"]> = [
  {
    id: "herdr-core",
    text: "当前运行在 Herdr Core 管理的终端中。agent 协作使用 Shepherdr；需要直接操作终端时先读 hc --skill；需要操作桌面窗口时先确认 herdr-app 可用并读 herdr-app --skill。",
    whenEnv: { HC_TERMINAL_ID: true, HC_TERMINAL_SOCKET: true },
  },
  {
    id: "herdr-tui",
    text: "当前运行在旧 Herdr TUI 管理的 pane 中。agent 协作使用 Shepherdr；需要操作终端或布局时先读 herdr --skill。",
    whenEnv: { HERDR_ENV: "1", HERDR_PANE_ID: true },
  },
];

export function registerPolicy(
  pi: ExtensionAPI,
  config: Policy,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!config.enabled || config.sections?.length === 0) return;
  pi.on("before_agent_start", (event) => {
    for (const block of config.sections ?? defaultSections) {
      if (matchesEnv(block.whenEnv, env)) {
        event.systemPromptOptions.sections[`context-policy-${block.id}`] = block.text;
        // Core terminals can inherit legacy HERDR_* markers; defaults select one backend.
        if (config.sections === undefined) break;
      }
    }
  });
}

export default async function contextPolicy(pi: ExtensionAPI) {
  let value: unknown = {};
  try {
    value = JSON.parse(
      (await readFile(join(getAgentDir(), fileName), "utf8")).replace(/^\uFEFF/, ""),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const config = parsePolicy(value);
  await registerResources(pi, config);
  registerPolicy(pi, config);
}
