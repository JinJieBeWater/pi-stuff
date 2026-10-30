# 测试

先在仓库根目录运行 `bun install --frozen-lockfile`，再在本 package 目录运行：

```sh
bun run test
bun run check-types
```

默认测试只运行 `unit.test.ts` 和 `lifecycle.test.ts`：使用临时文件、真实 SessionManager 和 Pi SDK，替换 Herdr 传输与最终模型提交，不操作用户的实际终端或会话。

## 需要真实 Pi / Herdr 的检查

以下脚本不包含在默认测试和 CI 中，须在独立安装了 Pi、Herdr 的环境里手动运行：

- `bun test/e2e.ts`：使用独立命名的 headless Herdr session、临时 Pi 配置和 Git 夹具，覆盖跨仓库、非 Git 特殊路径、源目录删除、已有 worktree、模型工具链、trust 阻塞和目标启动失败。
- `bun test/installed-smoke.ts`：检查执行机器的真实个人 Pi 配置，确认注册了新搬迁工具及命令，且没有旧 jump。只有该机器已经安装本扩展并完成旧入口切换时才适用。

两个脚本只停止它们自己创建的隔离 session；测试证据写入临时目录，不提交到仓库。它们不证明真实 LLM、所有平台或断电恢复行为。

恢复未完成的实际迁移时，按 [RECOVERY.md](RECOVERY.md) 核对身份和会话，不用重复执行测试脚本代替恢复。
