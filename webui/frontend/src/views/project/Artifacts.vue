<template>
  <div>
    <div class="head">
      <h2>产物列表</h2>
      <a-button type="primary" @click="openUpload">上传产物</a-button>
    </div>

    <a-space wrap style="margin-bottom: 12px">
      <a-select
        v-model:value="filters.project_id"
        allow-clear
        placeholder="项目"
        style="width: 200px"
        :options="projectOpts"
        @change="onFilterChange"
      />
      <a-select
        v-model:value="filters.stage"
        allow-clear
        placeholder="Stage"
        style="width: 160px"
        :options="stageOpts"
        @change="load"
      />
      <a-select
        v-model:value="filters.task"
        allow-clear
        placeholder="Task"
        style="width: 220px"
        :options="taskOpts"
        @change="load"
      />
    </a-space>

    <a-table :dataSource="rows" :columns="columns" row-key="id">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'created_at'">
          {{ formatLocalDateTime(record.created_at) }}
        </template>
        <template v-else-if="column.key === 'action'">
          <a-button size="small" type="link" @click="openDetail(record)">详情</a-button>
          <a-button size="small" @click="showVersions(record)">版本</a-button>
          <a-popconfirm
            v-if="record.can_delete"
            title="确认删除该产物？所有版本文件将一并清除，且不可恢复。"
            ok-text="删除"
            cancel-text="取消"
            ok-type="danger"
            @confirm="removeArtifact(record.id)"
          >
            <a-button size="small" danger style="margin-left: 6px" :loading="deletingId === record.id">
              删除
            </a-button>
          </a-popconfirm>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="open" title="上传产物" @ok="upload" :confirmLoading="uploading">
      <a-form layout="vertical">
        <a-form-item label="项目">
          <a-select
            v-model:value="form.project_id"
            :options="projectOpts"
            style="width: 100%"
            placeholder="选择项目"
            @change="onUploadProjectChange"
          />
        </a-form-item>
        <a-form-item label="名称"><a-input v-model:value="form.name" /></a-form-item>
        <a-form-item label="Stage">
          <a-select
            v-model:value="form.stage"
            :options="uploadStageOpts"
            style="width: 100%"
            show-search
            allow-clear
            placeholder="请先选择项目"
            :disabled="!form.project_id"
            @change="onUploadStageChange"
          />
        </a-form-item>
        <a-form-item label="Task">
          <a-select
            v-model:value="form.task"
            :options="uploadTaskOpts"
            style="width: 100%"
            show-search
            allow-clear
            placeholder="请先选择 Stage"
            :disabled="!form.project_id || !form.stage"
          />
        </a-form-item>
        <a-form-item label="备注"><a-input v-model:value="form.note" /></a-form-item>
        <a-form-item label="上传类型">
          <a-radio-group v-model:value="uploadMode">
            <a-radio-button value="file">文件</a-radio-button>
            <a-radio-button value="folder">文件夹</a-radio-button>
          </a-radio-group>
        </a-form-item>
        <a-form-item :label="uploadMode === 'folder' ? '文件夹' : '文件'">
          <input
            v-if="uploadMode === 'file'"
            type="file"
            @change="onFile"
          />
          <input
            v-else
            type="file"
            webkitdirectory
            multiple
            @change="onFolder"
          />
          <div v-if="uploadMode === 'folder' && folderFiles.length" class="hint">
            已选 {{ folderFiles.length }} 个文件
          </div>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-drawer v-model:open="drawer" title="版本历史" width="480">
      <a-timeline>
        <a-timeline-item v-for="v in versions" :key="v.id">
          v{{ v.version }} · {{ v.created_by }} · {{ v.note || '无备注' }}
          <div class="mono">{{ v.content_kind }} · {{ (v.files || []).length }} 文件</div>
        </a-timeline-item>
      </a-timeline>
    </a-drawer>

    <a-drawer
      v-model:open="detailOpen"
      :title="detail?.name ? `产物详情 · ${detail.name}` : '产物详情'"
      width="880"
      destroy-on-close
      @close="resetPreview"
    >
      <template v-if="detail">
        <a-descriptions size="small" bordered :column="2" style="margin-bottom: 12px">
          <a-descriptions-item label="项目">{{ detail.project_name || '—' }}</a-descriptions-item>
          <a-descriptions-item label="最新版本">v{{ detail.latest_version }}</a-descriptions-item>
          <a-descriptions-item label="Stage">{{ detail.stage || '—' }}</a-descriptions-item>
          <a-descriptions-item label="Task">{{ detail.task || '—' }}</a-descriptions-item>
          <a-descriptions-item label="备注" :span="2">
            {{ detailVersion?.note || '—' }}
          </a-descriptions-item>
        </a-descriptions>

        <a-space style="margin-bottom: 12px">
          <span>版本</span>
          <a-select
            v-model:value="detailVersionNo"
            style="width: 120px"
            :options="detailVersionOpts"
            @change="onDetailVersionChange"
          />
          <a-tag>{{ detailVersion?.content_kind || 'file' }}</a-tag>
        </a-space>

        <div
          v-if="detailVersion?.content_kind === 'package'"
          class="detail-split"
        >
          <aside class="file-tree">
            <div
              v-for="f in detailVersion.files || []"
              :key="f"
              class="file-item"
              :class="{ active: previewPath === f }"
              @click="previewFile(f)"
            >
              {{ f }}
            </div>
            <a-empty v-if="!(detailVersion.files || []).length" description="无文件" />
          </aside>
          <section class="preview-pane">
            <a-spin :spinning="previewLoading">
              <div v-if="!previewPath" class="hint">请选择左侧文件预览</div>
              <div v-else-if="previewKind === 'md' || previewKind === 'html' || previewKind === 'table'" class="md-preview" v-html="previewHtml" />
              <pre v-else-if="previewKind === 'text'" class="text-preview">{{ previewText }}</pre>
              <img v-else-if="previewKind === 'image'" class="img-preview" :src="previewUrl" alt="" />
              <iframe v-else-if="previewKind === 'pdf'" class="pdf-preview" :src="previewUrl" />
              <div v-else class="hint">
                该文件类型暂不支持预览。
                <a :href="downloadHref" target="_blank" rel="noopener">下载</a>
              </div>
            </a-spin>
          </section>
        </div>

        <div v-else class="preview-pane single">
          <a-spin :spinning="previewLoading">
            <div v-if="previewKind === 'md' || previewKind === 'html' || previewKind === 'table'" class="md-preview" v-html="previewHtml" />
            <pre v-else-if="previewKind === 'text'" class="text-preview">{{ previewText }}</pre>
            <img v-else-if="previewKind === 'image'" class="img-preview" :src="previewUrl" alt="" />
            <iframe v-else-if="previewKind === 'pdf'" class="pdf-preview" :src="previewUrl" />
            <div v-else-if="!previewLoading" class="hint">
              该文件类型暂不支持预览。
              <a v-if="downloadHref" :href="downloadHref" target="_blank" rel="noopener">下载</a>
            </div>
          </a-spin>
        </div>
      </template>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { api } from '../../api'
