<template>
  <div v-if="project">
    <div class="head">
      <h2>{{ project.name }}</h2>
      <a-space>
        <a-button type="primary" :loading="initLoading" @click="initConfig">从组织 HX 初始化配置</a-button>
        <a-tooltip v-if="!initialized" title="请先初始化">
          <a-button disabled>同步</a-button>
        </a-tooltip>
        <a-button v-else :loading="syncLoading" @click="syncConfig">同步</a-button>
        <a-button @click="$router.push('/project/list')">返回列表</a-button>
      </a-space>
    </div>
    <a-descriptions bordered size="small" :column="2">
      <a-descriptions-item label="Slug">{{ project.slug }}</a-descriptions-item>
      <a-descriptions-item label="Profile">{{ project.profile_key }}</a-descriptions-item>
      <a-descriptions-item label="当前阶段">{{ project.current_stage }}</a-descriptions-item>
      <a-descriptions-item label="GitHub">{{ project.github_repo || '—' }}</a-descriptions-item>
    </a-descriptions>

    <a-card title="成员管理" style="margin-top: 16px" size="small">
      <a-space style="margin-bottom: 12px">
        <a-select
          v-model:value="memberForm.user_id"
          style="width: 220px"
          :options="userOpts"
          placeholder="选择用户"
        />
        <a-select v-model:value="memberForm.role" style="width: 160px" :options="roleOpts" />
        <a-button type="primary" @click="addMember">添加成员</a-button>
      </a-space>
      <a-table :dataSource="project.members" :columns="mCols" row-key="id" size="small" :pagination="false">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'action'">
            <a-popconfirm title="移除？" @confirm="removeMember(record.id)">
              <a-button danger size="small">移除</a-button>
            </a-popconfirm>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-card title="项目 HX 配置（来自组织 Profile）" style="margin-top: 16px" size="small">
      <template #extra>
        <a-space>
          <a-tag>stages={{ hx?.counts?.stages ?? 0 }}</a-tag>
          <a-tag>tasks={{ hx?.counts?.tasks ?? 0 }}</a-tag>
          <a-tag>guides={{ hx?.counts?.guides ?? 0 }}</a-tag>
          <a-tag>sensors={{ hx?.counts?.sensors ?? 0 }}</a-tag>
        </a-space>
      </template>

      <a-empty v-if="!hx?.stages?.length" description="尚未初始化。请点击「从组织 HX 初始化配置」。" />

      <a-collapse v-else v-model:activeKey="activeStages">
        <a-collapse-panel v-for="stage in hx.stages" :key="stage.id" :header="`Stage: ${stage.id}（${stage.tasks.length} tasks）`">
          <div v-for="task in stage.tasks" :key="task.id" class="task-block">
            <div class="task-title">
              <strong>{{ task.id }}</strong>
              <span class="muted">{{ task.title }}</span>
              <a-tag v-if="task.required" color="blue">required</a-tag>
              <a-tag v-if="task.custom" color="purple">custom</a-tag>
            </div>
            <a-row :gutter="12">
              <a-col :span="12">
                <div class="sub-label">Guides</div>
                <a-table
                  :dataSource="task.guides"
                  :columns="guideCols"
                  row-key="asset_id"
                  size="small"
                  :pagination="false"
                >
                  <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'content'">
                      <a-button type="link" size="small" @click="preview(record)">查看</a-button>
                    </template>
                  </template>
                </a-table>
              </a-col>
              <a-col :span="12">
                <div class="sub-label">Sensors</div>
                <a-table
                  :dataSource="task.sensors"
                  :columns="sensorCols"
                  row-key="asset_id"
                  size="small"
                  :pagination="false"
                >
                  <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'content'">
                      <a-button type="link" size="small" @click="preview(record)">查看</a-button>
                    </template>
                  </template>
                </a-table>
              </a-col>
            </a-row>
          </div>
        </a-collapse-panel>
      </a-collapse>
    </a-card>

    <a-card
      v-if="hx?.guides?.length || hx?.sensors?.length"
      title="组织资产库（全部 Guide / Sensor）"
      style="margin-top: 16px"
      size="small"
    >
      <a-tabs>
        <a-tab-pane key="guides" :tab="`Guides (${hx?.guides?.length ?? 0})`">
          <a-table
            :dataSource="hx?.guides || []"
            :columns="assetGuideCols"
            row-key="asset_id"
            size="small"
            :pagination="{ pageSize: 10 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'bound'">
                <a-tag :color="record.bound ? 'blue' : 'default'">{{ record.bound ? '任务绑定' : '库资产' }}</a-tag>
              </template>
              <template v-else-if="column.key === 'content'">
                <a-button type="link" size="small" @click="preview(record)">查看</a-button>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
        <a-tab-pane key="sensors" :tab="`Sensors (${hx?.sensors?.length ?? 0})`">
          <a-table
            :dataSource="hx?.sensors || []"
            :columns="assetSensorCols"
            row-key="asset_id"
            size="small"
            :pagination="{ pageSize: 10 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'bound'">
                <a-tag :color="record.bound ? 'blue' : 'default'">{{ record.bound ? '任务绑定' : '库资产' }}</a-tag>
              </template>
              <template v-else-if="column.key === 'content'">
                <a-button type="link" size="small" @click="preview(record)">查看</a-button>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
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
            <a-button type="link" size="small" @click="showLogDetail(record)">明细</a-button>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-drawer v-model:open="drawerOpen" :title="drawerTitle" width="640">
      <pre class="preview">{{ drawerBody }}</pre>
    </a-drawer>
    <a-drawer v-model:open="logDetailOpen" title="操作明细" width="560">
      <pre class="preview">{{ logDetailBody }}</pre>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { api } from '../../api'

