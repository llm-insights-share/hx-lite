<template>
  <div>
    <div class="head">
      <h2>GitHub 同步</h2>
    </div>
    <a-space wrap style="margin-bottom: 12px">
      <a-select
        v-model:value="filterProjectId"
        allow-clear
        placeholder="筛选项目"
        style="width: 240px"
        :options="projectOpts"
        show-search
        option-filter-prop="label"
      />
    </a-space>
    <a-table :dataSource="filteredRows" :columns="columns" row-key="project_id">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'token'">
          <a-tag :color="record.github_token_configured ? 'success' : 'default'">
            {{ record.github_token_configured ? '已配置' : '未配置' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'last_sync'">
          {{ formatTime(record.last_sync) }}
        </template>
        <template v-else-if="column.key === 'action'">
          <a-button
            size="small"
            type="primary"
            :disabled="!record.github_repo"
            :loading="syncingId === record.project_id"
            @click="sync(record.project_id)"
          >
            同步
          </a-button>
          <a-button size="small" style="margin-left: 6px" @click="openLogs(record)">日志</a-button>
        </template>
      </template>
    </a-table>

    <a-modal
      v-model:open="logOpen"
      :title="logTitle"
      width="720px"
      :footer="null"
      destroy-on-close
    >
      <a-spin :spinning="logLoading">
        <a-empty v-if="!logLoading && !logJobs.length" description="暂无同步日志" />
        <a-table
          v-else
          :dataSource="logJobs"
          :columns="logCols"
          row-key="id"
          size="small"
          :pagination="{ pageSize: 8 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'created_at'">
              {{ formatTime(record.created_at) }}
            </template>
            <template v-else-if="column.key === 'status'">
              <a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag>
            </template>
            <template v-else-if="column.key === 'commit_sha'">
              <span class="mono">{{ record.commit_sha ? String(record.commit_sha).slice(0, 7) : '—' }}</span>
            </template>
            <template v-else-if="column.key === 'message'">
              <div class="msg">{{ record.message || '—' }}</div>
            </template>
          </template>
        </a-table>
      </a-spin>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { api } from '../../api'
import { formatLocalDateTime } from '../../utils/formatTime'

const rows = ref<any[]>([])
const filterProjectId = ref<number | undefined>(undefined)
const syncingId = ref<number | null>(null)
const logOpen = ref(false)
const logLoading = ref(false)
const logJobs = ref<any[]>([])
const logTitle = ref('同步日志')

const projectOpts = computed(() =>
  rows.value.map((r) => ({ value: r.project_id, label: r.project_name })),
)
const filteredRows = computed(() => {
  if (filterProjectId.value == null) return rows.value
  return rows.value.filter((r) => r.project_id === filterProjectId.value)
})

const columns = [
  { title: '项目', dataIndex: 'project_name' },
  { title: '仓库', dataIndex: 'github_repo' },
  { title: '项目 Token', key: 'token', width: 110 },
  { title: '上次同步', dataIndex: 'last_sync', key: 'last_sync', width: 170 },
  { title: '状态', dataIndex: 'last_status', width: 100 },
  { title: '产物数', dataIndex: 'artifact_count', width: 80 },
  { title: '操作', key: 'action', width: 160 },
]

const logCols = [
  { title: '时间', key: 'created_at', width: 160 },
  { title: '状态', key: 'status', width: 90 },
  { title: '分支', dataIndex: 'branch', width: 100 },
  { title: 'SHA', key: 'commit_sha', width: 90 },
  { title: '消息', key: 'message' },
]

function formatTime(v: string | null | undefined): string {
  return formatLocalDateTime(v)
}

function statusColor(status: string) {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'pending') return 'processing'
  return 'default'
}

async function load() {
  const { data } = await api.get('/github/sync-overview')
  rows.value = data
}

async function sync(id: number) {
  syncingId.value = id
  try {
    const { data } = await api.post(`/projects/${id}/github/sync`)
    message[data.ok ? 'success' : 'error'](data.message)
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '同步失败')
  } finally {
    syncingId.value = null
  }
  await load()
}

async function openLogs(record: any) {
  logTitle.value = `同步日志 · ${record.project_name}`
  logOpen.value = true
  logLoading.value = true
  logJobs.value = []
  try {
    const { data } = await api.get(`/projects/${record.project_id}/github/jobs`)
    logJobs.value = data || []
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '加载日志失败')
  } finally {
    logLoading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.mono {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
.msg {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  max-height: 72px;
  overflow: auto;
}
</style>
