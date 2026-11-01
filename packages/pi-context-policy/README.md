# Pi Context Policy

按环境选择提示词段落，以及托管的扩展、工具和 Skill。默认识别 Herdr Core 和旧 Herdr TUI，提供对应的官方手册入口；资源托管需要显式配置。

## 安装

随[仓库 Git package](../../README.md#安装)安装，入口为 `packages/pi-context-policy/index.ts`。可用 `pi config` 单独停用；更新和卸载方式见仓库说明。

## 默认行为

无需配置，按以下顺序选择一个环境段落：

| 环境         | 条件                                          | 操作说明                                                                                                     |
| ------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Herdr Core   | `HC_TERMINAL_ID`、`HC_TERMINAL_SOCKET` 都非空 | agent 协作使用 Shepherdr；终端操作先读 `hc --skill`；窗口操作先确认 `herdr-app` 可用并读 `herdr-app --skill` |
| 旧 Herdr TUI | `HERDR_ENV=1` 且 `HERDR_PANE_ID` 非空         | agent 协作使用 Shepherdr；终端或布局操作先读 `herdr --skill`                                                 |

Core 终端可能继承旧 `HERDR_*` 标记，因此两套条件都满足时只注入 Core 段落。其他环境不添加内容。环境标记说明终端由哪个后端管理，不能证明存在可用的桌面窗口。

手册由已安装的官方 CLI 提供，无需全局加载一份旧 Herdr Skill。并发编排遵循 Shepherdr 当前模式和用户要求。

## 配置

可选文件：`~/.pi/agent/pi-context-policy.json`。设置 `PI_CODING_AGENT_DIR` 时改从该目录读取。配置在加载时读取，修改后 `/reload` 或重开。

例如将默认段落替换成团队约定：

```json
{
  "sections": [
    {
      "id": "team",
      "text": "使用团队文档中的术语和约定。",
      "whenEnv": { "TEAM_WORKSPACE": "1", "TEAM_INSTANCE": true }
    }
  ]
}
```

- `enabled` 默认为 `true`；未配置 `sections` 时按上述顺序选择默认段落。
- 显式 `sections` 替换全部默认段落；设为 `[]` 或使用 `{"enabled": false}` 可关闭。
- 自定义段落仍会添加所有匹配项，Core 优先只适用于默认规则。
- `id` 使用唯一的小写标识符；段落键为 `context-policy-<id>`，不覆盖原生 `herdr` 等段落。
- `whenEnv` 中所有条件同时成立才生效；字符串精确匹配，`true` 要求变量非空，`false` 要求变量不存在或为空。省略条件则始终生效。

支持 UTF-8 BOM；未知字段、无效值、错误 JSON 和读取错误会报错，只有文件不存在时使用默认值。

## 按环境启停资源

Pi 在扩展运行前已经完成原生扩展加载，本扩展无法撤回那些已执行的代码。要托管某个资源，先关闭它的原生自动入口，再让本扩展决定是否加载。不修改上游文件，不自动安装依赖。

例如只在旧 TUI 中启用已安装的 `pi-herdr`，先把 `settings.json` 中该包的原有条目改为：

```json
{
  "source": "npm:@ogulcancelik/pi-herdr",
  "extensions": []
}
```

然后在 `pi-context-policy.json` 中配置：

```json
{
  "extensions": [
    {
      "source": "npm:@ogulcancelik/pi-herdr",
      "whenEnv": {
        "HERDR_ENV": "1",
        "HERDR_PANE_ID": true,
        "HC_TERMINAL_SOCKET": false
      }
    }
  ]
}
```

Core 即使继承旧 `HERDR_*` 标记也不会导入这个包。原有默认环境提示仍生效；添加资源规则不需要重写 `sections`。

| 字段         | 配置                                                  | 生效行为                                                     |
| ------------ | ----------------------------------------------------- | ------------------------------------------------------------ |
| `extensions` | `[{"source":"已安装的 Pi package", "whenEnv":{...}}]` | 匹配时按原生 manifest 发现入口并执行 factory；不匹配时不导入 |
| `tools`      | `[{"name":"工具名", "whenEnv":{...}}]`                | 筛选托管扩展的 `registerTool`，不匹配的工具不会注册          |
| `skills`     | `[{"path":"Skill 目录或文件", "whenEnv":{...}}]`      | 匹配时通过原生 `resources_discover` 加入技能目录             |

三项默认为空列表。名称精确匹配，每类目标不能重复。条件是允许规则：匹配才启用；未列出的托管工具保持上游行为。

扩展 source 支持已安装的 npm、git 和本地 package 目录，相对目录以 Pi 用户目录为基准。先用 `extensions: []` 或等效的原生过滤关闭要托管的入口；本扩展会核对原生解析结果和文件的物理路径，即使规则失配也不允许同一文件从别名或其他 package 入口加载。同一个包只能选择一个托管入口，不要同时交给 `pi-tool-exposure` 或项目、CLI 入口加载。匹配的包缺失、物理别名重复、入口无效或跨 factory 工具重名会报错；未匹配的包可以不在当前机器安装。不能托管本扩展自身，或包含其入口的整套 package。

工具规则只控制上方 `extensions` 中的包，不控制宿主内置工具或其他独立加载扩展。工具条件在加载时确定，后续注册仍遵循同一条件；工具的参数、执行、渲染和 exposure 保持上游定义。不匹配时也无法经 `tool_search` 或 Codemode 调用，因为该工具没有注册。单独禁用工具不会停止所属扩展的其他 hooks 或命令。

Skill 使用目录或 Markdown 文件路径；目录须直接包含 `SKILL.md`。支持 `~/`，其他相对路径以 Pi 用户目录为基准。先在 `settings.json` 的 `skills` 中加入对应的负路径，再配置条件，例如：

```json
{
  "skills": ["-~/.agents/skills/example-workflow"]
}
```

对应的 `pi-context-policy.json`：

```json
{
  "skills": [
    {
      "path": "~/.agents/skills/example-workflow",
      "whenEnv": { "EXAMPLE_WORKFLOW": "1" }
    }
  ]
}
```

负路径须与托管路径解析到同一个位置；缺少排除项会报错。如果 Skill 还由某个 package 的 manifest 提供，全局负路径不能关闭那个入口，还须在对应 package 条目中设置 `skills: []`，或使用等效的包级过滤：

```json
{
  "source": "npm:@example/workflows",
  "skills": []
}
```

本扩展会验证原生技能解析结果，同一文件仍从任何全局入口启用时会报错，包括物理路径别名。规则匹配时才要求 Skill 文件存在。不匹配时不加入原生技能目录，因此不会出现在系统技能目录、`skill_search` 或原生 `/skill:name` 注册中。项目、CLI 入口和其他同名副本须另行排除。

资源条件在启动或 `/reload` 时生效，不热卸载运行中的扩展。修改环境应重新启动 Pi；配置修改可在空闲时 `/reload`。`enabled: false` 会停止本扩展的提示注入和资源加载，已关闭的原生入口仍保持关闭。

## 边界

提示段落不会安装 Shepherdr、调用工具或授予额外权限。资源托管会执行已匹配包的代码，拥有普通 Pi 扩展权限；环境筛选不构成安全沙箱，也不阻止用户通过其他工具读取磁盘上的 Skill。

## 开发

通用命令见[开发指南](../../docs/development.md#验证)。测试覆盖 Core/TUI 选择、环境缺失条件、资源配置校验、未匹配包不导入、工具的初始与后续注册、Skill 原生发现和禁用，不连接 Herdr。