const route = useRoute()
const project = ref<any>(null)
const users = ref<any[]>([])
const initLoading = ref(false)
const syncLoading = ref(false)
const logsLoading = ref(false)
const opLogs = ref<any[]>([])
const opLogTotal = ref(0)
const activeStages = ref<string[]>([])
const drawerOpen = ref(false)
const drawerTitle = ref('')
const drawerBody = ref('')
const logDetailOpen = ref(false)
const logDetailBody = ref('')
const memberForm = reactive({ user_id: undefined as number | undefined, role: 'member' })
const roleOpts = ['project_owner', 'approver', 'member'].map((v) => ({ value: v, label: v }))
const userOpts = computed(() =>
  users.value.map((u) => ({ value: u.id, label: `${u.display_name || u.username} (${u.username})` })),
)
const hx = computed(() => project.value?.hx_config || null)
const initialized = computed(() => (hx.value?.counts?.tasks ?? 0) > 0)

const ACTION_LABELS: Record<string, string> = {
  project_create: '创建项目',
  project_update: '更新项目',
  init_config: '初始化',
  sync_config: '同步',
  member_add: '添加成员',
  member_update: '更新成员',
  member_remove: '移除成员',
  guide_create: '新建 Guide',
  guide_update: '更新 Guide',
  guide_delete: '删除 Guide',
  sensor_create: '新建 Sensor',
  sensor_update: '更新 Sensor',
  sensor_delete: '删除 Sensor',
  task_create: '新建 Task',
  task_update: '更新 Task',
  task_delete: '删除 Task',
  github_sync: 'GitHub 同步',
}

const mCols = [
  { title: '用户', dataIndex: 'username' },
  { title: '显示名', dataIndex: 'display_name' },
  { title: '角色', dataIndex: 'role' },
  { title: '操作', key: 'action', width: 90 },
]
const guideCols = [
  { title: 'ID', dataIndex: 'asset_id' },
  { title: 'Kind', dataIndex: 'kind', width: 120 },
  { title: '内容', key: 'content', width: 70 },
]
const sensorCols = [
  { title: 'ID', dataIndex: 'asset_id' },
  { title: 'Check', dataIndex: 'check_type', width: 80 },
  { title: '内容', key: 'content', width: 70 },
]
const assetGuideCols = [
  { title: 'ID', dataIndex: 'asset_id' },
  { title: 'Kind', dataIndex: 'kind', width: 140 },
  { title: 'Stage', dataIndex: 'stage', width: 90 },
  { title: 'Task', dataIndex: 'task', width: 160 },
  { title: '范围', key: 'bound', width: 100 },
  { title: '内容', key: 'content', width: 70 },
]
const assetSensorCols = [
  { title: 'ID', dataIndex: 'asset_id' },
  { title: 'Check', dataIndex: 'check_type', width: 90 },
  { title: 'Kind', dataIndex: 'kind', width: 140 },
  { title: 'Stage', dataIndex: 'stage', width: 90 },
  { title: 'Task', dataIndex: 'task', width: 160 },
  { title: '范围', key: 'bound', width: 100 },
  { title: '内容', key: 'content', width: 70 },
]
const logCols = [
  { title: '时间', key: 'time', width: 170 },
  { title: '操作人', dataIndex: 'actor_username', width: 120 },
  { title: '动作', key: 'action', width: 110 },
  { title: '摘要', dataIndex: 'summary' },
  { title: '明细', key: 'detail', width: 70 },
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

async function loadLogs() {
  logsLoading.value = true
  try {
    const { data } = await api.get(`/projects/${route.params.id}/operation-logs`, {
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

async function load() {
  const id = route.params.id
  const [p, u] = await Promise.all([api.get(`/projects/${id}`), api.get('/users')])
  project.value = p.data
  users.value = u.data
  activeStages.value = (p.data.hx_config?.stages || []).map((s: any) => s.id)
  await loadLogs()
}

async function initConfig() {
  initLoading.value = true
  try {
    const { data } = await api.post(`/projects/${route.params.id}/init-config`)
    const c = data.config?.counts || {}
    message.success(
      `已从组织拉取：${c.stages ?? 0} stage / ${c.tasks ?? 0} task / ${c.guides ?? 0} guide / ${c.sensors ?? 0} sensor`,
    )
    await load()
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '初始化失败')
  } finally {
    initLoading.value = false
  }
}

async function syncConfig() {
  syncLoading.value = true
  try {
    const { data } = await api.post(`/projects/${route.params.id}/sync-config`)
    if (!data.change_count) {
      message.success('已与组织 HX 一致，无变更')
    } else {
      message.success(`同步完成：${data.summary || '有变更'}`)
    }
    await load()
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '同步失败')
  } finally {
    syncLoading.value = false
  }
}

function preview(record: any) {
  drawerTitle.value = `${record.asset_id} (${record.kind || record.check_type || ''})`
  drawerBody.value = record.content || '（无内容）'
  drawerOpen.value = true
}

function showLogDetail(record: any) {
  logDetailBody.value = JSON.stringify(record.detail || {}, null, 2)
  logDetailOpen.value = true
}

async function addMember() {
  if (!memberForm.user_id) return
  await api.post(`/projects/${route.params.id}/members`, memberForm)
  message.success('已添加')
  await load()
}

async function removeMember(id: number) {
  await api.delete(`/projects/${route.params.id}/members/${id}`)
  await load()
}

onMounted(load)
</script>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.task-block {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}
.task-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.muted {
  color: #64748b;
  font-size: 12px;
}
.sub-label {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 6px;
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
