<template>
  <div>
    <div class="head">
      <h2>审批工单</h2>
      <a-button type="primary" @click="openCreate">+ 新建工单</a-button>
    </div>
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 12px"
      message="人工检查（human-check）：须先上传该 Stage/Task 产物，再创建并提交工单；批准后 nhx 人工 Check 才会通过。审核时可在详情中查看关联产物。"
    />
    <a-space style="margin-bottom: 12px">
      <a-select
        v-model:value="status"
        allow-clear
        placeholder="状态"
        style="width: 140px"
        :options="statusOpts"
        @change="load"
      />
    </a-space>
    <a-table :dataSource="rows" :columns="columns" row-key="id">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'scope'">
          <span v-if="record.stage || record.task">{{ record.stage || '—' }} / {{ record.task || '—' }}</span>
          <span v-else class="muted">—</span>
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space>
            <a-button size="small" @click="openDetail(record.id)">详情</a-button>
            <a-button v-if="record.status === 'draft'" size="small" @click="submit(record.id)">提交</a-button>
            <a-button v-if="record.status === 'submitted'" size="small" type="primary" @click="openDetail(record.id)">
              审核
            </a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal
      v-model:open="open"
      title="新建工单"
      width="720px"
      :confirm-loading="creating"
      :ok-button-props="{ disabled: createDisabled }"
      @ok="create"
    >
      <a-form layout="vertical">
        <a-form-item label="项目" required>
          <a-select
            v-model:value="form.project_id"
            :options="projectOpts"
            style="width: 100%"
            @change="onProjectChange"
          />
        </a-form-item>
        <a-form-item label="标题" required><a-input v-model:value="form.title" /></a-form-item>
        <a-form-item label="类型">
          <a-select
            v-model:value="form.ticket_type"
            :options="
              ['req-review', 'arch-approve', 'artifact-release', 'human-check', 'other'].map((v) => ({
                value: v,
                label: v,
              }))
            "
            @change="onTypeChange"
          />
        </a-form-item>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item :label="'Stage'" :required="isHumanCheck">
              <a-select
                v-if="isHumanCheck"
                v-model:value="form.stage"
                allow-clear
                placeholder="选择 Stage"
                style="width: 100%"
                :options="stageOpts"
                @change="onStageChange"
              />
              <a-input v-else v-model:value="form.stage" placeholder="如 req" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item :label="'Task'" :required="isHumanCheck">
              <a-select
                v-if="isHumanCheck"
                v-model:value="form.task"
                allow-clear
                placeholder="选择 Task"
                style="width: 100%"
                :options="taskOpts"
                @change="onTaskChange"
              />
              <a-input v-else v-model:value="form.task" placeholder="如 prd-writing" />
            </a-form-item>
          </a-col>
        </a-row>

        <template v-if="isHumanCheck">
          <a-form-item label="关联产物" required>
            <a-select
              v-model:value="form.artifact_name"
              show-search
              allow-clear
              placeholder="选择本任务已上传的产物"
              style="width: 100%"
              :options="artifactOpts"
              :loading="loadingArtifacts"
              option-filter-prop="label"
            />
            <div v-if="form.stage && form.task && !artifactOpts.length && !loadingArtifacts" class="hint-warn">
              该 Stage/Task 尚无产物，请先在下方上传后再创建工单。
            </div>
          </a-form-item>
          <a-form-item label="上传产物（可选）">
            <a-input
              v-model:value="uploadName"
              placeholder="产物名称"
              style="margin-bottom: 8px"
              :disabled="!form.stage || !form.task"
            />
            <a-radio-group v-model:value="uploadMode" style="margin-bottom: 8px" :disabled="!form.stage || !form.task">
              <a-radio-button value="file">单文件</a-radio-button>
              <a-radio-button value="folder">文件夹</a-radio-button>
            </a-radio-group>
            <div>
              <input
                v-if="uploadMode === 'file'"
                type="file"
                :disabled="!form.stage || !form.task"
                @change="onFile"
              />
              <input
                v-else
                type="file"
                webkitdirectory
                multiple
                :disabled="!form.stage || !form.task"
                @change="onFolder"
              />
            </div>
            <a-button
              type="dashed"
              style="margin-top: 8px"
              :loading="uploading"
              :disabled="!canUpload"
              @click="uploadArtifact"
            >
              上传并选中
            </a-button>
          </a-form-item>
        </template>
        <a-form-item v-else label="关联产物名（可选）">
          <a-input v-model:value="form.artifact_name" />
        </a-form-item>

        <a-form-item label="内容"><a-textarea v-model:value="form.body" :rows="5" /></a-form-item>
      </a-form>
    </a-modal>

    <a-drawer
      v-model:open="detailOpen"
      :title="detail?.ticket_no ? `工单 ${detail.ticket_no}` : '工单详情'"
      width="720"
      destroy-on-close
    >
      <template v-if="detail">
        <a-descriptions size="small" bordered :column="2" style="margin-bottom: 16px">
          <a-descriptions-item label="标题" :span="2">{{ detail.title }}</a-descriptions-item>
          <a-descriptions-item label="项目">{{ detail.project_name || detail.project_id }}</a-descriptions-item>
          <a-descriptions-item label="类型">{{ detail.ticket_type }}</a-descriptions-item>
          <a-descriptions-item label="Stage/Task">
            {{ detail.stage || '—' }} / {{ detail.task || '—' }}
          </a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="statusColor(detail.status)">{{ detail.status }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="提交人">{{ detail.submitter || '—' }}</a-descriptions-item>
          <a-descriptions-item label="关联产物名">{{ detail.artifact_name || '—' }}</a-descriptions-item>
          <a-descriptions-item v-if="detail.decided_by" label="处理人">{{ detail.decided_by }}</a-descriptions-item>
          <a-descriptions-item v-if="detail.decision_note" label="审批意见" :span="2">
            {{ detail.decision_note }}
          </a-descriptions-item>
        </a-descriptions>

        <div class="section-title">内容</div>
        <pre class="body-box">{{ detail.body || '（无）' }}</pre>

        <div class="section-title">关联产物</div>
        <a-empty v-if="!(detail.artifacts || []).length" description="未找到关联产物" />
        <a-list v-else size="small" bordered :data-source="detail.artifacts">
          <template #renderItem="{ item }">
            <a-list-item>
              <a-list-item-meta
                :title="item.name"
                :description="`${item.stage}/${item.task} · v${item.latest_version || 0}`"
              />
              <template #actions>
                <a @click="previewArtifact(item)">预览</a>
                <a @click="downloadArtifact(item)">下载</a>
              </template>
            </a-list-item>
          </template>
        </a-list>

        <div v-if="preview.loading" class="muted" style="margin-top: 12px">加载预览…</div>
        <div v-else-if="preview.text" class="preview-box">
          <div class="preview-head">{{ preview.name }}</div>
          <pre>{{ preview.text }}</pre>
        </div>
        <div v-else-if="preview.error" class="hint-warn" style="margin-top: 12px">{{ preview.error }}</div>

        <div v-if="detail.status === 'submitted'" class="decide-box">
          <div class="section-title">审批意见</div>
          <a-textarea v-model:value="decisionNote" :rows="3" placeholder="可选" />
          <a-space style="margin-top: 12px">
            <a-button type="primary" :loading="deciding" @click="decide(true)">批准</a-button>
            <a-button danger :loading="deciding" @click="decide(false)">驳回</a-button>
          </a-space>
        </div>
        <div v-else-if="detail.status === 'draft'" style="margin-top: 16px">
          <a-button type="primary" @click="submit(detail.id)">提交工单</a-button>
        </div>
      </template>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { api } from '../../api'

const rows = ref<any[]>([])
const projects = ref<any[]>([])
const open = ref(false)
const creating = ref(false)
const status = ref<string | undefined>()
const form = reactive({
  project_id: undefined as number | undefined,
  title: '',
  ticket_type: 'human-check',
  body: '',
  assignee_role: 'approver',
  stage: '' as string,
  task: '' as string,
  artifact_name: '',
})

const hxStages = ref<{ id: string; tasks: { id: string; title?: string }[] }[]>([])
const scopeArtifacts = ref<any[]>([])
const loadingArtifacts = ref(false)

const uploadName = ref('')
const uploadMode = ref<'file' | 'folder'>('file')
const uploadFile = ref<File | null>(null)
const uploadFolderFiles = ref<File[]>([])
const uploading = ref(false)

const detailOpen = ref(false)
const detail = ref<any | null>(null)
const decisionNote = ref('')
const deciding = ref(false)
const preview = reactive({ loading: false, name: '', text: '', error: '' })

const isHumanCheck = computed(() => form.ticket_type === 'human-check')
const projectOpts = computed(() => projects.value.map((p) => ({ value: p.id, label: p.name })))
const statusOpts = ['draft', 'submitted', 'approved', 'rejected'].map((v) => ({ value: v, label: v }))
const stageOpts = computed(() => hxStages.value.map((s) => ({ value: s.id, label: s.id })))
const taskOpts = computed(() => {
  const stage = hxStages.value.find((s) => s.id === form.stage)
  return (stage?.tasks || []).map((t) => ({
    value: t.id,
    label: t.title ? `${t.id} — ${t.title}` : t.id,
  }))
})
const artifactOpts = computed(() =>
  scopeArtifacts.value.map((a) => ({
    value: a.name,
    label: `${a.name} (v${a.latest_version || 0})`,
  })),
)

const canUpload = computed(
  () =>
    !!form.project_id &&
    !!form.stage &&
    !!form.task &&
    !!uploadName.value.trim() &&
    (uploadMode.value === 'file' ? !!uploadFile.value : uploadFolderFiles.value.length > 0),
)

const createDisabled = computed(() => {
  if (isHumanCheck.value) {
    return !form.artifact_name || !form.stage || !form.task
  }
  return false
})

const columns = [
  { title: '工单号', dataIndex: 'ticket_no', width: 130 },
  { title: '标题', dataIndex: 'title' },
  { title: '项目', dataIndex: 'project_name', width: 120 },
  { title: 'Stage/Task', key: 'scope', width: 180 },
  { title: '类型', dataIndex: 'ticket_type', width: 130 },
  { title: '提交人', dataIndex: 'submitter', width: 90 },
  { title: '状态', key: 'status', width: 100 },
  { title: '操作', key: 'action', width: 200 },
]

function statusColor(s: string) {
  return ({ draft: 'default', submitted: 'processing', approved: 'success', rejected: 'error' } as any)[s] || 'default'
}

async function load() {
  const { data } = await api.get('/tickets', { params: status.value ? { status: status.value } : {} })
  rows.value = data
}

function openCreate() {
  open.value = true
  if (form.project_id) void loadHxStages(form.project_id)
}

async function loadHxStages(projectId: number) {
  hxStages.value = []
  try {
    const { data } = await api.get(`/projects/${projectId}`)
    hxStages.value = (data.hx_config?.stages || []).map((s: any) => ({
      id: s.id,
      tasks: (s.tasks || []).map((t: any) => ({ id: t.id, title: t.title })),
    }))
  } catch {
    message.warning('加载项目 Stage/Task 失败，请确认项目已初始化')
  }
}

async function loadScopeArtifacts() {
  scopeArtifacts.value = []
  if (!form.project_id || !form.stage || !form.task) return
  loadingArtifacts.value = true
  try {
    const { data } = await api.get('/artifacts', {
      params: { project_id: form.project_id, stage: form.stage, task: form.task },
    })
    scopeArtifacts.value = data || []
  } catch {
    scopeArtifacts.value = []
  } finally {
    loadingArtifacts.value = false
  }
}

async function onProjectChange(projectId: number | undefined) {
  form.stage = ''
  form.task = ''
  form.artifact_name = ''
  scopeArtifacts.value = []
  hxStages.value = []
  if (projectId != null) await loadHxStages(projectId)
}

function onTypeChange() {
  form.artifact_name = ''
  if (isHumanCheck.value && form.project_id) void loadHxStages(form.project_id)
}

function onStageChange() {
  form.task = ''
  form.artifact_name = ''
  scopeArtifacts.value = []
}

function onTaskChange() {
  form.artifact_name = ''
  void loadScopeArtifacts()
}

watch(
  () => [form.project_id, form.stage, form.task, form.ticket_type] as const,
  () => {
    if (isHumanCheck.value && form.project_id && form.stage && form.task) void loadScopeArtifacts()
  },
)

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  uploadFile.value = input.files?.[0] || null
}

