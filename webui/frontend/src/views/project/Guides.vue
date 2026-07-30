<template>
  <div>
    <div class="head">
      <h2>项目 Guide 管理</h2>
      <a-button type="primary" @click="openCreate">+ 新建 Guide</a-button>
    </div>
    <a-form layout="inline" style="margin-bottom: 12px">
      <a-form-item label="项目">
        <a-select v-model:value="projectId" style="width: 220px" :options="projectOpts" @change="onProjectChange" />
      </a-form-item>
      <a-form-item label="Stage">
        <a-select
          v-model:value="filterStage"
          style="width: 160px"
          allow-clear
          placeholder="全部"
          :options="stageOpts"
          @change="onStageFilterChange"
        />
      </a-form-item>
      <a-form-item label="Task">
        <a-select
          v-model:value="filterTask"
          style="width: 220px"
          allow-clear
          placeholder="全部"
          :options="taskOpts"
          show-search
          option-filter-prop="label"
        />
      </a-form-item>
    </a-form>
    <a-table :dataSource="filteredRows" :columns="columns" row-key="id">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'asset'">
          <div class="asset-id">{{ record.asset_id }}</div>
          <div class="asset-name">{{ record.name || '—' }}</div>
        </template>
        <template v-else-if="column.key === 'kind'">
          <span class="kind-cell" :class="guideKindCategory(record.kind)">
            <component :is="guideKindIcon(record.kind)" class="kind-icon" />
            <span>{{ record.kind }}</span>
          </span>
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="statusColor(record.status)">{{ statusLabel(record.status) }}</a-tag>
        </template>
        <template v-else-if="column.key === 'source'">
          <a-tag :color="record.source === 'org' ? 'blue' : 'green'">
            {{ record.source === 'org' ? '组织' : '项目私有' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'stage'">
          <template v-if="(record.linked_stages || []).length">
            <a-tag v-for="s in record.linked_stages" :key="s" style="margin-bottom: 2px">{{ s }}</a-tag>
          </template>
          <span v-else class="muted">—</span>
        </template>
        <template v-else-if="column.key === 'task'">
          <template v-if="(record.linked_tasks || []).length">
            <a-tag v-for="t in record.linked_tasks" :key="t" color="processing" style="margin-bottom: 2px">
              {{ t }}
            </a-tag>
          </template>
          <span v-else class="muted">—</span>
        </template>
        <template v-else-if="column.key === 'action'">
          <span class="row-actions">
            <a-button size="small" @click="openDetail(record)">详情</a-button>
            <a-button
              v-if="record.editable"
              size="small"
              style="margin-left: 6px"
              @click="openEdit(record)"
            >
              编辑
            </a-button>
            <a-popconfirm
              v-if="record.editable"
              title="删除？"
              @confirm="remove(record.id)"
            >
              <a-button danger size="small" style="margin-left: 6px">删除</a-button>
            </a-popconfirm>
          </span>
        </template>
      </template>
    </a-table>

    <a-modal
      v-model:open="modalOpen"
      :title="modalTitle"
      :width="920"
      :confirmLoading="saving"
      :ok-button-props="modalMode === 'view' ? { style: { display: 'none' } } : undefined"
      :cancel-text="modalMode === 'view' ? '关闭' : '取消'"
      @ok="save"
    >
      <a-form layout="vertical">
        <a-form-item label="Asset ID" required>
          <a-input v-model:value="form.asset_id" :disabled="readonly || !!form.id" />
        </a-form-item>
        <a-form-item label="名称" required>
          <a-input
            v-model:value="form.name"
            :maxlength="20"
            show-count
            placeholder="不超过 20 字"
            :disabled="readonly"
          />
        </a-form-item>
        <a-form-item label="Version">
          <a-input v-model:value="form.version" style="width: 160px" :disabled="readonly" />
        </a-form-item>
        <a-form-item label="Status">
          <a-select
            v-model:value="form.status"
            style="width: 160px"
            :disabled="readonly"
            :options="statusOpts"
          />
        </a-form-item>
        <a-form-item label="来源">
          <a-tag :color="form.source === 'org' ? 'blue' : 'green'">
            {{ form.source === 'org' ? '组织 HX（只读）' : '项目私有' }}
          </a-tag>
        </a-form-item>
        <a-form-item label="Kind">
          <a-input v-model:value="form.kind" :disabled="readonly" />
        </a-form-item>
        <a-form-item v-if="readonly || form.content_mode === 'package'" label="内容预览">
          <div v-if="pkgLoading" class="muted">加载中…</div>
          <div v-else-if="isMultiFile" class="pkg-browse">
            <div class="pkg-tree">
              <a-directory-tree
                :tree-data="pkgTreeData"
                :selected-keys="pkgSelectedKeys"
                default-expand-all
                @select="onPkgSelect"
              />
            </div>
            <div class="pkg-preview">
              <div v-if="pkgPreviewLoading" class="muted">加载中…</div>
              <div v-else-if="pkgPreviewKind === 'md'" class="md-preview" v-html="pkgPreviewHtml" />
              <pre v-else-if="pkgPreviewKind === 'text'" class="pkg-text">{{ pkgPreviewText }}</pre>
              <div v-else-if="form.content" class="md-preview" v-html="mdHtml" />
              <div v-else class="muted">无内容</div>
            </div>
          </div>
          <div v-else class="md-preview" v-html="mdHtml" />
        </a-form-item>
        <a-form-item v-else label="Content">
          <div class="md-split">
            <a-textarea v-model:value="form.content" :rows="14" class="md-editor" :disabled="readonly" />
            <div class="md-preview" v-html="mdHtml" />
          </div>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { api } from '../../api'
import { guideKindCategory, guideKindIcon } from '../../utils/guideKind'

const projects = ref<any[]>([])
const projectId = ref<number>()
const allRows = ref<any[]>([])
const projectTasks = ref<any[]>([])
const filterStage = ref<string | undefined>()
const filterTask = ref<string | undefined>()
const modalOpen = ref(false)
const modalMode = ref<'create' | 'edit' | 'view'>('create')
const saving = ref(false)
const form = reactive<any>({
  id: null,
  asset_id: '',
  name: '',
  kind: 'guide.skill',
  version: '1.0.0',
  status: 'draft',
  source: 'project',
  content: '',
  content_mode: 'markdown',
  org_guide_id: null,
  package_path: '',
  package_files_json: '[]',
  editable: true,
})

const pkgFiles = ref<string[]>([])
const pkgLoading = ref(false)
const pkgSelectedKeys = ref<string[]>([])
const pkgPreviewLoading = ref(false)
const pkgPreviewKind = ref<'md' | 'text' | 'other'>('other')
const pkgPreviewHtml = ref('')
const pkgPreviewText = ref('')

const projectOpts = computed(() => projects.value.map((p) => ({ value: p.id, label: p.name })))
const readonly = computed(() => modalMode.value === 'view' || form.source === 'org')
const modalTitle = computed(() => {
  if (modalMode.value === 'view') return 'Guide 详情'
  if (modalMode.value === 'edit') return '编辑项目 Guide'
  return '新建项目 Guide'
})
const statusOpts = [
  { value: 'draft', label: '草稿' },
  { value: 'trial', label: '试用' },
  { value: 'enforced', label: '强制' },
]

const stageOpts = computed(() => {
  const set = new Set<string>()
  for (const t of projectTasks.value) {
    if (t.stage) set.add(t.stage)
  }
  for (const r of allRows.value) {
    for (const s of r.linked_stages || []) if (s) set.add(s)
  }
  return [...set].sort().map((s) => ({ value: s, label: s }))
})

const taskOpts = computed(() => {
  const map = new Map<string, string>()
  for (const t of projectTasks.value) {
    if (!t.stage || !t.task_id) continue
    if (filterStage.value && t.stage !== filterStage.value) continue
    const key = `${t.stage}/${t.task_id}`
    map.set(key, t.title ? `${key} — ${t.title}` : key)
  }
  for (const r of allRows.value) {
    for (const key of r.linked_tasks || []) {
      if (!key) continue
      if (filterStage.value && !key.startsWith(`${filterStage.value}/`) && key !== filterStage.value) continue
      if (!map.has(key)) map.set(key, key)
    }
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, label]) => ({ value, label }))
})