import { formatLocalDateTime } from '../../utils/formatTime'

const rows = ref<any[]>([])
const projects = ref<any[]>([])
const open = ref(false)
const drawer = ref(false)
const versions = ref<any[]>([])
const file = ref<File | null>(null)
const folderFiles = ref<File[]>([])
const uploadMode = ref<'file' | 'folder'>('file')
const uploading = ref(false)
const deletingId = ref<number | null>(null)
const form = reactive({
  project_id: undefined as number | undefined,
  name: '',
  stage: undefined as string | undefined,
  task: undefined as string | undefined,
  note: '',
})
const uploadStages = ref<{ id: string; tasks: { id: string; title?: string }[] }[]>([])
const filters = reactive({
  project_id: undefined as number | undefined,
  stage: undefined as string | undefined,
  task: undefined as string | undefined,
})
const hxStageOpts = ref<{ value: string; label: string }[]>([])
const hxTaskOpts = ref<{ value: string; label: string }[]>([])

const detailOpen = ref(false)
const detail = ref<any>(null)
const detailVersions = ref<any[]>([])
const detailVersionNo = ref<number | undefined>(undefined)
const detailVersion = computed(() =>
  detailVersions.value.find((v) => v.version === detailVersionNo.value) || null,
)

const previewPath = ref('')
const previewLoading = ref(false)
const previewKind = ref<'md' | 'text' | 'html' | 'table' | 'image' | 'pdf' | 'other' | ''>('')
const previewHtml = ref('')
const previewText = ref('')
const previewUrl = ref('')

