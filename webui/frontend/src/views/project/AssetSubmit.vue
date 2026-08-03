<template>
  <div>
    <div class="head">
      <h2>资产提交</h2>
    </div>
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 12px"
      message="仅可提交「组织库中尚不存在」的项目 Guide / Check。提交后由组织管理员审批入库（试用或强制）。"
    />
    <a-form layout="inline" style="margin-bottom: 12px">
      <a-form-item label="项目">
        <a-select v-model:value="projectId" style="width: 240px" :options="projectOpts" @change="reload" />
      </a-form-item>
    </a-form>

    <a-card title="可提交资产" size="small" style="margin-bottom: 16px">
      <a-form layout="vertical">
        <a-form-item label="提交理由（commit message）" required>
          <a-textarea v-model:value="reason" :rows="2" placeholder="说明为何要将这些资产纳入组织库" />
        </a-form-item>
        <a-form-item label="Guide">
          <a-checkbox-group v-model:value="selectedGuides" style="width: 100%">
            <div v-for="g in promotable.guides" :key="g.asset_id" class="asset-row">
              <a-checkbox :value="g.asset_id">
                <code>{{ g.asset_id }}</code>
                <a-tag style="margin-left: 8px">{{ g.kind }}</a-tag>
              </a-checkbox>
            </div>
            <a-empty v-if="!promotable.guides.length" description="无可提交 Guide" />
          </a-checkbox-group>
        </a-form-item>
        <a-form-item label="Check">
          <a-checkbox-group v-model:value="selectedSensors" style="width: 100%">
            <div v-for="s in promotable.sensors" :key="s.asset_id" class="asset-row">
              <a-checkbox :value="s.asset_id">
                <code>{{ s.asset_id }}</code>
                <a-tag style="margin-left: 8px">{{ s.check_type || s.kind }}</a-tag>
              </a-checkbox>
            </div>
            <a-empty v-if="!promotable.sensors.length" description="无可提交 Check" />
          </a-checkbox-group>
        </a-form-item>
        <a-button type="primary" :loading="submitting" @click="submit">提交入库申请</a-button>
      </a-form>
    </a-card>

    <a-card title="申请历史" size="small">
      <a-table :dataSource="history" :columns="histCols" row-key="id" size="small" :pagination="{ pageSize: 8 }">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-tag :color="statusColor(record.status)">{{ statusLabel(record.status) }}</a-tag>
          </template>
          <template v-else-if="column.key === 'items'">
            <span v-for="it in record.items || []" :key="it.id" style="margin-right: 6px">
              <a-tag>{{ it.asset_kind }}:{{ it.asset_id }}</a-tag>
            </span>
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { api } from '../../api'

const projects = ref<any[]>([])
const projectId = ref<number>()
const reason = ref('')
const submitting = ref(false)
const selectedGuides = ref<string[]>([])
const selectedSensors = ref<string[]>([])
const promotable = reactive<{ guides: any[]; sensors: any[] }>({ guides: [], sensors: [] })
const history = ref<any[]>([])

const projectOpts = computed(() => projects.value.map((p) => ({ value: p.id, label: p.name })))
const histCols = [
  { title: '单号', dataIndex: 'submission_no', width: 110 },
  { title: '理由', dataIndex: 'reason', ellipsis: true },
  { title: '资产', key: 'items' },
  { title: '状态', key: 'status', width: 100 },
  { title: '提交人', dataIndex: 'submitter', width: 100 },
  { title: '时间', dataIndex: 'created_at', width: 180 },
]

function statusLabel(s: string) {
  return ({ submitted: '待审', approved: '已通过', rejected: '已驳回', partial: '部分入库' } as any)[s] || s
}
function statusColor(s: string) {
  return ({ submitted: 'processing', approved: 'success', rejected: 'error', partial: 'warning' } as any)[s] || 'default'
}

async function reload() {
  if (!projectId.value) return
  const [p, h] = await Promise.all([
    api.get(`/projects/${projectId.value}/promotable-assets`),
    api.get(`/projects/${projectId.value}/asset-submissions`),
  ])
  promotable.guides = p.data.guides || []
  promotable.sensors = p.data.sensors || []
  history.value = h.data || []
  selectedGuides.value = []
  selectedSensors.value = []
}

async function submit() {
  if (!projectId.value) return
  if (!reason.value.trim()) {
    message.warning('请填写提交理由')
    return
  }
  const items = [
    ...selectedGuides.value.map((asset_id) => ({ asset_kind: 'guide', asset_id })),
    ...selectedSensors.value.map((asset_id) => ({ asset_kind: 'sensor', asset_id })),
  ]
  if (!items.length) {
    message.warning('请至少选择一个资产')
    return
  }
  submitting.value = true
  try {
    await api.post(`/projects/${projectId.value}/asset-submissions`, {
      reason: reason.value.trim(),
      items,
    })
    message.success('已提交入库申请')
    reason.value = ''
    await reload()
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '提交失败')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  const { data } = await api.get('/projects')
  projects.value = data
  if (data[0]) {
    projectId.value = data[0].id
    await reload()
  }
})
</script>

<style scoped>
.head {
  margin-bottom: 12px;
}
.asset-row {
  margin-bottom: 6px;
}
</style>
