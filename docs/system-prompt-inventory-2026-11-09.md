# Pi 系统提示盘点（2026-11-09）

范围：只读检查本机 Pi 1.5.0 配置、当前加载包、提示构建源码、PCC 日志及 shepherdr profiles。这里区分“实际载荷可见”和“基于源码重建”；没有运行时读取/改写任何配置。

## 结论摘要

- 默认主模型为 `magpie/codex/gpt-6.1-sol`，PCC `heavySystemPromptOverwrite: "gpt"` 生效。Pi 核心仍按 sections 拼装，PCC 在 `before_agent_start` 改写结构化内容。PCC 日志能给调用 prompt 总 token 数，不能回放 system 文本或消息正文。
- GPT 路径有一条可核的近期会话日志：首个主请求 `engine_total_prompt_tokens_total=8141`。这是整次调用输入合计，不是 system prompt 长度。无法仅凭该日志精确拆分 system、首轮注入和用户消息。
- Claude Opus 是通过 magpie→Claude Code 的 profile 路径；profiles 中 `general` 明确指定 `claude/claude-opus-5-5`。在已读证据中未找到 Claude 实际请求载荷，不能声称完整 prompt 已实测取得。PCC 配置是全 provider 范围，故源码上 GPT 压缩型 prompt 也用于符合其 scope 的 Claude provider。
- 系统上下文重复：Pi agent `AGENTS.md` 明确要求遵循 `~/.agents/AGENTS.md`，两份都会作为 project context 文件载入；Pi agent 文本第 1 行也将同一规则重复表达。`show-me` 发生路径与版本指向冲突（Pi 专属副本 vs 通用副本）。
- 配置垃圾确实存在：agent 根目录有多代 `.bak`/`before-*` 文件；配置包列表中 `@howaboua/pi-unicode-charts` 与 `@howaboua/pi-unicode-charts@0.1.3` 同时出现；多个条目显式 `extensions: []`，但它们可能仍提供 skills/assets，不能仅凭空扩展数组认定整体未加载。

## 1. 主模型和 Claude 的提示及首轮注入

### GPT / 默认 magpie 路径

**实际可见证据**：`~/.pi/agent/settings.json:15-19` 默认模型/provider/thinking；PCC 配置 `~/.pi/agent/pi-codex-conversion.json` 的 `prompt.heavySystemPromptOverwrite="gpt"`、`scope.additionalProviders=["magpie"]`、`openai.cacheDiagnostics="status-and-log"`。PCC 的 `src/extension/register.ts:29-33` 在 `before_agent_start` 触发 prompt mode，`src/extension/turn-lifecycle.ts:64-71` 合并 skills 并调用 `prepareCodexSystemPrompt`。

`~/.pi/agent/pi-codex-logs/2026-11-08T08-34-24-129Z_01a1ba4b-5f01-709f-9178-0bfdc0d0c226.log:19` 记录首个 response 请求 `engine_total_prompt_tokens_total=8141`；`:17` 是预热请求 8141，`:22` 是辅助请求 1754。日志记录计数/时序，不含序列化后的 system prompt 或首轮消息正文。因此完整“实际发出的 prompt + 注入消息”无法从该日志恢复。

**按当前源码/配置重建的顺序**（非载荷抓包）：

| 段 | 来源/内容 | token 数 |
|---|---|---:|
| Pi 基础 sections | `dist/core/system-prompt.js:67-147`：preamble、工具描述、rules、docs、addendum、project_context、skills、cwd、扩展 sections | 未单独记账 |
| project context | `~/.pi/agent/AGENTS.md` → `~/my/pi-stuff/config/pi/AGENTS.md`，以及 `~/AGENTS.md` → `~/.agents/AGENTS.md` → `~/my/pi-stuff/config/shared/AGENTS.md` | 未单独记账；两文件内容可直接读取 |
| skills | 当前配置启用的 skills 汇总，由 Pi `formatSkillsForPrompt` 形成；PCC turn lifecycle 可替换 prompt skills | 未单独记账；skill 描述会按激活/发现机制变化 |
| PCC GPT 模式 | `packages/pi-codex-conversion/src/prompt/build-system-prompt.ts:153-197` 依据 `gpt` 重构内容；其他扩展仍能写入 sections | 未单独记账 |
| 首轮运行时注入 | `pi-notes-compaction` window-message、`pi-shepherdr` messages/guidance、`pi-agent-board` briefing；再加当前用户消息及可能的时间提醒 | 具体首轮正文和各段 token 未见于当前日志 |

