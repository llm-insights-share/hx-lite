<template>
  <div>
    <div class="head">
      <h2>项目 Shell 管理</h2>
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
          style="width: 240px"
          allow-clear
          placeholder="全部"
          :options="taskOpts"
          show-search
          option-filter-prop="label"
        />
      </a-form-item>
    </a-form>

    <a-table :dataSource="filteredRows" :columns="columns" row-key="task_row_id">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'task'">
          <div>
            <div>{{ record.task_id }}</div>
            <div class="muted">{{ record.title || '—' }}</div>
          </div>
        </template>
        <template v-else-if="column.key === 'source'">
          <a-tag color="blue">组织</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-button size="small" @click="openDetail(record)">详情</a-button>
        </template>
      </template>
    </a-table>

    <a-modal
      v-model:open="detailOpen"
      title="Shell 详情"
      :width="980"
      :ok-button-props="{ style: { display: 'none' } }"
      cancel-text="关闭"
    >
      <a-descriptions bordered size="small" :column="2" style="margin-bottom: 12px">
        <a-descriptions-item label="Stage">{{ current.stage }}</a-descriptions-item>
        <a-descriptions-item label="Task">{{ current.task_id }}</a-descriptions-item>
        <a-descriptions-item label="Slash">/{{ current.slash_name }}</a-descriptions-item>
        <a-descriptions-item label="来源">组织 HX</a-descriptions-item>
      </a-descriptions>

      <a-tabs v-model:activeKey="detailTab">
        <a-tab-pane key="command" tab="Command Shell">
          <div class="path-hint">安装后按目标 IDE 投影为斜杠命令（Cursor / Qoder / Claude 等）</div>
          <div class="md-preview" v-html="commandPreviewHtml" />
        </a-tab-pane>
        <a-tab-pane key="skill" tab="Skill Shell">
          <div class="path-hint">安装后按目标 IDE 投影为 Skill（Cursor / Trae / Qoder 等）</div>
          <div class="md-preview" v-html="skillPreviewHtml" />
        </a-tab-pane>
      </a-tabs>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { api } from '../../api'

const projects = ref<any[]>([])
const projectId = ref<number>()
const allRows = ref<any[]>([])
const filterStage = ref<string | undefined>()
const filterTask = ref<string | undefined>()
const detailOpen = ref(false)
const detailTab = ref<'command' | 'skill'>('command')
const current = reactive<any>({
  stage: '',
  task_id: '',
  title: '',
  slash_name: '',
  source: 'org',
  command_body: '',
  skill_body: '',
})

const projectOpts = computed(() => projects.value.map((p) => ({ value: p.id, label: p.name })))
const stageOpts = computed(() => {
  const set = new Set<string>()
  for (const r of allRows.value) {
    if (r.stage) set.add(r.stage)
  }
  return [...set].sort().map((s) => ({ value: s, label: s }))
})
const taskOpts = computed(() => {
  const map = new Map<string, string>()
  for (const r of allRows.value) {
    if (!r.task_id) continue
    if (filterStage.value && r.stage !== filterStage.value) continue
    const key = `${r.stage || ''}/${r.task_id}`
    map.set(key, r.title ? `${key} — ${r.title}` : key)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, label]) => ({ value, label }))
})
const filteredRows = computed(() => {
  return allRows.value.filter((r) => {
    if (filterStage.value && r.stage !== filterStage.value) return false
    if (filterTask.value) {
      const key = `${r.stage || ''}/${r.task_id || ''}`
      if (key !== filterTask.value) return false
    }
    return true
  })
})
const columns = [
  { title: 'Stage', dataIndex: 'stage', width: 120 },
  { title: 'Task', key: 'task', width: 260 },
  { title: 'Slash', dataIndex: 'slash_name' },
  { title: '来源', key: 'source', width: 100 },
  { title: '操作', key: 'action', width: 100 },
]

function renderMd(src: string): string {
  try {
    const raw = marked.parse(src || '', { async: false }) as string
    return DOMPurify.sanitize(raw)
  } catch {
    return ''
  }
}

const commandMarkdown = computed(() => {
  const body = (current.command_body || '').trim()
  return body || '_无 Command Shell 内容_'
})

const skillMarkdown = computed(() => {
  const body = (current.command_body || '').trim()
  const appendix = (current.skill_body || '').trim()
  const merged = `${body}\n\n${appendix}`.trim()
  const desc = `task shell ${current.stage}/${current.task_id}`
  return `---\nname: ${current.slash_name || 'shell'}\ndescription: ${desc}\n---\n\n${merged || '_无 Skill Shell 内容_'}`
})

const commandPreviewHtml = computed(() => renderMd(commandMarkdown.value))
const skillPreviewHtml = computed(() => renderMd(skillMarkdown.value))

async function load() {
  if (!projectId.value) return
  const { data } = await api.get(`/projects/${projectId.value}/shells`)
  allRows.value = data || []
}

function onProjectChange() {
  filterStage.value = undefined
  filterTask.value = undefined
  void load()
}

function onStageFilterChange() {
  filterTask.value = undefined
}

function openDetail(record: any) {
  Object.assign(current, {
    stage: record.stage || '',
    task_id: record.task_id || '',
    title: record.title || '',
    slash_name: record.slash_name || '',
    source: record.source || 'org',
    command_body: record.command_body || '',
    skill_body: record.skill_body || '',
  })
  detailTab.value = 'command'
  detailOpen.value = true
}

onMounted(async () => {
  const { data } = await api.get('/projects')
  projects.value = data || []
  if (projects.value[0]) {
    projectId.value = projects.value[0].id
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
.muted {
  color: #94a3b8;
  font-size: 12px;
}
.path-hint {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  margin-bottom: 8px;
}
.md-preview {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 14px;
  overflow: auto;
  max-height: 520px;
  background: #fafafa;
  font-size: 13px;
  line-height: 1.55;
}
.md-preview :deep(pre) {
  background: #0f172a;
  color: #e2e8f0;
  padding: 10px;
  border-radius: 6px;
  overflow: auto;
}
.md-preview :deep(code) {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
</style>
