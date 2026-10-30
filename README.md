# pi-stuff

个人维护的 [Pi](https://github.com/earendil-works/pi) 扩展与扩展清单。

## 自己的扩展

| Package                                                 | 用途                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| [pi-lovely-mermaid](packages/pi-lovely-mermaid)         | 用终端字符图显示 Mermaid，跟随 Pi 主题                            |
| [pi-borderless-tables](packages/pi-borderless-tables)   | 将回复中的 Markdown 表格显示为无框对齐表                          |
| [pi-herdr-session-move](packages/pi-herdr-session-move) | 通过 Herdr 将当前 Pi 对话转到另一个已有目录，不移动代码或操作 Git |
| [pi-drop-session](packages/pi-drop-session)             | `/drop` 回收当前会话文件并打开新会话                              |
| [pi-context-policy](packages/pi-context-policy)         | 按环境条件添加配置驱动的系统提示词段落                            |
| [pi-tool-exposure](packages/pi-tool-exposure)           | 通过 Pi package discovery 按配置调整工具暴露方式                  |
| [pi-skill-discovery](packages/pi-skill-discovery)       | 核心 Skill 目录与按需关键词查找                                   |

[按用途浏览扩展与 Skills 清单](docs/pi-extensions.md)。

## 安装

使用 Pi 原生 Git package 安装，无需手动 clone、安装 Bun 或运行构建：

```sh
pi install git:github.com/JinJieBeWater/pi-stuff
pi config
```

Pi 下载仓库并安装运行依赖，默认加载表中的七项扩展；在 `pi config` 中按需关闭。已有会话执行 `/reload` 或重开。当前以 Pi 1.4 为验证基线。

也可在个人 `settings.json` 中明确选择入口，例如只加载 `/drop`：

```json
{
  "packages": [
    {
      "source": "git:github.com/JinJieBeWater/pi-stuff",
      "extensions": ["packages/pi-drop-session/index.ts"]
    }
  ]
}
```

Mermaid 扩展需要关闭 Pi 的原生 Mermaid 渲染，具体设置见它的 README；会话搬迁扩展另需 Herdr，并且只在 Herdr 环境中启用。

配置型插件从 Pi 用户目录读取同名 JSON（遵循 `PI_CODING_AGENT_DIR`），修改后 `/reload` 或重开。各插件 README 包含配置示例；Herdr 默认说明可通过 `pi-context-policy` 覆盖。`/drop` 还需可信的回收站命令；工具暴露适配需按其 README 避免重复加载。

## 更新

```sh
pi update git:github.com/JinJieBeWater/pi-stuff
```

更新后 `/reload` 或重开。使用 `@tag` 或 `@commit` 安装时，Pi 保持该引用，不会自动切到新版本。

## 卸载

```sh
pi remove git:github.com/JinJieBeWater/pi-stuff
```

这会移除整个 package；只停用其中一项请使用 `pi config`。用户 JSON 配置独立保留。

## 开发

```sh
git clone https://github.com/JinJieBeWater/pi-stuff.git
cd pi-stuff
bun install --frozen-lockfile
bun run check        # 格式、lint、各 package 的类型检查
bun run test         # 单元和生命周期测试，不启动真实会话搬迁
bun run format       # 格式化
```

使用 Bun workspaces 和 Vite+。可选 Git hooks：`bun run hooks:setup`。

开发时仍可 `pi install ./packages/pi-drop-session` 等单独加载本地 package；本地目录的依赖由开发者安装。不要同时加载 Git package 和它包含的本地入口，以免重复注册。本仓库通过 Git 分发，尚未发布 npm 包。

## 许可

暂未指定整体开源许可证。第三方归属与许可见 [third-party-notices.md](packages/pi-lovely-mermaid/third-party-notices.md)；依赖遵循各自的许可证。
