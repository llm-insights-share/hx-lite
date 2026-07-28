<template>
  <div>
    <div class="head">
      <h2>审批工单</h2>
      <a-button type="primary" @click="open = true">+ 新建工单</a-button>
    </div>
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 12px"
      message="人工检查：为 stage/task 创建 human-check 工单并提交；批准后 nhx sensor / hooks 中的人工 Sensor 才会通过。"
    />
    <a-space style="margin-bottom: 12px">
      <a-select
        v-model:value="status"
        allow-clear
        placeholder="状态"
        style="width: 140px"
        :options="statusOpts"
        @change="load"
      />
    </a-space>
    <a-table :dataSource="rows" :columns="columns" row-key="id">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'scope'">
          <span v-if="record.stage || record.task">{{ record.stage || '—' }} / {{ record.task || '—' }}</span>
          <span v-else class="muted">—</span>
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space>
            <a-button v-if="record.status === 'draft'" size="small" @click="submit(record.id)">提交</a-button>
            <a-button v-if="record.status === 'submitted'" size="small" type="primary" @click="decide(record.id, true)">
              批准
            </a-button>
            <a-button v-if="record.status === 'submitted'" size="small" danger @click="decide(record.id, false)">
              驳回
            </a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="open" title="新建工单" @ok="create" width="640px">
      <a-form layout="vertical">
        <a-form-item label="项目">
          <a-select v-model:value="form.project_id" :options="projectOpts" style="width: 100%" />
        </a-form-item>
        <a-form-item label="标题"><a-input v-model:value="form.title" /></a-form-item>
        <a-form-item label="类型">
          <a-select
            v-model:value="form.ticket_type"
            :options="
              ['req-review', 'arch-approve', 'artifact-release', 'human-check', 'other'].map((v) => ({
                value: v,
                label: v,
              }))
            "
          />
        </a-form-item>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="Stage">
              <a-input v-model:value="form.stage" placeholder="如 req" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Task">
              <a-input v-model:value="form.task" placeholder="如 prd-writing" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="关联产物名（可选）">
          <a-input v-model:value="form.artifact_name" />
        </a-form-item>
        <a-form-item label="内容"><a-textarea v-model:value="form.body" :rows="6" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { api } from '../../api'

const rows = ref<any[]>([])
const projects = ref<any[]>([])
const open = ref(false)
const status = ref<string | undefined>()
const form = reactive({
  project_id: undefined as number | undefined,
  title: '',
  ticket_type: 'human-check',
  body: '',
  assignee_role: 'approver',
  stage: '',
  task: '',
  artifact_name: '',
})
const projectOpts = computed(() => projects.value.map((p) => ({ value: p.id, label: p.name })))
const statusOpts = ['draft', 'submitted', 'approved', 'rejected'].map((v) => ({ value: v, label: v }))
const columns = [
  { title: '工单号', dataIndex: 'ticket_no', width: 130 },
  { title: '标题', dataIndex: 'title' },
  { title: '项目', dataIndex: 'project_name', width: 120 },
  { title: 'Stage/Task', key: 'scope', width: 180 },
  { title: '类型', dataIndex: 'ticket_type', width: 130 },
  { title: '提交人', dataIndex: 'submitter', width: 90 },
  { title: '状态', key: 'status', width: 100 },
  { title: '操作', key: 'action', width: 200 },
]

function statusColor(s: string) {
  return ({ draft: 'default', submitted: 'processing', approved: 'success', rejected: 'error' } as any)[s] || 'default'
}

async function load() {
  const { data } = await api.get('/tickets', { params: status.value ? { status: status.value } : {} })
  rows.value = data
}

async function create() {
  if (!form.project_id || !form.title) {
    message.warning('请填写项目与标题')
    return
  }
  if (form.ticket_type === 'human-check' && (!form.stage.trim() || !form.task.trim())) {
    message.warning('human-check 工单必须填写 Stage 与 Task')
    return
  }
  await api.post('/tickets', form)
  message.success('已创建')
  open.value = false
  await load()
}

async function submit(id: number) {
  await api.post(`/tickets/${id}/submit`)
  message.success('已提交')
  await load()
}

async function decide(id: number, ok: boolean) {
  Modal.confirm({
    title: ok ? '批准该工单？' : '驳回该工单？',
    async onOk() {
      await api.post(`/tickets/${id}/${ok ? 'approve' : 'reject'}`, { note: '' })
      message.success(ok ? '已批准' : '已驳回')
      await load()
    },
  })
}

onMounted(async () => {
  const [t, p] = await Promise.all([api.get('/tickets'), api.get('/projects')])
  rows.value = t.data
  projects.value = p.data
  if (p.data[0]) form.project_id = p.data[0].id
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
}
</style>
