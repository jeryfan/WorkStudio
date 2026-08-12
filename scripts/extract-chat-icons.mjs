#!/usr/bin/env node
/**
 * 从 prototype/chat.html 提取内联 SVG，生成 React 图标组件。
 * 目标目录：src/renderer/src/components/icons/extracted/（与 sider 提取物同约定）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const html = fs.readFileSync(path.join(root, 'prototype/chat.html'), 'utf8')
const outDir = path.join(root, 'src/renderer/src/components/icons/extracted')

/** 取包含指定片段的完整 <svg>...</svg>（片段在 svg 内部或之前最近的 svg） */
function svgAround(fragment, from = 0) {
  const i = html.indexOf(fragment, from)
  if (i < 0) throw new Error(`fragment not found: ${fragment.slice(0, 60)}`)
  const start = html.lastIndexOf('<svg', i)
  const end = html.indexOf('</svg>', i)
  if (start < 0 || end < 0 || end < start)
    throw new Error(`svg boundary broken: ${fragment.slice(0, 60)}`)
  return html.slice(start, end + 6)
}

/** 指定标记之后最近的 <svg>...</svg> */
function svgAfter(marker) {
  const i = html.indexOf(marker)
  if (i < 0) throw new Error(`marker not found: ${marker}`)
  const start = html.indexOf('<svg', i)
  const end = html.indexOf('</svg>', i)
  if (start < 0 || end < 0) throw new Error(`svg not found after: ${marker}`)
  return html.slice(start, end + 6)
}

/** tm-item 内 <img src="data:image/svg+xml;base64,..."> 解码出的 svg */
function tmImgSvg(title) {
  const item = tmItems.find((m) => m[1].includes(`<span class="ttitle">${title}</span>`))
  if (!item) throw new Error(`tm-item not found: ${title}`)
  const m = item[1].match(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/)
  if (!m) throw new Error(`tm-item svg img not found: ${title}`)
  return Buffer.from(m[1], 'base64').toString('utf8')
}

/** svg 文本 → JSX 主体（属性名驼峰化、去 xmlns/class） */
function toJsx(svg) {
  let s = svg.trim()
  s = s.replace(/\s*xmlns="[^"]*"/, '')
  s = s.replace(/\s*class="[^"]*"/, '')
  s = s.replace(/fill-rule=/g, 'fillRule=')
  s = s.replace(/clip-rule=/g, 'clipRule=')
  s = s.replace(/stroke-width=/g, 'strokeWidth=')
  s = s.replace(/stroke-linecap=/g, 'strokeLinecap=')
  s = s.replace(/stroke-linejoin=/g, 'strokeLinejoin=')
  s = s.replace(/<svg /, '<svg className={className} ')
  return s
}

function component(name, svg, comment) {
  return `import type { IconProps } from '../types'

/** ${comment} */
export function ${name}({ className }: IconProps): React.JSX.Element {
  return ${toJsx(svg)}
}
`
}

// 加号菜单 Add 区：每个 tm-item 的图标取「标题文本所在 svg 容器」——
// 图标在标题之前，因此用标题文本往前回溯最近的 <svg 会拿到错的，改用顺序扫描。
const tmItems = [...html.matchAll(/<button class="tm-item[^"]*">([\s\S]*?)<\/button>/g)]
const tmSvg = (title) => {
  const item = tmItems.find((m) => m[1].includes(`<span class="ttitle">${title}</span>`))
  if (!item) throw new Error(`tm-item not found: ${title}`)
  const m = item[1].match(/<svg[\s\S]*?<\/svg>/)
  if (!m) throw new Error(`tm-item svg not found: ${title}`)
  return m[0]
}

const targets = [
  [
    'PaperclipIcon',
    tmSvg('Files and folders'),
    'chat.html 加号菜单「Files and folders」回形针图标'
  ],
  [
    'WorkProjectIcon',
    tmSvg('Work in a project'),
    'chat.html 加号菜单「Work in a project」文件夹图标'
  ],
  ['GoalIcon', tmSvg('Goal'), 'chat.html 加号菜单「Goal」图标'],
  ['PlanModeIcon', tmSvg('Plan mode'), 'chat.html 加号菜单「Plan mode」灯泡图标'],
  ['RecordSkillIcon', tmSvg('Record a skill'), 'chat.html 加号菜单「Record a skill」图标'],
  [
    'TemplateIcon',
    tmImgSvg('Template Creator'),
    'chat.html 加号菜单插件区「Template Creator」图标'
  ],
  ['VisualizeIcon', tmImgSvg('Visualize'), 'chat.html 加号菜单插件区「Visualize」图标'],
  [
    'HandIcon',
    svgAround('<svg class="bic"', html.indexOf('id="popAccess"')),
    'chat.html 权限弹层「Ask for approval」手形图标'
  ],
  ['CheckIcon', svgAround('<svg class="rcheck"'), 'chat.html 弹层选项的选中勾选图标（rcheck）'],
  [
    'CircleCloseIcon',
    svgAfter('id="clearProject"'),
    'chat.html 项目 pill 的圆形取消图标（clearProject）'
  ]
]

for (const [name, svg, comment] of targets) {
  fs.writeFileSync(path.join(outDir, `${name}.tsx`), component(name, svg, comment))
  console.log(`written ${name}.tsx (${svg.length} chars)`)
}
