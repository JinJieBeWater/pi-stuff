import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { writeFileSync } from "node:fs";

export default function inspectTools(pi: ExtensionAPI) {
  pi.registerFlag("inspect-tools-file", { type: "string" });
  pi.on("session_start", (_event, ctx) => {
    const file = pi.getFlag("inspect-tools-file");
    if (typeof file !== "string") return;
    writeFileSync(
      file,
      JSON.stringify(
        {
          cwd: ctx.cwd,
          tools: pi
            .getAllTools()
            .filter((t) => t.name === "herdr_session_move" || t.name === "herdr_worktree_jump"),
          commands: pi.getCommands().filter((c) => c.name === "session-move"),
        },
        null,
        2,
      ),
      { mode: 0o600, flag: "wx" },
    );
    ctx.shutdown();
  });
}
