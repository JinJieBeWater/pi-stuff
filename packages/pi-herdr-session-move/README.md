# Pi Herdr Session Move

把当前 Pi 对话转到本机一个已存在的目录。目标可以是另一仓库、已有 worktree 或非 Git 目录；源 cwd 已移动或删除也能迁移。

## 安装

需要独立安装的 Pi 和 Herdr；扩展只在 Herdr 环境中注册。当前实现的验证基线为 Pi 1.4.0、Herdr 0.9.5。

在仓库根目录运行：

```sh
bun install --frozen-lockfile
pi install ./packages/pi-herdr-session-move
```

## 使用

1. **准备**：保存编辑器草稿，处理排队消息，收尾仍需原目录的后台任务。需要保留的进程内状态先写入文件；完成条件是没有待处理的草稿、队列或依赖原目录的未收尾任务。
2. **调用**：手动输入 `/session-move /绝对/目标目录`，路径含空格时原样输入，不加 shell 引号。交给 agent 迁移时使用 `herdr_session_move`，参数和调用条件以[工具注册定义](index.ts)为准。更新后若当前 Pi 尚未加载入口，在空闲时 `/reload`。
3. **验收**：目标端确认迁移成功、cwd 正确且原 Pi 已退出，才算完成。命令入口停在目标输入框；模型工具在当前 run settled 后交接，并在原 Pi 退出后续跑。`staged`、`ready` 或原端的搬迁通知都不单独代表完成。

报错、超时、启动被 trust 挡住，或通知与现场不一致时，按[恢复流程](RECOVERY.md)判断在哪端继续以及能否重试。

## 迁移边界

- 迁移的是持久化对话：保留当前选中的树分支、其他分支和来源关系，原会话文件留在原处。
- TS notebook、扩展内存、临时 CLI flags 和后台进程不随会话搬迁；目标项目使用自己的配置和 trust。
- 每次创建不抢焦点的专用 workspace/pane，只处理当前 Pi；代码、Git 分支、worktree 和源目录保持原样。
- 原 Pi 退出后保留空 shell。Herdr 0.9.5 的 pane close 无法按预期 occupant 原子关闭，自动清理仍有误关新程序的窗口。

## 维护

加载入口、peer packages 和常规检查脚本见 [package.json](package.json)。开发依赖由仓库根目录的 Bun workspace 安装提供，不依赖维护者机器上的 `node_modules` 软链。

核对测试覆盖、替换证据或未验证范围时，读 [TESTING.md](TESTING.md)。
