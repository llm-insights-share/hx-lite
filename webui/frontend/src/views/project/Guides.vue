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
      :width="1000"
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
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="Version">
              <a-input v-model:value="form.version" :disabled="readonly" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Status">
              <a-select
                v-model:value="form.status"
                style="width: 100%"
                :disabled="readonly"
                :options="statusOpts"
              />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="来源">
          <a-tag :color="form.source === 'org' ? 'blue' : 'green'">
            {{ form.source === 'org' ? '组织 HX（只读）' : '项目私有' }}
          </a-tag>
        </a-form-item>

        <a-form-item label="Kind">
          <a-alert
            v-if="legacyKind"
            type="warning"
            show-icon
            style="margin-bottom: 8px"
            :message="`当前为遗留类型 ${legacyKind}，可改选下方类型之一`"
          />
          <div class="kind-grid">
            <button
              v-for="k in kindCards"
              :key="k.value"
              type="button"
              class="kind-card"
              :class="{ active: form.kind === k.value, disabled: readonly }"
              :disabled="readonly"
              @click="!readonly && selectKind(k.value)"
            >
              <span class="kind-badge" :class="k.category">{{ k.category }}</span>
              <div class="kind-title">
                <component :is="k.icon" class="kind-card-icon" :class="k.category" />
                <span>{{ k.title }}</span>
              </div>
              <div class="kind-id">{{ k.value }}</div>
              <div class="kind-desc">{{ k.desc }}</div>
            </button>
          </div>
        </a-form-item>

        <a-form-item v-if="form.kind === 'guide.skill'" label="引用 Skill">
          <a-select
            v-if="!readonly"
            v-model:value="form.ref_skills"
            mode="multiple"
            style="width: 100%"
            placeholder="可选，引用其它 guide.skill（不进入任务壳）"
            :options="refSkillOpts"
            show-search
            option-filter-prop="label"
            allow-clear
          />
          <template v-else>
            <a-tag v-for="id in form.ref_skills || []" :key="id">{{ id }}</a-tag>
            <span v-if="!(form.ref_skills || []).length" class="muted">无</span>
          </template>
        </a-form-item>

        <a-form-item v-if="!readonly" label="内容来源">
          <a-radio-group v-model:value="contentSource" button-style="solid">
            <a-radio-button v-if="form.id && form.content_mode === 'package'" value="view">预览</a-radio-button>
            <a-radio-button value="text">纯文本</a-radio-button>
            <a-radio-button value="markdown">Markdown</a-radio-button>
            <a-radio-button value="upload">上传</a-radio-button>
            <a-radio-button v-if="form.kind === 'guide.skill'" value="github">GitHub</a-radio-button>
          </a-radio-group>
        </a-form-item>

        <a-form-item v-if="readonly || contentSource === 'view'" label="资产内容">
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
          <div v-else-if="form.content" class="md-preview" v-html="mdHtml" />
          <div v-else class="muted">无内容</div>
        </a-form-item>

        <a-form-item v-else-if="contentSource === 'text'" label="Content">
          <a-textarea v-model:value="form.content" :rows="14" placeholder="纯文本内容" />
        </a-form-item>

        <a-form-item v-else-if="contentSource === 'markdown'" label="Markdown">
          <div class="md-split">
            <a-textarea
              v-model:value="form.content"
              :rows="16"
              placeholder="# 标题&#10;正文…"
              class="md-editor"
            />
            <div class="md-preview" v-html="mdHtml" />
          </div>
        </a-form-item>

        <template v-else-if="contentSource === 'github'">
          <a-form-item label="GitHub 仓库" required>
            <a-input
              v-model:value="githubRepo"
              placeholder="owner/repo 或 https://github.com/owner/repo"
              allow-clear
            />
          </a-form-item>
          <a-form-item label="分支 / Tag（可选）">
            <a-input v-model:value="githubRef" placeholder="默认分支" style="width: 240px" allow-clear />
          </a-form-item>
          <a-form-item label="Skills（可多选）">
            <div style="margin-bottom: 8px">
              <a-button type="primary" ghost :loading="listingSkills" @click="listGithubSkills">列出 Skills</a-button>
              <span v-if="githubSkills.length" class="muted" style="margin-left: 10px">
                共 {{ githubSkills.length }} 个
              </span>
            </div>
            <a-select
              v-model:value="selectedSkillPaths"
              mode="multiple"
              style="width: 100%"
              placeholder="选择要安装的 Skill（可多选）"
              :options="githubSkillOpts"
              show-search
              option-filter-prop="label"
              allow-clear
              @change="onSkillsSelect"
            />
          </a-form-item>
        </template>

        <a-form-item v-else-if="contentSource === 'upload'" label="上传文件 / 文件夹">
          <a-alert
            v-if="form.package_path"
            type="info"
            show-icon
            style="margin-bottom: 8px"
            :message="`已有包：${form.package_path}（重新上传将覆盖）`"
          />
          <a-radio-group v-model:value="uploadMode" style="margin-bottom: 8px">
            <a-radio value="file">单文件</a-radio>
            <a-radio value="folder">文件夹</a-radio>
          </a-radio-group>
          <div>
            <input
              v-if="uploadMode === 'file'"
              type="file"
              @change="onFilePick"
            />
            <input
              v-else
              type="file"
              webkitdirectory
              multiple
              @change="onFolderPick"
            />
          </div>
          <ul v-if="uploadFileList.length" class="file-list">
            <li v-for="f in uploadFileList.slice(0, 40)" :key="f.rel">{{ f.rel }} <span class="muted">({{ f.size }} B)</span></li>
            <li v-if="uploadFileList.length > 40" class="muted">…共 {{ uploadFileList.length }} 个文件</li>
          </ul>
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
import {
  GUIDE_KIND_CARDS,
  guideKindCategory,
  guideKindIcon,
  toGuideKindCards,
  type GuideKindCard,
} from '../../utils/guideKind'

