// 从 /tmp/extracted-icons.json 生成 React 图标组件(一次性脚本)
import fs from 'node:fs'

const { svgs } = JSON.parse(fs.readFileSync('/tmp/extracted-icons.json', 'utf8'))
const dir = 'src/renderer/src/components/icons/extracted/composer'
fs.mkdirSync(dir, { recursive: true })
const toPascal = (s) => s.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('')

for (const [name, svg] of Object.entries(svgs)) {
  if (!svg) continue
  const open = svg.match(/<svg([^>]*)>/)[1]
  const body = svg.replace(/<svg[^>]*>/, '').replace('</svg>', '').trim()
  const get = (attr) => (open.match(new RegExp(attr + '="([^"]*)"')) || [, ''])[1]
  const w = get('width') || '20'
  const h = get('height') || '20'
  const vb = get('viewBox') || '0 0 20 20'
  const fill = get('fill')
  const comp = toPascal(name) + 'Icon'
  const lines = [
    `import type { IconProps } from '../../types'`,
    ``,
    `/** Codex composer 实测图标 —— 运行时 DOM 逐项提取 */`,
    `export function ${comp}({ className }: IconProps): React.JSX.Element {`,
    `  return (`,
    `    <svg`,
    `      width="${w}"`,
    `      height="${h}"`,
    `      viewBox="${vb}"`,
    fill ? `      fill="${fill}"` : null,
    `      xmlns="http://www.w3.org/2000/svg"`,
    `      className={className}`,
    `    >`,
    ...body.split('\n').map((l) => '      ' + l.trim()),
    `    </svg>`,
    `  )`,
    `}`,
    ``
  ].filter((l) => l !== null)
  fs.writeFileSync(`${dir}/${comp}.tsx`, lines.join('\n'))
}
console.log('done')
