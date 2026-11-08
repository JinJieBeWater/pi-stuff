# Pi skills 共享审计与落地（2026-11-09）

范围：`~/.pi/agent/skills` 本地 skill，以及 `~/.pi/agent/settings.json` 中 `packages` 实际提供的 skill。先只读分类，再按用户的跨 agent 共用目标实施。全局指令和发现入口见[跨 agent 配置](../config/shared/README.md)；本报告记录 skill 分类及最终落地。

## 1. 先决机制（决定怎么链）

- Pi 依次扫描 `~/.pi/agent/skills`、`~/.agents/skills` 和包内 skill（`dist/core/package-manager.js:2168-2178`）。
- `realpath` 相同的重复项会被静默跳过；同名但 realpath 不同时先发现的胜出，并报 `collision` 警告（`dist/core/skills.js:322-350`）。
- 因此把 Pi 源目录软链进 `~/.agents/skills` 不会在 Pi 里产生重复或警告。反过来，复制一份就会触发 collision。
- 调用限制有宿主差异：本次为仅手动调用的 audit-neighbor 补 `agents/openai.yaml` 的 `policy.allow_implicit_invocation: false`，沿用 `pi-stuff/skills/shared/show-me/agents/openai.yaml` 的适配方式；原 `disable-model-invocation` 保留。其他宿主须核对自身的调用限制支持。
- 本机 `~/.pi/agent` 不是 git 仓库；本次将三个可跨宿主执行的自有 skill 纳入 `pi-stuff/skills/shared/`，原 Pi 入口和新共享入口软链到同一源。含本机网络地址的 configure-kvm-moshi-via-tailscale 实体放在 `~/.agents/skills`，三个宿主共享，不入公开仓库。

## 2. 分类结论

### A. 可直接共享：依赖都在目录内，正文只要求 shell 和文件读写

**全部已导出：** 本节 13 项，加上完成调用策略适配的 audit-neighbor，共 14 项。每项均有 `~/.agents/skills`、`~/.codex/skills`、`~/.claude/skills` 入口；Claude 原有的 skill-creator 同源软链保留。全程保留第三方正文和自有工作流。

| skill                                                                                                                      | 来源                                                 | 依赖检查                                                             | 备注                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ponytail-review                                                                                                            | git:DietrichGebert/ponytail                          | 无外部引用                                                           | 全局 AGENTS.md 指定的默认审查 skill，优先级最高。上游 README 允许其他 agent 以 skill 方式安装；装 Claude/Codex 原生 plugin 会连带常驻 ponytail 模式和 hooks，超出本需求 |
| skill-creator                                                                                                              | npm @howaboua/pi-skill-skill-creator                 | `references/`、`scripts/skill-efficiency-check.py`（相对路径，存在） | `~/.claude/skills/skill-creator` 已是同一目标的软链                                                                                                                     |
| agents-md                                                                                                                  | npm @howaboua/pi-skill-agents-md                     | 1 个 reference，存在                                                 | 与 `improve-agents-md`、`writing-for-agents` 职责重叠，见 §4                                                                                                            |
| adversarial-qa                                                                                                             | npm @howaboua/pi-skill-adversarial-qa                | 1 个 reference，存在                                                 |                                                                                                                                                                         |
| agent-session-diagnostics、agent-tool-design、extension-design、harness-checklist、instruction-calibration、prompt-caching | npm @howaboua/pi-skill-harness-and-agent-engineering | 只有 agent-tool-design 引用 `references/pi.md`，限 Pi 场景，存在     | 内容不绑宿主；需要逐个链，因为每个 skill 是包内一个子目录                                                                                                               |
| configure-kvm-moshi-via-tailscale                                                                                          | 本地                                                 | 无引用；用到 hc/herdr/brew/systemd CLI                               | Pi 在这里是被安装的软件，不是执行宿主                                                                                                                                   |
| diagnose-pi-internals                                                                                                      | 本地                                                 | 8 个 reference，全部存在                                             | 主题是 Pi 内部，但执行只需读源码和会话，其他 agent 排查 Pi 时能用上                                                                                                     |
| pi-magpie-same-model-failover                                                                                              | 本地                                                 | 无引用；用到 magpie/claude/hc CLI                                    | 执行与宿主无关                                                                                                                                                          |

### B. 调用适配与暂不共享项

| skill                                                   | 条件                                                              | 原因                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| audit-neighbor（自有，`deliver.md` 相对引用正常）       | 已纳入 `skills/shared/audit-neighbor` 并补 Codex 调用策略，已共享 | 依赖 `hc`（`~/.local/bin/hc` 存在），不依赖 Pi 工具；保留仅手动调用 |
| scheduler（npm agents-cron，自带 `agents/openai.yaml`） | 先全局安装 `agents-cron` CLI（目前 PATH 上没有）                  | 正文为非 Pi 宿主写了 CLI 路径；每次运行仍由 Pi Task Session 执行    |

### C. 保留在 Pi：依赖 Pi 工具或扩展