const projects = ref<any[]>([])
const projectId = ref<number>()
const allRows = ref<any[]>([])
const projectTasks = ref<any[]>([])
const filterStage = ref<string | undefined>()
const filterTask = ref<string | undefined>()
const modalOpen = ref(false)
const modalMode = ref<'create' | 'edit' | 'view'>('create')
const saving = ref(false)
const contentSource = ref<'view' | 'text' | 'markdown' | 'upload' | 'github'>('markdown')
const uploadMode = ref<'file' | 'folder'>('file')
const uploadFileList = ref<{ file: File; rel: string; size: number }[]>([])
const githubRepo = ref('')
const githubRef = ref('')
const listingSkills = ref(false)
const githubSkills = ref<{ id: string; path: string; skill_md_path: string }[]>([])
const selectedSkillPaths = ref<string[]>([])
const kindCards = ref<GuideKindCard[]>([...GUIDE_KIND_CARDS])
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
  ref_skills: [] as string[],
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
const cardKindSet = computed(() => new Set(kindCards.value.map((k) => k.value)))
const legacyKind = computed(() =>
  form.kind && !cardKindSet.value.has(form.kind) ? form.kind : '',
)
const githubSkillOpts = computed(() =>
  githubSkills.value.map((s) => ({
    value: s.path,
    label: `${s.id}  (${s.path})`,
  })),
)
const refSkillOpts = computed(() =>
  allRows.value
    .filter(
      (g) =>
        g.kind === 'guide.skill' &&
        g.asset_id &&
        g.asset_id !== (form.asset_id || '').trim(),
    )
    .map((g) => ({
      value: g.asset_id,
      label: g.name ? `${g.asset_id} — ${g.name}` : g.asset_id,
    })),
)
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

function selectKind(kind: string) {
  form.kind = kind
  if (kind !== 'guide.skill') {
    form.ref_skills = []
    if (contentSource.value === 'github') {
      contentSource.value = 'markdown'
    }
  }
}

