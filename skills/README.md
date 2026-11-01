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

## 来源和许可

`show-me` 基于 [HumanLayer 的原始 Skill](https://github.com/humanlayer/skills/tree/main/plugins/show-me/skills/show-me)，本仓库加入工具分工和 Pi 渲染规则。两版目录均附原始 [MIT 许可](pi/show-me/LICENSE)，版权声明保留为 HumanLayer；仓库其他部分的许可范围不因此改变。