function onFolder(e: Event) {
  const input = e.target as HTMLInputElement
  uploadFolderFiles.value = Array.from(input.files || [])
}

async function uploadArtifact() {
  if (!canUpload.value || !form.project_id) return
  uploading.value = true
  try {
    const name = uploadName.value.trim()
    const fd = new FormData()
    fd.append('project_id', String(form.project_id))
    fd.append('name', name)
    fd.append('stage', form.stage)
    fd.append('task', form.task)
    fd.append('note', '')
    if (uploadMode.value === 'file' && uploadFile.value) {
      fd.append('file', uploadFile.value)
    } else {
      for (const f of uploadFolderFiles.value) {
        fd.append('files', f)
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
        fd.append('relative_paths', rel)
      }
    }
    await api.post('/artifacts', fd)
    message.success('产物已上传')
    await loadScopeArtifacts()
    form.artifact_name = name
    uploadFile.value = null
    uploadFolderFiles.value = []
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '上传失败')
  } finally {
    uploading.value = false
  }
}

async function create() {
  if (!form.project_id || !form.title.trim()) {
    message.warning('请填写项目与标题')
    return Promise.reject()
  }
  if (isHumanCheck.value) {
    if (!form.stage || !form.task) {
      message.warning('human-check 工单必须选择 Stage 与 Task')
      return Promise.reject()
    }
    if (!form.artifact_name) {
      message.warning('请选择关联产物（可先上传）')
      return Promise.reject()
    }
  }
  creating.value = true
  try {
    await api.post('/tickets', {
      ...form,
      stage: form.stage || '',
      task: form.task || '',
      artifact_name: form.artifact_name || '',
    })
    message.success('已创建')
    open.value = false
    form.title = ''
    form.body = ''
    form.artifact_name = ''
    await load()
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '创建失败')
    return Promise.reject()
  } finally {
    creating.value = false
  }
}

