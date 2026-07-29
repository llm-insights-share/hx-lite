<template>
  <div>
    <div class="head">
      <h2>自定义 Task</h2>
      <a-button type="primary" :disabled="!projectId" @click="openCreate">+ 新建 Task</a-button>
    </div>
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 12px"
      message="任务直接绑定 Guide / Sensor。人工审查：编辑任务并勾选 check_type=human 的 Sensor。Profile 任务也可改绑定（无需删建）。"
    />
    <a-form layout="inline" style="margin-bottom: 12px">
      <a-form-item label="项目">
        <a-select v-model:value="projectId" style="width: 260px" :options="projectOpts" @change="onProjectChange" />
      </a-form-item>
      <a-form-item label="Stage">
        <a-select
          v-model:value="stageFilter"
          style="width: 160px"
          :options="stageFilterOpts"
          allow-clear
          placeholder="全部"
        />
      </a-form-item>
    </a-form>
    <a-table :dataSource="filteredRows" :columns="columns" row-key="id">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'guides'">
          <a-tag v-for="g in record.guides || []" :key="g">{{ g }}</a-tag>
        </template>
        <template v-else-if="column.key === 'sensors'">
          <a-tag
            v-for="s in record.sensors || []"
            :key="s"
            :color="isHumanSensor(s) ? 'purple' : 'processing'"
          >
            {{ s }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'shell'">
          <div class="shell-cell">
            <code>/{{ record.slash_name }}</code>
          </div>
        </template>
        <template v-else-if="column.key === 'custom'">
          <a-tag :color="record.custom ? 'blue' : 'default'">{{ record.custom ? 'custom' : 'from-profile' }}</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-button size="small" @click="openEdit(record)">编辑</a-button>
          <a-popconfirm v-if="record.custom" title="删除任务及自动生成的壳？" @confirm="remove(record.id)">
            <a-button danger size="small" style="margin-left: 6px">删除</a-button>
          </a-popconfirm>
        </template>
      </template>
    </a-table>

    <a-modal
      v-model:open="open"
      :title="form.id ? '编辑 Task 绑定' : '新建自定义 Task'"
      width="720px"
      :confirmLoading="saving"
      @ok="save"
    >
      <a-form layout="vertical">
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="Stage" required>
              <a-select
                v-model:value="form.stage"
                :options="stageOpts"
                show-search
                placeholder="选择阶段"
                :disabled="!!form.id"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Task ID" required>
              <a-input v-model:value="form.task_id" placeholder="如 my-custom-review" :disabled="!!form.id" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="标题">
          <a-input v-model:value="form.title" placeholder="可选，默认等于 Task ID" />
        </a-form-item>
        <a-form-item label="Guide 资产">
          <a-select
            v-model:value="form.guides"
            mode="multiple"
            style="width: 100%"
            :options="guideOpts"
            placeholder="选择项目中的 Guide（可多选）"
            option-filter-prop="label"
            show-search
          />
        </a-form-item>
        <a-form-item label="Sensor 资产">
          <a-select
            v-model:value="form.sensors"
            mode="multiple"
            style="width: 100%"
            :options="sensorOpts"
            placeholder="直接选择要绑定的 Sensor（可多选）"
            option-filter-prop="label"
            show-search
          />
          <div class="hint">含 · human 的为人工审批关卡。</div>
        </a-form-item>
        <a-form-item label="Required">
          <a-switch v-model:checked="form.required" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { api } from '../../api'

const projects = ref<any[]>([])
const projectId = ref<number>()
const stageFilter = ref<string | undefined>(undefined)
const rows = ref<any[]>([])
const open = ref(false)
const saving = ref(false)
const options = ref<{ stages: string[]; guides: any[]; sensors: any[] }>({
  stages: [],
  guides: [],
  sensors: [],
})

const form = reactive({
  id: null as number | null,
  stage: 'dev',
  task_id: '',
  title: '',
  required: false,
  guides: [] as string[],
  sensors: [] as string[],
})

const projectOpts = computed(() => projects.value.map((p) => ({ value: p.id, label: p.name })))
const stageOpts = computed(() => options.value.stages.map((s) => ({ value: s, label: s })))
const stageFilterOpts = computed(() => {
  const fromOpts = options.value.stages || []
  const fromRows = [...new Set(rows.value.map((r) => r.stage).filter(Boolean))]
  const list = [...fromOpts]
  for (const s of fromRows) {
    if (!list.includes(s)) list.push(s)
  }
  return list.map((s) => ({ value: s, label: s }))
})
const filteredRows = computed(() => {
  if (!stageFilter.value) return rows.value
  return rows.value.filter((r) => r.stage === stageFilter.value)
})
const guideOpts = computed(() =>
  options.value.guides.map((g) => ({
    value: g.asset_id,
    label: g.name ? `${g.asset_id} — ${g.name}` : `${g.asset_id} (${g.kind})`,
  })),
)
const sensorOpts = computed(() =>
  options.value.sensors.map((s) => ({
    value: s.asset_id,
    label: s.name
      ? `${s.asset_id} — ${s.name}`
      : `${s.asset_id}${s.check_type ? ` · ${s.check_type}` : ''}`,
  })),
)

const humanSensorIds = computed(() => {
  const ids = new Set<string>()
  for (const s of options.value.sensors) {
    if (s.check_type === 'human' || s.check_type === 'manual') ids.add(s.asset_id)
  }
  return ids
})

function isHumanSensor(assetId: string) {
  return humanSensorIds.value.has(assetId) || /approv|human|manual/i.test(assetId)
}

const columns = [
  { title: 'Stage', dataIndex: 'stage', width: 90 },
  { title: 'Task', dataIndex: 'task_id', width: 160 },
  { title: '标题', dataIndex: 'title' },
  { title: 'Guides', key: 'guides' },
  { title: 'Sensors', key: 'sensors' },
  { title: 'Command 壳', key: 'shell', width: 200 },
  { title: '来源', key: 'custom', width: 110 },
  { title: '操作', key: 'action', width: 140 },
]

async function loadOptions() {
  if (!projectId.value) return
  const { data } = await api.get(`/projects/${projectId.value}/custom-task-options`)
  options.value = data
  if (data.stages?.length && !data.stages.includes(form.stage)) form.stage = data.stages[0]
}

async function load() {
  if (!projectId.value) return
  const { data } = await api.get(`/projects/${projectId.value}/tasks`)
  rows.value = data
}

async function onProjectChange() {
  stageFilter.value = undefined
  await Promise.all([load(), loadOptions()])
}

function openCreate() {
  form.id = null
  form.task_id = ''
  form.title = ''
  form.required = false
  form.guides = []
  form.sensors = []
  if (options.value.stages?.length) form.stage = options.value.stages[0]
  open.value = true
}

function openEdit(record: any) {
  form.id = record.id
  form.stage = record.stage
  form.task_id = record.task_id
  form.title = record.title || ''
  form.required = !!record.required
  form.guides = [...(record.guides || [])]
  form.sensors = [...(record.sensors || [])]
  open.value = true
}

async function save() {
  if (!projectId.value) return
  if (!form.stage || !form.task_id.trim()) {
    message.warning('请填写 Stage 与 Task ID')
    return
  }
  saving.value = true
  try {
    if (form.id) {
      await api.put(`/projects/${projectId.value}/tasks/${form.id}`, {
        title: form.title.trim(),
        required: form.required,
        guides: form.guides,
        sensors: form.sensors,
      })
      message.success('已更新绑定')
    } else {
      const { data } = await api.post(`/projects/${projectId.value}/tasks`, {
        stage: form.stage,
        task_id: form.task_id.trim(),
        title: form.title.trim(),
        required: form.required,
        guides: form.guides,
        sensors: form.sensors,
      })
      const shell = data.shell || {}
      message.success(
        `已创建；生成壳：${(shell.created || []).join(', ') || '—'}；命令 /${data.slash_name || shell.slash_name}`,
      )
    }
    open.value = false
    await Promise.all([load(), loadOptions()])
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(id: number) {
  try {
    await api.delete(`/projects/${projectId.value}/tasks/${id}`)
    message.success('已删除')
    await Promise.all([load(), loadOptions()])
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '删除失败')
  }
}

onMounted(async () => {
  const { data } = await api.get('/projects')
  projects.value = data
  if (data[0]) {
    projectId.value = data[0].id
    await onProjectChange()
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
.hint {
  margin-top: 6px;
  color: #64748b;
  font-size: 12px;
}
.shell-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}
.muted {
  color: #94a3b8;
}
code {
  font-family: ui-monospace, monospace;
}
</style>