| skill                                               | 绑定点                                                                                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| classifier-first                                    | Pi Codemode `models` 分类 API（`references/pi-classifier.md`）                                                                                     |
| multi-agent-review                                  | Shepherdr `agents` spawn，以及 reviewer-* profile、`/skill:` 用法                                                                                  |
| context7-docs                                       | 扩展工具 `resolve-library-id`、`query-docs`；其他 agent 应原生接入 Context7 MCP/plugin，`ctx7` CLI 未安装                                          |
| autoresearch-create / -finalize / -hooks            | 扩展工具 `init_experiment` / `run_experiment` / `log_experiment` 和配套会话文件                                                                    |
| pi-evals                                            | frontmatter `compatibility: Pi; exec_command、apply_patch、ask`                                                                                    |
| show-me（Pi 版，链到 `pi-stuff/skills/pi/show-me`） | 有意拆分：Pi 版含原生渲染说明；通用版 `shared/show-me` 已在 `~/.agents/skills`，并被 settings `-~/.agents/skills/show-me` 排除在 Pi 之外。无需处理 |

不在范围内：ponytail 包里其余 skill（settings 只启用了 `ponytail-review`）；各本地包 `node_modules/.../examples/.../SKILL.md`（没有 `pi.skills` 声明，不会加载）。

## 3. 现有共享目录状态

- `~/.agents/skills`：没有坏链接；A、B 两类候选与现有目录无同名冲突。
- 已有的不一致（与本次共享无关，供参考）：
  - `~/.agents/skills/gpt-image2-ppt-skills` 的 frontmatter `name: gpt-image2-ppt` 与目录名不一致。Pi 容忍，其他宿主可能拒绝加载。
  - `~/.pi/agent/skills/glyph-kit`、`glyphcss-diagrams` 是指回 `~/.agents/skills` 的软链，realpath 相同会被静默去重，属于冗余，可删可留。
  - settings `skills` 中的 `-/Users/jinjiebewater/.agents/skills/herdr-gpui-browser` 指向不存在的路径（该 skill 在 `~/.claude/skills`），是过期条目，无害。
  - `~/.codex/skills/xlsx -> ../../.agents/skills/xlsx` 是坏链，目标不存在。

## 4. 共享后的路由重叠（建议在入口指令中明确，不改 skill 本身）

- 审查：`ponytail-review`（默认）、`code-review`（规范验收）、`adversarial-qa`（反例/变异测试）。现有 AGENTS.md 已写明前两者的分工。
- 写指令：`writing-for-agents`（AGENTS.md 规定必读）、`skill-creator`、`agents-md`、`improve-agents-md`。它们的描述有交叉，其他 agent 可能只加载其中一个。

## 5. 最终入口与验证

| 共享 skill                                | `~/.agents/skills/<name>` 的目标                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| agents-md                                 | `~/.pi/agent/npm/node_modules/@howaboua/pi-skill-agents-md/skills/agents-md`                  |
| skill-creator                             | `~/.pi/agent/npm/node_modules/@howaboua/pi-skill-skill-creator/skills/skill-creator`          |
| adversarial-qa                            | `~/.pi/agent/npm/node_modules/@howaboua/pi-skill-adversarial-qa/skills/adversarial-qa`        |
| ponytail-review                           | `~/.pi/agent/git/github.com/DietrichGebert/ponytail/skills/ponytail-review`                   |
| 六个 harness-engineering skill（见 A 类） | `~/.pi/agent/npm/node_modules/@howaboua/pi-skill-harness-and-agent-engineering/skills/<name>` |
| 三个归档的自有 skill（含 audit-neighbor） | `~/my/pi-stuff/skills/shared/<name>`；旧 Pi 入口也指向同一源                                  |
| configure-kvm-moshi-via-tailscale         | 实体在 `~/.agents/skills/configure-kvm-moshi-via-tailscale`；Pi/Codex/Claude 入口指向它       |

- 四个自有 skill 搬迁前后逐文件对比一致，仅 audit-neighbor 新增 Codex 策略文件；随后按仓库格式规范空白和表格，工作流正文保留。相对引用均可解析。审查后将机器专用网络 skill 留在本机共享目录、项目构建约定移入 `~/.pi/agent/local-environment.md`，两者不入库。
- Pi 原生 `loadSkills` 实跑：14 个导出项各出现一次，没有加载诊断或 collision，audit-neighbor 的仅手动调用标记保留。
- Pi 原生 `loadProjectContextFiles` 实跑：可发现主目录的共享 AGENTS.md 和 Pi 专属入口。
- 14 项共享及 Codex/Claude 入口、四个旧 Pi 入口、指令软链和 SKILL.md 相对引用逐项核对通过；本任务文件的格式检查与 `git diff --check` 通过。
- `bunx vp test run test/package.test.ts`：5 项通过，原有 show-me 调用差异与包发现行为保留。
- skill-efficiency 检查：已检查的原样迁移项无 Issue；ponytail-review 的 YAML 折叠描述被简易检查器读成 `>`，audit-neighbor 和 pi-magpie 原描述有触发措辞提示，未改上游或原工作流。
- 未启动新的真实 Codex/Claude/Pi 模型会话验证选择行为；文件发现与解析不证明实际模型一定选用。未执行各环境运维 skill 的安装、重启等动作。
- 已有 xlsx 坏链、无害旧排除项和其他目录命名未改；不删除用途不明的既有入口。npm/git 包卸载或改名、移动仓库后，对应软链会失效，变更来源后应重查。
