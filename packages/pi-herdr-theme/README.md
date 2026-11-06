# pi-herdr-theme

让 Pi 的配色跟着 Herdr App 的主题走，包括 16 色调色板。

在 Herdr 里，Pi 的 `system` 主题从 Herdr Core 取色。Herdr App 会把前景、背景和光标色告诉 Core，但不传 16 色调色板，Core 对调色板查询回答的是自己的默认值，所以色相会偏。本扩展读取 Herdr App 画界面实际用的那组颜色（主题文件里写的，加上 Herdr 替没写的推算出来的），再用 Pi 生成 `system` 主题的同一套算法生成 `~/.pi/agent/themes/herdr.json`。主题文件只写了终端色时，Pi 和 Herdr 也用同一组强调色、灰字和选中色。

- 颜色来自 [Herdr T3](https://github.com/JinJieBeWater/herdr-t3) 的可选扩展 [`t3-theme-export`](https://github.com/JinJieBeWater/herdr-t3/tree/main/extras/mods/t3-theme-export)，它是本扩展在 Herdr 那一侧的部分，需要另外装进 Herdr，装法见[它的说明](https://github.com/JinJieBeWater/herdr-t3/blob/main/README.zh-CN.md#给-pi-用的主题导出)。Herdr 当前显示的颜色一变（设置页点选、布局主题、系统明暗、内置预设都算），它就写到 `~/.cache/herdr-app-theme.json`；它只在放了它的块的布局里运行，切到其他布局后 Pi 保持原来的颜色。本扩展只监听这个文件，所有 Pi 读的是同一份输入。没有这个文件时保持现有配色。两边只靠这个路径和 `{ name, colors }` 格式对接，改的时候要一起改。
- 卡片底色接近灰：成功卡片用 Herdr 的 `selected` 色，失败和消息只留很淡的色相；颜色留给文字。
- 文字强调色和 Herdr 一致：标题用 `solid`，强调、列表符号、流程图箭头用 `accent`，灰字用 `muted`/`dim`，分隔线、成功色和字符串取调色板原色。文字色在终端背景上看不清时保留生成器的颜色，例如浅色背景上的部分调色板原色，以及面板和终端底色不同的 `win98`。警告始终用生成器的黄色，因为只写了终端色的主题里 `blocked` 是红色，会和错误混淆。
- 行内代码学 Codex，退回主题的 `accent`；`accent` 和链接蓝色相太近时保留调色板的洋红，免得和链接混淆。
- Herdr 的颜色可以半透明，Pi 不行，所以半透明颜色都先压到背景上。
- 在 `settings.json` 里设 `"theme": "herdr"`。
- 重新生成后 Pi 热加载，不用 `/reload`。只有第一次例外：Pi 启动时如果还没有 `herdr.json`，会退回 `system` 且不监听这个文件，等导出出现后要重启 Pi 或执行一次 `/reload`。
- 生成失败时 Pi 里会提示一次原因。

改回其他主题并从 `packages` 删除本包即可恢复。
