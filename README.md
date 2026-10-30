# pi-stuff

为 [Pi](https://github.com/earendil-works/pi) 提供终端显示、会话管理和按需发现扩展，通过 Pi 原生 Git package 分发。

[分类清单](docs/pi-extensions.md) · [开发指南](docs/development.md)

## 扩展

| 扩展                                                    | 用途                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| [pi-lovely-mermaid](packages/pi-lovely-mermaid)         | 用终端字符图显示 Mermaid，跟随 Pi 主题                       |
| [pi-borderless-tables](packages/pi-borderless-tables)   | 将回复中的 Markdown 表格显示为无框对齐表                     |
| [pi-herdr-session-move](packages/pi-herdr-session-move) | 通过 Herdr 搬迁当前对话，不移动代码或操作 Git                |
| [pi-drop-session](packages/pi-drop-session)             | `/drop` 新建会话后，将旧会话文件送到废纸篓                   |
| [pi-context-policy](packages/pi-context-policy)         | Herdr 默认说明，以及可按环境条件配置的提示词段落             |
| [pi-tool-exposure](packages/pi-tool-exposure)           | 按配置调整已安装 package 的工具暴露方式                      |
| [pi-skill-discovery](packages/pi-skill-discovery)       | 保留核心 Skill 目录，通过 `skill_search` 按需查找其余 Skills |

## 安装

需要已安装 Pi 和 Git。Pi 负责下载源码和安装运行依赖，无需手动 clone、安装 Bun 或构建：

```sh
pi install git:github.com/JinJieBeWater/pi-stuff
pi config
```

默认加载上表中的七项扩展，在 `pi config` 中关闭不需要的入口。已有会话执行 `/reload` 或重开。

不要同时加载这个 Git package 和相同扩展的本地入口，以免重复注册。分类清单中的第三方 package 不会随本仓库安装。

## 选择扩展

也可编辑 Pi 用户目录 `settings.json` 的 `packages` 中已有的本包条目。例如只加载 `/drop`，其他 package 声明保持不变：

```json
{
  "source": "git:github.com/JinJieBeWater/pi-stuff",
  "extensions": ["packages/pi-drop-session/index.ts"]
}
```

`extensions` 省略时加载全部入口，设为 `[]` 时全部停用。修改后 `/reload` 或重开。

## 配置

- [Mermaid](packages/pi-lovely-mermaid/README.md#配置)：启用前将 Pi 的 `markdown.mermaid` 设为 `off`，避免原生渲染先处理代码块。
- [会话搬迁](packages/pi-herdr-session-move/README.md#使用)：需要独立安装 Herdr，只在 Herdr 中注册入口。
- [`/drop`](packages/pi-drop-session/README.md#使用)：需要可信的回收站命令，默认从 `PATH` 查找 `trash`。
- [Skill 发现](packages/pi-skill-discovery/README.md#配置)：默认核心名单为空，所有可自动调用的 Skills 都按需查找；原生 `/skill:name` 仍可用。

配置型扩展从 Pi 用户目录读取同名 JSON，默认目录为 `~/.pi/agent/`，遵循 `PI_CODING_AGENT_DIR`。配置文件可省略；具体默认行为、字段和限制见各扩展 README。修改 JSON 后 `/reload` 或重开。

## 更新

```sh
pi update git:github.com/JinJieBeWater/pi-stuff
```

更新后 `/reload` 或重开。使用 `@tag` 或 `@commit` 安装时，Pi 保持该引用，不会自动切到新版本。

## 卸载

```sh
pi remove git:github.com/JinJieBeWater/pi-stuff
```

这会移除整个 package；只停用其中一项请使用 `pi config`。用户 JSON 配置独立保留，移除后 `/reload` 或重开。

本仓库尚未发布 npm 包。源码开发、本地安装、兼容基线和测试说明见[开发指南](docs/development.md)。

## 许可

暂未指定整体开源许可证。第三方归属与许可见 [third-party-notices.md](packages/pi-lovely-mermaid/third-party-notices.md)；依赖遵循各自的许可证。
