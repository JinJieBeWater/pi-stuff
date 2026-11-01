import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalTarget, conversationLeaf, readJson, relocate } from "./move.ts";
import { acceptHandoff, finishHandoff } from "./receiver.ts";
import { createRuntime } from "./runtime.ts";

export default function sessionMove(pi: ExtensionAPI) {
  if (!createRuntime(pi.exec, process.cwd())) return;
  const lifetime = new AbortController();
  let staged: { cwd: string; signal?: AbortSignal } | undefined;
  let moving = false;
  let receiving = false;
  let handedOff = false;

  const perform = async (
    ctx: ExtensionContext,
    cwd: string,
    resume: boolean,
    signal?: AbortSignal,
  ) => {
    moving = true;
    ctx.ui.setStatus("session-move", "Moving Pi session…");
    try {
      if (ctx.ui.getEditorText().trim())
        throw new Error("Keep or send the editor draft before moving");
      const record = await relocate(ctx, cwd, {
        runtime: createRuntime(pi.exec, cwd)!,
        agentDir: getAgentDir(),
        extension: fileURLToPath(import.meta.url),
        sourcePid: process.pid,
        resume,
        signal: signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal,
      });
      handedOff = true;
      ctx.ui.notify(
        `Session moved to ${record.cwd}; source history retained at ${record.sourceSessionFile}`,
        "info",
      );
      ctx.shutdown();
    } finally {
      if (!handedOff) moving = false;
      ctx.ui.setStatus("session-move", undefined);
    }
  };

  pi.registerFlag("session-move-handoff", {
    type: "string",
    description: "Private session-move handshake record",
  });
  pi.registerTool({
    name: "herdr_session_move",
    label: "Move Pi Session",
    exposure: "deferred",
    executionMode: "sequential",
    description:
      "Transfer this Pi conversation after the current run settles; the replacement resumes after this Pi exits. Source history is retained.",
    promptGuidelines: [
      "Call herdr_session_move alone when the user explicitly requests relocating this Pi session",
    ],
    parameters: Type.Object(
      {
        cwd: Type.String({
          description: "Existing absolute directory, in any repository or outside Git",
        }),
      },
      { additionalProperties: false },
    ),
    async execute(_id, { cwd }, signal, _update, ctx) {
      if (moving || staged || receiving) throw new Error("A session move is already pending");
      const target = await canonicalTarget(cwd, ctx.cwd);
      if (!ctx.sessionManager.getSessionFile()) throw new Error("This session is not persisted");
      if (ctx.hasPendingMessages()) throw new Error("Queued messages must finish before moving");
      signal?.throwIfAborted();
      staged = { cwd: target, signal };
      return {
        content: [
          {
            type: "text",
            text: `Move staged to ${target}. Transfer starts when this run settles; take no further actions here.`,
          },
        ],
        details: { cwd: target, state: "staged" },
        terminate: true,
      };
    },
  });

  pi.registerCommand("session-move", {
    description: "Move this Pi conversation to an absolute directory",
    handler: async (cwd, ctx) => {
      if (moving || staged || receiving) {
        ctx.ui.notify("A session move is already pending", "warning");
        return;
      }
      await ctx.waitForIdle();
      try {
        await perform(ctx, await canonicalTarget(cwd.trim(), ctx.cwd), false);
      } catch (error) {
        ctx.ui.notify(String(error), "error");
      }
    },
  });

  pi.on("tool_call", () => {
    if (staged || moving || receiving)
      return { block: true, reason: "Session handoff is pending; no further work may run here" };
  });

  const guardConversation = (_event: unknown, ctx: ExtensionContext) => {
    if (staged || moving || receiving) {
      ctx.ui.notify("Finish the session handoff before changing the conversation", "warning");
      return { cancel: true };
    }
  };
  pi.on("session_before_tree", guardConversation);
  pi.on("session_before_switch", guardConversation);
  pi.on("session_before_fork", guardConversation);
  pi.on("session_before_compact", guardConversation);

  pi.on("agent_settled", async (event, ctx) => {
    const request = staged;
    staged = undefined;
    if (!request) return;
    if (event.aborted || request.signal?.aborted) {
      ctx.ui.notify("Session move cancelled; source was kept", "warning");
      return;
    }
    try {
      await perform(ctx, request.cwd, true, request.signal);
    } catch (error) {
      pi.sendMessage({ customType: "session-move-error", content: String(error), display: true });
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    const handoff = pi.getFlag("session-move-handoff");
    if (typeof handoff !== "string" || !handoff) return;
    // A reload or later /new must not replay a completed or cancelled handoff.
    const directory = join(handoff, "..");
    if (
      (await readJson(join(directory, "completed.json"))) ||
      (await readJson(join(directory, "cancelled.json")))
    )
      return;
    receiving = true;
    try {
      const record = await acceptHandoff(
        ctx,
        handoff,
        getAgentDir(),
        createRuntime(pi.exec, ctx.cwd)!,
        process.pid,
        lifetime.signal,
      );
      const leaf = conversationLeaf(ctx.sessionManager);
      const checkTarget = () => {
        lifetime.signal.throwIfAborted();
        if (
          ctx.sessionManager.getSessionId() !== record.targetSessionId ||
          ctx.sessionManager.getSessionFile() !== record.targetSessionFile ||
          conversationLeaf(ctx.sessionManager) !== leaf ||
          ctx.ui.getEditorText().trim() ||
          ctx.hasPendingMessages()
        ) {
          throw new Error(
            "The target conversation or draft changed; automatic continuation was stopped",
          );
        }
      };
      void finishHandoff(record, process.pid, { signal: lifetime.signal, checkTarget })
        .then((status) => {
          receiving = false;
          if (status !== "completed") {
            ctx.ui.notify(
              `Move ${status}; no task was resumed. Source and replacement history were kept. Inspect ${record.directory}`,
              "warning",
            );
            return;
          }
          checkTarget();
          ctx.ui.notify(
            `Session is now in ${record.cwd}; source terminal ${record.sourcePane} was retained`,
            "info",
          );
          if (record.resume)
            pi.sendUserMessage(
              `This session moved to ${record.cwd}. The old Pi has exited. Continue the user's task from the preserved conversation; do not repeat the move.`,
            );
        })
        .catch((error) => {
          receiving = false;
          if (!lifetime.signal.aborted)
            ctx.ui.notify(
              `Move not resumed: ${String(error)}. Inspect ${record.directory}`,
              "error",
            );
        });
    } catch (error) {
      receiving = false;
      ctx.ui.notify("Handoff rejected; source must stay open: " + String(error), "error");
    }
  });

  pi.on("input", (event, ctx) => {
    if (!moving && !staged && !receiving) return;
    ctx.ui.setEditorText(event.text);
    ctx.ui.notify("Session handoff is pending; input was kept in the editor", "warning");
    return { action: "handled" };
  });
  pi.on("session_shutdown", () => {
    lifetime.abort();
  });
}
