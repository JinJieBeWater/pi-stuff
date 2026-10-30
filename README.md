# jinjiebewater-pi-stuff

我自己写的 [Pi](https://github.com/earendil-works/pi) 扩展，以及我在用的第三方扩展清单。

## 自己的扩展

| Package                                                 | 用途                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| [pi-lovely-mermaid](packages/pi-lovely-mermaid)         | 用终端字符图显示 Mermaid，跟随 Pi 主题                            |
| [pi-borderless-tables](packages/pi-borderless-tables)   | 将回复中的 Markdown 表格显示为无框对齐表                          |
| [pi-herdr-session-move](packages/pi-herdr-session-move) | 通过 Herdr 将当前 Pi 对话转到另一个已有目录，不移动代码或操作 Git |

三个 package 均包含源码、Pi manifest 和测试，尚未发布到 npm。

## 个人扩展清单

[我在用的 Pi packages](docs/pi-extensions.md) 单独记录第三方包、Skills、按需加载和已停用项，不包含第三方源码、凭据或整份个人配置。

这份清单是我的选择，不是推荐全部安装的整合包。

## 从源码安装

先安装 Pi 和 Bun，再在仓库根目录运行：

```sh
bun install --frozen-lockfile

# 按需安装，不必三个全装
pi install ./packages/pi-lovely-mermaid
pi install ./packages/pi-borderless-tables
pi install ./packages/pi-herdr-session-move
```

已有会话需要 `/reload` 或重开。Mermaid 扩展还需关闭 Pi 的原生 Mermaid 渲染，具体设置见它的 README；会话搬迁扩展只在 Herdr 中启用。

扩展直接加载 TypeScript，不需要打包。这里不提供自动修改个人设置或批量安装第三方包的脚本。

## 开发

```sh
bun install --frozen-lockfile
bun run check        # 格式、lint、各 package 的类型检查
bun run test         # 单元和生命周期测试，不启动真实会话搬迁
bun run format       # 格式化
```

使用 Bun workspaces 和 Vite+。可选 Git hooks 由 `bun run hooks:setup` 安装，没有自定义 hook 框架。GitHub Actions 运行相同的安装、检查和测试命令。

脚手架按指定的 Better-T-Stack 空栈参数生成，记录保留在 [bts.jsonc](bts.jsonc)。没有前端、后端、数据库或部署服务；因此移除了无实际任务的 `dev`、`build` 脚本和未使用的环境校验依赖。

## 维护范围

- 自写扩展维护在 `packages/`；第三方扩展只记录来源和用途，不搬运源码。
- 新增 package 时声明 `pi.extensions`、运行依赖和 host peer dependencies，并提供 `test`、`check-types` 脚本。
- 扩展清单有变化时更新 `docs/pi-extensions.md`，不提交 auth、模型凭据、会话、缓存或本机备份。
- 创建本仓库没有切换本机或 KVM 的现有 Pi 加载路径；原安装仍保留。改用这里的源码需另行安装，避免与旧入口重复加载。

## 来源与许可

仓库组织参考 [howaboua-pi-stuff](https://github.com/IgorWarzocha/howaboua-pi-stuff)，脚手架来自 [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack)，未复制它们的扩展实现。

本仓库尚未指定整体开源许可证。Mermaid 扩展中已有的第三方归属和许可保留在 [third-party-notices.md](packages/pi-lovely-mermaid/third-party-notices.md)；依赖仍遵循各自的许可证。
