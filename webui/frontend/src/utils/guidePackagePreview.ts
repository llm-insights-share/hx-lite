/** Guide package file preview/edit helpers (docx/xlsx/md). */

import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { Document, Packer, Paragraph, TextRun } from 'docx'
import DOMPurify from 'dompurify'

export function fileExt(path: string): string {
  const n = path.split('/').pop() || path
  const i = n.lastIndexOf('.')
  return i >= 0 ? n.slice(i + 1).toLowerCase() : ''
}

export function filterPackageFilesForKind(files: string[], kind: string): string[] {
  if ((kind || '') !== 'guide.template') return files
  return files.filter((f) => (f.split('/').pop() || '').toLowerCase() !== 'skill.md')
}

export function htmlToPlainParagraphs(html: string): string[] {
  const div = document.createElement('div')
  div.innerHTML = html || ''
  const blocks = Array.from(div.querySelectorAll('p, h1, h2, h3, h4, li, div'))
  const lines: string[] = []
  if (blocks.length) {
    for (const el of blocks) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
      if (t) lines.push(t)
    }
  } else {
    const t = (div.textContent || '').trim()
    if (t) lines.push(...t.split(/\n+/).map((s) => s.trim()).filter(Boolean))
  }
  return lines.length ? lines : ['']
}

export async function arrayBufferToDocxHtml(buf: ArrayBuffer): Promise<string> {
  const result = await mammoth.convertToHtml({ arrayBuffer: buf })
  return DOMPurify.sanitize(result.value || '')
}

export async function htmlToDocxBlob(html: string): Promise<Blob> {
  const paras = htmlToPlainParagraphs(html)
  const doc = new Document({
    sections: [
      {
        children: paras.map(
          (line) =>
            new Paragraph({
              children: [new TextRun(line)],
            }),
        ),
      },
    ],
  })
  const buf = await Packer.toBlob(doc)
  return buf
}

export function arrayBufferToSheetAoA(buf: ArrayBuffer): { name: string; rows: string[][] } {
  const wb = XLSX.read(buf, { type: 'array' })
  const name = wb.SheetNames[0] || 'Sheet1'
  const sheet = wb.Sheets[name]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]
  const normalized = rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : []))
  return { name, rows: normalized.length ? normalized : [['']] }
}

export function sheetAoAToXlsxBlob(sheetName: string, rows: string[][]): Blob {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function sheetAoAToHtml(rows: string[][]): string {
  const body = rows
    .map(
      (r) =>
        '<tr>' +
        r.map((c) => `<td>${escapeHtml(String(c ?? ''))}</td>`).join('') +
        '</tr>',
    )
    .join('')
  return DOMPurify.sanitize(`<table><tbody>${body}</tbody></table>`)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
