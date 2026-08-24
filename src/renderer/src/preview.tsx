import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import './assets/main.css'
import { ThreadScrollContainer } from './chat/ThreadScrollContainer'
import {
  ThreadAssistantMessage,
  ThreadItem,
  ThreadItems,
  ThreadProcessSection,
  ThreadTurn,
  ThreadTurnGap,
  ThreadUserMessage
} from './chat/ThreadTurn'
import { shouldShowProcessToggle } from './chat/model/turnSections'
import { ChatContentPart } from './chat/parts/ChatContentPart'
import { MarkdownPart } from './chat/parts/MarkdownPart'
import { contentKey } from './chat/model/contentKey'
import { TodoListPart } from './chat/parts/TodoListPart'
import { ThemeProvider } from './chat/theme/ThemeProvider'
import { useTheme } from './chat/theme/themeContext'
import { THEME_VARIANTS, themeClassName } from './chat/theme/themes'
import { setTheme as publishTheme } from './chat/theme/themeStore'
import { WorkspaceProvider } from './state/WorkspaceContext'
import { AppShellProvider } from './state/AppShellContext'
import type { ThreadRow } from './chat/model/rows'

/** 临时预览页：在浏览器里核对对话区的视觉，不进产物 */

const ANSWER = `我把两处都改了。

## 改动

1. \`scripts/gen-vscode-tokens.mjs\` 里补上了尺寸注册表
2. 覆盖率自检现在会在缺变量时**直接退出**

\`\`\`ts
export function resolveLang(hint: string | null): ShikiLang | null {
  if (!hint) return null
  const key = hint.trim().toLowerCase()
  if (key in LANG_LOADERS) return key as ShikiLang
  return ALIASES[key] ?? null
}
\`\`\`

> 注意：\`transparent()\` 这类变换必须走上游自己的求值逻辑。

| 主题 | 颜色 | tokenColors |
| --- | --- | --- |
| Dark 2026 | 532 | 118 |
| Light 2026 | 532 | 113 |

细节见 [VSCode 仓库](https://github.com/microsoft/vscode)。

\`\`\`bash
npm run tokens:gen && npm run tokens:verify
\`\`\`
`