const projectOpts = computed(() => projects.value.map((p) => ({ value: p.id, label: p.name })))
const uploadStageOpts = computed(() =>
  uploadStages.value.map((s) => ({ value: s.id, label: s.id })),
)
const uploadTaskOpts = computed(() => {
  const stage = uploadStages.value.find((s) => s.id === form.stage)
  if (!stage) return []
  return (stage.tasks || []).map((t) => ({
    value: t.id,
    label: t.title ? `${t.id} — ${t.title}` : t.id,
  }))
})
const stageOpts = computed(() => {
  const set = new Set<string>()
  for (const o of hxStageOpts.value) set.add(o.value)
  for (const r of rows.value) if (r.stage) set.add(r.stage)
  if (filters.stage) set.add(filters.stage)
  return [...set].sort().map((v) => ({ value: v, label: v }))
})
const taskOpts = computed(() => {
  const set = new Set<string>()
  for (const o of hxTaskOpts.value) set.add(o.value)
  for (const r of rows.value) if (r.task) set.add(r.task)
  if (filters.task) set.add(filters.task)
  return [...set].sort().map((v) => ({ value: v, label: v }))
})
const detailVersionOpts = computed(() =>
  detailVersions.value.map((v) => ({ value: v.version, label: `v${v.version}` })),
)

const downloadHref = computed(() => {
  if (!detail.value || detailVersionNo.value == null) return ''
  const q = previewPath.value ? `?path=${encodeURIComponent(previewPath.value)}` : ''
  return `/api/artifacts/${detail.value.id}/versions/${detailVersionNo.value}/content${q}`
})

const columns = [
  { title: '名称', dataIndex: 'name' },
  { title: '项目', dataIndex: 'project_name' },
  { title: 'Stage', dataIndex: 'stage' },
  { title: 'Task', dataIndex: 'task' },
  { title: '最新版本', dataIndex: 'latest_version' },
  { title: '创建时间', key: 'created_at', width: 180 },
  { title: '操作', key: 'action', width: 220 },
]

async function load() {
  const params: Record<string, string | number> = {}
  if (filters.project_id != null) params.project_id = filters.project_id
  if (filters.stage) params.stage = filters.stage
  if (filters.task) params.task = filters.task
  const [a, p] = await Promise.all([api.get('/artifacts', { params }), api.get('/projects')])
  rows.value = a.data
  projects.value = p.data
}

async function onFilterChange() {
  filters.stage = undefined
  filters.task = undefined
  hxStageOpts.value = []
  hxTaskOpts.value = []
  if (filters.project_id != null) {
    try {
      const { data } = await api.get(`/projects/${filters.project_id}`)
      const stages = data.hx_config?.stages || []
      const sOpts: { value: string; label: string }[] = []
      const tOpts: { value: string; label: string }[] = []
      for (const s of stages) {
        if (s.id) sOpts.push({ value: s.id, label: s.id })
        for (const t of s.tasks || []) {
          if (t.id) tOpts.push({ value: t.id, label: `${s.id}/${t.id}` })
        }
      }
      hxStageOpts.value = sOpts
      hxTaskOpts.value = tOpts
    } catch {
      /* ignore */
    }
  }
  await load()
}

