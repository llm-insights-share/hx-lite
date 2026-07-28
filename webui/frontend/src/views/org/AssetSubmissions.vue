<template>
  <div>
    <div class="head">
      <h2>入库申请</h2>
      <a-select
        v-model:value="statusFilter"
        allow-clear
        placeholder="状态筛选"
        style="width: 140px"
        :options="statusOpts"
        @change="load"
      />
    </div>
    <a-table
      :dataSource="rows"
      :columns="cols"
      row-key="id"
      :pagination="{ pageSize: 10 }"
      :customRow="(record: any) => ({ onClick: () => openDetail(record) })"
      style="cursor: pointer"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <a-tag :color="statusColor(record.status)">{{ statusLabel(record.status) }}</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-button size="small" @click.stop="openDetail(record)">处理</a-button>
        </template>
      </template>
    </a-table>

    <a-modal
      v-model:open="open"
      :title="`入库申请 ${detail?.submission_no || ''}`"
      width="820px"
      :footer="detail?.status === 'submitted' ? undefined : null"
      ok-text="确认审批"
      :confirmLoading="saving"
      @ok="decide"
    >
      <template v-if="detail">
        <a-descriptions bordered size="small" :column="1" style="margin-bottom: 12px">
          <a-descriptions-item label="项目">{{ detail.project_name }} (#{{ detail.project_id }})</a-descriptions-item>
          <a-descriptions-item label="提交人">{{ detail.submitter }}</a-descriptions-item>
          <a-descriptions-item label="理由">{{ detail.reason }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="statusColor(detail.status)">{{ statusLabel(detail.status) }}</a-tag>
          </a-descriptions-item>
        </a-descriptions>

        <div v-for="it in detail.items" :key="it.id" class="item-block">
          <div class="item-head">
            <a-tag color="blue">{{ it.asset_kind }}</a-tag>
            <code>{{ it.asset_id }}</code>
            <a-tag>{{ it.kind }}{{ it.check_type ? ` · ${it.check_type}` : '' }}</a-tag>
            <a-tag v-if="it.item_status !== 'pending'">{{ it.item_status }}{{ it.target_status ? `/${it.target_status}` : '' }}</a-tag>
          </div>
          <pre class="preview">{{ it.content || '（无内容）' }}</pre>
          <a-radio-group
            v-if="detail.status === 'submitted'"
            v-model:value="itemActions[it.id]"
            button-style="solid"
            size="small"
          >
            <a-radio-button value="accept_trial">入库（试用）</a-radio-button>
            <a-radio-button value="accept_enforced">入库（强制）</a-radio-button>
            <a-radio-button value="skip">跳过</a-radio-button>
          </a-radio-group>
        </div>

        <a-form v-if="detail.status === 'submitted'" layout="vertical" style="margin-top: 12px">
          <a-form-item label="审批结论">
            <a-radio-group v-model:value="decision">
              <a-radio value="approve">通过（按上方选项入库）</a-radio>
              <a-radio value="reject">整单驳回</a-radio>
            </a-radio-group>
          </a-form-item>
          <a-form-item label="审批备注">
            <a-textarea v-model:value="note" :rows="2" />
          </a-form-item>
        </a-form>
        <a-alert
          v-else-if="detail.decision_note"
          type="info"
          show-icon
          :message="`备注：${detail.decision_note}`"
        />
      </template>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { api } from '../../api'

const rows = ref<any[]>([])
const statusFilter = ref<string | undefined>('submitted')
const statusOpts = [
  { value: 'submitted', label: '待审' },
  { value: 'approved', label: '已通过' },
  { value: 'partial', label: '部分入库' },
  { value: 'rejected', label: '已驳回' },
]
const cols = [
  { title: '单号', dataIndex: 'submission_no', width: 110 },
  { title: '项目', dataIndex: 'project_name' },
  { title: '理由', dataIndex: 'reason', ellipsis: true },
  { title: '状态', key: 'status', width: 100 },
  { title: '提交人', dataIndex: 'submitter', width: 100 },
  { title: '时间', dataIndex: 'created_at', width: 180 },
  { title: '操作', key: 'action', width: 80 },
]

const open = ref(false)
const detail = ref<any>(null)
const decision = ref<'approve' | 'reject'>('approve')
const note = ref('')
const saving = ref(false)
const itemActions = reactive<Record<number, string>>({})

function statusLabel(s: string) {
  return ({ submitted: '待审', approved: '已通过', rejected: '已驳回', partial: '部分入库' } as any)[s] || s
}
function statusColor(s: string) {
  return ({ submitted: 'processing', approved: 'success', rejected: 'error', partial: 'warning' } as any)[s] || 'default'
}

async function load() {
  const params: any = {}
  if (statusFilter.value) params.status = statusFilter.value
  const { data } = await api.get('/org/asset-submissions', { params })
  rows.value = data
}

async function openDetail(record: any) {
  const { data } = await api.get(`/org/asset-submissions/${record.id}`)
  detail.value = data
  decision.value = 'approve'
  note.value = ''
  for (const it of data.items || []) {
    itemActions[it.id] = it.item_status === 'pending' ? 'accept_trial' : 'skip'
  }
  open.value = true
}

async function decide() {
  if (!detail.value) return
  saving.value = true
  try {
    const items = (detail.value.items || []).map((it: any) => {
      const act = itemActions[it.id] || 'skip'
      if (act === 'accept_trial') return { id: it.id, action: 'accept', target_status: 'trial' }
      if (act === 'accept_enforced') return { id: it.id, action: 'accept', target_status: 'enforced' }
      return { id: it.id, action: 'skip' }
    })
    await api.post(`/org/asset-submissions/${detail.value.id}/decide`, {
      decision: decision.value,
      note: note.value,
      items: decision.value === 'reject' ? [] : items,
    })
    message.success('已处理')
    open.value = false
    await load()
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '审批失败')
    return Promise.reject(e)
  } finally {
    saving.value = false
  }
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
.item-block {
  margin-bottom: 14px;
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}
.item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.preview {
  max-height: 160px;
  overflow: auto;
  margin: 0 0 8px;
  padding: 8px 10px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 6px;
  font-size: 11px;
  white-space: pre-wrap;
}
</style>
