# 本地 Pi 维护状态

[简体中文](local-maintenance-audit-2026-11-01.md) | [English](local-maintenance-audit-2026-11-01.en.md)

核对日期：2026-11-01。扩展和 Skills 见[仓库 README](../README.md)，个人使用策略见[配置归档](../config/README.md)。这里记录仓库外实现的来源、部署差异和维护缺口。

## 本地 fork 与安装来源

源码维护在 `~/my/personal/fork/howaboua-pi-stuff`，当前本地 HEAD 为 `328c437`。本仓库保存使用配置，第三方实现和构建脚本继续在 fork 维护。

| 组件             | 当前加载来源                                  | 本地改动                                               |
| ---------------- | --------------------------------------------- | ------------------------------------------------------ |
| Browser 0.0.13   | npm 目录中的本地 tarball 安装                 | 首次操作时加载后端，`84933b1`                          |
| Notes 0.0.13     | npm 目录中的本地 tarball 安装                 | Node ESM 入口与 context-sharing，`32b7b21`             |
| Shepherdr 0.2.25 | fork 的 `packages/pi-shepherdr/dist/index.js` | Node ESM 入口 `1ede1a6`，Core agent 状态摘要 `328c437` |

Browser 和 Notes 的安装归档来自固定提交 `32b7b21b2036eaba1a68881c8b025f58bf0736aa`，存于 `~/.pi/agent/packages/startup-32b7b21-20261101-135354/`。其中 `README.md`、`installation.json` 记录 tarball、哈希、备份和当时的安装验证。原记录包含三个包；Shepherdr 现已改为加载本地 fork，npm 目录不再安装它。

恢复 Browser/Notes 时同时保留源码提交和安装归档；版本号沿用了源码版本，不能单凭版本号识别这些构建。当前 npm 依赖使用 `file:` 指向归档，后续包更新可能覆盖定制。重建使用 fork 各包的 `build` / `prepack`；本地 Shepherdr 的 `build` 生成配置所指向的 `dist/index.js`。

## 补丁部署差异

| 补丁                                      | 当前状态                                                |
| ----------------------------------------- | ------------------------------------------------------- |
| Notes/History 非法字段列出支持字段        | 已安装源码及 `dist/index.js` 均包含 `supported fields:` |
| Board 描述注明回复使用 `post + thread_id` | fork 已有；已安装的 npm 0.0.4 尚无该提示                |

部署状态按实际加载文件核对，fork 有提交不代表本机已加载。

## 仍需维护的内容

- **跨机同步**：`~/my/tools/pi-config-sync/` 的 `sync.sh` 和 `self-check.py` 仍在独立目录维护。脚本默认 dry-run，有白名单、备份和主机差异合并；当前白名单未覆盖 rpiv-todo。继续使用前核对本地 package 路径及目标机部署方式，保留私人载荷在仓库外。
- **组合验收**：`~/.pi/agent/startup-optimization/` 保存本机审计脚本。仍有价值的目标是最终系统提示、Skill 可发现性、todo 契约，以及原生 Codemode 与 PCC normal 组合后的工具注册。提炼时使用本仓库的 Vite+ 测试和隔离夹具；旧脚本有硬编码路径和已移除的 `pi-reply-visuals` 断言，不能整体当作现行验收。

本次按当前配置、安装 manifest 和源码核对；未重跑启动性能、模型调用或真实远端同步。安装记录中的历史验证不计作本次通过。