function openUpload() {
  open.value = true
  uploadMode.value = 'file'
  file.value = null
  folderFiles.value = []
  form.stage = undefined
  form.task = undefined
  uploadStages.value = []
  if (form.project_id != null) {
    void loadUploadStages(form.project_id)
  } else if (filters.project_id != null) {
    form.project_id = filters.project_id
    void loadUploadStages(filters.project_id)
  }
}

async function loadUploadStages(projectId: number) {
  uploadStages.value = []
  try {
    const { data } = await api.get(`/projects/${projectId}`)
    uploadStages.value = (data.hx_config?.stages || []).map((s: any) => ({
      id: s.id,
      tasks: (s.tasks || []).map((t: any) => ({ id: t.id, title: t.title })),
    }))
  } catch {
    message.warning('加载项目 Stage/Task 失败，请确认项目已初始化')
  }
}

async function onUploadProjectChange(projectId: number | undefined) {
  form.stage = undefined
  form.task = undefined
  uploadStages.value = []
  if (projectId != null) await loadUploadStages(projectId)
}

function onUploadStageChange() {
  form.task = undefined
}

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  file.value = input.files?.[0] || null
}

function onFolder(e: Event) {
  const input = e.target as HTMLInputElement
  folderFiles.value = Array.from(input.files || [])
}

async function upload() {
  if (!form.project_id || !form.name) {
    message.warning('请填写完整')
    return
  }
  if (uploadMode.value === 'file' && !file.value) {
    message.warning('请选择文件')
    return
  }
  if (uploadMode.value === 'folder' && !folderFiles.value.length) {
    message.warning('请选择文件夹')
    return
  }
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('project_id', String(form.project_id))
    fd.append('name', form.name)
    fd.append('stage', form.stage || '')
    fd.append('task', form.task || '')
    fd.append('note', form.note)
    if (uploadMode.value === 'file' && file.value) {
      fd.append('file', file.value)
    } else {
      for (const f of folderFiles.value) {
        fd.append('files', f)
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
        fd.append('relative_paths', rel)
      }
    }
    const { data } = await api.post('/artifacts', fd)
    const renames = (data?.renamed_files || []) as Array<{ from: string; to: string }>
    if (renames.length) {
      const tip = renames.map((r) => `${r.from} → ${r.to}`).join('；')
      message.success(`已上传（文件名冲突已自动重命名：${tip}）`)
    } else {
      message.success('已上传')
    }
    open.value = false
    await load()
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '上传失败')
  } finally {
    uploading.value = false
  }
}

async function showVersions(record: any) {
  const { data } = await api.get(`/artifacts/${record.id}/versions`)
  versions.value = data
  drawer.value = true
}

async function removeArtifact(id: number) {
  deletingId.value = id
  try {
    await api.delete(`/artifacts/${id}`)
    message.success('产物已删除')
    if (detail.value?.id === id) detailOpen.value = false
    await load()
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '删除失败')
  } finally {
    deletingId.value = null
  }
}

