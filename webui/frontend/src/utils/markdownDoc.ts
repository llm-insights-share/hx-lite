import { marked } from 'marked'
import DOMPurify from 'dompurify'

/** Parse leading YAML front matter between --- markers (skill SKILL.md formatter). */
export function parseYamlFrontMatter(src: string): { meta: Record<string, string>; body: string } {
  const text = (src || '').replace(/^\uFEFF/, '')
  if (!text.startsWith('---')) return { meta: {}, body: src }
  const afterOpen = text.slice(3).replace(/^\r?\n/, '')
  const endMatch = afterOpen.match(/\r?\n---[ \t]*(?:\r?\n|$)/)
  if (!endMatch || endMatch.index === undefined) return { meta: {}, body: src }
  const yamlBlock = afterOpen.slice(0, endMatch.index)
  const body = afterOpen.slice(endMatch.index + endMatch[0].length)
  const meta: Record<string, string> = {}
  let currentKey = ''
  for (const line of yamlBlock.split(/\r?\n/)) {
    if (!line.trim()) continue
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (kv && !/^[ \t]/.test(line)) {
      currentKey = kv[1]
      let val = kv[2] ?? ''
      if (
        (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
        (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
      ) {
        val = val.slice(1, -1)
      }
      if (val === '>' || val === '|' || val === '>-' || val === '|-') {
        meta[currentKey] = ''
      } else {
        meta[currentKey] = val
      }
      continue
    }
    if (currentKey && /^[ \t]/.test(line)) {
      const cont = line.replace(/^[ \t]+/, '')
      meta[currentKey] = meta[currentKey] ? `${meta[currentKey]} ${cont}` : cont
    }
  }
  return { meta, body }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderFrontMatterTable(meta: Record<string, string>): string {
  const keys = Object.keys(meta)
  if (!keys.length) return ''
  const preferred = ['name', 'description']
  const ordered = [...preferred.filter((k) => k in meta), ...keys.filter((k) => !preferred.includes(k))]
  const rows = ordered
    .map((k) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(meta[k])}</td></tr>`)
    .join('')
  return `<table class="fm-meta"><tbody>${rows}</tbody></table>`
}

export function renderMarkdownDocument(src: string): string {
  const { meta, body } = parseYamlFrontMatter(src)
  const table = renderFrontMatterTable(meta)
  const mdHtml = marked.parse(body || '', { async: false }) as string
  return DOMPurify.sanitize(table + mdHtml)
}