const rows: ThreadRow[] = [
  {
    kind: 'request',
    id: 't1',
    text: '帮我把 token 生成脚本的覆盖率自检补上',
    attachments: [],
    timestamp: Date.now() - 60000
  },
  {
    kind: 'response',
    id: 't1',
    content: [
      {
        kind: 'thinking',
        id: 'th1',
        title: '核对求值规则',
        items: [
          '**核对求值规则**\n\n颜色默认值里有 transparent()、darken()、oneOf() 这些变换，还会跨 id 引用。静态翻译这套规则容易出错。',
          '**决定执行上游代码**\n\n用 esbuild 把注册表打包成 ESM 直接跑，求值逻辑就是 VSCode 本身那一份。',
          '**处理无法导入的两个模块**\n\npeekView 在 browser 层，导入链会在模块初始化时真的构建 DOM。'
        ],
        isActive: false
      },
      { kind: 'markdownContent', content: ANSWER, phase: 'final_answer' },
      {
        kind: 'toolInvocation',
        invocation: {
          id: 'tool-term',
          toolId: 'shell',
          invocationMessage: 'Running npm run tokens:gen',
          pastTenseMessage: 'Ran npm run tokens:gen',
          state: { type: 'completed', success: true, durationMs: 2400 },
          data: {
            kind: 'terminal',
            commandKind: 'unknown',
            command: 'npm run tokens:gen',
            commandForDisplay: 'npm run tokens:gen',
            cwd: '/Users/me/proj',
            output: '✓ tokens.css\n  颜色 562 项 / 尺寸 47 项\n  覆盖自检 ✓ 124 个变量全部有来源',
            exitCode: 0
          }
        }
      },
      {
        kind: 'toolInvocation',
        invocation: {
          id: 'tool-fail',
          toolId: 'shell',
          invocationMessage: 'Running npm test',
          pastTenseMessage: 'Ran npm test',
          state: { type: 'completed', success: false, durationMs: 800 },
          data: {
            kind: 'terminal',
            commandKind: 'unknown',
            command: 'npm test',
            commandForDisplay: 'npm test',
            cwd: null,
            output: 'FAIL src/a.test.ts',
            exitCode: 1
          }
        }
      },
      {
        kind: 'toolInvocation',
        invocation: {
          id: 'tool-edit',
          toolId: 'apply_patch',
          invocationMessage: 'Editing src/langs.ts',
          pastTenseMessage: 'Edited src/langs.ts',
          state: { type: 'completed', success: true, durationMs: null },
          data: {
            kind: 'fileEdit',
            changes: [
              {
                path: 'src/renderer/src/shiki/langs.ts',
                operation: 'update',
                movedTo: null,
                diff: [
                  '--- a/src/renderer/src/shiki/langs.ts',
                  '+++ b/src/renderer/src/shiki/langs.ts',
                  '@@ -1,6 +1,7 @@',
                  ' export const LANG_LOADERS = {',
                  "   bash: () => import('@shikijs/langs/bash'),",
                  "-  c: () => import('@shikijs/langs/c'),",
                  "+  c: () => import('@shikijs/langs/c'),",
                  "+  cpp: () => import('@shikijs/langs/cpp'),",
                  "   css: () => import('@shikijs/langs/css'),",
                  ' }'
                ].join('\n')
              }
            ]
          }
        }
      },
      {
        kind: 'toolInvocation',
        invocation: {
          id: 'tool-mcp',
          toolId: 'github/create_issue',
          invocationMessage: 'Running create_issue',
          pastTenseMessage: 'Ran create_issue',
          state: { type: 'executing', progress: null },
          data: {
            kind: 'inputOutput',
            blocks: [],
            structuredJson: null,
            error: null,
            rawJson: '{\n  "invocation": { "tool": "create_issue" }\n}'
          }
        }
      },
      /*
       * MCP 结果的三条通道各一条 —— ① 的四样验证要靠它们:
       * 散文(长 URL 必须换行不能横向溢出)/ 整体 JSON(走代码块)/ 错误。
       */
      {
        kind: 'toolInvocation',
        invocation: {
          id: 'tool-mcp-prose',
          toolId: 'playwright/browser_navigate',
          invocationMessage: 'Running browser_navigate',
          pastTenseMessage: 'Ran browser_navigate',
          state: { type: 'completed', success: true, durationMs: 1840 },
          data: {
            kind: 'inputOutput',
            blocks: [
              {
                type: 'text',
                text: [
                  '### Ran Playwright code',
                  '',
                  '已导航到 https://www.gongkongcat.com/about?utm_source=codex&utm_medium=referral&utm_campaign=alignment-audit-2026&ref=very-long-query-string-that-must-wrap',
                  '',
                  '页面标题:工控猫 - 工业自动化产品一站式采购平台。',
                  '"工控猫"是工控网(北京)电子商务股份有限公司旗下的工业品垂直电商平台,',
                  '主营 PLC、变频器、伺服、传感器等自动化元器件。'
                ].join('\n'),
                annotations: null
              }
            ],
            structuredJson: null,
            error: null,
            rawJson: '{\n  "invocation": { "tool": "browser_navigate" }\n}'
          }
        }
      },
      {
        kind: 'toolInvocation',
        invocation: {
          id: 'tool-mcp-json',
          toolId: 'linear/list_issues',
          invocationMessage: 'Running list_issues',
          pastTenseMessage: 'Ran list_issues',
          state: { type: 'completed', success: true, durationMs: 420 },
          data: {
            kind: 'inputOutput',
            blocks: [],
            structuredJson:
              '{\n  "issues": [\n    { "id": "WS-12", "title": "对齐活动行" }\n  ]\n}',
            error: null,
            rawJson: '{\n  "invocation": { "tool": "list_issues" }\n}'
          }
        }
      },
      {
        kind: 'toolInvocation',
        invocation: {
          id: 'tool-mcp-error',
          toolId: 'fetch/fetch_url',
          invocationMessage: 'Running fetch_url',
          pastTenseMessage: 'Ran fetch_url',
          state: { type: 'completed', success: false, durationMs: 12000 },
          data: {
            kind: 'inputOutput',
            blocks: [],
            structuredJson: null,
            error: 'HTTP 403 Forbidden — 目标站点的 WAF 拦截了直接抓取',
            rawJson: '{\n  "invocation": { "tool": "fetch_url" }\n}'
          }
        }
      },
      {
        kind: 'toolInvocation',
        invocation: {
          id: 'tool-search',
          toolId: 'web_search',
          invocationMessage: 'Searching the web for vscode agent window',
          pastTenseMessage: 'Searched the web for vscode agent window',
          state: { type: 'completed', success: true, durationMs: null },
          data: {
            kind: 'search',
            query: 'vscode agent window',
            results: [
              {
                title: 'Agent Window - Visual Studio Code',
                url: 'https://code.visualstudio.com/docs/copilot/agent-window'
              },
              {
                title: 'microsoft/vscode: src/vs/sessions',
                url: 'https://github.com/microsoft/vscode'
              },
              { title: '没有 url 的一条结果（协议里是不透明 JSON）', url: null }
            ]
          }
        }
      },
      { kind: 'contextCompaction', id: 'k1' }
    ],
    isComplete: true,
    isCanceled: false,
    startedAtMs: Date.now() - 60000,
    completedAtMs: Date.now() - 47600
  },
  {
    kind: 'request',
    id: 't2',
    text: '再跑一次',
    attachments: [],
    timestamp: Date.now() - 20000
  },
  {
    kind: 'response',
    id: 't2',
    content: [
      {
        kind: 'thinking',
        id: 'th2',
        title: '正在核对覆盖率',
        items: [
          '**列出候选变量**\n\n先把对话 CSS 里出现的每一个 --vscode-* 变量抓出来，去重之后是 124 个。',
          '**分类**\n\n其中 54 个能直接命中主题 JSON，约 30 个是尺寸/圆角/间距，剩下的要走注册表默认值。',
          '**核对覆盖率**\n\n扫描上游 CSS 引用的每个变量，确认生成的 tokens.css 里都有对应的定义。',
          '**处理漏网的两个**\n\npeekView 在 browser 层导入链会真的构建 DOM，debugTokenExpression 包在函数里不会自动注册，这两个只能钉住…'
        ],
        isActive: true
      },
      {
        kind: 'errorDetails',
        level: 'error',
        message: '上游对话 CSS 引用了 2 个无来源的变量',
        isLast: true
      },
      /*
       * `phase: null` —— 复刻「调研下工控猫」那种轮次:有最终助手文本,但 provider
       * 没标 phase。Codex 在这种轮次上**不给折叠头**,过程条目直接摊开;
       * 上一版 WS 会显示「Worked for …」。对照 t1(`phase: 'final_answer'`,有折叠头)。
       */
      { kind: 'markdownContent', content: '两个变量已经钉在注册表里了。', phase: null }
    ],
    isComplete: true,
    isCanceled: false,
    startedAtMs: Date.now() - 20000,
    completedAtMs: Date.now() - 19000
  },

  // ── Phase 5：审批 / 计划 / 钩子 / 重连 / 审阅模式 ─────────────────
  {
    kind: 'request',
    id: 't3',
    text: '清掉构建产物再重来一遍',
    attachments: [],
    timestamp: Date.now() - 8000
  },
  {
    kind: 'response',
    id: 't3',
    content: [
      {
        kind: 'hook',
        id: 'h1',
        title: 'Hook added context',
        body: '当前分支是 feature/layout，改动前先确认没有未提交的内容。'
      },
      // 等待确认：终端
      {
        kind: 'toolInvocation',
        invocation: {
          id: 'tool-approve-cmd',
          toolId: 'shell',
          invocationMessage: 'Running rm -rf build',
          pastTenseMessage: null,
          state: {
            type: 'waitingForConfirmation',
            requestKey: 'cb-1',
            reason: '这条命令会删除沙箱之外的文件'
          },
          data: {
            kind: 'terminal',
            commandKind: 'unknown',
            command: 'rm -rf build',
            commandForDisplay: 'rm -rf build',
            cwd: '/Users/me/repo',
            output: null,
            exitCode: null
          }
        }
      },
      // 等待确认：文件改动（带补丁）
      {
        kind: 'toolInvocation',
        invocation: {
          id: 'tool-approve-edit',
          toolId: 'apply_patch',
          invocationMessage: 'Editing src/renderer/src/chat/ChatView.tsx',
          pastTenseMessage: null,
          state: { type: 'waitingForConfirmation', requestKey: 'cb-2', reason: null },
          data: {
            kind: 'fileEdit',
            changes: [
              {
                path: 'src/renderer/src/chat/ChatView.tsx',
                operation: 'update',
                movedTo: null,
                diff: [
                  '@@ -12,5 +12,6 @@',
                  ' export function ChatView(): React.JSX.Element {',
                  '-  const { turns, loading } = useChatRuntime()',
                  '-  const rows = useMemo(() => turnsToRows(turns), [turns])',
                  '+  const { turns, approvals, loading } = useChatRuntime()',
                  '+  const rows = useMemo(() => turnsToRows(turns, approvals), [turns, approvals])',
                  ' '
                ].join('\n')
              }
            ]
          }
        }
      },
      { kind: 'reviewMode', id: 'rv1', entered: true, review: '看看这次改动有没有漏掉的分支' },
      {
        kind: 'reconnect',
        attempt: 2,
        maxAttempts: 5,
        serverOverloaded: true,
        detail: 'HTTP 429 · retry-after 12s'
      }
    ],
    isComplete: false,
    isCanceled: false,
    startedAtMs: Date.now() - 8000,
    completedAtMs: null
  },

  // 刚发出去、什么都还没回来 —— 这一刻界面上必须有东西在动
  {
    kind: 'request',
    id: 't4',
    text: '再确认一遍搜索结果',
    attachments: [],
    timestamp: Date.now() - 1000
  },
  {
    kind: 'response',
    id: 't4',
    content: [{ kind: 'working', label: 'Thinking' }],
    isComplete: false,
    isCanceled: false,
    startedAtMs: Date.now() - 1000,
    completedAtMs: null
  }
]

