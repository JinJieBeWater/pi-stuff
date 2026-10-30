import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Local deterministic provider: exercises Pi's real turn/tool lifecycle without a network call.
export default function fixture(pi: ExtensionAPI) {
  pi.registerProvider("move-fixture", {
    baseUrl: "http://127.0.0.1:1",
    apiKey: "fixture-not-a-credential",
    api: "move-fixture-api",
    models: [
      {
        id: "fixture",
        name: "Fixture",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 100000,
        maxTokens: 1024,
      },
    ],
    streamSimple(model, context) {
      const config = JSON.parse(readFileSync(join(getAgentDir(), "fixture.json"), "utf8"));
      const target = process.cwd() === config.target;
      const sourceAlive = config.sourcePid
        ? (() => {
            try {
              process.kill(config.sourcePid, 0);
              return true;
            } catch {
              return false;
            }
          })()
        : undefined;
      appendFileSync(
        config.calls,
        JSON.stringify({
          pid: process.pid,
          cwd: process.cwd(),
          target,
          sourceAlive,
          messages: context.messages.filter((m) => m.role !== "system"),
        }) + "\n",
      );
      const message: AssistantMessage = {
        role: "assistant",
        provider: model.provider,
        api: model.api,
        model: model.id,
        timestamp: Date.now(),
        stopReason: target ? "stop" : "toolUse",
        content: target
          ? [{ type: "text", text: "Fixture continued in destination." }]
          : [
              {
                type: "toolCall",
                id: "fixture-move",
                name: "herdr_session_move",
                arguments: { cwd: config.target },
              },
            ],
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        stream.push({ type: "start", partial: message });
        stream.push({ type: "done", reason: target ? "stop" : "toolUse", message });
        stream.end();
      });
      // The installed host has two nominally distinct pi-ai copies; Pi maps them at extension load.
      return stream as unknown as ReturnType<NonNullable<ProviderConfig["streamSimple"]>>;
    },
  });
  pi.on("session_start", () => {
    pi.setActiveTools([...pi.getActiveTools(), "herdr_session_move"]);
  });
}
