[简体中文](README.md) | [English](README.en.md)

# Pi Tool Exposure

按配置调整已安装 Pi package 的工具暴露方式。由 Pi 原生 package discovery 解析 manifest，不写死扩展文件路径，不修改上游源码，也不会自动安装包。

## 安装

随[仓库 Git package](../../README.md#安装)安装，入口为 `packages/pi-tool-exposure/index.ts`。可用 `pi config` 单独停用；更新和卸载方式见仓库说明。

## 配置

默认没有适配规则，不执行操作。可选文件为 `~/.pi/agent/pi-tool-exposure.json`；设置 `PI_CODING_AGENT_DIR` 时改从该目录读取。配置在加载时读取，修改后 `/reload` 或重开。

下面的 package 和工具名是占位示例，需要替换成已安装包的真实名称。

1. 在用户 `settings.json` 的 `packages` 中修改目标包的已有条目，关闭它的原生扩展入口，避免注册两次：

```json
{
  "source": "npm:@example/pi-tools",
  "extensions": []
}
```

2. 在 `pi-tool-exposure.json` 中添加适配规则，由本扩展发现目标包的入口并加载：

```json
{
  "adapters": [{ "source": "npm:@example/pi-tools", "tools": { "lookup": "deferred" } }]
}
```

`enabled` 默认为 `true`，设为 `false` 可关闭适配；`adapters` 默认为 `[]`。每项的 `source` 支持 Pi 的 npm、git 和本地 package 目录，相对目录以 Pi 用户目录为基准；`tools` 是工具名到暴露方式的非空映射。

| 暴露方式     | 含义                                              |
| ------------ | ------------------------------------------------- |
| `direct`     | 激活时向模型声明，也可被其他工具嵌套调用          |
| `deferred`   | 不主动展示定义，通过宿主 `tool_search` 发现并激活 |
| `model-only` | 激活时向模型声明，不供其他工具嵌套调用            |

source 和工具名不可重复或带首尾空白。支持 UTF-8 BOM；未知字段、无效值、错误 JSON 和读取错误会报错，只有文件不存在时使用默认值。

不再使用适配器时，停用本扩展并恢复目标包原来的入口过滤，再 `/reload`。本扩展不会代为修改设置；不要在项目配置中重复加载已适配的包。

## 边界

- 适配发生在调用 factory 时，通过包装 `registerTool` 设置 exposure，原生入口过滤不能省略。重复包、入口或跨 factory 的工具名冲突会报错。
- 支持 `direct`、`deferred`、`model-only`。只覆写缺省/direct，保留上游其他显式策略；执行函数、参数校验和渲染不变。
- 入口仍在启动时加载；`deferred` 延后的是工具定义的展示，不是模块加载。实际发现依赖宿主的 `tool_search` 等能力，其他 harness 需单独验证。
- 工具名精确匹配，不自动生成不存在的工具；上游改名后应检查配置。支持通过捕获的适配 API 后续注册，但不接管其他 factory 或 MCP 的注册。
- MCP 工具使用原生 `mcp.json` 的 exposure/toolExposure 配置。本插件不是安全沙箱；配置的 package 仍拥有普通 Pi 扩展的执行权限。

## 开发

通用命令见[开发指南](../../docs/development.md#验证)。本包测试使用隔离 package 夹具和注册替身，不安装真实上游包或调用模型。
