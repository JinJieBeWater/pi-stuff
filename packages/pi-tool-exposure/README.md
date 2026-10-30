# Pi Tool Exposure

按配置调整已安装 Pi package 的工具暴露方式。由 Pi 原生 package discovery 解析 manifest，不写死扩展文件路径，不修改上游源码，也不会自动安装包。

## 安装与配置

在仓库根目录安装：

```sh
bun install --frozen-lockfile
pi install ./packages/pi-tool-exposure
```

在 Pi 用户目录创建 `pi-tool-exposure.json`（默认 `~/.pi/agent/`，遵循 `PI_CODING_AGENT_DIR`）：

```json
{
  "adapters": [{ "source": "npm:@example/pi-tools", "tools": { "lookup": "deferred" } }]
}
```

目标包必须已安装；同一包在个人 `settings.json` 的声明需关闭原生扩展入口，避免注册两次：

```json
{ "source": "npm:@example/pi-tools", "extensions": [] }
```

随后 `/reload` 或重开。配置只在加载时读取；`enabled: false` 关闭本插件，缺省没有 adapters 时不执行操作。`source` 支持 Pi 的 npm、git 和本地 package 目录；相对目录以 Pi 用户目录为基准。不要在项目配置中重复加载已适配的包。

## 边界

- Pi 1.4 没有注册后修改 exposure 的公开接口，因此必须在调用 factory 时包装 `registerTool`，原生入口过滤仍然必要。已有冲突会明确报错，不静默修改用户设置。
- 支持 `direct`、`deferred`、`model-only`。只覆写缺省/direct，保留上游其他显式策略；执行函数、参数校验和渲染不变。
- 入口仍在启动时加载；`deferred` 延后的是工具定义的展示，不是模块加载。实际发现依赖宿主的 `tool_search` 等能力，其他 harness 需单独验证。
- 工具名精确匹配，不自动生成不存在的工具；上游改名后应检查配置。支持通过捕获的适配 API 后续注册，但不接管其他 factory 或 MCP 的注册。
- MCP 工具使用原生 `mcp.json` 的 exposure/toolExposure 配置。本插件不是安全沙箱；配置的 package 仍拥有普通 Pi 扩展的执行权限。

## 开发

```sh
bun run test
bun run check-types
```
