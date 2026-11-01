# 个人 Pi 配置

核对日期：2026-11-01。保存当前 macOS 安装的个人配置，供对比和恢复，不随 Pi Git package 自动加载。

`pi/` 对应 Pi 用户目录，默认是 `~/.pi/agent/`；`rpiv-todo/` 对应 `~/.config/rpiv-todo/`。主目录路径统一为 `~/`，设备 ID、已读版本、音频初始化状态和认证不入库。

## 内容

| 文件                                                                                                                                                          | 用途                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| [AGENTS.md](pi/AGENTS.md)                                                                                                                                     | Pi 专属协作规则                         |
| [settings.json](pi/settings.json)                                                                                                                             | 包来源、加载顺序、过滤和界面偏好        |
| [pi-codex-conversion.json](pi/pi-codex-conversion.json)                                                                                                       | PCC normal 模式、提示词、压缩和语音偏好 |
| [pi-skill-discovery.json](pi/pi-skill-discovery.json)、[pi-tool-exposure.json](pi/pi-tool-exposure.json)、[pi-context-policy.json](pi/pi-context-policy.json) | Skill 展示、工具暴露和环境适配          |
| [shepherdr/profiles/](pi/shepherdr/profiles/)                                                                                                                 | 六套角色预设及共享 prompt               |
| [multi-agent-review/](pi/skills/multi-agent-review/)                                                                                                          | 手动审查 Skill、校验脚本及离线测试      |
| [rpiv-todo/config.json](rpiv-todo/config.json)                                                                                                                | 任务追踪指引，不含任务数据              |

其余文件保存快捷键、主题、交互、Ponytail、辅助模型、网页抓取、权限和工作树模板。停用的 accent-color、MCP 配置、未定制的语音模板和等于默认值的 `/drop` 配置不保留。`session.titleGeneration` 只保留停用标记，自动标题由本仓库扩展负责。

原生 Codemode 开启，PCC 使用 `normal`；两者负责不同层。

## 恢复与维护

1. 按需逐文件对比合并；设置了 `PI_CODING_AGENT_DIR` 时使用该目录。本仓库、PCC/Shepherdr fork、评测 Skill 分别位于 `~/my/pi-stuff`、`~/my/personal/fork/howaboua-pi-stuff`、`~/my/tools/pi-evals`。换目录或安装来源时调整 package 路径，保留 [Skill discovery 在 PCC 前加载](../packages/pi-skill-discovery/README.md#与-codex-conversion-共用)的顺序。本地依赖安装见[开发指南](../docs/development.md#准备)。
2. 模型定义与认证由目标机器提供。`npmCommand` 使用 mise 和 Node 24.13.1；网页抓取使用 macOS Homebrew 的 curl。Skills 从各自来源安装；本机 show-me 入口软链到仓库的 `skills/pi/show-me`。
3. [权限配置](pi/extensions/pi-permission-system/config.json)保留 `yoloMode: true`；[工作树模板](pi/templates/worktree.json)会复制 `.env`、链接项目目录并安装依赖。按目标环境选择是否采用。
4. 合并后在空闲会话 `/reload` 或重开，核对工具暴露和角色列表。修改运行配置后再同步副本，继续排除设备状态、旧修订和备份。会话、日志、缓存及跨机同步载荷留在各自机器。

定制构建和跨机同步工具的来源见[维护记录](../docs/local-maintenance-audit-2026-11-01.md)。

手动审查校验器沿用 Python 3，可离线运行，不调用模型：

```sh
python3 config/pi/skills/multi-agent-review/tests/test-review-validation.py
```
