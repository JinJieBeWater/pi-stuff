# show-me

统一选择代码草图、精确表格、日常关系图、基础数据图、产品设计材料、专业图和交互 HTML。保留用户指定的工具或格式，修改已有规格时沿用原工具。

| 版本 | 源文件                                             | 调用方式                                                                 |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| Pi   | [pi/show-me/SKILL.md](pi/show-me/SKILL.md)         | 随根 Pi 包注册，支持自动发现和 `/skill:show-me`；含本机原生渲染说明      |
| 通用 | [shared/show-me/SKILL.md](shared/show-me/SKILL.md) | 显式调用；保留 `disable-model-invocation: true` 和 OpenAI 的显式调用策略 |

两版保留不同宿主的调用方式。根 manifest 只声明 Pi 版，避免发现两个同名 Skill。用户目录可用软链指向对应版本，正文由仓库维护。

例如在 Pi 中：

```text
/skill:show-me 解释这几个组件如何配合
```

## 绘图依赖

基础代码草图和表格可以直接使用。Pi 原生关系图和数据图分别由本仓库的 `pi-lovely-mermaid` 与单独安装的 `pi-unicode-charts` 提供。

产品设计和专业数据图读取以下共享安装位置；使用前将 `~` 展开为当前用户目录：

| 工具      | Skill 路径                                    | 安装来源                                                                                                                   |
| --------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Glyph kit | `~/.agents/skills/glyph-kit/SKILL.md`         | [官方 v0.3.0](https://github.com/alextraykov/glyph-kit/releases/tag/v0.3.0)，按官方说明安装完整 Skill 目录                 |
| GlyphCSS  | `~/.agents/skills/glyphcss-diagrams/SKILL.md` | [用户 fork](https://github.com/JinJieBeWater/glyphcss-diagrams)，在其 checkout 中运行 `node install.mjs --provider agents` |

这两个第三方项目列在[个人配置清单](../docs/personal-setup.md)中，不随 `pi-stuff` 复制或自动安装。GlyphCSS fork 的自动发现已关闭，`show-me` 通过固定路径按需读取；显式调用仍可用。GlyphCSS 运行需 Node.js 22+，Glyph kit 需 Node.js 18+。

缺少依赖时使用能忠实表达输入的已有工具，或说明缺少哪项能力。GlyphCSS 当前会将部分中文标签替换成 `??`，不能把这种输出当作完整结果；中文优先使用原生 Mermaid、Glyph kit 或其他可保留标签的表达。

## 来源和许可

`show-me` 基于 [HumanLayer 的原始 Skill](https://github.com/humanlayer/skills/tree/main/plugins/show-me/skills/show-me)，本仓库加入工具分工、Glyph kit/GlyphCSS 调用和 Pi 渲染规则。两版目录均附原始 [MIT 许可](pi/show-me/LICENSE)，版权声明保留为 HumanLayer；仓库其他部分的许可范围不因此改变。
