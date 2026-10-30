# pi-stuff

我写的 [Pi](https://github.com/earendil-works/pi) 扩展、定制 Skills 和日常自用清单。

[自写扩展](#自写扩展) · [定制 Skills](#定制-skills) · [自用清单](#自用清单) · [安装](#安装) · [开发指南](docs/development.md)

## 自写扩展

| 扩展                                                    | 用途                                                  |
| ------------------------------------------------------- | ----------------------------------------------------- |
| [pi-lovely-mermaid](packages/pi-lovely-mermaid)         | 将 Mermaid 显示为跟随主题的终端字符图                 |
| [pi-borderless-tables](packages/pi-borderless-tables)   | 无框对齐表格                                          |
| [pi-herdr-session-move](packages/pi-herdr-session-move) | 把当前 Pi 对话转到另一个已有目录                      |
| [pi-drop-session](packages/pi-drop-session)             | 新建会话后，将旧会话文件送到废纸篓                    |
| [pi-context-policy](packages/pi-context-policy)         | Herdr 默认说明和可配置的提示词段落                    |
| [pi-tool-exposure](packages/pi-tool-exposure)           | 按配置调整工具暴露，使用原生 package discovery 找入口 |
| [pi-skill-discovery](packages/pi-skill-discovery)       | 配置核心目录并按需查找其他 Skills                     |

## 定制 Skills

| Skill                                    | 用途                                                              |
| ---------------------------------------- | ----------------------------------------------------------------- |
| [show-me（Pi）](skills/pi/show-me)       | 统一选择代码草图、原生 Mermaid/chart、Glyph kit、GlyphCSS 或 HTML |
| [show-me（通用）](skills/shared/show-me) | 供其他 agent 显式调用的通用版本                                   |

Pi 包只注册 Pi 版；通用版不参与 Pi 包发现。两版的调用方式、第三方依赖和来源见 [Skills 说明](skills/README.md)。

## 自用清单

自用的第三方扩展和 Skill 包，按单一用途分类；实际启用情况以 Pi 配置为准。

### 界面

- [pi-unicode-charts](https://www.npmjs.com/package/@howaboua/pi-unicode-charts)：终端柱状图、折线图、散点图、sparkline 和热力图
- [angristan/pi-extensions](https://github.com/angristan/pi-extensions)：TUI 显示、标题与统计的扩展集合

angristan 集合中的具体条目：

- 显示：`accent-color`、`cached-line-resets`、`code-blocks`、`hyperlinks`。
- 状态：`turn-stats`、`working-timer`。
- 会话：`auto-session-title`、`herdr-tab-title`、`reload-all`。

### 会话

- [pi-session-naming](https://www.npmjs.com/package/@furbyhaxx/pi-session-naming)：会话命名、浏览和管理
- [pi-smart-btw](https://www.npmjs.com/package/@howaboua/pi-smart-btw)：异步侧会话提问，再显式注入主会话

### 上下文

- [pi-notes-compaction](https://www.npmjs.com/package/@howaboua/pi-notes-compaction)：持久 notes 与上下文换窗
- [pi-auto-trees](https://www.npmjs.com/package/@howaboua/pi-auto-trees)：用 `/marker`、`/end` 为增量长任务生成分支摘要

### 缓存

- [pi-cache-hit-predictor](https://www.npmjs.com/package/@howaboua/pi-cache-hit-predictor)：预测切换模型或思考档位后的 prompt cache 命中

### 任务管理

- [rpiv-todo](https://www.npmjs.com/package/@juicesharp/rpiv-todo)：持久任务清单

### 多 Agent

- [pi-shepherdr](https://www.npmjs.com/package/@howaboua/pi-shepherdr)：持久、阻塞式或异步子 agent
- [pi-agent-board](https://www.npmjs.com/package/@howaboua/pi-agent-board)：Agent 消息板与只读查看器

### 交互

- [pi-ask](https://www.npmjs.com/package/@howaboua/pi-ask)：交互决策、review 分流和 handoff

### 网页搜索

- [pi-web-access](https://www.npmjs.com/package/pi-web-access)：网页搜索、抓取、PDF 和视频分析
- [pi-codex-web-run](https://www.npmjs.com/package/@howaboua/pi-codex-web-run)：Codex Web 搜索与导航

### 浏览器

- [pi-browser](https://www.npmjs.com/package/@howaboua/pi-browser)：控制已登录的浏览器

### 库文档

- [context7-pi](https://www.npmjs.com/package/@upstash/context7-pi)：查询库文档和示例

### 终端控制

- [pi-herdr](https://www.npmjs.com/package/@ogulcancelik/pi-herdr)：控制 Herdr 的 workspace、tab、pane 和 agent

### 模型适配

- [pi-codex-conversion](https://www.npmjs.com/package/@howaboua/pi-codex-conversion)：为 Codex 模型调整工具与 prompt 契约

### 图像生成

- [pi-codex-imagegen](https://www.npmjs.com/package/@howaboua/pi-codex-imagegen)：图像生成与编辑

### 权限控制

- [pi-permission-system](https://www.npmjs.com/package/@gotgenes/pi-permission-system)：工具、命令与文件访问的权限规则

### 代码质量

- [pi-simplify](https://www.npmjs.com/package/@geminixiang/pi-simplify)：简化与代码质量检查

### 实验

- [pi-autoresearch](https://www.npmjs.com/package/pi-autoresearch)：运行、测量并保留或丢弃实验

### 开发模式

- [Ponytail](https://github.com/DietrichGebert/ponytail)：最小实现模式与 ponytail-review

### Skills

- [Glyph kit](https://github.com/alextraykov/glyph-kit/releases/tag/v0.3.0)：产品设计图示、可编辑规格和文档导出，`show-me` 用于线框、研究及交付材料
- [GlyphCSS diagrams](https://github.com/JinJieBeWater/glyphcss-diagrams)：按需生成专业图种和高级数据图；从 [apresmoi/glyphcss-diagrams](https://github.com/apresmoi/glyphcss-diagrams) fork，关闭自动发现，由 `show-me` 读取或显式调用
- [pi-skill-adversarial-qa](https://www.npmjs.com/package/@howaboua/pi-skill-adversarial-qa)：用可执行反例检查边界与回归
- [pi-skill-agents-md](https://www.npmjs.com/package/@howaboua/pi-skill-agents-md)：编写和维护分层 AGENTS.md
- [pi-skill-anti-ai-copy](https://www.npmjs.com/package/@howaboua/pi-skill-anti-ai-copy)：保留作者语气，减少空泛文案
- [pi-skill-skill-creator](https://www.npmjs.com/package/@howaboua/pi-skill-skill-creator)：创建、验证和维护 Skills
- [pi-skill-harness-and-agent-engineering](https://www.npmjs.com/package/@howaboua/pi-skill-harness-and-agent-engineering)：Harness、工具、指令和缓存工作流

## 安装

需要已安装 Pi 和 Git。Pi 负责下载源码和安装运行依赖，无需手动 clone、安装 Bun 或构建：

```sh
pi install git:github.com/JinJieBeWater/pi-stuff
pi config
```

默认发现上方七项扩展和 Pi 版 `show-me`，不安装自用清单中的第三方项目。`show-me` 的 Glyph kit/GlyphCSS 功能需要[单独安装依赖](skills/README.md#绘图依赖)。在 `pi config` 中关闭不需要的入口。已有会话执行 `/reload` 或重开。

不要同时加载这个 Git package 和相同扩展或 Skill 的本地入口，以免重复注册。

## 选择扩展

也可编辑 Pi 用户目录 `settings.json` 的 `packages` 中已有的本包条目。例如只加载 `/drop` 并停用本包的 Skills，其他 package 声明保持不变：

```json
{
  "source": "git:github.com/JinJieBeWater/pi-stuff",
  "extensions": ["packages/pi-drop-session/index.ts"],
  "skills": []
}
```

`extensions` 或 `skills` 省略时加载该类型的全部入口，设为 `[]` 时停用该类型。修改后 `/reload` 或重开。

## 配置

- [Mermaid](packages/pi-lovely-mermaid/README.md#配置)：启用前将 Pi 的 `markdown.mermaid` 设为 `off`，避免原生渲染先处理代码块。
- [会话搬迁](packages/pi-herdr-session-move/README.md#使用)：需要独立安装 Herdr，只在 Herdr 中注册入口。
- [`/drop`](packages/pi-drop-session/README.md#使用)：需要可信的回收站命令，默认从 `PATH` 查找 `trash`。
- [Skill 发现](packages/pi-skill-discovery/README.md#配置)：默认核心名单为空，所有可自动调用的 Skills 都按需查找；原生 `/skill:name` 仍可用。

配置型扩展从 Pi 用户目录读取同名 JSON，默认目录为 `~/.pi/agent/`，遵循 `PI_CODING_AGENT_DIR`。配置文件可省略；具体默认行为、字段和限制见各扩展 README。修改 JSON 后 `/reload` 或重开。

## 更新

```sh
pi update git:github.com/JinJieBeWater/pi-stuff
```

更新后 `/reload` 或重开。使用 `@tag` 或 `@commit` 安装时，Pi 保持该引用，不会自动切到新版本。

## 卸载

```sh
pi remove git:github.com/JinJieBeWater/pi-stuff
```

这会移除整个 package；只停用其中一项请使用 `pi config`。用户 JSON 配置独立保留，移除后 `/reload` 或重开。

本仓库尚未发布 npm 包。源码开发、本地安装、兼容基线和测试说明见[开发指南](docs/development.md)。

## 许可

暂未指定整体开源许可证。Mermaid 第三方归属与许可见 [third-party-notices.md](packages/pi-lovely-mermaid/third-party-notices.md)；`show-me` 的 HumanLayer 来源与 MIT 许可见 [Skills 说明](skills/README.md#来源和许可)。依赖遵循各自的许可证。
