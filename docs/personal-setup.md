# 个人配置清单

[简体中文](personal-setup.md) | [English](personal-setup.en.md)

核对日期：2026-11-01。按本机配置与已安装资源整理：38 个配置包，原生自动发现启用 36 个扩展入口，工具适配另行加载 4 个入口；旧版 Herdr TUI 还会按环境加载一个 `pi-herdr` 入口。入口数包含包内 changelog 和两个本机 hook，不含宿主内置扩展；不等于功能或工具数量。

这些第三方包与本机配置不随 `pi-stuff` 自动安装。配置、指令、Shepherdr 角色和 todo 指引见[个人配置](../config/README.md)；构建来源见[维护记录](local-maintenance-audit-2026-11-01.md)。这里记录配置的启用状态，当前会话是否已加载取决于最近一次启动或 `/reload`。

## 本仓库与本地 fork

[本仓库九项扩展](../README.md#自写扩展)全部启用，从 `~/my/pi-stuff/packages/` 加载；Pi 版 `show-me` 通过 `~/.pi/agent/skills/show-me` 软链加载。

| 扩展                                                                               | 当前来源与用途                                                                                                                |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [pi-codex-conversion](https://www.npmjs.com/package/@howaboua/pi-codex-conversion) | `~/my/personal/fork/howaboua-pi-stuff/packages/pi-codex-conversion/dist/index.js`；PCC `normal` 模式与 Codex prompt、工具适配 |
| [pi-shepherdr](https://www.npmjs.com/package/@howaboua/pi-shepherdr)               | 同一 fork 的 `packages/pi-shepherdr/dist/index.js`；持久、阻塞式或异步子 agent                                                |

`pi-skill-discovery` 排在 PCC 前加载。npm 目录里残留的同名包不代表实际从 npm 加载。

## 已启用的第三方扩展包

未特别标注的包由 `npm:` 来源加载，包内扩展入口全部启用；资源过滤以[设置快照](../config/pi/settings.json)为准。

| 包                                                                                       | 用途与加载说明                                                         |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [pi-permission-system](https://www.npmjs.com/package/@gotgenes/pi-permission-system)     | 工具、命令与文件访问的权限规则；当前 `yoloMode: true`                  |
| [pi-cache-hit-predictor](https://www.npmjs.com/package/@howaboua/pi-cache-hit-predictor) | 预测模型或思考档位切换后的 prompt cache 命中                           |
| [angristan/pi-extensions](https://github.com/angristan/pi-extensions)                    | Git 来源；只启用下文列出的五项                                         |
| [pi-session-naming](https://www.npmjs.com/package/@furbyhaxx/pi-session-naming)          | 会话命名、浏览和管理                                                   |
| [pi-auto-trees](https://www.npmjs.com/package/@howaboua/pi-auto-trees)                   | 用 `/marker`、`/end` 为增量长任务生成分支摘要                          |
| [pi-ask](https://www.npmjs.com/package/@howaboua/pi-ask)                                 | 交互决策、review 分流和 handoff                                        |
| [pi-smart-btw](https://www.npmjs.com/package/@howaboua/pi-smart-btw)                     | 异步侧会话提问，再显式注入主会话                                       |
| [Ponytail](https://github.com/DietrichGebert/ponytail)                                   | Git 来源；最小实现模式，Skill 只选择 `ponytail-review`                 |
| [pi-web-access](https://www.npmjs.com/package/pi-web-access)                             | 网页搜索、抓取、PDF 和视频分析                                         |
| [pi-autoresearch](https://www.npmjs.com/package/pi-autoresearch)                         | 运行、测量并保留或丢弃实验，附带三个 Skills                            |
| [pi-codex-web-run](https://www.npmjs.com/package/@howaboua/pi-codex-web-run)             | Codex Web 搜索与导航                                                   |
| [pi-browser](https://www.npmjs.com/package/@howaboua/pi-browser)                         | 控制已登录的浏览器；npm 目录中安装本地 tarball，含 changelog 入口      |
| [pi-agent-board](https://www.npmjs.com/package/@howaboua/pi-agent-board)                 | Agent 消息板与只读查看器，含 changelog 入口                            |
| [pi-notes-compaction](https://www.npmjs.com/package/@howaboua/pi-notes-compaction)       | 持久 notes 与上下文换窗；npm 目录中安装本地 tarball，含 changelog 入口 |
| [pi-unicode-charts](https://www.npmjs.com/package/@howaboua/pi-unicode-charts)           | 终端柱状图、折线图、散点图、sparkline 和热力图；配置固定 `@0.1.3`      |
| [pi-grok](https://github.com/stnly/pi-grok)                                              | Git 来源；通过 Grok 订阅搜索 X                                         |

angristan 集合的启用入口：

- 显示：`cached-line-resets`、`code-blocks`。
- 状态：`turn-stats`、`working-timer`。
- 会话：`reload-all`。

`accent-color`、`hyperlinks` 和上游 `auto-session-title` 均停用。自动标题由本仓库的 [pi-auto-session-title](../packages/pi-auto-session-title/README.md) 负责，Herdr 标签页同步由 [pi-herdr-tab-title](../packages/pi-herdr-tab-title/README.md) 负责。

## 由管理扩展加载的包

下列五个包在 `settings.json` 中显式设置 `extensions: []`，关闭原生自动入口，避免与管理扩展重复注册。前四个由 [pi-tool-exposure 配置](../config/pi/pi-tool-exposure.json)加载；`pi-herdr` 由 [pi-context-policy 配置](../config/pi/pi-context-policy.json)按环境加载。

| 包                                                                             | 实际加载与工具暴露配置                                                                                                 |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| [pi-simplify](https://www.npmjs.com/package/@geminixiang/pi-simplify)          | 由工具适配加载；`simplify_candidates`、`code_smell_scan`、`code_smell_findings` 为 `deferred`                          |
| [context7-pi](https://www.npmjs.com/package/@upstash/context7-pi)              | 由工具适配加载；`resolve-library-id`、`query-docs` 为 `deferred`；`context7-docs` Skill 和一个 prompt 模板仍由原生发现 |
| [rpiv-todo](https://www.npmjs.com/package/@juicesharp/rpiv-todo)               | 由工具适配加载；`todo` 为 `direct`；[todo 指引](../config/rpiv-todo/config.json)另行归档                               |
| [pi-codex-imagegen](https://www.npmjs.com/package/@howaboua/pi-codex-imagegen) | 由工具适配加载；`imagegen` 为 `deferred`                                                                               |
| [pi-herdr](https://www.npmjs.com/package/@ogulcancelik/pi-herdr)               | 仅 `HERDR_ENV=1`、`HERDR_PANE_ID` 非空、`HC_TERMINAL_SOCKET` 缺失或为空时加载，即旧 TUI；Core 环境不加载               |

`direct` 将工具定义直接展示给模型；`deferred` 通过 `tool_search` 按需发现。工具适配仍在启动时加载扩展代码。Skills、prompt 模板和宿主内置能力单独计算。

## 只提供 Skills 的包

| 包                                                                                                                       | 用途                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| [pi-skill-adversarial-qa](https://www.npmjs.com/package/@howaboua/pi-skill-adversarial-qa)                               | 用可执行反例检查边界与回归                                |
| [pi-skill-agents-md](https://www.npmjs.com/package/@howaboua/pi-skill-agents-md)                                         | 编写和维护分层 AGENTS.md                                  |
| [pi-skill-anti-ai-copy](https://www.npmjs.com/package/@howaboua/pi-skill-anti-ai-copy)                                   | 保留作者语气，减少空泛文案                                |
| [pi-skill-skill-creator](https://www.npmjs.com/package/@howaboua/pi-skill-skill-creator)                                 | 创建、验证和维护 Skills                                   |
| [pi-skill-harness-and-agent-engineering](https://www.npmjs.com/package/@howaboua/pi-skill-harness-and-agent-engineering) | Harness、工具、指令和缓存工作流，共六个 Skills            |
| `~/my/tools/pi-evals`                                                                                                    | 独立维护的本地 Skill 包，用于 eval 设计、审计与 hillclimb |

共享和 Pi 专属目录中的其他 Skills 仍由各自来源维护；本页不复制完整 Skill 目录。

## 本机自动发现的入口

`~/.pi/agent/extensions/` 还有两个启用入口，不在上述 38 个包中：

- `herdr-agent-state.ts`：Herdr 安装器管理的 agent 状态集成。
- `moshi-hooks.ts`：Moshi Hook 生成的生命周期事件集成。

它们依赖本机安装器和环境，由对应工具维护，源码不复制到本仓库。原生 Codemode 由 `settings.json` 开启，PCC 使用 `normal`，不将宿主能力重复记作第三方扩展。