`PCC` 日志中的 8141 是请求总输入 token 数（包含 system 与消息上下文），不是 prompt 的独立计数。作为粗上界/一次请求总量参考，不将其误报成 system prompt token 数。无法给出段级近似数，证据源没有文本 payload/tokenizer 结果。

### Claude Code 路径

`~/.pi/agent/shepherdr/profiles/general/profile.json:2-7` 指定 Claude Opus 5.5 high，并引用同目录 `prompt.md`；`prompt.md:1-5` 定义授权执行、验证和交付。Explorer profile 使用 `~/.pi/agent/shepherdr/profiles/explorer/prompt.md:1-5` 的只读研究约束。Claude 本机路径通过 magpie→Claude Code 转发，因此不能把它当成 Pi 原生 provider 的工具集/消息格式。

静态重建：Pi 的基础 prompt 与 Claude profile 的 system prompt 是不同层；shepherdr profile 内容作为子进程/子 agent 指令；PCC 配置中 `scope.allProviders="off"` 且额外 provider 包含 `magpie`，PCC 对该路由适用；GPT heavy overwrite 为全局 PCC prompt 模式，没有按 Claude 单独区分。此前 Claude harness 诊断记录也指出压缩型提示影响 magpie-opus 路径：`~/.pi/agent/diagnostics/claude-harness-2026-11-05/00-baseline.md:19-20`。

没有本机 Claude 请求 body、system prompt dump 或对应 session 完整回放，故实际首轮注入内容、分段 token 数均不能确认。profile `general` 文本约 40 个空白分词（不是 tokenizer token）；不得视为模型计数。

## 2. 重复、冲突、陈旧引用

| 项目 | 观察 | 证据/判断 |
|---|---|---|
| AGENTS 首行重复 | `~/.pi/agent/AGENTS.md:1` 指定读 `~/.agents/AGENTS.md`；Pi 上下文加载两者，且共享 AGENTS 自己包含沟通与权限总规则。语义有意继承，但增加一行重复指令。 | 两条软链目标可用 `ls -l ~/.pi/agent/AGENTS.md ~/AGENTS.md ~/.agents/AGENTS.md` 核实；配置文件内容见 `config/pi/AGENTS.md:1`、`config/shared/AGENTS.md:1`。核心加载格式见 `dist/core/system-prompt.js:96-99`。 |
| show-me 双版本 | Pi AGENTS:3 要求 Pi 专属 `~/.pi/agent/skills/show-me/SKILL.md`；共享 AGENTS:4 要求通用 `~/.agents/skills/show-me/SKILL.md`。两处都是绝对路径，但后者与前者选择相反；settings `skills` 还显式排除通用路径（settings 后段）。 | 可能两种副本都在，但需要梳理唯一维护来源；当前 instruction 与用户/宿主政策冲突时，以 Pi 覆盖规则为准。 |
| unicode charts 重复包声明 | `settings.json:100` 有无版本约束 npm 包，`extensionChangelogVersions` 又记录 `@0.1.3` 和 `@howaboua/pi-unicode-charts` 的 0.1.4。版本/来源状态不一致，可能加载重复或形成遗留 changelog key；需 package resolver 实际路径确认。 | settings `:100` 及后部 `extensionChangelogVersions`。 |
| show-me 路径优先级 | 两份路径都存在，且分别指向 `~/my/pi-stuff/skills/pi/show-me` 与 `~/my/pi-stuff/skills/shared/show-me`。Pi AGENTS 明确要求 Pi 专属版；共享 AGENTS 指向通用版；settings 排除通用路径。这里是版本/来源分歧，不是失效路径。 | `ls -l ~/.pi/agent/skills/show-me ~/.agents/skills/show-me`；`settings.json:165-170`；Pi AGENTS:3、共享 AGENTS:4。 |
| 过时 API 声称 | 现有 Pi 1.5.0 核心提供结构化 section `sections`，事件 API 通过 `event.systemPromptOptions` 修改（`dist/core/system-prompt.js:67-147`、PCC `turn-lifecycle.ts:64-71`）。静态检查的当前启用 prompt 扩展并未证明有返回冻结的 `systemPrompt` 链；不能将历史源码风险直接判成当前运行故障。 | 需要逐个具体扩展版本比对旧回调返回值；此轮未确认“返回 systemPrompt 冻结链”的活跃实例。 |
| 配置路径中的包失活判断 | settings 的 `extensions: []` 表示不加载该包内扩展入口，但包本身仍可能提供 skills、commands、themes 或依赖，故不直接标成垃圾。 | `settings.json:41-50,81-83,88-95,108-...`。 |

对过时引用/工具/profile 的全文检索只覆盖 agent 配置、可见 profiles 与已安装/本地 fork 清单；没有扫描所有历史备份文件的语义引用。报告不宣称穷尽全磁盘死引用。