async function submit(id: number) {
  try {
    await api.post(`/tickets/${id}/submit`)
    message.success('已提交')
    await load()
    if (detail.value?.id === id) await openDetail(id)
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '提交失败')
  }
}

async function openDetail(id: number) {
  preview.loading = false
  preview.name = ''
  preview.text = ''
  preview.error = ''
  decisionNote.value = ''
  try {
    const { data } = await api.get(`/tickets/${id}`)
    detail.value = data
    detailOpen.value = true
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '加载详情失败')
  }
}

async function downloadArtifact(item: any) {
  try {
    const ver = item.latest_version || 1
    const { data } = await api.get(`/artifacts/${item.id}/versions/${ver}/content`, {
      responseType: 'blob',
    })
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = item.name || `artifact-${item.id}`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '下载失败')
  }
}

async function previewArtifact(item: any) {
  preview.loading = true
  preview.name = item.name
  preview.text = ''
  preview.error = ''
  try {
    const ver = item.latest_version || 1
    const { data: meta } = await api.get(`/artifacts/${item.id}/versions/${ver}`)
    const kind = meta?.content_kind || 'file'
    const files: string[] = meta?.files || []
    if (kind === 'package' && files.length) {
      const first =
        files.find((f) => /\.(md|txt|json|ya?ml)$/i.test(f)) || files[0]
      const { data } = await api.get(`/artifacts/${item.id}/versions/${ver}/content`, {
        params: { path: first },
        responseType: 'text',
        transformResponse: [(d) => d],
      })
      preview.text = typeof data === 'string' ? data.slice(0, 20000) : String(data).slice(0, 20000)
      preview.name = `${item.name} / ${first}`
    } else {
      const { data } = await api.get(`/artifacts/${item.id}/versions/${ver}/content`, {
        responseType: 'text',
        transformResponse: [(d) => d],
      })
      const text = typeof data === 'string' ? data : String(data)
      if (/[\x00-\x08\x0e-\x1f]/.test(text.slice(0, 200))) {
        preview.error = '该产物为二进制文件，请使用下载查看'
      } else {
        preview.text = text.slice(0, 20000)
      }
    }
  } catch (e: any) {
    preview.error = e?.response?.data?.detail || '预览失败，请尝试下载'
  } finally {
    preview.loading = false
  }
}

