# Pi Herdr tab title

把 Pi 会话名称同步到所在 Herdr 标签页。响应 `session_start` 和
`session_info_changed`，只在 Pi 的 TUI 模式运行；空名称不改标签。

随[仓库 Git package](../../README.md#安装)安装，入口为 `packages/pi-herdr-tab-title/index.ts`；可用 `pi config` 单独停用。

重载 Pi 后，使用 `/name 标题` 即可同步。

- Core 优先：有 `HC_TERMINAL_SOCKET` 时，仅走 Core/App。读取本终端
  `hc get <HC_TERMINAL_ID> --json`，要求准确地址及终端携带的随机
  `herdr.space` / `herdr.tab` 标签，与 `herdr-app ls` 中本地
  `machine: null` 的 space、tab、terminal 三者一致，然后显式传入
  `id` / `name` 调用 `herdr-app do tab.rename`。执行前复核 App socket 身份。
- TUI：使用 `HERDR_ENV=1`、`HERDR_SOCKET_PATH`、`HERDR_PANE_ID`，每次从
  `herdr pane current --current` 取得当前位置，向该 socket 发送
  `tab.rename`，参数为 `tab_id` / `label`；pane 移动后跟随新标签页。
- App 未运行、目标不匹配、标签缺失、命令失败时安全跳过。后台 worker
  不借用父终端标签；不启动 App、不创建终端、不改变焦点。
- 标题更新串行执行；等待期间被新标题取代的旧更新会跳过。

运行本包检查：`bun run test`、`bun run check-types`。测试只替换外部执行、
socket 和文件系统副作用，不操作真实标签页。原上游扩展文件保留，由配置选择
加载本包，避免同时加载两个标题同步扩展。
