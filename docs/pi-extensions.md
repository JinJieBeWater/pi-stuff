# 我的 Pi 扩展清单

更新于 2026-10-30，按本机与 Linux/KVM 的用户级配置核对，共 32 个 package。项目目录可以额外加载或覆盖资源；package 数量不等于扩展入口、工具或能力的数量。

这里记录选型、用途和加载方式，不是个人配置备份，也不建议全部安装。自写扩展的源码在本仓库；第三方包仍从各自上游安装。

## Packages

| 来源                                                              | 资源 / 加载方式                                 | 我用来做什么                                   |
| ----------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| `npm:@geminixiang/pi-simplify`                                    | Extension，适配 / deferred                      | 简化与代码质量检查                             |
| `npm:@ogulcancelik/pi-herdr`                                      | Extension，原生                                 | 控制 Herdr 的 workspace、tab、pane 和 agent    |
| `npm:@upstash/context7-pi`                                        | Extension + Skill + Prompt，工具适配 / deferred | 查 library 文档和示例                          |
| `npm:@gotgenes/pi-permission-system`                              | Extension，原生                                 | 工具、命令与文件访问的权限规则                 |
| `npm:@howaboua/pi-cache-hit-predictor`                            | Extension，原生                                 | 预测切换模型或思考档位后的 prompt cache 命中   |
| `git:github.com/angristan/pi-extensions`                          | 扩展集合，仅启用下文的 9 项                     | TUI 显示、标题和统计                           |
| `npm:@howaboua/pi-codex-conversion`                               | Extension，原生                                 | 为 Codex 模型调整工具与 prompt 契约            |
| `npm:@furbyhaxx/pi-session-naming`                                | Extension，原生                                 | 会话命名、浏览和管理                           |
| `npm:@howaboua/pi-auto-trees`                                     | Extension，原生                                 | 用 `/marker`、`/end` 推进增量长任务            |
| `npm:@howaboua/pi-ask`                                            | Extension，原生                                 | 交互决策、review 分流和 handoff                |
| `npm:@howaboua/pi-smart-btw`                                      | Extension，原生                                 | 异步侧会话提问，再显式注入主会话               |
| `npm:@howaboua/pi-skill-adversarial-qa`                           | Skill，原生                                     | 用可执行反例检查边界与回归                     |
| `npm:@howaboua/pi-skill-agents-md`                                | Skill，原生                                     | 编写和维护分层 AGENTS.md                       |
| `npm:@howaboua/pi-skill-anti-ai-copy`                             | Skill，原生                                     | 保留作者语气，减少空泛文案                     |
| `npm:@howaboua/pi-skill-skill-creator`                            | Skill，原生                                     | 创建、验证和维护 Skills                        |
| `git:github.com/DietrichGebert/ponytail`                          | Extension + Skill，Skill 白名单                 | 最小实现模式与 ponytail-review                 |
| `npm:@juicesharp/rpiv-todo`                                       | Extension，适配 / direct                        | 持久任务清单                                   |
| `npm:pi-web-access`                                               | Extension，原生 / auto                          | Web search、网页抓取、PDF 和视频分析           |
| `npm:pi-autoresearch`                                             | Extension + Skill，保留原生模式开关             | 运行、测量并保留或丢弃实验                     |
| `npm:@howaboua/pi-codex-web-run`                                  | Extension，原生                                 | Codex Web 搜索与导航                           |
| `npm:@howaboua/pi-codex-imagegen`                                 | Extension，适配 / deferred                      | 图像生成与编辑                                 |
| `npm:@howaboua/pi-shepherdr`                                      | Extension，原生                                 | 持久、阻塞式或异步子 agent                     |
| 本地 `pi-evals`                                                   | Skill，原生；不收录于本仓库                     | 设计、审计和迭代 evals                         |
| `npm:@howaboua/pi-browser`                                        | Extension，原生                                 | 控制已登录的浏览器                             |
| `npm:@howaboua/pi-skill-harness-and-agent-engineering`            | Skill，原生                                     | Harness、工具、指令和缓存工作流                |
| `npm:@howaboua/pi-agent-board`                                    | Extension，原生                                 | Agent 消息板和只读查看器                       |
| [本地 `pi-lovely-mermaid`](../packages/pi-lovely-mermaid)         | Extension，原生                                 | 用终端字符图显示 Mermaid                       |
| `npm:@howaboua/pi-notes-compaction`                               | Extension，原生                                 | 持久 notes 与 notes 引导的上下文换窗           |
| `npm:@ogulcancelik/pi-herdr-worktree-jump`                        | 保留安装，入口关闭，无适配注册                  | 旧搬迁扩展，已由下方自写扩展替代               |
| `npm:@howaboua/pi-unicode-charts`                                 | Extension，原生                                 | 终端柱状图、折线图、散点图、sparkline 和热力图 |
| [本地 `pi-borderless-tables`](../packages/pi-borderless-tables)   | Extension，原生                                 | 无框对齐表格，只改变显示                       |
| [本地 `pi-herdr-session-move`](../packages/pi-herdr-session-move) | Extension，原生；工具 deferred                  | 把当前持久化对话转到另一已有目录               |

## angristan：实际启用的 9 项

| 入口                 | 用途                            |
| -------------------- | ------------------------------- |
| `accent-color`       | 固定输入框强调色                |
| `auto-session-title` | 自动生成会话标题                |
| `cached-line-resets` | 缓存稳定的 TUI 行处理           |
| `code-blocks`        | 代码块语法高亮和分隔线          |
| `herdr-tab-title`    | 将 Pi 会话名同步到 Herdr 标签页 |
| `reload-all`         | 确认后重载同机多个 Pi 会话      |
| `turn-stats`         | 每轮耗时、Token 与费用统计      |
| `hyperlinks`         | 将本地文件路径显示成可点击链接  |
| `working-timer`      | 工作阶段和实时计时              |

`better-native-pi`、`context-inspector`、`notifications` 已关闭。没有手动删除集合中未启用的源码目录。

## `extensions: []` 不一定表示功能关闭

Simplify、Context7、Todo、Imagegen 的原生入口被过滤，由个人 `deferred-tools` 适配层调用同一上游 factory，以避免重复加载并控制工具暴露方式，没有修改上游源码。

- `direct`：工具直接向模型提供。
- `deferred`：工具仍注册，但完整定义按需发现，不是禁用。
- 原生自动加载：仍可能受运行环境、模型、模式或用户设置约束，不等于每个功能一直运行。

例外是旧 Worktree Jump：它的入口与适配注册都已关闭，确实不再加载。

个人 Skill 查找使用原生目录和 `skill_search`；旧 `pi-skill-manager` 已移出 package 清单，原目录与归档保留。Skill 的默认提示词展示范围与“是否已注册、能否显式调用”是不同的事。

## 本机与 KVM 的差异

共享选择保持一致，KVM 保留 Linux 启动和网页抓取配置、专用 profiles，以及更严格的敏感文件规则；不启用 Opus 或 Claude 订阅路由。KVM 额外保留一个 footer-status 过滤入口。

本清单不保存这些策略的完整配置、provider 凭据、登录状态、会话数据或备份。新增或停用 package 时手动更新清单；安装版本由实际环境和各自的 lockfile 管理。