async function loadKindCards() {
  try {
    const { data } = await api.get('/org/guide-kinds')
    const all = data?.all || []
    if (Array.isArray(all) && all.length) {
      kindCards.value = toGuideKindCards(all)
      return
    }
  } catch {
    /* fallback */
  }
  kindCards.value = [...GUIDE_KIND_CARDS]
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
    ref_skills: [],
    editable: true,
  })
  contentSource.value = 'markdown'
  uploadMode.value = 'file'
  uploadFileList.value = []
  githubRepo.value = ''
  githubRef.value = ''
  githubSkills.value = []
  selectedSkillPaths.value = []
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
    ref_skills: Array.isArray(data.ref_skills) ? [...data.ref_skills] : [],
    editable: !!data.editable,
  })
  uploadFileList.value = []
  contentSource.value =
    data.content_mode === 'package' ? 'view' : data.content_mode === 'text' ? 'text' : 'markdown'
  if (data.package_path || data.content_mode === 'package') {
    await loadPackage(data.id)
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

async function loadPackage(guideId: number) {
  if (!projectId.value) return
  pkgLoading.value = true
  try {
    const { data } = await api.get(`/projects/${projectId.value}/guides/${guideId}/package`)
    pkgFiles.value = data.files || []
    if (data.content) form.content = data.content
    if (pkgFiles.value.length === 1) await previewPackageFile(guideId, pkgFiles.value[0])
  } catch {
    pkgFiles.value = []
  } finally {
    pkgLoading.value = false
  }
}

function onPkgSelect(keys: (string | number)[]) {
  const key = String(keys[0] || '')
  if (!key || key.startsWith('dir:') || !form.id) return
  pkgSelectedKeys.value = [key]
  void previewPackageFile(form.id, key)
}

async function previewPackageFile(guideId: number, relPath: string) {
  if (!projectId.value) return
  pkgPreviewLoading.value = true
  try {
    const res = await api.get(`/projects/${projectId.value}/guides/${guideId}/package-file`, {
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

function onFilePick(ev: Event) {
  const input = ev.target as HTMLInputElement
  const f = input.files?.[0]
  uploadFileList.value = f ? [{ file: f, rel: f.name, size: f.size }] : []
}

function onFolderPick(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files || [])
  uploadFileList.value = files.map((f) => ({
    file: f,
    rel: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
    size: f.size,
  }))
}

async function listGithubSkills() {
  if (!projectId.value) return
  if (!githubRepo.value.trim()) {
    message.warning('请填写 GitHub 仓库')
    return
  }
  listingSkills.value = true
  githubSkills.value = []
  selectedSkillPaths.value = []
  try {
    const { data } = await api.get(`/projects/${projectId.value}/guides/github-skills`, {
      params: {
        repo: githubRepo.value.trim(),
        ref: githubRef.value.trim() || undefined,
      },
    })
    githubSkills.value = data.skills || []
    if (!githubSkills.value.length) {
      message.info('未找到含 SKILL.md 的目录')
    }
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '列出 Skills 失败')
  } finally {
    listingSkills.value = false
  }
}

function onSkillsSelect(paths: string[]) {
  if (paths.length === 1) {
    const skill = githubSkills.value.find((s) => s.path === paths[0])
    if (skill && !form.asset_id?.trim()) {
      form.asset_id = skill.id
      if (!form.name?.trim()) form.name = skill.id.slice(0, 20)
    }
  }
}

async function save() {
  if (modalMode.value === 'view') {
    modalOpen.value = false
    return
  }
  if (!projectId.value) return Promise.reject()

  if (contentSource.value === 'github') {
    if (!githubRepo.value.trim()) {
      message.warning('请填写 GitHub 仓库')
      return Promise.reject()
    }
    if (!selectedSkillPaths.value.length) {
      message.warning('请先列出并选择要安装的 Skill')
      return Promise.reject()
    }
  } else if (!form.asset_id?.trim()) {
    message.warning('请填写 Asset ID')
    return Promise.reject()
  }

  const name = (form.name || '').trim() || (form.asset_id || '').trim().slice(0, 20)
  if (name.length > 20) {
    message.warning('名称不能超过 20 个字')
    return Promise.reject()
  }
  if (contentSource.value !== 'github' && !form.kind?.trim()) {
    message.warning('请选择 Kind')
    return Promise.reject()
  }

  saving.value = true
  try {
    if (contentSource.value === 'github') {
      const skills = selectedSkillPaths.value.map((path) => {
        const sk = githubSkills.value.find((s) => s.path === path)
        return {
          skill_path: path,
          asset_id:
            selectedSkillPaths.value.length === 1 && form.asset_id?.trim()
              ? form.asset_id.trim()
              : sk?.id,
        }
      })
      const { data } = await api.post(`/projects/${projectId.value}/guides/from-github-batch`, {
        repo: githubRepo.value.trim(),
        skills,
        version: form.version || '1.0.0',
        status: form.status || 'draft',
        ref: githubRef.value.trim() || undefined,
      })
      const nOk = data.created?.length || 0
      const nSkip = data.skipped?.length || 0
      const nErr = data.errors?.length || 0
      message.success(`安装完成：成功 ${nOk} / 跳过 ${nSkip} / 失败 ${nErr}`)
      if (nErr && data.errors?.[0]?.detail) {
        message.warning(String(data.errors[0].detail))
      }
    } else if (contentSource.value === 'upload') {
      if (!uploadFileList.value.length && !form.package_path) {
        message.warning('请选择要上传的文件或文件夹')
        return Promise.reject()
      }
      if (uploadFileList.value.length) {
        const fd = new FormData()
        fd.append('asset_id', form.asset_id.trim())
        fd.append('name', name)
        fd.append('kind', form.kind)
        fd.append('stage', '')
        fd.append('task', '')
        fd.append('version', form.version || '1.0.0')
        fd.append('status', form.status || 'draft')
        fd.append('ref_skills', JSON.stringify(form.kind === 'guide.skill' ? form.ref_skills || [] : []))
        if (form.id) fd.append('guide_id', String(form.id))
        for (const item of uploadFileList.value) {
          fd.append('files', item.file)
          fd.append('relative_paths', item.rel)
        }
        await api.post(`/projects/${projectId.value}/guides/upload`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } else if (form.id) {
        await api.put(`/projects/${projectId.value}/guides/${form.id}`, {
          asset_id: form.asset_id.trim(),
          name,
          kind: form.kind,
          version: form.version,
          status: form.status,
          content: form.content,
          content_mode: form.content_mode || 'package',
          ref_skills: form.kind === 'guide.skill' ? form.ref_skills || [] : [],
        })
      } else {
        message.info('未选择新文件，保留原有包')
        modalOpen.value = false
        return
      }
    } else if (contentSource.value === 'view') {
      if (form.id) {
        await api.put(`/projects/${projectId.value}/guides/${form.id}`, {
          asset_id: form.asset_id.trim(),
          name,
          kind: form.kind,
          version: form.version,
          status: form.status,
          content: form.content,
          content_mode: 'package',
          ref_skills: form.kind === 'guide.skill' ? form.ref_skills || [] : [],
        })
      }
    } else {
      const contentMode = contentSource.value === 'text' ? 'text' : 'markdown'
      const payload = {
        asset_id: form.asset_id.trim(),
        name,
        kind: form.kind,
        content: form.content,
        status: form.status,
        version: form.version,
        content_mode: contentMode,
        stage: '',
        task: '',
        ref_skills: form.kind === 'guide.skill' ? form.ref_skills || [] : [],
      }
      if (modalMode.value === 'edit' && form.id) {
        await api.put(`/projects/${projectId.value}/guides/${form.id}`, payload)
      } else {
        await api.post(`/projects/${projectId.value}/guides`, payload)
      }
    }
    if (contentSource.value !== 'github') message.success('已保存')
    modalOpen.value = false
    await load()
  } catch (e: any) {
    if (e) message.error(e?.response?.data?.detail || '保存失败')
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
  await loadKindCards()
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
.kind-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.kind-card {
  text-align: left;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  padding: 10px 12px;
  cursor: pointer;
  min-height: 118px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.kind-card.disabled,
.kind-card:disabled {
  cursor: default;
  opacity: 0.9;
  pointer-events: none;
}
.kind-card:hover {
  border-color: #91caff;
}
.kind-card.active {
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.15);
}
.kind-badge {
  display: inline-block;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  margin-bottom: 6px;
  color: #334155;
  background: #f1f5f9;
}
.kind-badge.computational {
  background: #ecfeff;
  color: #0e7490;
}
.kind-badge.inferential {
  background: #f5f3ff;
  color: #6d28d9;
}
.kind-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 13px;
  color: #0f172a;
  margin-bottom: 4px;
}
.kind-card-icon {
  font-size: 16px;
  flex-shrink: 0;
}
.kind-card-icon.computational {
  color: #0e7490;
}
.kind-card-icon.inferential {
  color: #6d28d9;
}
.kind-id {
  font-size: 11px;
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  margin-bottom: 4px;
}
.kind-desc {
  font-size: 12px;
  color: #64748b;
  line-height: 1.35;
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
.file-list {
  margin: 10px 0 0;
  padding-left: 18px;
  max-height: 160px;
  overflow: auto;
  font-size: 12px;
}
@media (max-width: 900px) {
  .kind-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .md-split {
    grid-template-columns: 1fr;
  }
}
</style>
