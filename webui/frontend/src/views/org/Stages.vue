<template>
  <div>
    <div class="head">
      <h2>Stage & Task</h2>
      <div class="filters">
        <a-select v-model:value="profileKey" style="width: 160px" @change="load">
          <a-select-option value="*">所有</a-select-option>
          <a-select-option v-for="p in profiles" :key="p.key" :value="p.key">{{ p.key }}</a-select-option>
        </a-select>
        <a-select v-model:value="stage" style="width: 120px; margin-left: 8px" allow-clear placeholder="Stage" @change="load">
          <a-select-option v-for="s in stages" :key="s" :value="s">{{ s }}</a-select-option>
        </a-select>
        <a-button type="primary" style="margin-left: 8px" @click="openCreate">+ 新建 Task</a-button>
      </div>
    </div>
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 12px"
      message="任务直接绑定 Guide / Sensor。人工审查：把 check_type=human 的 Sensor（如 prd-approved）绑到目标 Task。"
    />
    <a-table :dataSource="rows" :columns="columns" row-key="id" :pagination="{ pageSize: 12 }">
      <template #bodyCell="{ column, record, text }">
        <template v-if="column.key === 'required'">
          <CheckCircleFilled v-if="record.required" class="req-yes" title="必须" />
          <MinusCircleOutlined v-else class="req-no" title="非必须" />
        </template>
        <template v-else-if="column.key === 'profiles'">
          <a-space wrap :size="[4, 4]">
            <a-tag v-for="p in record.profiles || []" :key="p">{{ p }}</a-tag>
            <span v-if="!(record.profiles || []).length" class="muted">—</span>
          </a-space>
        </template>
        <template v-else-if="column.key === 'guides'">
          <a-tag v-for="g in record.guides" :key="g">{{ g }}</a-tag>
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
        <template v-else-if="column.key === 'action'">
          <a-button size="small" @click="openEdit(record)">编辑</a-button>
          <a-popconfirm title="确认删除？" @confirm="remove(record.id)">
            <a-button danger size="small" style="margin-left: 6px">删除</a-button>
          </a-popconfirm>
        </template>
        <template v-else>{{ text }}</template>
      </template>
    </a-table>

    <a-modal
      v-model:open="open"
      :title="form.id ? '编辑 Task' : '新建 Task'"
      @ok="save"
      width="720px"
    >
      <a-form layout="vertical">
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="Profile">
              <a-input v-model:value="form.profile_key" :disabled="!!form.id" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Stage">
              <a-select
                v-model:value="form.stage"
                :options="stages.map((s) => ({ value: s, label: s }))"
                :disabled="!!form.id"
              />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="Task ID">
          <a-input v-model:value="form.task_id" :disabled="!!form.id" />
        </a-form-item>
        <a-form-item label="标题(中)"><a-input v-model:value="form.title_zh" /></a-form-item>
        <a-form-item label="Guide 资产">
          <a-select
            v-model:value="form.guides"
            mode="multiple"
            style="width: 100%"
            :options="guideOpts"
            placeholder="选择 Guide（可多选）"
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
            placeholder="直接绑定 Sensor；人工审查选 human 类型"
            option-filter-prop="label"
            show-search
          />
        </a-form-item>
        <a-form-item label="必须"><a-switch v-model:checked="form.required" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { CheckCircleFilled, MinusCircleOutlined } from '@ant-design/icons-vue'
import { api } from '../../api'

const stages = ['req', 'arch', 'dev', 'test']
const profiles = ref<any[]>([])
const rows = ref<any[]>([])
const guides = ref<any[]>([])
const sensors = ref<any[]>([])
const profileKey = ref('*')
const stage = ref<string | undefined>()
const open = ref(false)
const form = reactive({
  id: null as number | null,
  profile_key: '*',
  stage: 'dev',
  task_id: '',
  title_zh: '',
  title_en: '',
  required: true,
  guides: [] as string[],
  sensors: [] as string[],
  enabled: true,
})

const guideOpts = computed(() =>
  guides.value.map((g) => ({ value: g.asset_id, label: `${g.asset_id} (${g.kind})` })),
)
const sensorOpts = computed(() =>
  sensors.value.map((s) => ({
    value: s.asset_id,
    label: `${s.asset_id} · ${s.check_type || 'rules'}`,
  })),
)

const humanSensorIds = computed(() => {
  const ids = new Set<string>()
  for (const s of sensors.value) {
    if (s.check_type === 'human' || s.check_type === 'manual') ids.add(s.asset_id)
  }
  return ids
})

function isHumanSensor(assetId: string) {
  return humanSensorIds.value.has(assetId) || /approv|human|manual/i.test(assetId)
}

const columns = [
  { title: 'Stage', dataIndex: 'stage', width: 80 },
  { title: 'Task', dataIndex: 'task_id' },
  { title: '标题', dataIndex: 'title_zh' },
  { title: 'Profiles', key: 'profiles', width: 220 },
  { title: '必须', key: 'required', dataIndex: 'required', width: 72, align: 'center' },
  { title: 'Guides', key: 'guides' },
  { title: 'Sensors', key: 'sensors' },
  { title: '操作', key: 'action', width: 150 },
]

async function loadAssets() {
  const [g, s] = await Promise.all([api.get('/org/guides'), api.get('/org/sensors')])
  guides.value = g.data
  sensors.value = s.data
}

async function load() {
  const params: any = { profile_key: profileKey.value }
  if (stage.value) params.stage = stage.value
  const { data } = await api.get('/org/tasks', { params })
  rows.value = data
}

function resetForm() {
  Object.assign(form, {
    id: null,
    profile_key: profileKey.value || '*',
    stage: stage.value || 'dev',
    task_id: '',
    title_zh: '',
    title_en: '',
    required: true,
    guides: [],
    sensors: [],
    enabled: true,
  })
}

function openCreate() {
  resetForm()
  open.value = true
}

function openEdit(record: any) {
  Object.assign(form, {
    id: record.id,
    profile_key: record.profile_key,
    stage: record.stage,
    task_id: record.task_id,
    title_zh: record.title_zh || '',
    title_en: record.title_en || '',
    required: !!record.required,
    guides: [...(record.guides || [])],
    sensors: [...(record.sensors || [])],
    enabled: record.enabled !== false,
  })
  open.value = true
}

async function save() {
  if (!form.task_id.trim()) {
    message.warning('请填写 Task ID')
    return
  }
  const payload = {
    profile_key: form.profile_key,
    stage: form.stage,
    task_id: form.task_id.trim(),
    title_zh: form.title_zh,
    title_en: form.title_en,
    required: form.required,
    guides: form.guides,
    sensors: form.sensors,
    enabled: form.enabled,
  }
  if (form.id) await api.put(`/org/tasks/${form.id}`, payload)
  else await api.post('/org/tasks', payload)
  message.success('已保存')
  open.value = false
  resetForm()
  await load()
}

async function remove(id: number) {
  await api.delete(`/org/tasks/${id}`)
  await load()
}

onMounted(async () => {
  const { data } = await api.get('/org/profiles')
  profiles.value = data
  await Promise.all([loadAssets(), load()])
})
</script>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.filters {
  display: flex;
  align-items: center;
}
.req-yes {
  color: #1677ff;
  font-size: 16px;
}
.req-no {
  color: #bfbfbf;
  font-size: 16px;
}
.muted {
  color: #94a3b8;
  font-size: 12px;
}
</style>