function resetPreview() {
  previewPath.value = ''
  previewKind.value = ''
  previewHtml.value = ''
  previewText.value = ''
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

function fileExt(path: string) {
  const n = path.split('/').pop() || path
  const i = n.lastIndexOf('.')
  return i >= 0 ? n.slice(i + 1).toLowerCase() : ''
}

async function openDetail(record: any) {
  resetPreview()
  const [meta, vers] = await Promise.all([
    api.get(`/artifacts/${record.id}`),
    api.get(`/artifacts/${record.id}/versions`),
  ])
  detail.value = meta.data
  detailVersions.value = vers.data || []
  detailVersionNo.value = detailVersions.value[0]?.version
  detailOpen.value = true
  await onDetailVersionChange()
}

async function onDetailVersionChange() {
  resetPreview()
  if (!detailVersion.value) return
  if (detailVersion.value.content_kind === 'package') {
    const files = detailVersion.value.files || []
    if (files.length === 1) await previewFile(files[0])
    return
  }
  const files = detailVersion.value.files || []
  await previewFile(files[0] || '')
}

async function previewFile(relPath: string) {
  if (!detail.value || detailVersionNo.value == null) return
  previewPath.value = relPath
  previewLoading.value = true
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
  previewHtml.value = ''
  previewText.value = ''
  try {
    const res = await api.get(`/artifacts/${detail.value.id}/versions/${detailVersionNo.value}/content`, {
      params: relPath ? { path: relPath } : undefined,
      responseType: 'arraybuffer',
    })
    const buf = res.data as ArrayBuffer
    const ext = fileExt(relPath || (detailVersion.value?.files || [])[0] || '')
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
      previewKind.value = 'image'
      const blob = new Blob([buf])
      previewUrl.value = URL.createObjectURL(blob)
    } else if (ext === 'pdf') {
      previewKind.value = 'pdf'
      previewUrl.value = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }))
    } else if (ext === 'md' || ext === 'markdown') {
      const text = new TextDecoder('utf-8').decode(buf)
      previewKind.value = 'md'
      previewHtml.value = DOMPurify.sanitize(marked.parse(text, { async: false }) as string)
    } else if (ext === 'txt' || ext === 'json' || ext === 'yaml' || ext === 'yml' || ext === 'csv') {
      previewKind.value = 'text'
      previewText.value = new TextDecoder('utf-8').decode(buf)
    } else if (ext === 'docx') {
      const result = await mammoth.convertToHtml({ arrayBuffer: buf })
      previewKind.value = 'html'
      previewHtml.value = DOMPurify.sanitize(result.value || '')
    } else if (ext === 'xlsx' || ext === 'xls') {
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      previewKind.value = 'table'
      previewHtml.value = DOMPurify.sanitize(XLSX.utils.sheet_to_html(sheet))
    } else {
      try {
        const text = new TextDecoder('utf-8').decode(buf)
        if (/[\x00-\x08\x0e-\x1f]/.test(text.slice(0, 200))) {
          previewKind.value = 'other'
        } else {
          previewKind.value = 'text'
          previewText.value = text
        }
      } catch {
        previewKind.value = 'other'
      }
    }
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '预览失败')
    previewKind.value = 'other'
  } finally {
    previewLoading.value = false
  }
}

watch(uploadMode, () => {
  file.value = null
  folderFiles.value = []
})

onMounted(load)
</script>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.mono {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: #64748b;
}
.hint {
  margin-top: 6px;
  color: #64748b;
  font-size: 12px;
}
.detail-split {
  display: flex;
  min-height: 420px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}
.file-tree {
  width: 240px;
  flex-shrink: 0;
  overflow: auto;
  border-right: 1px solid #e5e7eb;
  background: #fafafa;
}
.file-item {
  padding: 8px 10px;
  font-size: 12px;
  font-family: ui-monospace, monospace;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  word-break: break-all;
}
.file-item:hover {
  background: #f1f5f9;
}
.file-item.active {
  background: #e8f1ff;
}
.preview-pane {
  flex: 1;
  min-width: 0;
  padding: 12px;
  overflow: auto;
}
.preview-pane.single {
  min-height: 360px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.md-preview {
  font-size: 13px;
  line-height: 1.6;
}
.md-preview :deep(table) {
  border-collapse: collapse;
  width: 100%;
}
.md-preview :deep(th),
.md-preview :deep(td) {
  border: 1px solid #e5e7eb;
  padding: 4px 8px;
}
.text-preview {
  margin: 0;
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
.img-preview {
  max-width: 100%;
  height: auto;
}
.pdf-preview {
  width: 100%;
  min-height: 480px;
  border: 0;
}
</style>
