# Pi Skill Discovery

只在系统提示词中展示配置的核心 Skill 目录，其余可自动调用的 Skills 通过只读工具 `skill_search` 按需查找。只缩减目录元数据，不删除原生 Skill 注册、不改写正文，也不影响显式 `/skill:name` 调用。

## 安装

随[仓库 Git package](../../README.md#安装)安装，入口为 `packages/pi-skill-discovery/index.ts`。可用 `pi config` 单独停用；更新和卸载方式见仓库说明。

## 使用

模型可先查找任务关键词或 Skill 名称，再读取返回路径上的原始 `SKILL.md`。普通问题不需要强制搜索。

```text
skill_search({"query":"任务关键词或 Skill 名称"})
```

`query` 长度为 `1..256`，不接受额外参数；空白或不含词语的输入会失败。返回值包含：

- `matches`：每项的 `name`、`description` 和原文件 `path`，不包含 Skill 正文。
- `truncated`：是否还有未返回的词法匹配结果。

标记 `disable-model-invocation` 的 Skills 不展示，也不参与搜索；它们的原生注册仍保留。

## 配置

可选文件：`~/.pi/agent/pi-skill-discovery.json`。设置 `PI_CODING_AGENT_DIR` 时改从该目录读取。配置在加载时读取，修改后 `/reload` 或重开。

```json
{
  "coreSkills": [],
  "maxResults": 5
}
```

| 字段         | 默认值 | 含义                                            |
| ------------ | ------ | ----------------------------------------------- |
| `enabled`    | `true` | 是否精简目录并注册搜索工具                      |
| `coreSkills` | `[]`   | 需要保留展示的 Skill 名称，区分大小写且精确匹配 |
| `maxResults` | `5`    | 单次返回上限，整数范围 `1..20`                  |

**默认核心名单为空，所有可自动调用的 Skills 都按需查找。** 名称必须非空、唯一且没有首尾空白。支持 UTF-8 BOM；未知字段、无效值、错误 JSON 和读取错误会报错，只有文件不存在时使用默认值。

## 边界

- 搜索在本地对名称和描述做词法匹配：NFKC 规范化、转为小写、`Intl.Segmenter` 分词和加权子串评分。名称完全匹配优先，同分按名称排序。
- 不翻译查询、不推断同义词、不做语义路由，也不执行 Skill。跨语言搜索应使用原始名称或描述中出现的词语。
- 目录快照在每轮 agent 启动前刷新，按会话和工作目录隔离，关闭会话时清除。首轮启动前，或更换目录后尚未开始新一轮时，直接调用会报告目录不可用。

## 开发

通用命令见[开发指南](../../docs/development.md#验证)。本包测试使用临时配置和合成 Skill 目录，不请求模型。
