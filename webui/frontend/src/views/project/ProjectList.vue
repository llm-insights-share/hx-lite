<template>
  <div>
    <div class="head">
      <h2>项目列表</h2>
      <a-button type="primary" @click="open = true">+ 新建项目</a-button>
    </div>
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 12px"
      message="初始化配置会从组织 HX 全量拉取 Stage / Task 与全部 Guide、Sensor。「同步」仅增量对齐组织有变更的项（并移除组织已删除的组织资产）；重新初始化会全量重建，项目私有 Guide 会保留。"
    />
    <a-table :dataSource="rows" :columns="columns" row-key="id">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'id'">
          <span class="mono-id">{{ record.id }}</span>
        </template>
        <template v-else-if="column.key === 'hx'">
          <a-tag :color="record.initialized ? 'success' : 'default'">
            {{ record.initialized ? '已初始化' : '未初始化' }}
          </a-tag>
          <span v-if="record.initialized" class="muted">
            S{{ record.hx_counts?.stages ?? 0 }} /
            T{{ record.hx_counts?.tasks ?? 0 }} /
            G{{ record.hx_counts?.guides ?? 0 }} /
            Se{{ record.hx_counts?.sensors ?? 0 }}
          </span>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-button size="small" type="link" @click="$router.push(`/project/${record.id}`)">详情</a-button>
          <a-button size="small" @click="initConfig(record.id)">
            {{ record.initialized ? '重新初始化' : '初始化配置' }}
          </a-button>
          <a-tooltip v-if="!record.initialized" title="请先初始化">
            <a-button size="small" disabled style="margin-left: 6px">同步</a-button>
          </a-tooltip>
          <a-button
            v-else
            size="small"
            style="margin-left: 6px"
            :loading="syncingId === record.id"
            @click="syncConfig(record.id)"
          >
            同步
          </a-button>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="open" title="新建项目" @ok="create">
      <a-form layout="vertical">
        <a-form-item label="名称"><a-input v-model:value="form.name" /></a-form-item>
        <a-form-item label="Slug"><a-input v-model:value="form.slug" placeholder="可空自动生成" /></a-form-item>
        <a-form-item label="Profile">
          <a-select v-model:value="form.profile_key" :options="profileOpts" style="width: 100%" />
        </a-form-item>
        <a-form-item label="GitHub 仓库"><a-input v-model:value="form.github_repo" /></a-form-item>
        <a-form-item label="描述"><a-textarea v-model:value="form.description" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { api } from '../../api'

const rows = ref<any[]>([])
const open = ref(false)
const syncingId = ref<number | null>(null)
const profileOpts = ref<{ value: string; label: string }[]>(
  ['lite', 'standard', 'strict', 'enterprise'].map((v) => ({ value: v, label: v })),
)
const form = reactive({
  name: '',
  slug: '',
  profile_key: 'standard',
  github_repo: '',
  github_branch: 'main',
  description: '',
})
const columns = [
  { title: '项目 ID', dataIndex: 'id', key: 'id', width: 90 },
  { title: '名称', dataIndex: 'name' },
  { title: 'Profile', dataIndex: 'profile_key', width: 110 },
  { title: '当前阶段', dataIndex: 'current_stage', width: 100 },
  { title: 'HX 配置', key: 'hx', width: 220 },
  { title: '成员', dataIndex: 'member_count', width: 70 },
  { title: '产物', dataIndex: 'artifact_count', width: 70 },
  { title: 'GitHub', dataIndex: 'github_repo' },
  { title: '操作', key: 'action', width: 280 },
]

async function load() {
  const { data } = await api.get('/projects')
  rows.value = data
}

async function loadProfiles() {
  try {
    const { data } = await api.get('/org/profiles')
    if (data?.length) {
      profileOpts.value = data.map((p: any) => ({
        value: p.key,
        label: `${p.key}${p.title ? ` — ${p.title}` : ''}`,
      }))
    }
  } catch {
    /* org may be empty */
  }
}

async function create() {
  await api.post('/projects', form)
  message.success('已创建')
  open.value = false
  await load()
}

async function initConfig(id: number) {
  try {
    const { data } = await api.post(`/projects/${id}/init-config`)
    const c = data.config?.counts || data.hx_config?.counts || {}
    message.success(
      `已从组织 HX 初始化：${c.stages ?? 0} stage / ${c.tasks ?? 0} task / ${c.guides ?? 0} guide / ${c.sensors ?? 0} sensor`,
    )
    await load()
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '初始化失败')
  }
}

async function syncConfig(id: number) {
  syncingId.value = id
  try {
    const { data } = await api.post(`/projects/${id}/sync-config`)
    if (!data.change_count) {
      message.success('已与组织 HX 一致，无变更')
    } else {
      message.success(`同步完成：${data.summary || '有变更'}`)
    }
    await load()
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '同步失败')
  } finally {
    syncingId.value = null
  }
}

onMounted(async () => {
  await Promise.all([load(), loadProfiles()])
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
  margin-left: 8px;
  color: #64748b;
  font-size: 12px;
  font-family: ui-monospace, monospace;
}
.mono-id {
  font-family: ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}
</style>
