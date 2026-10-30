# Pi Lovely Mermaid

用 `lovely-mermaid 0.3.3` 替换 Pi 聊天中的原生 Mermaid 渲染。普通 Mermaid 代码块会直接显示为终端字符图，支持 Pi 主题、作者定义的节点样式和终端超链接，不需要模型调用额外工具。

## 启用

通过 Pi 原生 Git package 安装，在 `pi config` 中按需启用本扩展：

```sh
pi install git:github.com/JinJieBeWater/pi-stuff
pi config
```

整个 package 的更新、卸载和单入口过滤见[仓库说明](../../README.md#安装)。在 Pi 的个人设置中将原生渲染关闭：

```json
{
  "markdown": {
    "mermaid": "off"
  }
}
```

已有 Pi 会话执行 `/reload` 后生效。原生 transformer 先于扩展执行，因此项目设置也应保持 `markdown.mermaid` 为 `off`。该设置只控制原生渲染；扩展启用期间会持续渲染。

直接发送包含 `flowchart TD` 等 Mermaid 代码块的消息即可。用户和助手消息都会渲染，思考块保持原样；窗口和主题变化时重新渲染。超链接只应用到节点文字，并以终端能力检测结果为准。

文字和边框跟随 Pi 当前主题的代码块配色，连线使用强调色；作者定义的节点样式优先。

## 边界

- 不含 Mermaid 关键字的普通消息原样透传，跳过 Markdown 解析。
- 只处理顶层 Mermaid 代码块，与目前的原生实现一致。
- 超宽或不支持的图保留源码；本扩展不增加滚动、缩放或宽度重排。
- 流式输出尽量渲染；完成后如果解析器报告警告，则显示源码和警告，避免隐藏未能画出的内容。
- 仅改变交互式聊天的显示，不改写会话、模型上下文或 HTML 导出。

恢复原生渲染：在 `pi config` 中停用本扩展，把 `markdown.mermaid` 改回 `streaming`，再执行 `/reload`。

## 验证与来源

在本 package 目录运行 `bun run test` 和 `bun run check-types`。测试通过扩展注册的公开 Markdown transformer 检查实际渲染结果；开发依赖由仓库根目录的 Bun workspace 安装提供。

接入方式参考 [Pi PR #8158](https://github.com/earendil-works/pi/pull/8158)，Markdown 行编码沿用 Pi 的处理方式。渲染器来自 [lovely-mermaid](https://github.com/xl0/lovely-mermaid)，使用其已发布版本，不修改上游文件。许可证与署名见[第三方声明](third-party-notices.md)。
