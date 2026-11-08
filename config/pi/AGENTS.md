始终读取并遵循 `~/.agents/AGENTS.md`。

- 在 Pi 中以 `~/.pi/agent/skills/show-me/SKILL.md` 代替通用 show-me。
- grill 等访谈提问一律用 ask：同轮 frontier 合为一次调用，每题一个 prompt，首个 choice 是推荐项并标「（建议）」，理由写进它的 description；此格式优先于 skill 自带的问答格式。
- 子 agent 按任务分两类：改代码、文档和评审在本机用 Claude Opus profile（`general`、`reviewer-opus-high`）；只能在 KVM 做的 Linux 构建、门禁、实跑和读图才开到 KVM，用 `kvm-sol`（`machine` 填 `agents list` 返回的 ID）。KVM 跑不了 Claude 模型。一次性 KVM 命令用 `hc run --on kvm`。
- 本机环境补充规则：若 `~/.pi/agent/local-environment.md` 存在，读取并遵循；该文件不入库。
- 仅明确要求多 agent 独立复核时，读取并遵循 `~/.pi/agent/skills/multi-agent-review/SKILL.md`。
