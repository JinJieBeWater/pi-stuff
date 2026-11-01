# 开发指南

日常使用请按[仓库 README](../README.md#安装)安装 Git package。开发需要 Bun 1.4.4 管理依赖，以及 Node.js 运行工具和测试；[`.node-version`](../.node-version) 使用 Node 24，最低支持 Node 22.19。

## 准备

```sh
git clone https://github.com/JinJieBeWater/pi-stuff.git
cd pi-stuff
bun install --frozen-lockfile --ignore-scripts
```

仓库使用 Bun workspaces 管理各包和依赖关系，Vite+ 提供检查工具和测试入口。Vite+、TypeScript、Node 类型及 Pi SDK 的开发版本统一声明在根 `package.json`，由一个 `bun.lock` 锁定；在根目录安装和更新依赖。依赖安装跳过生命周期脚本，Git hooks 按下文单独启用。

根目录和全部扩展都继承 [`packages/config/tsconfig.base.json`](../packages/config/tsconfig.base.json)：ES2023、Node 类型、严格类型检查、索引访问检查和未使用声明检查，只检查类型、不生成文件。Node 类型使用 22 系列，对齐 Pi 的最低运行基线。各自的 `tsconfig.json` 只指定检查范围，根目录覆盖 Vite+ 配置、公共代码和根测试，扩展覆盖源码及测试脚本。

## 验证

在仓库根目录运行：

| 命令                  | 检查内容                                                          |
| --------------------- | ----------------------------------------------------------------- |
| `bun run check`       | 文档和代码格式、lint、根目录及全部扩展的类型检查                  |
| `bun run test`        | 各扩展默认测试，以及根 package 的声明、资源发现和真实扩展加载测试 |
| `bun run check-types` | 仅运行根目录及全部扩展的类型检查                                  |
| `bun run format`      | 格式化仓库文件                                                    |

默认测试通过 Vite+ 内置的 Vitest 在 Node 环境运行，测试 API 从 `vite-plus/test` 导入。测试使用隔离夹具或替身，不请求真实模型、不执行真实 trash，也不搬迁用户会话。根测试另用临时 Pi 配置，通过真实 `DefaultResourceLoader` 和 jiti 加载全部扩展。

多个 `before_agent_start` 回调共同处理 `systemPromptOptions` 时，组合验收以全部回调结束后最终构造的系统提示为准。[Skill 发现与 Codex conversion 共用](../packages/pi-skill-discovery/README.md#与-codex-conversion-共用)列出了顺序约束，以及目录、搜索和原生注册表的检查项。

`bun run` 只启动仓库脚本。根测试执行 `vp test run`，统一发现 `*.test.ts`；格式化、lint 和测试共用根 [`vite.config.ts`](../vite.config.ts)。类型检查由 `vp exec tsc` 执行，根脚本用 `vp run` 调度各扩展的检查。

只检查某个扩展时，在该包目录运行：

```sh
bun run test
bun run check-types
```

子包测试显式指定根配置和当前目录，只运行本包的 `*.test.ts`；不会执行需要真实 Herdr 的手动脚本。

会话搬迁另有需要真实 Pi、Herdr 进程的手动检查，不包含在默认测试和 CI 中，见[测试说明](../packages/pi-herdr-session-move/TESTING.md)。

可选 Git hooks：在根目录执行 `bun run hooks:setup`。CI 在 Node 22.19 和 Node 24 下分别运行冻结锁文件安装、`bun run check` 和 `bun run test`，定义见 [check.yml](../.github/workflows/check.yml)。

## 本地加载

安装开发依赖后，在仓库根目录将单个本地 package 加入 Pi：

```sh
pi install ./packages/pi-drop-session
```

修改源码后，在空闲的 Pi 会话中 `/reload` 或重开。结束本地调试时，在同一目录执行：

```sh
pi remove ./packages/pi-drop-session
```

本地目录由 Pi 直接加载，不会被复制或自动安装依赖。若已安装整个 Git package，先停用其中相同的入口，不要让两种来源同时注册同一扩展或 Skill。

调试 `show-me` 时，可将用户目录中的 Skill 入口软链到仓库的 `skills/pi/show-me`，共享 agent 入口软链到 `skills/shared/show-me`。先核对同名入口，避免覆盖其他安装；两版调用方式和绘图依赖见 [Skills 说明](../skills/README.md)。

## 分发

根 [package.json](../package.json) 将各扩展入口和 `skills/pi/show-me` 声明为一个 Pi Git package；各扩展子包仍有独立 manifest。扩展直接加载 TypeScript，Skill 直接读取 Markdown，不需要打包。`skills/shared/show-me` 供其他 agent 显式使用，不注册为第二个 Pi Skill。

宿主提供的 Pi 库声明为 `peerDependencies`，不作为运行依赖复制。根 package 声明整个扩展集合需要的运行库，各子包声明自身的运行库；开发和测试依赖集中在根 `devDependencies`，子包在本仓库 workspace 中开发。资源发现与单入口过滤由根目录测试覆盖。

[个人配置清单](personal-setup.md)只做导航，其中的第三方 package 不参与根 manifest 的资源发现或依赖安装。

## 兼容基线

当前运行接口以 Node 宿主和 Pi SDK 1.4 为验证基线，Herdr 相关扩展以旧 TUI 0.9.5、Core 0.1.15 和 App 0.1.10 的原生接口验证。SDK 的确切版本见根 `devDependencies`；这些验证不代表兼容 Bun 编译版 Pi，或所有历史、未来版本。

- 无框表格依赖 Pi 原生表格布局，无法识别的布局会回退原生显示。
- `/drop` 的命令查找面向 macOS/Linux，不支持 Windows，也未验证该平台。
- 会话搬迁保留源终端，避免自动关闭时误关其他程序。Core 启动路径使用 macOS/Linux 的 `/usr/bin/env`；Windows 搬迁未验证。

各扩展的功能限制保留在各自 README，搬迁失败的处理见[恢复说明](../packages/pi-herdr-session-move/RECOVERY.md)。
