# 个人配置清单

自用的第三方扩展和 Skill 包，按单一用途分类；实际启用情况以 Pi 配置为准。

清单中的项目不随 `pi-stuff` 自动安装。本仓库维护的扩展和 Skills 见[仓库 README](../README.md)。

## 界面

- [pi-unicode-charts](https://www.npmjs.com/package/@howaboua/pi-unicode-charts)：终端柱状图、折线图、散点图、sparkline 和热力图
- [angristan/pi-extensions](https://github.com/angristan/pi-extensions)：TUI 显示、标题与统计的扩展集合

angristan 集合中的具体条目：

- 显示：`accent-color`、`cached-line-resets`、`code-blocks`、`hyperlinks`。
- 状态：`turn-stats`、`working-timer`。
- 会话：`auto-session-title`、`reload-all`；Herdr 标签页同步由 [pi-herdr-tab-title](../packages/pi-herdr-tab-title/README.md) 负责。

## 会话

- [pi-session-naming](https://www.npmjs.com/package/@furbyhaxx/pi-session-naming)：会话命名、浏览和管理
- [pi-smart-btw](https://www.npmjs.com/package/@howaboua/pi-smart-btw)：异步侧会话提问，再显式注入主会话

## 上下文

- [pi-notes-compaction](https://www.npmjs.com/package/@howaboua/pi-notes-compaction)：持久 notes 与上下文换窗
- [pi-auto-trees](https://www.npmjs.com/package/@howaboua/pi-auto-trees)：用 `/marker`、`/end` 为增量长任务生成分支摘要

## 缓存

- [pi-cache-hit-predictor](https://www.npmjs.com/package/@howaboua/pi-cache-hit-predictor)：预测切换模型或思考档位后的 prompt cache 命中

## 任务管理

- [rpiv-todo](https://www.npmjs.com/package/@juicesharp/rpiv-todo)：持久任务清单

## 多 Agent

- [pi-shepherdr](https://www.npmjs.com/package/@howaboua/pi-shepherdr)：持久、阻塞式或异步子 agent
- [pi-agent-board](https://www.npmjs.com/package/@howaboua/pi-agent-board)：Agent 消息板与只读查看器

## 交互

- [pi-ask](https://www.npmjs.com/package/@howaboua/pi-ask)：交互决策、review 分流和 handoff

## 网页搜索

- [pi-web-access](https://www.npmjs.com/package/pi-web-access)：网页搜索、抓取、PDF 和视频分析
- [pi-codex-web-run](https://www.npmjs.com/package/@howaboua/pi-codex-web-run)：Codex Web 搜索与导航

## 浏览器

- [pi-browser](https://www.npmjs.com/package/@howaboua/pi-browser)：控制已登录的浏览器

## 库文档

- [context7-pi](https://www.npmjs.com/package/@upstash/context7-pi)：查询库文档和示例

## 终端控制

- [pi-herdr](https://www.npmjs.com/package/@ogulcancelik/pi-herdr)：控制 Herdr 的 workspace、tab、pane 和 agent

## 模型适配

- [pi-codex-conversion](https://www.npmjs.com/package/@howaboua/pi-codex-conversion)：为 Codex 模型调整工具与 prompt 契约

## 图像生成

- [pi-codex-imagegen](https://www.npmjs.com/package/@howaboua/pi-codex-imagegen)：图像生成与编辑

## 权限控制

- [pi-permission-system](https://www.npmjs.com/package/@gotgenes/pi-permission-system)：工具、命令与文件访问的权限规则

## 代码质量

- [pi-simplify](https://www.npmjs.com/package/@geminixiang/pi-simplify)：简化与代码质量检查

## 实验

- [pi-autoresearch](https://www.npmjs.com/package/pi-autoresearch)：运行、测量并保留或丢弃实验

## 开发模式

- [Ponytail](https://github.com/DietrichGebert/ponytail)：最小实现模式与 ponytail-review

## Skills

- [pi-skill-adversarial-qa](https://www.npmjs.com/package/@howaboua/pi-skill-adversarial-qa)：用可执行反例检查边界与回归
- [pi-skill-agents-md](https://www.npmjs.com/package/@howaboua/pi-skill-agents-md)：编写和维护分层 AGENTS.md
- [pi-skill-anti-ai-copy](https://www.npmjs.com/package/@howaboua/pi-skill-anti-ai-copy)：保留作者语气，减少空泛文案
- [pi-skill-skill-creator](https://www.npmjs.com/package/@howaboua/pi-skill-skill-creator)：创建、验证和维护 Skills
- [pi-skill-harness-and-agent-engineering](https://www.npmjs.com/package/@howaboua/pi-skill-harness-and-agent-engineering)：Harness、工具、指令和缓存工作流
