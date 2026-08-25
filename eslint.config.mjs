import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  // 协议类型由 npm run protocol:gen 从 agent 二进制导出，不参与代码风格检查
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      'src/shared/protocol/generated',
      'resources/agent',
      /*
       * 逆向取证的产物不是本项目代码。
       *
       * `reverse/` 里是 Codex 打包后的 JS（329MB，单文件动辄几 MB），
       * 不排掉的话 `npm run lint` 会在解析这些文件时把 V8 堆打爆 ——
       * 表现是打印一段 V8 backtrace 然后 **exit 0**，看起来像"检查通过"，
       * 实际上一条规则都没跑完。踩过一次，别再让它伪装成绿灯。
       */
      'reverse',
      'prototype',
      '.playwright-mcp'
    ]
  },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      // TypeScript props 已由类型系统校验，prop-types 在 TS 组件上只会误报
      'react/prop-types': 'off'
    }
  },
  // 构建脚本是纯 Node JS，TS 专属规则不适用
  {
    files: ['scripts/**/*.mjs'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },
  // 对话区视觉核对用的预览入口：它是页面入口而不是组件模块，
  // react-refresh 的"只导出组件"规则不适用（它什么都不导出）
  {
    files: ['src/renderer/src/preview.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off'
    }
  },
  // ── chat 的分层边界 ──────────────────────────────────────────────
  //
  // 对话区分四层：model（形状）← adapter（唯一认识协议的地方）← parts/rows（渲染）。
  // 这套分层的全部价值在于"协议变了只有 adapter 会崩"。一旦渲染层直接
  // import 了 @shared/protocol，价值当场归零，而且这种越界在 code review 里
  // 很难看出来——它长得和普通 import 一模一样。所以交给 lint 挡。
  {
    files: ['src/renderer/src/chat/**/*.{ts,tsx}'],
    ignores: ['src/renderer/src/chat/adapter/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@shared/protocol', '@shared/protocol/*', '**/shared/protocol/*'],
              message:
                '渲染层不认识协议。Entry → ChatContent 的转换只能发生在 chat/adapter/，' +
                '那里是唯一允许 import 协议类型的地方。'
            }
          ]
        }
      ]
    }
  },
  // model 层是纯形状定义：不许碰 React，也不许碰协议
  {
    files: ['src/renderer/src/chat/model/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', '@shared/protocol', '@shared/protocol/*'],
              message: 'model 层只放类型与纯函数。需要 React 的放 parts/，需要协议的放 adapter/。'
            }
          ]
        }
      ]
    }
  },
  eslintConfigPrettier
)
