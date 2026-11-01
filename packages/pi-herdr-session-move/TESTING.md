# 会话搬迁测试

依赖准备和全仓检查见[开发指南](../../docs/development.md#验证)。下面的命令均在 `packages/pi-herdr-session-move/` 目录运行。

## 默认测试

```sh
bun run test
bun run check-types
```

`bun run test` 只运行：

- [unit.test.ts](test/unit.test.ts)：目标目录校验、会话复制、分支和来源记录等。
- [lifecycle.test.ts](test/lifecycle.test.ts)：工具和命令入口、交接、取消、身份变化、草稿及消息队列等生命周期条件。
- [runtime.test.ts](test/runtime.test.ts)：Core/TUI 选择、原生启动参数、源端退出后的独立存活、私有终端绑定和进程校验。

测试由 Vite+ 内置 Vitest 在 Node 环境运行，使用临时文件、真实 SessionManager 和 Pi SDK，替换 Herdr 传输与最终模型提交，不操作用户的实际终端或会话。

## 手动进程测试

以下脚本不包含在默认测试和 CI 中，须在独立安装了 Pi、Herdr 的环境里手动运行：

- `node test/e2e.ts`：使用独立命名的 headless Herdr session、临时 Pi 配置、离线 provider 和 Git 夹具，覆盖跨仓库、pane 跨 workspace 移动、非 Git 特殊路径、源目录删除、已有 worktree、模型工具链、trust 阻塞和目标启动失败。
- `node test/core-e2e.ts`：使用独立 `HC_SESSION` 和临时 XDG 目录，在真实 Core 中检查特殊路径搬迁、工具续跑、目标独立存活和 trust 阻塞。它使用项目 Pi SDK 随附的 CLI 与本机 Node，不依赖个人安装路径，不启动 App；结束后清理自身终端、Core 和临时目录。
- `node test/installed-smoke.ts`：读取执行机器的真实个人 Pi 配置，在独立 headless Herdr session 中检查 `herdr_session_move`、`/session-move` 和启动错误。该检查要求本扩展已安装，且 `herdr_worktree_jump` 没有同时注册；它不是对任意用户配置都成立的通用测试。

脚本只停止它们自己创建的隔离 session；旧 TUI 脚本将测试证据留在临时目录，检查后自行清理，不提交到仓库。它们不证明真实 LLM、所有平台或断电恢复行为。

## 结果判断

测试通过不等于实际用户迁移已经完成。实际完成需同时确认目标会话和 cwd 正确、源 Pi 已退出，并且没有另一端重复执行任务；`staged`、`ready` 或已有握手文件不能单独作为成功依据。

恢复未完成的实际迁移时，按 [RECOVERY.md](RECOVERY.md) 核对身份和会话，不用重复执行测试脚本代替恢复。