const filteredRows = computed(() => {
  return allRows.value.filter((r) => {
    if (filterStage.value) {
      const stages: string[] = r.linked_stages || []
      if (!stages.includes(filterStage.value)) return false
    }
    if (filterTask.value) {
      const tasks: string[] = r.linked_tasks || []
      if (!tasks.includes(filterTask.value)) return false
    }
    return true
  })
})

const columns = [
  { title: 'Asset', key: 'asset' },
  { title: 'Kind', key: 'kind', width: 180 },
  { title: 'Stage', key: 'stage', width: 120 },
  { title: 'Task', key: 'task', width: 180 },
  { title: 'Status', key: 'status', width: 90 },
  { title: '来源', key: 'source', width: 100 },
  { title: '操作', key: 'action', width: 200 },
]

const mdHtml = computed(() => renderMarkdownDocument(form.content || ''))
const isMultiFile = computed(() => {
  if (pkgFiles.value.length > 1) return true
  if (pkgFiles.value.length === 1 && pkgFiles.value[0].includes('/')) return true
  return false
})

type TreeNode = { title: string; key: string; children?: TreeNode[]; isLeaf?: boolean }
const pkgTreeData = computed(() => buildFileTree(pkgFiles.value))

function statusLabel(s: string) {
  return ({ draft: '草稿', trial: '试用', enforced: '强制' } as any)[s] || s || '草稿'
}
function statusColor(s: string) {
  return ({ draft: 'default', trial: 'processing', enforced: 'success' } as any)[s] || 'default'
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function parseYamlFrontMatter(src: string): { meta: Record<string, string>; body: string } {
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
      meta[currentKey] = val === '>' || val === '|' || val === '>-' || val === '|-' ? '' : val
      continue
    }
    if (currentKey && /^[ \t]/.test(line)) {
      const cont = line.replace(/^[ \t]+/, '')
      meta[currentKey] = meta[currentKey] ? `${meta[currentKey]} ${cont}` : cont
    }
  }
  return { meta, body }
}

