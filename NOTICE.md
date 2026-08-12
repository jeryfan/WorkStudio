# 第三方素材与代码来源

本项目的对话界面移植自 [Visual Studio Code](https://github.com/microsoft/vscode) 的
Agent Window（`src/vs/sessions/` + `src/vs/workbench/contrib/chat/`）。

## Visual Studio Code — MIT License

Copyright (c) Microsoft Corporation.

以下内容源自 VSCode，或由其源码生成：

- `src/renderer/src/chat/media/**` —— 从 `workbench/contrib/chat/browser/widget/media/`
  与 `sessions/contrib/chat/browser/media/` 移植的样式
- `src/renderer/src/chat/theme/tokens.css` —— 由 `scripts/gen-vscode-tokens.mjs`
  执行 VSCode 的颜色/尺寸注册表生成
- `src/renderer/src/chat/theme/vscode-themes/*.json` —— VSCode 内置默认主题
  （Dark 2026 / Light 2026 / Default High Contrast / Default High Contrast Light）
  的扁平化产物
- `src/renderer/src/chat/parts/**` —— 按 `chatContentParts/` 的 DOM 结构与交互语义
  在 React 中重写

MIT License 全文见 https://github.com/microsoft/vscode/blob/main/LICENSE.txt

## Codicons — CC BY 4.0

Copyright (c) Microsoft Corporation.

图标字体 `@vscode/codicons`（`codicon.ttf`）按
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
授权使用；其随附代码按 MIT 授权。

## monaco-editor — MIT License

Copyright (c) Microsoft Corporation. 用于对话中的代码块与 diff 渲染。

## shiki — MIT License

Copyright (c) Pine Wu. 提供 TextMate 语法与主题着色，并经 `@shikijs/monaco`
作为 Monaco 的分词器。