## 3. 子 agent prompt 与父差异

Shepherdr profile 添加在各自 profile 的 Pi session/Claude Code prompt 层，不会自动取代 Pi 父会话 system prompt。可见 profiles：

- `general`：`profile.json:2-7` 使用 Claude Opus 5.5 high；`prompt.md:1-5` 添加“执行授权、限制范围、验证交付、报告”。
- `explorer`：在 `prompt.md:1-5` 添加只读研究对象、仅写指定报告、区分事实/推断/建议等约束；具体模型见 profile.json。
- 其余 profiles (`reviewer-opus-high`、`reviewer-sol-max`、`deepseek-general` 等) 在 `~/.pi/agent/shepherdr/profiles` 和配置快照 `~/my/pi-stuff/config/pi/shepherdr/profiles` 中另有定义；其模型/提示可能不同。

和父相比：Claude 子 agent 会获得 profile prompt 与 Claude Code 自身 harness prompt；Pi 内 GPT 子 agent仍从 Pi 核心/扩展构造 prompt，profile prompt 是额外身份规则。实际是否继承父 session 消息由 shepherdr 启动参数决定，本次没有采集子进程请求 body，故不能断言“完全继承/完全隔离”。profile 仅能证明显式 profile 指令差异。

## 4. 配置垃圾、快照漂移

### 备份残留

`~/.pi/agent` 根下存在大量 `settings.json.bak-*`、`model-router.json.bak-*`、`models*.bak-*`、`*.before-*`。只扫根目录时 shell glob 的 `*.bak*` / `*.before-*` 数量受 shell/命令差异影响；样例包括 `settings.json.bak-fork-sync-20261105-235617`、`settings.json.before-magpie`、`models.before-magpie`、`models.json.before-magpie`、多个 model-router 历史副本。另有 `update-backups/`、`backups/`、`skill-backups/` 等历史归档目录。未比较每个备份与现行内容，也未评估是否仍需回滚，故仅确认为占用空间/检索噪声的候选，不主张删除。

### 已停用或空扩展配置

- `~/.pi/agent/extensions/` 中仍可见本地 `magpie.ts` 等扩展；`~/.pi/agent/disabled-extensions/` 为空（目录存在）。
- `settings.json:39-111` 一些 npm 包显式 `extensions: []`，如 `pi-simplify`、`pi-herdr`、`context7-pi`、`rpiv-todo`、codex-imagegen、pi-browser、pi-grok。它们可能是仅声明 package/skills 的依赖，也可能只是遗留，不足以判定未加载。
- `settings.json:100` 重复 unicode chart 包标识值得优先核实；未发现明确未加载但仍有专属 prompt 文本的条目。

### 仓库快照和本机漂移

- `~/.pi/agent/AGENTS.md` 是指向 `~/my/pi-stuff/config/pi/AGENTS.md` 的软链，故文件内容天然相同；不能以软链与仓库文件的“diff”证明漂移。
- `~/AGENTS.md` 指向 `~/.agents/AGENTS.md`，后者再指向 `~/my/pi-stuff/config/shared/AGENTS.md`（背景已确认）；该共享文件由另一个 config snapshot 管理。
- 本机 `~/.pi/agent/settings.json`、`pi-codex-conversion.json`、`shepherdr/profiles` 等多为本地状态，与仓库 `config/pi` 中对应文件是否同步，需对每个具体相对路径运行 `diff -u`。本次没有记录所有文件 hash/diff，结论只确认存在 snapshot 与 live config 两套来源，不足以宣称逐文件一致。

## 复核路径和限制

- Pi 拼装：`~/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js:67-147`。
- 当前主配置：`~/.pi/agent/settings.json:15-111`；PCC 配置：`~/.pi/agent/pi-codex-conversion.json`。
- PCC prompt 处理：`~/my/personal/fork/howaboua-pi-stuff/packages/pi-codex-conversion/src/prompt/build-system-prompt.ts:153-197`、`src/extension/turn-lifecycle.ts:64-71`。
- 近期日志：`~/.pi/agent/pi-codex-logs/2026-11-08T08-34-24-129Z_01a1ba4b-5f01-709f-9178-0bfdc0d0c226.log:17-24`。
- profile 源：`~/.pi/agent/shepherdr/profiles/*/profile.json`、`prompt.md`。
- 本报告没有运行 prompt tokenizer，也没有抓取当前进程 `getSystemPrompt()` 返回值、Claude Code 实际 request payload 或首轮注入 message body。段级 token 数/精确完整文本因此留空；8141 仅为 PCC 记录的模型调用输入总量。
