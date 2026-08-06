/** Shared Sensor create/edit helpers for org Guides & project Sensors. */

export type SensorCheckType = 'rules' | 'shell' | 'inline' | 'human'

export type TriggerChannel =
  | 'hook:beforeSubmit'
  | 'hook:afterFileEdit'
  | 'hook:stop'
  | 'cli'
  | 'task-shell'

export const CHECK_TYPE_OPTS: { value: SensorCheckType; label: string }[] = [
  { value: 'rules', label: 'rules — 文本规则（注入 Agent 由模型评判）' },
  { value: 'shell', label: 'shell — 执行 bash 脚本块' },
  { value: 'inline', label: 'inline — 内置函数检查' },
  { value: 'human', label: 'human — 人工审批（仅提醒尚未批准）' },
]

export const TRIGGER_CHANNEL_OPTS: { value: TriggerChannel; label: string }[] = [
  { value: 'hook:beforeSubmit', label: '提交任务指令前' },
  { value: 'hook:afterFileEdit', label: '文件生成/编辑后' },
  { value: 'hook:stop', label: 'Agent 回合结束 (stop)' },
  { value: 'cli', label: 'nhx 人工指令' },
  { value: 'task-shell', label: 'command/skill 壳' },
]

export const DEFAULT_TRIGGERS: TriggerChannel[] = ['hook:stop', 'cli', 'task-shell']

export const TRIGGER_CHANNELS_HELP = {
  title: '触发通道说明',
  body: [
    '可多选。Check 仍绑定 Task，在勾选的通道上执行。',
    'triggers / scope 只在上方表单配置，不要写入「配置内容」。',
    'human：任一通道触发时只提醒「尚未批准」（或已批准），不做文件/脚本检查；beforeSubmit 不阻断提交。',
    'hook:afterFileEdit 需配置 Scope（glob）；与编辑路径匹配才跑。',
  ].join('\n'),
}

export type InlineFn = {
  expr: string
  label: string
  desc: string
}

/** Built-in predicates supported by nhx check (inline). */
export const INLINE_FUNCTIONS: InlineFn[] = [
  {
    expr: 'file.exists(path=docs/prd/PRD.md)',
    label: 'file.exists',
    desc: '检查相对仓库根的文件是否存在；path 支持 * /**，多匹配须全部存在',
  },
  {
    expr: 'file.min_bytes(path=docs/requirements/bizmodel*.md, n=200)',
    label: 'file.min_bytes',
    desc: '检查文件存在且至少 n 字节；通配时每个匹配文件都须 ≥ n',
  },
  {
    expr: 'doc.sections_complete(path=docs/prd/PRD.md, require=[用户故事, 验收标准])',
    label: 'doc.sections_complete',
    desc: '检查 Markdown 中是否包含指定章节关键词；通配时每个匹配文件都须满足',
  },
  {
    expr: 'approval.prd == true',
    label: 'approval.<gate>',
    desc: '产品路径更推荐 check_type=human（仅提醒尚未批准）',
  },
]

/** Help / examples shown in ? popover — not stored in content. */
export const CHECK_TYPE_HELP: Record<
  SensorCheckType,
  { title: string; body: string; example: string }
> = {
  rules: {
    title: 'rules 配置说明',
    body: '仅写规则专属字段。触发通道 / Scope 在上方表单配置。文本规则注入 Task 壳与 IDE hook，由对话模型评判；本地不跑 LLM。文件存在请用 inline。',
    example: `---
check_type: rules
input:
  - docs/prd/PRD.md
rules_text: |
  - 验收标准必须可测试、可观察
  - 禁止「适当 / 尽快」等不可验证表述
---`,
  },
  shell: {
    title: 'shell 配置说明',
    body: '仅写 check_type + bash 代码块。触发通道在上方表单配置。exit 0 通过。',
    example: `---
check_type: shell
---

\`\`\`bash
set -euo pipefail
npx --yes tsc --noEmit
\`\`\``,
  },
  inline: {
    title: 'inline 配置说明',
    body: '仅写 check_type + expr。触发通道 / Scope 在上方表单。支持 file.exists / file.min_bytes / doc.sections_complete / approval.*。path 支持 * 与 **；若匹配多个文件，须全部满足条件才通过。',
    example: `---
check_type: inline
expr: "file.min_bytes(path=docs/requirements/bizmodel*.md, n=200)"
---`,
  },
  human: {
    title: 'human 配置说明',
    body: '写 check_type 与检查意图说明即可。触发通道在上方表单。须先上传该任务产物，再创建并批准 human-check 工单；触发时仅提醒「尚未批准」。',
    example: `---
check_type: human
---

## 检查意图

架构 LLD 人工审批。

触发时仅提醒「尚未批准」，不执行自动文件/脚本检查；需人工确认后再继续。

通过本门禁后再进入下一交付环节。
`,
  },
}

