# 开发指南

日常使用请按[仓库 README](../README.md#安装)安装 Git package。只有修改源码或运行测试时才需要 Bun。

## 准备

```sh
git clone https://github.com/JinJieBeWater/pi-stuff.git
cd pi-stuff
bun install --frozen-lockfile
```

仓库使用 Bun workspaces 和 Vite+。依赖版本以根目录、各 package 的 `package.json` 及 `bun.lock` 为准，不要单独更新某个包的依赖树。

## 验证

在仓库根目录运行：

| 命令                  | 检查内容                                                           |
| --------------------- | ------------------------------------------------------------------ |
| `bun run check`       | 文档和代码格式、lint、各扩展类型检查                               |
| `bun run test`        | 各扩展默认测试，以及根 package 的 manifest、依赖和原生资源发现测试 |
| `bun run check-types` | 仅运行各扩展类型检查                                               |
| `bun run format`      | 格式化仓库文件                                                     |

默认测试使用隔离夹具或替身，不请求真实模型、不执行真实 trash，也不搬迁用户会话。`/drop` 的子进程信号测试需要 `PATH` 中有 Node.js。

只检查某个扩展时，在该包目录运行：

```sh
bun run test
bun run check-types
```

会话搬迁另有需要真实 Pi、Herdr 进程的手动检查，不包含在默认测试和 CI 中，见[测试说明](../packages/pi-herdr-session-move/TESTING.md)。

可选 Git hooks：在根目录执行 `bun run hooks:setup`。CI 运行 frozen-lockfile 安装、`bun run check` 和 `bun run test`，定义见 [check.yml](../.github/workflows/check.yml)。

## 本地加载

安装开发依赖后，在仓库根目录将单个本地 package 加入 Pi：

```sh
pi install ./packages/pi-drop-session
```

修改源码后，在空闲的 Pi 会话中 `/reload` 或重开。结束本地调试时，在同一目录执行：

```sh
pi remove ./packages/pi-drop-session
```

本地目录由 Pi 直接加载，不会被复制或自动安装依赖。若已安装整个 Git package，先停用其中相同的入口，不要让两种来源同时注册同一扩展。

## 分发

根 [package.json](../package.json) 将各包入口声明为一个 Pi Git package；各子包仍有独立 manifest。扩展直接加载 TypeScript，不需要打包。

宿主提供的 Pi 库声明为 `peerDependencies`，不作为运行依赖复制。根 package 声明整个扩展集合需要的运行库，各子包声明自身的运行库；开发和测试依赖放在 `devDependencies`。资源发现与单入口过滤由根目录测试覆盖。

分类清单中的第三方 package 只做导航，不参与根 manifest 的资源发现或依赖安装。

## 兼容基线

当前运行接口以 Pi SDK 1.4 为验证基线，会话搬迁另以 Herdr 0.9.5 的接口验证。SDK 的确切版本见各包 `devDependencies`；这些验证不代表兼容所有历史或未来版本。

- 无框表格依赖 Pi 原生表格布局，无法识别的布局会回退原生显示。
- `/drop` 的命令查找面向 macOS/Linux，不支持 Windows，也未验证该平台。
- 会话搬迁保留源 pane，避免 Herdr 无法按预期进程身份原子关闭 pane 时误关其他程序。

各扩展的功能限制保留在各自 README，搬迁失败的处理见[恢复说明](../packages/pi-herdr-session-move/RECOVERY.md)。
