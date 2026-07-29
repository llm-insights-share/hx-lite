<template>
  <div>
    <div class="head">
      <h2>Profile 管理</h2>
      <a-button type="primary" @click="openCreate">+ 新建 Profile</a-button>
    </div>
    <a-table :dataSource="rows" :columns="columns" row-key="id" :pagination="false">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'stages'">
          <a-tag v-for="s in record.stages" :key="s">{{ s }}</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space>
            <a-button size="small" @click="openDetail(record)">详情</a-button>
            <a-button size="small" @click="openClone(record)">复制</a-button>
            <template v-if="!isBuiltin(record.key)">
              <a-button size="small" type="primary" ghost @click="openEdit(record)">修改</a-button>
              <a-popconfirm title="确认删除？" @confirm="remove(record.id)">
                <a-button danger size="small">删除</a-button>
              </a-popconfirm>
            </template>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal
      v-model:open="openForm"
      :title="formModalTitle"
      :confirmLoading="saving"
      width="720px"
      @ok="save"
    >
      <a-form layout="vertical">
        <a-form-item label="Key" required>
          <a-input v-model:value="form.key" :disabled="!!form.id" />
        </a-form-item>
        <a-form-item label="标题">
          <a-input v-model:value="form.title" />
        </a-form-item>
        <a-form-item label="描述">
          <a-textarea v-model:value="form.description" :rows="3" />
        </a-form-item>
        <a-form-item label="Stages">
          <a-select
            v-model:value="form.stages"
            mode="multiple"
            :options="stageOpts"
            style="width: 100%"
            @change="onStagesChange"
          />
        </a-form-item>

        <div v-for="stage in form.stages" :key="stage" class="stage-block">
          <div class="stage-block-title">Stage：{{ stage }} — 任务</div>
          <a-select
            :value="form.tasks[stage] || []"
            mode="multiple"
            style="width: 100%; margin-bottom: 8px"
            :options="taskOptsFor(stage)"
            placeholder="从模板目录选择任务"
            option-filter-prop="label"
            show-search
            @change="(vals: string[]) => onTasksSelect(stage, vals)"
          />
          <div v-if="(form.tasks[stage] || []).length" class="task-order-list">
            <div v-for="(tid, idx) in form.tasks[stage]" :key="tid" class="task-order-row">
              <span class="task-order-label">{{ idx + 1 }}. {{ taskLabel(stage, tid) }}</span>
              <a-space>
                <a-button size="small" :disabled="idx === 0" @click="moveTask(stage, idx, -1)">上移</a-button>
                <a-button
                  size="small"
                  :disabled="idx === form.tasks[stage].length - 1"
                  @click="moveTask(stage, idx, 1)"
                >
                  下移
                </a-button>
                <a-button size="small" danger @click="removeTask(stage, idx)">移除</a-button>
              </a-space>
            </div>
          </div>
          <div v-else class="muted">尚未选择任务</div>
        </div>
      </a-form>
    </a-modal>

    <a-modal v-model:open="openDetailModal" title="Profile 详情" :footer="null" width="640px">
      <a-descriptions v-if="detail" bordered :column="1" size="small">
        <a-descriptions-item label="Key">
          {{ detail.key }}
          <a-tag v-if="isBuiltin(detail.key)" color="blue" style="margin-left: 8px">内置</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="标题">{{ detail.title || '—' }}</a-descriptions-item>
        <a-descriptions-item label="描述">{{ detail.description || '—' }}</a-descriptions-item>
        <a-descriptions-item label="Stages">
          <a-space wrap>
            <a-tag v-for="s in detail.stages || []" :key="s">{{ s }}</a-tag>
            <span v-if="!(detail.stages || []).length">—</span>
          </a-space>
        </a-descriptions-item>
        <a-descriptions-item label="Tasks">
          <div v-if="detail.stages?.length" class="detail-tasks">
            <div v-for="stage in detail.stages" :key="stage" class="detail-stage">
              <div class="detail-stage-title">{{ stage }}</div>
              <ol v-if="(detail.tasks?.[stage] || []).length">
                <li v-for="tid in detail.tasks[stage]" :key="tid">{{ taskLabel(stage, tid) }}</li>
              </ol>
              <div v-else class="muted">（无任务）</div>
            </div>
          </div>
          <span v-else>—</span>
        </a-descriptions-item>
      </a-descriptions>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { api } from '../../api'

/** Bootstrap 内置四档 Profile，仅允许查看 */
const BUILTIN_KEYS = new Set(['lite', 'standard', 'strict', 'enterprise'])

const rows = ref<any[]>([])
const catalogTasks = ref<any[]>([])
const openForm = ref(false)
const openDetailModal = ref(false)
const saving = ref(false)
const detail = ref<any>(null)
const cloneSourceKey = ref('')
const form = reactive({
  id: null as number | null,
  key: '',
  title: '',
  description: '',
  stages: [] as string[],
  tasks: {} as Record<string, string[]>,
})
const stageOpts = ['req', 'arch', 'dev', 'test'].map((v) => ({ value: v, label: v }))
const columns = [
  { title: 'Key', dataIndex: 'key' },
  { title: '标题', dataIndex: 'title' },
  { title: '描述', dataIndex: 'description' },
  { title: 'Stages', key: 'stages' },
  { title: '操作', key: 'action', width: 280 },
]

