<template>
  <div>
    <h2>仪表盘</h2>
    <a-row :gutter="16" style="margin-top: 16px">
      <a-col :span="4" v-for="s in stats" :key="s.label" style="flex: 1; max-width: 20%">
        <a-card>
          <a-statistic :title="s.label" :value="s.value" />
        </a-card>
      </a-col>
    </a-row>
    <a-card title="组织设置摘要" style="margin-top: 16px">
      <p>组织：{{ data?.settings?.org_name }}</p>
      <p>GitHub：{{ data?.settings?.github_repo || '未配置' }}</p>
      <p>分支：{{ data?.settings?.github_branch || 'main' }}</p>
    </a-card>

    <a-card title="操作日志" style="margin-top: 16px" size="small">
      <a-table
        :dataSource="opLogs"
        :columns="logCols"
        row-key="id"
        size="small"
        :pagination="{ pageSize: 10, total: opLogTotal }"
        :loading="logsLoading"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'action'">
            {{ actionLabel(record.action) }}
          </template>
          <template v-else-if="column.key === 'time'">
            {{ formatTime(record.created_at) }}
          </template>
          <template v-else-if="column.key === 'detail'">
            <span class="detail-cell">
              <span class="detail-summary">{{ record.summary || '—' }}</span>
              <a-button type="link" size="small" @click="showLogDetail(record)">明细</a-button>
            </span>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-drawer v-model:open="logDetailOpen" title="操作明细" width="560">
      <pre class="preview">{{ logDetailBody }}</pre>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'

const data = ref<any>(null)
const logsLoading = ref(false)
const opLogs = ref<any[]>([])
const opLogTotal = ref(0)
const logDetailOpen = ref(false)
const logDetailBody = ref('')

const stats = computed(() => [
  { label: 'Profiles', value: data.value?.profiles ?? 0 },
  { label: 'Tasks', value: data.value?.tasks ?? 0 },
  { label: 'Guides', value: data.value?.guides ?? 0 },
  { label: 'Sensors', value: data.value?.sensors ?? 0 },
  { label: 'Commands', value: data.value?.commands ?? 0 },
])

const ACTION_LABELS: Record<string, string> = {
  bootstrap: '初始化组织',
  settings_update: '更新设置',
  profile_create: '新建 Profile',
  profile_update: '更新 Profile',
  profile_delete: '删除 Profile',
  task_create: '新建 Task',
  task_update: '更新 Task',
  task_delete: '删除 Task',
  guide_create: '新建 Guide',
  guide_update: '更新 Guide',
  guide_delete: '删除 Guide',
  guide_upload_create: '上传新建 Guide',
  guide_upload_update: '上传更新 Guide',
  guide_from_github: 'GitHub 安装 Guide',
  guide_from_github_batch: '批量 GitHub 安装',
  guide_status: '更新 Guide 状态',
  sensor_create: '新建 Sensor',
  sensor_update: '更新 Sensor',
  sensor_delete: '删除 Sensor',
  sensor_status: '更新 Sensor 状态',
  command_create: '新建 Command',
  command_update: '更新 Command',
  command_delete: '删除 Command',
  export_hub: '导出 Hub',
  github_push: 'GitHub 推送',
  asset_submission_decide: '审批资产提交',
  user_create: '创建用户',
  user_active: '启用/停用用户',
  user_roles: '更新用户角色',
  user_delete: '删除用户',
}

const logCols = [
  { title: '时间', key: 'time', width: 170 },
  { title: '操作人', dataIndex: 'actor_username', width: 120 },
  { title: '操作', key: 'action', width: 140 },
  { title: '详细信息', key: 'detail' },
]

function actionLabel(action: string) {
  return ACTION_LABELS[action] || action
}

function formatTime(v: string) {
  if (!v) return '—'
  try {
    return new Date(v).toLocaleString()
  } catch {
    return v
  }
}

function showLogDetail(record: any) {
  logDetailBody.value = JSON.stringify(
    {
      summary: record.summary || '',
      detail: record.detail || {},
    },
    null,
    2,
  )
  logDetailOpen.value = true
}

async function loadLogs() {
  logsLoading.value = true
  try {
    const { data } = await api.get('/org/operation-logs', {
      params: { limit: 100 },
    })
    opLogs.value = data.items || []
    opLogTotal.value = data.total || 0
  } catch {
    opLogs.value = []
    opLogTotal.value = 0
  } finally {
    logsLoading.value = false
  }
}

onMounted(async () => {
  const { data: d } = await api.get('/org/dashboard')
  data.value = d
  await loadLogs()
})
</script>

<style scoped>
.detail-cell {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
}
.detail-summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 360px;
}
.preview {
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  background: #0b1220;
  color: #e2e8f0;
  padding: 12px;
  border-radius: 6px;
  max-height: calc(100vh - 120px);
  overflow: auto;
}
</style>
