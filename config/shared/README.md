# 跨 agent 的个人配置

通用指令源是本目录的 [AGENTS.md](AGENTS.md)，本机 `~/.agents/AGENTS.md` 软链到它，Codex 和 Claude 的全局文件显式读取。Pi 使用独立的[全局指令](../pi/AGENTS.md)，不读取本文件；两份各自维护。

```text
~/.codex/AGENTS.md ──读取──┐
~/.claude/CLAUDE.md ─读取──┴─→ ~/.agents/AGENTS.md → config/shared/AGENTS.md
~/.pi/agent/AGENTS.md → config/pi/AGENTS.md（独立）

~/.agents/skills/<name>/ → 原 skill 目录（含 references、scripts 等）
```

宿主不一定自动读取 `~/.agents/AGENTS.md`。需要时在其全局指令或项目 AGENTS.md 中加入：

```markdown
始终读取并遵循 `~/.agents/AGENTS.md`。
```

SKILL.md 的格式与自动发现目录也分开处理：共享目录提供标准 skill 包；宿主支持 `~/.agents/skills` 时直接加载，否则可在宿主 skill 目录添加单项软链。通用指令还提供按 name、description 选取 skill 的文件读取入口，供没有原生 skill 搜索工具的 agent 使用。

## 本机整理与边界

- 通用沟通、权限、agent 文本写作、验证、提交和清理规则在共享源。Pi 版以它为底，并入 ask、Shepherdr profiles、手动多 agent 审查和本机环境规则，去掉与 Pi 的 skill_search、ponytail 重复的条目；修改共享规则时按需同步 Pi 版。本机项目环境约定保存在不入库的 `~/.pi/agent/local-environment.md`。
- Codex 和 Claude 的全局文件原先已读取共享源，保留各自额外规则。
- 本次从 Pi 安装来源暴露的通用 skill、依赖和未导出原因见[审计清单](../../docs/pi-shared-skills-audit-2026-11-09.md)。上游目录原样保留，整个目录软链，不复制 SKILL.md。
- 含本机网络地址的 `configure-kvm-moshi-via-tailscale` 实体保留在 `~/.agents/skills`，由 Pi/Codex/Claude 软链使用；它和本机环境补充规则均不进入公开仓库，换机器时私下恢复。
- Pi 扩展、工具注册、MCP、模型、认证、UI 和宿主生命周期配置仍归 Pi。通用 skill 可读不等于宿主具备其调用的工具；使用前按 skill 的前置条件核对。
- show-me 保留[既有两个版本](../../skills/README.md)：共享版保持显式调用策略，Pi 版保留自动发现和原生渲染适配。

## 恢复

先按原来源安装 skill 与所需工具，再链接；软链指向的源必须存在。下面是尚未建立入口时的命令，已有文件先对比合并，不直接覆盖：

```sh
ln -s ~/my/pi-stuff/config/shared/AGENTS.md ~/.agents/AGENTS.md
```

各 skill 的源路径见审计清单；目录软链例如：

```sh
ln -s ~/.pi/agent/npm/node_modules/@howaboua/pi-skill-agents-md/skills/agents-md ~/.agents/skills/agents-md
ln -s ../../.agents/skills/agents-md ~/.codex/skills/agents-md
ln -s ../../.agents/skills/agents-md ~/.claude/skills/agents-md
```

这些入口只在当前机器生效；换机器需重新安装来源并调整路径。卸载 Pi 包或移动仓库会使相应软链失效。更新后重开目标 agent 会话；现有会话已经加载的指令不会自动刷新。
