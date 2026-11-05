# pi-herdr-theme

让 Pi 的配色跟着 Herdr App 的主题走，包括 16 色调色板。

在 Herdr 里，Pi 的 `system` 主题从 Herdr Core 取色，但 Core 不知道 Herdr App 的调色板，回答的是自己的默认值，所以颜色会偏。本扩展读取 Herdr App 画界面实际用的那组颜色（主题文件里写的，加上 Herdr 替没写的推算出来的），再用 Pi 生成 `system` 主题的同一套算法生成 `~/.pi/agent/themes/herdr.json`。主题文件只写了终端色时，Pi 和 Herdr 也用同一组强调色、灰字和选中色。

- 颜色来自 [Herdr T3](https://github.com/JinJieBeWater/herdr-t3) 的可选扩展 [`t3-theme-export`](https://github.com/JinJieBeWater/herdr-t3/tree/main/extras/mods/t3-theme-export)，它是本扩展在 Herdr 那一侧的部分，需要另外装进 Herdr，装法见[它的说明](https://github.com/JinJieBeWater/herdr-t3/blob/main/README.zh-CN.md#给-pi-用的主题导出)。Herdr 当前显示的颜色一变（设置页点选、布局主题、系统明暗、内置预设都算），它就写到 `~/.cache/herdr-app-theme.json`。本扩展只监听这个文件，所有 Pi 读的是同一份输入。没有这个文件时保持现有配色。两边只靠这个路径和 `{ name, light, colors }` 格式对接，改的时候要一起改。
- 卡片底色接近灰：成功卡片用 Herdr 的 `selected` 色（半透明时压到背景上），失败和消息只留很淡的色相；颜色留给文字。
- 文字强调色和 Herdr 一致：标题用 `solid`，强调、列表符号、流程图箭头用 `accent`，灰字用 `muted`/`dim`，警告用 `blocked`，成功和分隔线取调色板原色。
- 行内代码学 Codex，退回主题的 `accent`；`accent` 和链接蓝色相太近时保留调色板的洋红，免得和链接混淆。
- 在 `settings.json` 里设 `"theme": "herdr"`。
- 重新生成后 Pi 热加载，不用 `/reload`。

改回其他主题并从 `packages` 删除本包即可恢复。
