<template>
  <div>
    <div class="head">
      <h2>项目 Sensor 管理</h2>
      <a-button type="primary" @click="openCreate">+ 新建 Sensor</a-button>
    </div>
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 12px"
      message="触发通道可多选（hooks / nhx CLI / command-skill 壳）。human 仅提醒「尚未批准」。配置说明点 ?"
    />
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
        <template v-else-if="column.key === 'check_type'">
          <a-tag :color="normalizeCheckType(record.check_type) === 'human' ? 'purple' : 'default'">
            {{ normalizeCheckType(record.check_type) }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'triggers'">
          <span class="triggers-cell">{{ formatTriggersShort(record.triggers) }}</span>
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
          <a-button size="small" @click="openEdit(record)">编辑</a-button>
          <a-popconfirm title="删除？" @confirm="remove(record.id)">
            <a-button danger size="small" style="margin-left: 6px">删除</a-button>
          </a-popconfirm>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="open" :title="form.id ? '编辑项目 Sensor' : '新建项目 Sensor'" @ok="save" width="720px">
      <a-alert
        v-if="normalizeCheckType(form.check_type) === 'human'"
        type="warning"
        show-icon
        style="margin-bottom: 12px"
        message="human：触发时仅提醒「尚未批准」，不做文件/脚本检查。"
      />
      <a-form layout="vertical">
        <a-form-item label="Asset ID">
          <a-input v-model:value="form.asset_id" :disabled="!!form.id" />
        </a-form-item>
        <a-form-item label="名称" required>
          <a-input v-model:value="form.name" :maxlength="20" show-count placeholder="不超过 20 字" />
        </a-form-item>
        <a-form-item label="Check Type">
          <a-select
            v-model:value="form.check_type"
            :options="CHECK_TYPE_OPTS"
            style="width: 100%"
            @change="onCheckTypeChange"
          />
        </a-form-item>
        <a-form-item>
          <template #label>
            <span class="content-label">
              触发通道
              <a-popover placement="topLeft" trigger="click" :overlayStyle="{ maxWidth: '400px' }">
                <template #content>
                  <div class="sensor-help">
                    <div class="sensor-help-title">{{ TRIGGER_CHANNELS_HELP.title }}</div>
                    <pre class="sensor-help-example" style="white-space: pre-wrap">{{ TRIGGER_CHANNELS_HELP.body }}</pre>
                  </div>
                </template>
                <a-button type="link" size="small" class="help-btn" @click.prevent>?</a-button>
              </a-popover>
            </span>
          </template>
          <a-select
            v-model:value="form.triggers"
            mode="multiple"
            :options="TRIGGER_CHANNEL_OPTS"
            style="width: 100%"
          />
        </a-form-item>
        <a-form-item v-if="form.triggers.includes('hook:afterFileEdit')" label="Scope（afterFileEdit glob，每行一个）">
          <a-textarea
            :value="form.scope.join('\n')"
            :rows="3"
            placeholder="docs/**"
            @update:value="(v: string) => (form.scope = v.split('\n').map((s) => s.trim()).filter(Boolean))"
          />
        </a-form-item>
        <a-form-item v-if="normalizeCheckType(form.check_type) === 'inline'" label="内置函数">
          <div class="inline-fns">
            <a-tag
              v-for="fn in INLINE_FUNCTIONS"
              :key="fn.label"
              color="blue"
              class="fn-tag"
              @click="insertInlineFn(fn.expr)"
            >
              {{ fn.label }}
            </a-tag>
          </div>
        </a-form-item>
        <a-form-item>
          <template #label>
            <span class="content-label">
              配置内容
              <a-popover placement="leftTop" trigger="click" :overlayStyle="{ maxWidth: '420px' }">
                <template #content>
                  <div class="sensor-help">
                    <div class="sensor-help-title">{{ helpFor(form.check_type).title }}</div>
                    <p>{{ helpFor(form.check_type).body }}</p>
                    <div class="sensor-help-sub">样例</div>
                    <pre class="sensor-help-example">{{ helpFor(form.check_type).example }}</pre>
                  </div>
                </template>
                <a-button type="link" size="small" class="help-btn" @click.prevent>?</a-button>
              </a-popover>
            </span>
          </template>
          <a-textarea
            v-model:value="form.content"
            :rows="10"
            placeholder="仅 check 专属字段（expr / rules_text / bash）；triggers/scope 在上方表单"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { api } from '../../api'
import {
  CHECK_TYPE_OPTS,
  DEFAULT_TRIGGERS,
  INLINE_FUNCTIONS,
  TRIGGER_CHANNEL_OPTS,
  TRIGGER_CHANNELS_HELP,
  formatTriggersShort,
  helpFor,
  insertExprIntoContent,
  isSensorTemplateContent,
  leanSensorContent,
  normalizeCheckType,
  normalizeScope,
  normalizeTriggers,
  templateFor,
} from '../../constants/sensorTemplates'

const projects = ref<any[]>([])
const projectId = ref<number>()
const allRows = ref<any[]>([])
const projectTasks = ref<any[]>([])
const filterStage = ref<string | undefined>()
const filterTask = ref<string | undefined>()
const open = ref(false)
const form = reactive({
  id: null as number | null,
  asset_id: '',
  name: '',
  kind: 'sensor.rule',
  check_type: 'rules',
  content: '',
  triggers: [...DEFAULT_TRIGGERS] as string[],
  scope: [] as string[],
})
const projectOpts = computed(() => projects.value.map((p) => ({ value: p.id, label: p.name })))

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
  { title: 'Kind', dataIndex: 'kind', width: 120 },
  { title: 'Stage', key: 'stage', width: 120 },
  { title: 'Task', key: 'task', width: 180 },
  { title: 'Check', key: 'check_type', dataIndex: 'check_type', width: 100 },
  { title: 'Triggers', key: 'triggers', width: 140 },
  { title: '操作', key: 'action', width: 150 },
]