function ThemeSwitcher(): React.JSX.Element {
  const { variant } = useTheme()
  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        left: 8,
        zIndex: 99,
        display: 'flex',
        gap: 4,
        fontFamily: 'system-ui',
        fontSize: 12
      }}
    >
      {THEME_VARIANTS.map((v) => (
        <button
          key={v}
          /*
           * 直接改 <html> 的类:应用里外观只跟随系统(与 Codex 一致,没有
           * 应用内选择器),但预览页必须能强制两档都走一遍,否则暗色下的
           * 回归只能靠改系统设置来验。仅限 harness。
           */
          onClick={() => {
            for (const other of THEME_VARIANTS) {
              document.documentElement.classList.toggle(themeClassName(other), other === v)
            }
            document.documentElement.style.colorScheme = v
            /*
             * 必须同时发一次 themeStore —— 光切 <html> 的类只换了 CSS 变量,
             * **Monaco 不会跟着换主题**(它订阅的是 themeStore),代码块会在
             * 深色页面上留一块白底。这是预览页专属的坑:真应用里 ThemeProvider
             * 会一起做这两件事,预览页的开关是直接改 DOM 抄近路。
             *
             * data-theme(给 .hljs-* 选档的那个)仍然由 useTheme() 的 context 决定,
             * 而 context 只跟系统外观走 —— 所以预览页切深色时代码块的
             * data-theme 仍是 light。这是预览页的已知限制,不是产品行为。
             */
            publishTheme(v)
            document.documentElement.style.colorScheme = v
          }}
          style={{ fontWeight: variant === v ? 700 : 400, padding: '2px 6px' }}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

/**
 * 预览页外壳。
 *
 * `empty` 开关不是为了好玩：应用里从首页发第一条消息时，消息流是**先以空
 * 列表挂载、随后才拿到行**的（startChat 先 resetView 再 startTurn）。
 * ThreadScrollContainer 的贴底跟随(ResizeObserver)在"挂载时 0 项"这条路径上
 * 最容易出问题，所以 harness 必须能走一遍。
 */
function Preview(): React.JSX.Element {
  const [empty, setEmpty] = useState(false)
  return (
    <>
      <ThemeSwitcher />
      <button
        onClick={() => setEmpty((v) => !v)}
        style={{
          position: 'fixed',
          top: 8,
          right: 8,
          zIndex: 99,
          fontSize: 12,
          padding: '2px 6px'
        }}
      >
        {empty ? '填充行' : '清空行'}
      </button>
      {/*
       * 外层用与 MainContentLayout / ChatView 一致的壳层类名 —— 宽度由
       * --thread-content-max-width + px-toolbar 决定,用普通 div 撑高就测不出
       * 应用里真实的布局。
       *
       * **`main` 上面这两层不能省。** AppShell 的注释里写着那条高度传递链:
       *
       *   应用根有确定高度(100vh) → 主行 flex-1 + min-h-0
       *   → aside/main 靠 align-items:stretch 自动等高
       *   —— 任何一环写成块级,后面全得手写高度
       *
       * 之前这里把 `main` 直接挂在 React 根那个**块级** div 下面:`main` 从模块
       * CSS 拿到 `flex:1`,但父级不是 flex 容器,这条声明就是死的 → 它的高度由
       * 内容决定(实测 1445px)→ 溢出 800px 的视口、被 `body{overflow:hidden}` 裁掉,
       * 而 `.thread-scroll-container` 自己和内容一样高,`scrollHeight ≈ clientHeight`
       * → **整页滚不动**。
       *
       * 之前没暴露出来只是因为 fixture 内容比视口短;这一轮补上过程段之后内容
       * 长过一屏,立刻就撞上了。
       */}
      <div className="relative flex flex-col" style={{ height: '100vh' }}>
        <div className="relative isolate flex max-h-full min-h-0 w-full flex-1">
          <main className="codex-MainContentSurface">
            <div className="relative flex h-full flex-col min-h-0">
              <ThreadScrollContainer
                footer={
                  <>
                    {/* 计划挂在输入区上方，不进回复流 —— 与上游一致 */}
                    <TodoListPart
                      todos={[
                        { title: '读上游的色彩注册表', status: 'completed' },
                        { title: '生成四套主题的 token', status: 'completed' },
                        { title: '把审批缝到工具调用上', status: 'in-progress' },
                        { title: '删掉旧的 session 视图', status: 'not-started' }
                      ]}
                    />
                    <div className="rounded-lg border border-dashed border-token-border p-3 text-size-chat text-token-description-foreground">
                      输入区占位（应用里是 Composer）
                    </div>
                  </>
                }
              >
                {empty ? (
                  <div className="text-sm text-token-description-foreground">Loading…</div>
                ) : (
                  /*
                   * 把 request / response 两行合成一个 turn —— 与 ChatView 一致。
                   * 之前是各渲染一个 `<ThreadTurn key={row.id}>`,而 fixture 里
                   * 同一轮的两行 **id 相同**,于是控制台一直在报
                   * "Encountered two children with the same key: t1"。
                   * 更要紧的是结构也不对:Codex 的一个 turn 里必须同时有用户消息
                   * 与回复,分成两个 turn 就测不到段间隔与三段式。
                   */
                  TURN_GROUPS.map((g) => (
                    <ThreadTurn key={g.key} turnKey={g.key}>
                      {g.request && (
                        <>
                          <ThreadUserMessage unitKey={g.key}>
                            <MarkdownPart
                              content={{
                                kind: 'markdownContent',
                                content: g.request.text,
                                phase: null
                              }}
                            />
                          </ThreadUserMessage>
                          <ThreadTurnGap />
                        </>
                      )}
                      {g.response && <PreviewTurnBody row={g.response} />}
                    </ThreadTurn>
                  ))
                )}
              </ThreadScrollContainer>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

/**
 * 把 request / response 合成 turn —— 与 ChatView 的线性扫描同一套判据
 * (同一轮两行 id 相同且相邻,request 在前)。
 */
const TURN_GROUPS: {
  key: string
  request?: Extract<ThreadRow, { kind: 'request' }>
  response?: Extract<ThreadRow, { kind: 'response' }>
}[] = (() => {
  const groups: {
    key: string
    request?: Extract<ThreadRow, { kind: 'request' }>
    response?: Extract<ThreadRow, { kind: 'response' }>
  }[] = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (row.kind === 'request') groups.push({ key: row.id, request: row })
    else if (last && last.key === row.id && !last.response) last.response = row
    else groups.push({ key: row.id, response: row })
  }
  return groups
})()

/**
 * 一条回复的三段式 —— 与 ChatView 里的逻辑对齐(过程 / 最终输出)。
 *
 * 分段判据刻意简化成"最后一条 markdown 是最终输出":预览页的数据是写死的
 * fixture,不需要 ChatView 那套跳过尾部推理的逻辑;要测的是**结构**
 * (折叠头 + 发丝线 + 段间隔 + 活动行),不是分段算法。
 *
 * 但**折叠头的显隐走真函数**(`shouldShowProcessToggle`)—— 这一条不能简化,
 * 它正是本轮要验的东西:t1 的最终文本标了 `final_answer` → 有折叠头;
 * t2 的标了 `null` → 没有折叠头、条目摊开。
 */
function PreviewTurnBody({
  row
}: {
  row: Extract<ThreadRow, { kind: 'response' }>
}): React.JSX.Element {
  let cut = row.content.length - 1
  while (cut >= 0 && row.content[cut].kind !== 'markdownContent') cut -= 1
  const process = cut < 0 ? row.content : row.content.filter((_, i) => i !== cut)
  const final = cut < 0 ? [] : [row.content[cut]]

  return (
    <>
      {process.length > 0 && (
        <>
          <ThreadProcessSection
            showToggle={shouldShowProcessToggle({ final, process, cancelled: row.isCanceled })}
            summary={`Worked for 1m 28s`}
          >
            <ThreadItems>
              {process.map((content, index) => (
                <ThreadItem key={contentKey(content, index)}>
                  <ChatContentPart content={content} />
                </ThreadItem>
              ))}
            </ThreadItems>
          </ThreadProcessSection>
          <ThreadTurnGap />
        </>
      )}
      <ThreadAssistantMessage unitKey={row.id} targetId={row.id}>
        <div
          data-markdown-text-style="assistant-message"
          className="codex-MarkdownRoot [&>*:last-child]:mb-0 [&>ol:first-child]:mt-0 [&>ul:first-child]:mt-0"
        >
          {final.map((content, index) => (
            <ChatContentPart key={contentKey(content, index)} content={content} />
          ))}
        </div>
      </ThreadAssistantMessage>
      <ThreadTurnGap />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  // InlineAnchor（文件改动里的路径胶囊）需要这两个 Provider 才能挂载
  <WorkspaceProvider>
    <AppShellProvider>
      <ThemeProvider>
        <Preview />
      </ThemeProvider>
    </AppShellProvider>
  </WorkspaceProvider>
)
