# Pi Context Policy

向 Pi 系统提示词添加独立段落，可用配置和环境变量限定生效条件。不创建 agent，也不执行段落中的指令；具体行动由模型决定。

## 安装

在仓库根目录运行：

```sh
bun install --frozen-lockfile
pi install ./packages/pi-context-policy
```

## 配置

无需配置即可使用：当 `HERDR_ENV=1` 且 `HERDR_PANE_ID` 非空时，默认添加：

> 你当前运行在 Herdr 中，自动识别可以并发的任务，通过 Shepherdr 进行并发。

其他环境不添加内容。这只是提示词偏好，不会安装或自动运行 Shepherdr。

要替换默认段落，在 Pi 用户目录创建 `pi-context-policy.json`（默认 `~/.pi/agent/`，遵循 `PI_CODING_AGENT_DIR`）：

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

- `enabled` 默认为 `true`；未配置 `sections` 时使用上述 Herdr 默认段落。
- 显式 `sections` 替换全部默认段落；设为 `[]` 或使用 `{"enabled": false}` 可关闭。
- `id` 使用唯一的小写标识符；段落键为 `context-policy-<id>`，不覆盖原生 `herdr` 等段落。
- `whenEnv` 中所有条件同时成立才生效；字符串精确匹配，`true` 要求变量非空。省略条件则始终生效。
- 配置只在加载时读取，修改后 `/reload` 或重开。内容仍遵循系统提示词的权限层级，不是执行授权或安全沙箱。

## 开发

```sh
bun run test
bun run check-types
```
