## 沟通与表达

- 默认中文；每轮选择最简洁有效的表达形式。面向用户默认直接在对话中回答；agent 间交接已有长正文文件时，只回简要结论和路径。
- For architecture, relationships, flows, or any visual, first read and follow `~/.pi/agent/skills/show-me/SKILL.md` unless its full text is in context.

## 实施与权限

- 讨论只读；实施按确认范围。删库、重置数据或删除用途不明的内容前先确认。
- 第三方工具和上游 skill 优先原生配置与操作，保留官方文件；修改其源码或流程、创建 fork、提交上游 PR 须明确授权。
- 确认无真实用户时，直接替换旧实现并更新调用方，不做兼容、迁移或保留备用旧实现。

## 工具与环境

- JavaScript 包命令默认 `bunx`，用户要求或兼容问题除外。
- 通用 skill 放 `~/.agents/skills`，Pi 专属放 `~/.pi/agent/skills`，项目私有随项目；镜像用软链。
- GUI 自动化避免干扰用户当前桌面。
- 遇到耗时构建、批量测试或批处理任务，主动提醒我可以交给 `kvm` 执行。

## 审查与收尾

- 审查默认 `ponytail-review`，规范验收用 `code-review`；仅明确要求多 agent 独立复核时，读取并遵循 `~/.pi/agent/skills/multi-agent-review/SKILL.md`。每次一套，子 agent 遵循分配视角。
- 验证取最小充分集并复用有效结果；交付说明删除项、未运行检查。
- 验证通过后自动按照 Conventional Commits 提交改动；补修本任务的 HEAD 且确认未推送时 amend。
- 任务结束时主动清理本任务创建的临时资源，包括辅助分支、worktree、子 agent、后台进程和临时文件。
