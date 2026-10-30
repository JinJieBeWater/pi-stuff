# pi-stuff

个人维护的 [Pi](https://github.com/earendil-works/pi) 扩展与扩展清单。

## 自己的扩展

| Package                                                 | 用途                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| [pi-lovely-mermaid](packages/pi-lovely-mermaid)         | 用终端字符图显示 Mermaid，跟随 Pi 主题                            |
| [pi-borderless-tables](packages/pi-borderless-tables)   | 将回复中的 Markdown 表格显示为无框对齐表                          |
| [pi-herdr-session-move](packages/pi-herdr-session-move) | 通过 Herdr 将当前 Pi 对话转到另一个已有目录，不移动代码或操作 Git |

[按用途浏览扩展与 Skills 清单](docs/pi-extensions.md)。

## 从源码安装

需要 Pi 和 Bun；会话搬迁扩展还需要 Herdr。

```sh
git clone https://github.com/JinJieBeWater/pi-stuff.git
cd pi-stuff
bun install --frozen-lockfile

# 按需选择
pi install ./packages/pi-lovely-mermaid
pi install ./packages/pi-borderless-tables
pi install ./packages/pi-herdr-session-move
```

已有会话需要 `/reload` 或重开。Mermaid 扩展还需关闭 Pi 的原生 Mermaid 渲染，具体设置见它的 README；会话搬迁扩展只在 Herdr 中启用。

扩展直接加载 TypeScript，不需要打包，目前仅提供源码安装。

## 开发

```sh
bun install --frozen-lockfile
bun run check        # 格式、lint、各 package 的类型检查
bun run test         # 单元和生命周期测试，不启动真实会话搬迁
bun run format       # 格式化
```

使用 Bun workspaces 和 Vite+。可选 Git hooks：`bun run hooks:setup`。

## 许可

暂未指定整体开源许可证。第三方归属与许可见 [third-party-notices.md](packages/pi-lovely-mermaid/third-party-notices.md)；依赖遵循各自的许可证。
