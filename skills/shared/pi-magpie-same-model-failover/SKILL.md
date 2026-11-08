---
name: "pi-magpie-same-model-failover"
description: "Pi 中配置 Magpie 同型号后备、纠正 Sonnet/Haiku 被换成 Opus，或续接仍持旧路由的 Claude Code 会话。不用于跨型号智能分流。"
version: 2
created: "2026-10-13"
updated: "2026-10-31"
---

# Magpie 同型号后备

## Workflow

1. **锁定意图与入口。** “供应商后备”默认保留所选模型及思考档位；逐槽记录主、Opus、Sonnet、Haiku、Fable、子代理和后台入口。区分默认直连、同型号供应商后备、授权的跨型号降级。只询问会改变核心路由的剩余决定。
2. **读本版原生契约与现场。** 找到安装的 Magpie，读 `--help`、`group --help`、`provider`、目标 agent help；交叉检查官方 `https://github.com/yetone/magpie/blob/main/docs/reference.md`。读当前 providers/settings、近期 usage/routing 及活跃会话 ID。凭据只送原有端点；客户端限定 Claude Code 时，用真实 `claude` CLI 发生成请求。
3. **先检查是否换型号。** Provider 级 `fallback` 是固定模型列表；`claude.fallback=[tokenflux/claude-opus-…]` 会让原 Sonnet/Haiku 失败也转 Opus，不是同型号后备。模型列表查询和 CLI 请求名均不能证明实际型号；检查 `usage.provider`、`served` 和 routing `tries`。路由卡顶层 `provider` 可保留原主供应商，不能据此误判实际服务方。Magpie/客户端价格估算不是供应商实际账单。
4. **原生逐型号路由。** 先做私密备份。复用同名自动组，每组只有官方同型号与后备同型号，顺序官方在前，`routing=order`；隐藏组先恢复。将各模型槽位和子代理绑定对应组，Haiku 保留固定低档；Fable 为“同主模型”时保留该语义。清除错误的统一模型 fallback，保留其他提供商、账号排序和无关客户端设置。

   已验证的本版命令形状（替换实际 IDs）：

   ```sh
   magpie group set auto-claude-sonnet-5-5 models=claude/claude-sonnet-5-5,tokenflux/claude-sonnet-5-5 routing=order stays=auto
   magpie claude sonnet 'group/auto-claude-sonnet-5-5[1m]'
   magpie claude subagent 'group/auto-claude-sonnet-5-5[1m]'
   magpie provider fallback claude none
   ```

   `provider fallback claude` 无后续参数只查看，不会清除。更新上游 CLI 后重新核实。

5. **测新入口，再处理旧会话。** 使用真实 Claude Code、禁用不必要工具/MCP，在新证据目录验证每个组与默认子代理。当前配置不会自动替换已打开/恢复会话持有的显式 `claude/model` ID；组就绪但旧 ID 仍可能官方额度 429。仅获准后重启活跃会话：先保存任务边界、已交回子代理结果和未完成工作；原终端/cwd 用原 `--resume <session-id>`，显式选择正确主路由组，避免恢复旧模型覆盖。继续最后用户任务，不新建重复任务。控制入口按运行时选择：有 `HC_TERMINAL_SOCKET` 时优先 Core，须同时有 `HC_TERMINAL_ID`，先读 `hc --skill`，用 `hc get <terminal>` 核对目标；Core 标记不完整时先核查，不回落到继承的 TUI 身份。无 Core socket 且 `HERDR_ENV=1`、`HERDR_PANE_ID` 非空时读 `herdr --skill`，用旧 TUI pane 命令核对目标。没有完整标记时从实际宿主入口确认目标，不因缺少 `HERDR_ENV` 阻断 Magpie 配置。终端 ID 与 Claude 会话 ID 分别核对，操作仍限用户批准的会话重启范围。
6. **验收真实原会话。** 新进程必须保留原会话 ID，原任务继续产生请求和工具调用。核对主模型仍主模型、新子代理仍其型号、后台仍所选型号；旧子代理若保存了旧供应商 ID，利用其已保存结果，让正确同型号的新子代理只续做未完成部分。尚未观察原会话新请求时，不宣称已全面生效。

## Verification

- 每组成员的实际模型 ID 一致；官方优先，后备供应商第二；无误设跨型号统一 fallback。
- Opus/Sonnet/Haiku 真实生成成功，实际 `served` 与选定型号匹配，Haiku 档位符合配置。
- 真实子代理被启动且完成；其实际型号匹配，不只检查配置文本。
- 获准重启后，两旧会话 ID/任务进度保留，最新请求成功，主/子代理不串型号。
- 清楚列出移除的错误配置、未做的 GUI/稳定性/实际账单核查；原任务继续运行不等于原任务成果已完成。
