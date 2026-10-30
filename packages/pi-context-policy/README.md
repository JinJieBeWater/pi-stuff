# Pi Context Policy

向 Pi 系统提示词添加独立段落，支持环境变量条件。默认提供 Herdr 说明，不创建 agent，也不自动执行段落中的指令。

## 安装

随[仓库 Git package](../../README.md#安装)安装，入口为 `packages/pi-context-policy/index.ts`。可用 `pi config` 单独停用；更新和卸载方式见仓库说明。

## 默认行为

无需配置即可使用：当 `HERDR_ENV=1` 且 `HERDR_PANE_ID` 非空时，默认添加：

> 你当前运行在 Herdr 中，自动识别可以并发的任务，通过 Shepherdr 进行并发。

其他环境不添加内容。

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

- `enabled` 默认为 `true`；未配置 `sections` 时使用上述 Herdr 默认段落。
- 显式 `sections` 替换全部默认段落；设为 `[]` 或使用 `{"enabled": false}` 可关闭。
- `id` 使用唯一的小写标识符；段落键为 `context-policy-<id>`，不覆盖原生 `herdr` 等段落。
- `whenEnv` 中所有条件同时成立才生效；字符串精确匹配，`true` 要求变量非空。省略条件则始终生效。

支持 UTF-8 BOM；未知字段、无效值、错误 JSON 和读取错误会报错，只有文件不存在时使用默认值。

## 边界

段落只改变提示词内容，不会安装 Shepherdr、调用工具或授予额外权限，不能替代执行确认和权限控制。

## 开发

通用命令见[开发指南](../../docs/development.md#验证)。本包测试覆盖默认条件、配置替换、禁用和校验，不连接 Herdr。
