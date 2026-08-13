/** Build IDE Command/Skill shell usage markdown from project shells API rows. */

export type ShellUsageRow = {
  stage?: string
  task_id?: string
  title?: string
  slash_name?: string
  ide_slash_name?: string
  command_body?: string
  skill_body?: string
  description?: string
}

export type ShellUsageProject = {
  name?: string
  slug?: string
}

/** Extract markdown section body under `## heading` until next `## ` or EOF. */
export function extractMdSection(src: string, heading: string): string {
  const text = src || ''
  const re = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, 'im')
  const m = re.exec(text)
  if (!m || m.index === undefined) return ''
  const start = m.index + m[0].length
  const rest = text.slice(start)
  const next = rest.search(/^##\s+/m)
  const body = (next >= 0 ? rest.slice(0, next) : rest).trim()
  return body
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function ideSlash(row: ShellUsageRow): string {
  if (row.ide_slash_name) return row.ide_slash_name
  const stage = row.stage || ''
  const task = (row.task_id || '').replace(/_/g, '-')
  return `nhx-${stage}-${task}`
}

function inputPlaceholder(stage: string): string {
  if (stage === 'req') return '<slug>'
  if (stage === 'arch') return '<module-or-change>'
  if (stage === 'dev' || stage === 'test') return '<change>'
  return '<identifier>'
}

function extractSensorsHint(appendix: string): string {
  const text = appendix || ''
  if (!/特别约束 — 绑定 (?:Checks|Sensors)|绑定 (?:Checks|Sensors)/i.test(text)) return ''
  const lines = text.split(/\r?\n/)
  const ids: string[] = []
  let inTable = false
  for (const line of lines) {
    if (/绑定 (?:Checks|Sensors)/i.test(line)) {
      inTable = true
      continue
    }
    if (inTable) {
      if (/^###\s|^##\s/.test(line)) break
      const cell = line.match(/^\|\s*`([^`]+)`\s*\|/)
      if (cell && cell[1] !== 'sensor' && cell[1] !== 'check' && cell[1] !== '—') ids.push(cell[1])
    }
  }
  if (!ids.length) return ''
  return `完成前需通过绑定 Check 门禁：${ids.map((id) => `\`${id}\``).join('、')}。`
}

function stepsHint(body: string): string {
  const steps = extractMdSection(body, '步骤')
  if (steps) {
    const lines = steps
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3)
    if (lines.length) return lines.join('\n')
  }
  const lines = (body || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('---'))
  return lines.slice(0, 2).join('\n') || '按壳正文步骤执行本任务并产出约定交付物。'
}

function anchorId(stage: string, taskId: string): string {
  return `${stage}-${taskId}`.toLowerCase().replace(/[^a-z0-9\-]+/g, '-')
}

export function buildShellUsageMarkdown(
  project: ShellUsageProject,
  rows: ShellUsageRow[],
  opts?: { stageFilter?: string },
): string {
  const filtered = (rows || []).filter((r) => {
    if (opts?.stageFilter && r.stage !== opts.stageFilter) return false
    return !!(r.stage && r.task_id)
  })

  const projectName = project.name || project.slug || '项目'
  const generatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')

  const lines: string[] = [
    `# ${projectName} — Command / Skill 壳使用说明`,
    '',
    `> 根据当前项目 Task 壳自动生成（${generatedAt}）。本地需先执行 \`nhx sync\` / \`nhx adapter sync\` 后再在 IDE 中调用。`,
    '',
    '## 总览：在 IDE 中怎么用',
    '',
    '1. **前置**：`nhx login` → `nhx sync`（可选 stage）→ `nhx adapter sync`，将壳投影到 IDE。跨项目安装加 `--global`（写入 `~/.cursor/`、`~/.trae/`、`~/.codebuddy/`、`~/.workbuddy/`、`~/.qoder/`）。',
    '2. **Command Shell（Cursor / CodeBuddy / WorkBuddy / Qoder 等）**：在对话中输入斜杠命令 `/{ide_slash}`，可附带参数。',
    '   - 项目：`.cursor/commands/{ide_slash}.md`、`.qoder/commands/{ide_slash}.md`（以及 `.nhx/commands/`）',
    '   - 全局：`~/.cursor/commands/{ide_slash}.md`、`~/.qoder/commands/{ide_slash}.md`（`nhx adapter sync --global`）',
    '3. **Skill Shell（Cursor / Trae / Qoder 等）**：启用同名 Skill；无斜杠命令的 IDE 以 Skill 为主。',
    '   - 项目：`.cursor/skills/{ide_slash}/SKILL.md`、`.trae/skills/{ide_slash}/SKILL.md`、`.qoder/skills/{ide_slash}/SKILL.md`',
    '   - 全局：`~/.cursor/skills/{ide_slash}/SKILL.md`、`~/.trae/skills/{ide_slash}/SKILL.md`、`~/.qoder/skills/{ide_slash}/SKILL.md`',
    '4. **CodeBuddy / WorkBuddy**：项目级投影到 `.codebuddy/commands`、`.codebuddy/skills` 与 `.codebuddy/settings.json`；全局分别为 `~/.codebuddy/` 与 `~/.workbuddy/`。',
    '5. **Qoder**：项目级投影到 `.qoder/commands`、`.qoder/skills` 与 `.qoder/settings.json`；全局 `~/.qoder/`（或 `$QODER_CONFIG_DIR`）。',
    '6. 每个 Task **同时**具备 Command 与 Skill 两种壳，正文一致；Skill 含自动注入附录（绑定 Guide / Check）。',
    '',
    '## 目录',
    '',
  ]

  const byStage = new Map<string, ShellUsageRow[]>()
  for (const r of filtered) {
    const s = r.stage || ''
    if (!byStage.has(s)) byStage.set(s, [])
    byStage.get(s)!.push(r)
  }
  const stages = [...byStage.keys()].sort()

  for (const stage of stages) {
    for (const r of byStage.get(stage) || []) {
      const title = r.title || r.task_id || ''
      const id = anchorId(stage, r.task_id || '')
      lines.push(`- [${stage}/${r.task_id} — ${title}](#${id})`)
    }
  }
  lines.push('')

  if (!filtered.length) {
    lines.push('_当前项目暂无 Task 壳。请先初始化项目配置或添加自定义 Task。_')
    lines.push('')
    return lines.join('\n')
  }

  for (const stage of stages) {
    lines.push(`## Stage: ${stage}`)
    lines.push('')
    for (const r of byStage.get(stage) || []) {
      const slash = ideSlash(r)
      const title = r.title || r.task_id || ''
      const body = r.command_body || ''
      const appendix = r.skill_body || ''
      const id = anchorId(stage, r.task_id || '')
      const inputSec = extractMdSection(body, '输入')
      const outputSec = extractMdSection(body, '产出')
      const doneSec = extractMdSection(body, '完成标准')
      const placeholder = inputPlaceholder(stage)
      const sensorHint = extractSensorsHint(appendix)

      lines.push(`### ${title}（\`${r.task_id}\`）`)
      lines.push('')
      lines.push(`<a id="${id}"></a>`)
      lines.push('')
      lines.push(`- **IDE 斜杠 / Skill 名**：\`/${slash}\` / \`${slash}\``)
      if (r.slash_name && r.slash_name !== slash) {
        lines.push(`- **组织壳 slash（参考）**：\`/${r.slash_name}\``)
      }
      lines.push('')

      lines.push('#### 使用说明')
      lines.push('')
      lines.push(`- **Command**：在 Cursor / CodeBuddy / WorkBuddy / Qoder 等支持斜杠命令的 IDE 中输入 \`/${slash}\`，按提示补充参数后执行任务。`)
      lines.push(`- **Skill**：在 Cursor / Trae / CodeBuddy / WorkBuddy / Qoder 等中启用 Skill \`${slash}\`。`)
      lines.push(`- **投影文件**：Cursor 项目 \`.cursor/commands/${slash}.md\`，CodeBuddy/WorkBuddy 项目 \`.codebuddy/commands/${slash}.md\`，Qoder 项目 \`.qoder/commands/${slash}.md\``)
      lines.push(`- **Skill 文件**：Cursor 项目 \`.cursor/skills/${slash}/SKILL.md\`，Trae 项目 \`.trae/skills/${slash}/SKILL.md\`，CodeBuddy/WorkBuddy 项目 \`.codebuddy/skills/${slash}/SKILL.md\`，Qoder 项目 \`.qoder/skills/${slash}/SKILL.md\``)
      lines.push('')
      lines.push('任务意图 / 步骤摘要：')
      lines.push('')
      lines.push(stepsHint(body))
      lines.push('')

      lines.push('#### 输入样例')
      lines.push('')
      if (inputSec) {
        lines.push(inputSec)
        lines.push('')
      }
      lines.push('可复制调用示例：')
      lines.push('')
      lines.push('```text')
      lines.push(`/${slash} ${placeholder}`)
      lines.push('```')
      lines.push('')
      lines.push('也可在普通对话中说明任务意图，并引用 Skill / 命令名，例如：')
      lines.push('')
      lines.push('```text')
      lines.push(`请按 ${slash} 执行，标识为 demo-feature`)
      lines.push('```')
      lines.push('')

      lines.push('#### 输出说明')
      lines.push('')
      if (outputSec) {
        lines.push(outputSec)
        lines.push('')
      } else {
        lines.push('- 按绑定 Template / 任务定义产出交付文档或代码变更。')
        lines.push('')
      }
      if (doneSec) {
        lines.push('**完成标准**')
        lines.push('')
        lines.push(doneSec)
        lines.push('')
      }
      if (sensorHint) {
        lines.push(sensorHint)
        lines.push('')
      }

      lines.push('---')
      lines.push('')
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

export function downloadMarkdown(filename: string, markdown: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
