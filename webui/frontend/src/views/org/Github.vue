<template>
  <div>
    <h2>GitHub 推送</h2>
    <a-card style="margin-top: 12px">
      <p>仓库：{{ settings?.github_repo || '未配置（请先到设置填写）' }}</p>
      <p>分支：{{ settings?.github_branch || 'main' }}</p>
      <a-space style="margin-top: 12px">
        <a-button @click="dryRun" :loading="loadingDry">预览 Diff</a-button>
        <a-button type="primary" @click="push" :loading="loadingPush">推送到 GitHub</a-button>
        <a-button @click="exportHub" :loading="loadingExport">仅导出 Hub 目录</a-button>
      </a-space>
      <a-alert v-if="messageText" :type="ok ? 'success' : 'error'" :message="messageText" style="margin-top: 16px" show-icon />
      <a-card v-if="exportMeta" title="导出摘要" size="small" style="margin-top: 16px">
        <p>路径：<code>{{ exportMeta.path }}</code></p>
        <p>时间：{{ exportMeta.exported_at }}</p>
        <a-space wrap>
          <a-tag>files={{ exportMeta.counts?.files ?? 0 }}</a-tag>
          <a-tag>profiles={{ exportMeta.counts?.profiles ?? 0 }}</a-tag>
          <a-tag>guides={{ exportMeta.counts?.guides ?? 0 }}</a-tag>
          <a-tag>sensors={{ exportMeta.counts?.sensors ?? 0 }}</a-tag>
          <a-tag>commands={{ exportMeta.counts?.commands ?? 0 }}</a-tag>
          <a-tag>catalog={{ exportMeta.counts?.catalog_entries ?? 0 }}</a-tag>
        </a-space>
        <div style="margin-top: 8px; color: #64748b; font-size: 12px">
          布局：{{ (exportMeta.layout || []).join(' · ') }}
        </div>
      </a-card>
      <a-card v-if="diff" title="Diff" size="small" style="margin-top: 16px">
        <DiffViewer :diff-text="diff" />
      </a-card>
      <a-table
        style="margin-top: 16px"
        :dataSource="jobs"
        :columns="cols"
        row-key="id"
        size="small"
        :pagination="{ pageSize: 5 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'created_at'">
            {{ formatExecTime(record.created_at) }}
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { api } from '../../api'
import DiffViewer from '../../components/DiffViewer.vue'

const settings = ref<any>(null)
const jobs = ref<any[]>([])
const diff = ref('')
const messageText = ref('')
const ok = ref(true)
const exportMeta = ref<any>(null)
const loadingDry = ref(false)
const loadingPush = ref(false)
const loadingExport = ref(false)

const cols = [
  { title: 'ID', dataIndex: 'id', width: 60 },
  { title: '执行时间', dataIndex: 'created_at', key: 'created_at', width: 140 },
  { title: 'Kind', dataIndex: 'kind' },
  { title: 'Status', dataIndex: 'status' },
  { title: 'SHA', dataIndex: 'commit_sha' },
  { title: 'Message', dataIndex: 'message' },
]

function formatExecTime(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}-${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function load() {
  const [s, j] = await Promise.all([api.get('/org/settings'), api.get('/org/github/jobs')])
  settings.value = s.data
  jobs.value = j.data
}

async function dryRun() {
  loadingDry.value = true
  try {
    const { data } = await api.post('/org/github/dry-run')
    ok.value = data.ok
    messageText.value = data.message
    diff.value = data.diff_text || ''
    exportMeta.value = data.export_meta || null
    await load()
  } finally {
    loadingDry.value = false
  }
}

async function push() {
  loadingPush.value = true
  try {
    const { data } = await api.post('/org/github/push')
    ok.value = data.ok
    messageText.value = data.message + (data.commit_sha ? ` (${data.commit_sha.slice(0, 7)})` : '')
    exportMeta.value = data.export_meta || null
    message[data.ok ? 'success' : 'error'](data.message)
    await load()
  } finally {
    loadingPush.value = false
  }
}

async function exportHub() {
  loadingExport.value = true
  try {
    const { data } = await api.post('/org/export-hub')
    exportMeta.value = data.export_meta || null
    ok.value = true
    messageText.value = `已导出到 ${data.path}`
    message.success(messageText.value)
  } finally {
    loadingExport.value = false
  }
}

onMounted(load)
</script>