function renderMarkdownDocument(src: string): string {
  try {
    const { meta, body } = parseYamlFrontMatter(src)
    const keys = Object.keys(meta)
    let table = ''
    if (keys.length) {
      const preferred = ['name', 'description']
      const ordered = [
        ...preferred.filter((k) => k in meta),
        ...keys.filter((k) => !preferred.includes(k)),
      ]
      table =
        '<table class="fm-meta"><tbody>' +
        ordered
          .map((k) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(meta[k])}</td></tr>`)
          .join('') +
        '</tbody></table>'
    }
    const md = marked.parse(body || '', { async: false }) as string
    return DOMPurify.sanitize(table + md)
  } catch {
    return ''
  }
}

function buildFileTree(files: string[]): TreeNode[] {
  const root: Record<string, any> = {}
  for (const f of files) {
    const parts = f.split('/').filter(Boolean)
    let cur = root
    parts.forEach((part, i) => {
      if (!cur[part]) cur[part] = { __children: {}, __file: null as string | null }
      if (i === parts.length - 1) cur[part].__file = f
      cur = cur[part].__children
    })
  }
  function toNodes(obj: Record<string, any>, prefix = ''): TreeNode[] {
    return Object.keys(obj)
      .sort()
      .map((name) => {
        const node = obj[name]
        const key = prefix ? `${prefix}/${name}` : name
        const children = toNodes(node.__children, key)
        if (children.length) return { title: name, key: `dir:${key}`, children }
        return { title: name, key: node.__file || key, isLeaf: true }
      })
  }
  return toNodes(root)
}

function resetForm() {
  Object.assign(form, {
    id: null,
    asset_id: '',
    name: '',
    kind: 'guide.skill',
    version: '1.0.0',
    status: 'draft',
    source: 'project',
    content: '',
    content_mode: 'markdown',
    org_guide_id: null,
    package_path: '',
    package_files_json: '[]',
    editable: true,
  })
  pkgFiles.value = []
  pkgSelectedKeys.value = []
  pkgPreviewHtml.value = ''
  pkgPreviewText.value = ''
}

async function load() {
  if (!projectId.value) return
  const [g, t] = await Promise.all([
    api.get(`/projects/${projectId.value}/guides`),
    api.get(`/projects/${projectId.value}/tasks`),
  ])
  allRows.value = g.data
  projectTasks.value = t.data || []
}

function onProjectChange() {
  filterStage.value = undefined
  filterTask.value = undefined
  void load()
}

function onStageFilterChange() {
  filterTask.value = undefined
}

function openCreate() {
  resetForm()
  modalMode.value = 'create'
  modalOpen.value = true
}

async function fillFromRecord(record: any) {
  resetForm()
  const { data } = await api.get(`/projects/${projectId.value}/guides/${record.id}`)
  Object.assign(form, {
    id: data.id,
    asset_id: data.asset_id,
    name: data.name || (data.asset_id || '').slice(0, 20),
    kind: data.kind || 'guide.skill',
    version: data.version || '1.0.0',
    status: data.status || 'draft',
    source: data.source || 'project',
    content: data.content || '',
    content_mode: data.content_mode || 'markdown',
    org_guide_id: data.org_guide_id || null,
    package_path: data.package_path || '',
    package_files_json: data.package_files_json || '[]',
    editable: !!data.editable,
  })
  if (data.org_guide_id && (data.package_path || data.content_mode === 'package')) {
    await loadOrgPackage(data.org_guide_id)
  }
}

async function openDetail(record: any) {
  modalMode.value = 'view'
  modalOpen.value = true
  try {
    await fillFromRecord(record)
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '加载详情失败')
  }
}

async function openEdit(record: any) {
  if (!record.editable) {
    message.warning('来自组织 HX 的 Guide 不可编辑')
    return
  }
  modalMode.value = 'edit'
  modalOpen.value = true
  try {
    await fillFromRecord(record)
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '加载失败')
  }
}

async function loadOrgPackage(orgGuideId: number) {
  pkgLoading.value = true
  try {
    const { data } = await api.get(`/org/guides/${orgGuideId}/package`)
    pkgFiles.value = data.files || []
    if (data.content) form.content = data.content
    if (pkgFiles.value.length === 1) await previewOrgFile(orgGuideId, pkgFiles.value[0])
  } catch {
    pkgFiles.value = []
  } finally {
    pkgLoading.value = false
  }
}

function onPkgSelect(keys: (string | number)[]) {
  const key = String(keys[0] || '')
  if (!key || key.startsWith('dir:') || !form.org_guide_id) return
  pkgSelectedKeys.value = [key]
  void previewOrgFile(form.org_guide_id, key)
}

async function previewOrgFile(orgGuideId: number, relPath: string) {
  pkgPreviewLoading.value = true
  try {
    const res = await api.get(`/org/guides/${orgGuideId}/package-file`, {
      params: { path: relPath },
      responseType: 'arraybuffer',
    })
    const text = new TextDecoder('utf-8').decode(res.data as ArrayBuffer)
    const ext = (relPath.split('.').pop() || '').toLowerCase()
    if (ext === 'md' || ext === 'markdown') {
      pkgPreviewKind.value = 'md'
      pkgPreviewHtml.value = renderMarkdownDocument(text)
    } else {
      pkgPreviewKind.value = 'text'
      pkgPreviewText.value = text
    }
  } catch {
    pkgPreviewKind.value = 'other'
  } finally {
    pkgPreviewLoading.value = false
  }
}

async function save() {
  if (modalMode.value === 'view') {
    modalOpen.value = false
    return
  }
  if (!projectId.value || !form.asset_id?.trim()) {
    message.warning('请填写 Asset ID')
    return Promise.reject()
  }
  const name = (form.name || '').trim() || form.asset_id.trim().slice(0, 20)
  if (name.length > 20) {
    message.warning('名称不能超过 20 个字')
    return Promise.reject()
  }
  saving.value = true
  try {
    const payload = {
      asset_id: form.asset_id.trim(),
      name,
      kind: form.kind,
      content: form.content,
      status: form.status,
      version: form.version,
      content_mode: form.content_mode || 'markdown',
      stage: '',
      task: '',
    }
    if (modalMode.value === 'edit' && form.id) {
      await api.put(`/projects/${projectId.value}/guides/${form.id}`, payload)
    } else {
      await api.post(`/projects/${projectId.value}/guides`, payload)
    }
    message.success('已保存')
    modalOpen.value = false
    await load()
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '保存失败')
    return Promise.reject(e)
  } finally {
    saving.value = false
  }
}

async function remove(id: number) {
  try {
    await api.delete(`/projects/${projectId.value}/guides/${id}`)
    await load()
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '删除失败')
  }
}

onMounted(async () => {
  const { data } = await api.get('/projects')
  projects.value = data
  if (data[0]) {
    projectId.value = data[0].id
    await load()
  }
})
</script>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.asset-id {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.88);
  line-height: 1.35;
}
.asset-name {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.3;
  margin-top: 2px;
}
.row-actions {
  display: inline-flex;
  align-items: center;
}
.muted {
  color: #94a3b8;
}
.kind-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.kind-icon {
  font-size: 14px;
  color: #64748b;
}
.kind-cell.computational .kind-icon {
  color: #0e7490;
}
.kind-cell.inferential .kind-icon {
  color: #6d28d9;
}
.md-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  min-height: 280px;
}
.md-editor {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.md-preview {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 14px;
  overflow: auto;
  max-height: 420px;
  background: #fafafa;
  font-size: 13px;
  line-height: 1.55;
}
.md-preview :deep(table.fm-meta) {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 16px;
  table-layout: fixed;
}
.md-preview :deep(table.fm-meta th),
.md-preview :deep(table.fm-meta td) {
  border: 1px solid #c9d1d9;
  padding: 10px 14px;
  vertical-align: top;
  text-align: left;
}
.md-preview :deep(table.fm-meta th) {
  width: 120px;
  background: #eef1f4;
  font-weight: 700;
}
.pkg-browse {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 12px;
  min-height: 320px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}
.pkg-tree {
  border-right: 1px solid #e5e7eb;
  padding: 8px;
  overflow: auto;
  max-height: 400px;
  background: #fafafa;
}
.pkg-preview {
  padding: 12px;
  overflow: auto;
  max-height: 400px;
}
.pkg-text {
  margin: 0;
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
</style>
