/** Parse API datetime strings (UTC, often without Z suffix) for local display. */
export function parseApiDateTime(v: string | null | undefined): Date | null {
  if (!v) return null
  const s = String(v).trim()
  if (!s) return null
  const hasTz = /[zZ]$|[+-]\d{2}:\d{2}$/.test(s)
  const d = new Date(hasTz ? s : `${s}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatLocalDateTime(v: string | null | undefined): string {
  const d = parseApiDateTime(v)
  if (!d) return v ? String(v) : '—'
  return d.toLocaleString()
}