async function load() {
  if (!projectId.value) return
  const [s, t] = await Promise.all([
    api.get(`/projects/${projectId.value}/sensors`),
    api.get(`/projects/${projectId.value}/tasks`),
  ])
  allRows.value = s.data
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
  Object.assign(form, {
    id: null,
    asset_id: '',
    name: '',
    kind: 'sensor.rule',
    check_type: 'rules',
    content: templateFor('rules'),
    triggers: [...DEFAULT_TRIGGERS],
    scope: [],
  })
  open.value = true
}

function openEdit(record: any) {
  const ct = normalizeCheckType(record.check_type)
  Object.assign(form, {
    id: record.id,
    asset_id: record.asset_id,
    name: record.name || (record.asset_id || '').slice(0, 20),
    kind: record.kind || 'sensor.rule',
    check_type: ct,
    content: leanSensorContent(record.content || templateFor(ct)),
    triggers: normalizeTriggers(record.triggers),
    scope: normalizeScope(record.scope),
  })
  open.value = true
}

function onCheckTypeChange(val: string) {
  const ct = normalizeCheckType(val)
  form.check_type = ct
  if (isSensorTemplateContent(form.content)) {
    form.content = templateFor(ct)
  }
  if (ct === 'human' && !form.triggers.includes('hook:beforeSubmit')) {
    form.triggers = normalizeTriggers(['hook:beforeSubmit', ...form.triggers])
  }
}

function insertInlineFn(expr: string) {
  form.check_type = 'inline'
  form.content = insertExprIntoContent(form.content || templateFor('inline'), expr)
}

async function save() {
  if (!projectId.value) return
  if (!form.asset_id?.trim()) {
    message.warning('请填写 Asset ID')
    return Promise.reject()
  }
  const name = (form.name || '').trim() || form.asset_id.trim().slice(0, 20)
  if (name.length > 20) {
    message.warning('名称不能超过 20 个字')
    return Promise.reject()
  }
  const ct = normalizeCheckType(form.check_type)
  const payload = {
    asset_id: form.asset_id,
    name,
    kind: ct === 'human' ? 'sensor.human' : form.kind,
    stage: '',
    task: '',
    check_type: ct,
    content: leanSensorContent(form.content),
    triggers: normalizeTriggers(form.triggers),
    scope: normalizeScope(form.scope),
  }
  if (form.id) await api.put(`/projects/${projectId.value}/sensors/${form.id}`, payload)
  else await api.post(`/projects/${projectId.value}/sensors`, payload)
  message.success('已保存')
  open.value = false
  await load()
}

async function remove(id: number) {
  await api.delete(`/projects/${projectId.value}/sensors/${id}`)
  await load()
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
.inline-fns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.fn-tag {
  cursor: pointer;
}
.content-label {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.help-btn {
  padding: 0 4px;
  height: auto;
  line-height: 1;
  font-weight: 600;
  font-size: 14px;
}
.sensor-help-title {
  font-weight: 600;
  margin-bottom: 6px;
}
.sensor-help-sub {
  font-weight: 600;
  margin: 10px 0 4px;
  font-size: 12px;
}
.sensor-help-example {
  margin: 0;
  padding: 8px 10px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  max-height: 280px;
  overflow: auto;
}
.sensor-help p {
  margin: 0;
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
}
.triggers-cell {
  font-size: 12px;
  color: #64748b;
}
.muted {
  color: #94a3b8;
}
</style>