const formModalTitle = computed(() => {
  if (form.id) return '修改 Profile'
  if (cloneSourceKey.value) return '复制 Profile'
  return '新建 Profile'
})

const catalogByStage = computed(() => {
  const map: Record<string, { value: string; label: string }[]> = {}
  for (const t of catalogTasks.value) {
    const stage = t.stage
    if (!map[stage]) map[stage] = []
    map[stage].push({
      value: t.task_id,
      label: t.title_zh ? `${t.task_id} — ${t.title_zh}` : t.task_id,
    })
  }
  return map
})

function isBuiltin(key: string) {
  return BUILTIN_KEYS.has(key)
}

function taskOptsFor(stage: string) {
  return catalogByStage.value[stage] || []
}

function taskLabel(stage: string, tid: string) {
  const hit = (catalogByStage.value[stage] || []).find((o) => o.value === tid)
  return hit?.label || tid
}

function resetForm() {
  cloneSourceKey.value = ''
  Object.assign(form, {
    id: null,
    key: '',
    title: '',
    description: '',
    stages: [],
    tasks: {},
  })
}

async function loadCatalog() {
  const { data } = await api.get('/org/tasks', { params: { profile_key: '*' } })
  catalogTasks.value = Array.isArray(data) ? data : []
}

async function load() {
  const { data } = await api.get('/org/profiles')
  rows.value = data
}

function openCreate() {
  resetForm()
  openForm.value = true
}

function openEdit(record: any) {
  cloneSourceKey.value = ''
  const tasks: Record<string, string[]> = {}
  for (const [stage, tids] of Object.entries(record.tasks || {})) {
    tasks[stage] = [...(tids as string[])]
  }
  Object.assign(form, {
    id: record.id,
    key: record.key,
    title: record.title || '',
    description: record.description || '',
    stages: [...(record.stages || [])],
    tasks,
  })
  openForm.value = true
}

function openClone(record: any) {
  const sourceKey = record.key || ''
  const tasks: Record<string, string[]> = {}
  for (const [stage, tids] of Object.entries(record.tasks || {})) {
    tasks[stage] = [...(tids as string[])]
  }
  cloneSourceKey.value = sourceKey
  Object.assign(form, {
    id: null,
    key: `${sourceKey}-clone`,
    title: `${record.title || sourceKey}-clone`,
    description: record.description || '',
    stages: [...(record.stages || [])],
    tasks,
  })
  openForm.value = true
}

function openDetail(record: any) {
  detail.value = record
  openDetailModal.value = true
}

function onStagesChange(stages: string[]) {
  const next: Record<string, string[]> = {}
  for (const s of stages) {
    next[s] = [...(form.tasks[s] || [])]
  }
  form.tasks = next
}

/** Keep relative order of previous selection; append newly picked at end. */
function onTasksSelect(stage: string, vals: string[]) {
  const prev = form.tasks[stage] || []
  const keep = prev.filter((id) => vals.includes(id))
  const added = vals.filter((id) => !keep.includes(id))
  form.tasks = { ...form.tasks, [stage]: [...keep, ...added] }
}

function moveTask(stage: string, idx: number, delta: number) {
  const list = [...(form.tasks[stage] || [])]
  const j = idx + delta
  if (j < 0 || j >= list.length) return
  ;[list[idx], list[j]] = [list[j], list[idx]]
  form.tasks = { ...form.tasks, [stage]: list }
}

function removeTask(stage: string, idx: number) {
  const list = [...(form.tasks[stage] || [])]
  list.splice(idx, 1)
  form.tasks = { ...form.tasks, [stage]: list }
}

async function save() {
  const key = form.key?.trim() || ''
  if (!key) {
    message.warning('请填写 Key')
    return Promise.reject()
  }
  if (cloneSourceKey.value && key === cloneSourceKey.value) {
    message.warning('请修改 Key（不能与源 Profile 相同）')
    return Promise.reject()
  }
  saving.value = true
  try {
    const tasks: Record<string, string[]> = {}
    for (const s of form.stages) {
      tasks[s] = [...(form.tasks[s] || [])]
    }
    const payload = {
      key,
      title: form.title,
      description: form.description,
      stages: form.stages,
      tasks,
    }
    const isEdit = !!form.id
    if (isEdit) await api.put(`/org/profiles/${form.id}`, payload)
    else await api.post('/org/profiles', payload)
    message.success(isEdit ? '已更新' : cloneSourceKey.value ? '已复制' : '已创建')
    openForm.value = false
    resetForm()
    await load()
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '保存失败')
    return Promise.reject(e)
  } finally {
    saving.value = false
  }
}

async function remove(id: number) {
  await api.delete(`/org/profiles/${id}`)
  message.success('已删除')
  await load()
}

onMounted(async () => {
  await Promise.all([loadCatalog(), load()])
})
</script>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.stage-block {
  margin-bottom: 16px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.stage-block-title {
  font-weight: 600;
  margin-bottom: 8px;
  color: #334155;
}
.task-order-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.task-order-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}
.task-order-label {
  font-size: 13px;
  color: #0f172a;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.muted {
  color: #94a3b8;
  font-size: 12px;
}
.detail-tasks {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.detail-stage-title {
  font-weight: 600;
  margin-bottom: 4px;
}
.detail-stage ol {
  margin: 0;
  padding-left: 20px;
}
</style>