/** Default editor body per check_type (frontmatter + intent prose for human). */
const TEMPLATES: Record<SensorCheckType, string> = {
  rules: `---
check_type: rules
input:
  - docs/prd/PRD.md
rules_text: |
  - 验收标准必须可测试、可观察
  - 禁止「适当 / 尽快」等不可验证表述
---
`,
  shell: `---
check_type: shell
---

\`\`\`bash
set -euo pipefail
if [ -f package.json ]; then
  npx --yes tsc --noEmit 2>/dev/null || npm run typecheck 2>/dev/null || echo "skip: no typecheck script"
fi
test -d docs -o -d harnessX -o -d openspec || { echo "缺少交付目录"; exit 1; }
\`\`\`
`,
  inline: `---
check_type: inline
expr: "doc.sections_complete(path=docs/prd/PRD.md, require=[用户故事, 验收标准])"
---
`,
  human: `---
check_type: human
---

## 检查意图

人工审批。

触发时仅提醒「尚未批准」，不执行自动文件/脚本检查；需人工确认后再继续。须先上传该任务产物，再创建并批准 human-check 工单。

通过本门禁后再进入下一交付环节。
`,
}

export function normalizeCheckType(raw: string | undefined | null): SensorCheckType {
  const t = (raw || 'rules').toLowerCase()
  if (t === 'manual') return 'human'
  if (t === 'shell' || t === 'inline' || t === 'human' || t === 'rules') return t
  return 'rules'
}

export function normalizeTriggers(raw: unknown): TriggerChannel[] {
  const allowed = new Set(TRIGGER_CHANNEL_OPTS.map((o) => o.value))
  const list = Array.isArray(raw) ? raw.map(String) : []
  const out = list.filter((t): t is TriggerChannel => allowed.has(t as TriggerChannel))
  return out.length ? out : [...DEFAULT_TRIGGERS]
}

export function normalizeScope(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map(String).map((s) => s.trim()).filter(Boolean)
}

export function templateFor(checkType: string): string {
  return TEMPLATES[normalizeCheckType(checkType)]
}

export function helpFor(checkType: string) {
  return CHECK_TYPE_HELP[normalizeCheckType(checkType)]
}

/** Strip triggers/scope from content frontmatter — those belong in form fields only. */
export function leanSensorContent(raw: string | undefined | null): string {
  const text = (raw || '').replace(/\r\n/g, '\n')
  if (!text.trim()) return text
  const m = text.match(/^---\n([\s\S]*?)\n---(\n[\s\S]*)?$/)
  if (!m) {
    // bare "check_type: human" etc.
    return text
      .split('\n')
      .filter((line) => !/^\s*(triggers|scope)\s*:/.test(line) && !/^\s*-\s+/.test(line))
      .join('\n')
  }
  let fm = m[1]
  fm = fm.replace(/^triggers:\s*\n(?:[ \t]+-.*\n?)*/m, '')
  fm = fm.replace(/^scope:\s*\n(?:[ \t]+(?:-.*|\[\])\s*\n?)*/m, '')
  fm = fm.replace(/^triggers:\s*\[[\s\S]*?\]\s*$/m, '')
  fm = fm.replace(/^scope:\s*\[[\s\S]*?\]\s*$/m, '')
  fm = fm.replace(/\n{2,}/g, '\n').replace(/^\n+|\n+$/g, '')
  const rest = (m[2] || '').replace(/^\n/, '')
  const out = `---\n${fm}\n---\n${rest}`
  return out.replace(/\n+$/, '\n')
}

export function isSensorTemplateContent(content: string): boolean {
  const c = leanSensorContent(content || '').trim()
  if (!c) return true
  return Object.values(TEMPLATES).some((t) => t.trim() === c)
}

export function insertExprIntoContent(content: string, expr: string): string {
  const line = `expr: "${expr}"`
  const base = leanSensorContent(content?.trim() ? content : templateFor('inline'))
  if (/^---\n[\s\S]*?\n---/.test(base)) {
    if (/(^|\n)expr:\s*/m.test(base)) {
      return base.replace(/(^|\n)expr:\s*.*/m, `$1${line}`)
    }
    return base.replace(/^(---\n)/, `$1${line}\n`)
  }
  return `---\ncheck_type: inline\n${line}\n---\n`
}

export function formatTriggersShort(triggers: string[] | undefined): string {
  const t = normalizeTriggers(triggers)
  return t
    .map((id) => {
      if (id === 'hook:beforeSubmit') return 'before'
      if (id === 'hook:afterFileEdit') return 'edit'
      if (id === 'hook:stop') return 'stop'
      if (id === 'task-shell') return '壳'
      return id
    })
    .join(',')
}
