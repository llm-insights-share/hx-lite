export type DiffLineKind = 'context' | 'add' | 'del' | 'hunk' | 'meta'

export interface DiffLine {
  kind: DiffLineKind
  text: string
  oldNo: number | null
  newNo: number | null
}

export type FileChangeStatus = 'added' | 'deleted' | 'modified' | 'renamed'

export interface DiffFile {
  path: string
  oldPath: string | null
  status: FileChangeStatus
  binary: boolean
  additions: number
  deletions: number
  lines: DiffLine[]
}

export interface ParsedDiff {
  empty: boolean
  files: DiffFile[]
  filesChanged: number
  additions: number
  deletions: number
  statusSection: string
}

function stripStatusSection(raw: string): { body: string; statusSection: string } {
  const idx = raw.search(/\n# status\n/)
  if (idx < 0) {
    if (raw.startsWith('# status\n')) {
      return { body: '', statusSection: raw.slice('# status\n'.length) }
    }
    return { body: raw, statusSection: '' }
  }
  return {
    body: raw.slice(0, idx),
    statusSection: raw.slice(idx + '\n# status\n'.length),
  }
}

function stripPrefix(path: string): string {
  if (path.startsWith('a/') || path.startsWith('b/')) return path.slice(2)
  return path
}

function parsePathsFromGitLine(line: string): { a: string; b: string } | null {
  // diff --git a/foo b/foo  (paths may contain spaces when quoted)
  const m = line.match(/^diff --git (?:a\/|"a\/)(.+?)(?:")? (?:b\/|"b\/)(.+?)(?:")?$/)
  if (!m) return null
  return { a: m[1], b: m[2] }
}

function parseHunkHeader(line: string): { oldStart: number; newStart: number } | null {
  const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
  if (!m) return null
  return { oldStart: Number(m[1]), newStart: Number(m[2]) }
}

function parseFileBlock(block: string): DiffFile | null {
  const lines = block.split('\n')
  if (!lines[0]?.startsWith('diff --git ')) return null

  const gitPaths = parsePathsFromGitLine(lines[0])
  let oldPath: string | null = gitPaths?.a ?? null
  let newPath: string | null = gitPaths?.b ?? null
  let status: FileChangeStatus = 'modified'
  let binary = false

  for (const line of lines) {
    if (line.startsWith('new file mode')) status = 'added'
    else if (line.startsWith('deleted file mode')) status = 'deleted'
    else if (line.startsWith('rename from ') || line.startsWith('rename to ')) status = 'renamed'
    else if (line.startsWith('Binary files ') || line.includes('GIT binary patch')) binary = true
    else if (line.startsWith('--- ')) {
      const p = line.slice(4).trim()
      if (p !== '/dev/null') oldPath = stripPrefix(p.replace(/^"/, '').replace(/"$/, ''))
      else status = status === 'modified' ? 'added' : status
    } else if (line.startsWith('+++ ')) {
      const p = line.slice(4).trim()
      if (p !== '/dev/null') newPath = stripPrefix(p.replace(/^"/, '').replace(/"$/, ''))
      else status = status === 'modified' ? 'deleted' : status
    }
  }

  const path =
    status === 'deleted'
      ? oldPath || newPath || '(unknown)'
      : newPath || oldPath || '(unknown)'

  const outLines: DiffLine[] = []
  let additions = 0
  let deletions = 0
  let oldNo: number | null = null
  let newNo: number | null = null
  let inHunk = false

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('@@')) {
      const h = parseHunkHeader(line)
      inHunk = true
      oldNo = h?.oldStart ?? null
      newNo = h?.newStart ?? null
      outLines.push({ kind: 'hunk', text: line, oldNo: null, newNo: null })
      continue
    }
    if (!inHunk) continue
    if (line.startsWith('\\')) {
      outLines.push({ kind: 'meta', text: line, oldNo: null, newNo: null })
      continue
    }
    if (line.startsWith('+')) {
      outLines.push({ kind: 'add', text: line.slice(1), oldNo: null, newNo })
      if (newNo != null) newNo += 1
      additions += 1
    } else if (line.startsWith('-')) {
      outLines.push({ kind: 'del', text: line.slice(1), oldNo, newNo: null })
      if (oldNo != null) oldNo += 1
      deletions += 1
    } else if (line.startsWith(' ') || line === '') {
      const text = line.startsWith(' ') ? line.slice(1) : line
      outLines.push({ kind: 'context', text, oldNo, newNo })
      if (oldNo != null) oldNo += 1
      if (newNo != null) newNo += 1
    }
  }

  return {
    path,
    oldPath: status === 'renamed' || status === 'deleted' ? oldPath : null,
    status,
    binary,
    additions,
    deletions,
    lines: outLines,
  }
}

/** Parse `git diff` unified output (optionally with trailing `# status` section). */
export function parseUnifiedDiff(raw: string): ParsedDiff {
  const trimmed = (raw || '').trim()
  if (!trimmed || trimmed === '(no changes)') {
    return {
      empty: true,
      files: [],
      filesChanged: 0,
      additions: 0,
      deletions: 0,
      statusSection: '',
    }
  }

  const { body, statusSection } = stripStatusSection(trimmed)
  const diffBody = body.trim()
  if (!diffBody || diffBody === '(no changes)') {
    return {
      empty: true,
      files: [],
      filesChanged: 0,
      additions: 0,
      deletions: 0,
      statusSection,
    }
  }

  const blocks = diffBody.split(/(?=^diff --git )/m).filter((b) => b.trim().startsWith('diff --git '))
  const files: DiffFile[] = []
  for (const block of blocks) {
    const f = parseFileBlock(block)
    if (f) files.push(f)
  }

  const additions = files.reduce((s, f) => s + f.additions, 0)
  const deletions = files.reduce((s, f) => s + f.deletions, 0)

  return {
    empty: files.length === 0,
    files,
    filesChanged: files.length,
    additions,
    deletions,
    statusSection,
  }
}
