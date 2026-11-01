# show-me

[简体中文](README.md) | [English](README.en.md)

Choose between code sketches, exact tables, everyday relationship diagrams, basic data charts, product design materials, specialized figures, and interactive HTML. Keep the user's chosen tool or format, and use the original tool when editing an existing specification.

| Version | Source                                             | Invocation                                                                                                                 |
| ------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Pi      | [pi/show-me/SKILL.md](pi/show-me/SKILL.md)         | Registered by the root Pi package; supports automatic discovery and `/skill:show-me`, with local native rendering guidance |
| Shared  | [shared/show-me/SKILL.md](shared/show-me/SKILL.md) | Explicit invocation; retains `disable-model-invocation: true` and OpenAI's explicit invocation policy                      |

The two versions retain their hosts' respective invocation modes. The root manifest declares only the Pi version, avoiding discovery of two Skills with the same name. User directory entries can symlink to the appropriate version, with the text maintained in this repository.

For example, in Pi:

```text
/skill:show-me Explain how these components work together
```

## Drawing dependencies

Basic code sketches and tables work directly. Pi's native relationship diagrams and data charts use this repository's `pi-lovely-mermaid` and the separately installed `pi-unicode-charts`, respectively.

## Source and license

`show-me` is based on [HumanLayer's original Skill](https://github.com/humanlayer/skills/tree/main/plugins/show-me/skills/show-me). This repository adds tool selection and Pi rendering rules. Both version directories include the original [MIT license](pi/show-me/LICENSE), retaining HumanLayer's copyright notice. This does not change the licensing scope of the rest of the repository.