async function decide(ok: boolean) {
  if (!detail.value?.id) return
  deciding.value = true
  try {
    await api.post(`/tickets/${detail.value.id}/${ok ? 'approve' : 'reject'}`, {
      note: decisionNote.value || '',
    })
    message.success(ok ? '已批准' : '已驳回')
    await load()
    await openDetail(detail.value.id)
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '操作失败')
  } finally {
    deciding.value = false
  }
}

onMounted(async () => {
  const [t, p] = await Promise.all([api.get('/tickets'), api.get('/projects')])
  rows.value = t.data
  projects.value = p.data
  if (p.data[0]) {
    form.project_id = p.data[0].id
    void loadHxStages(p.data[0].id)
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
.muted {
  color: #94a3b8;
}
.hint-warn {
  margin-top: 6px;
  color: #d48806;
  font-size: 12px;
}
.section-title {
  font-weight: 600;
  margin: 12px 0 8px;
}
.body-box {
  margin: 0;
  padding: 10px 12px;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  max-height: 200px;
  overflow: auto;
}
.preview-box {
  margin-top: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}
.preview-head {
  padding: 6px 10px;
  background: #f1f5f9;
  font-size: 12px;
  color: #475569;
}
.preview-box pre {
  margin: 0;
  padding: 10px 12px;
  max-height: 280px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.decide-box {
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}
</style>
