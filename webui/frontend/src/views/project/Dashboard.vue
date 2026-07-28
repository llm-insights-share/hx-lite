<template>
  <div>
    <h2>项目仪表盘</h2>
    <a-row :gutter="16" style="margin-top: 16px">
      <a-col :span="6" v-for="s in stats" :key="s.label">
        <a-card><a-statistic :title="s.label" :value="s.value" /></a-card>
      </a-col>
    </a-row>
    <a-card title="待处理工单" style="margin-top: 16px">
      <a-table :dataSource="data?.recent_tickets || []" :columns="cols" row-key="id" size="small" :pagination="false" />
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'

const data = ref<any>(null)
const stats = computed(() => [
  { label: '项目数', value: data.value?.project_count ?? 0 },
  { label: '待审批工单', value: data.value?.pending_tickets ?? 0 },
  { label: '产物数', value: data.value?.artifact_count ?? 0 },
  { label: '产物版本总数', value: data.value?.version_count ?? 0 },
])
const cols = [
  { title: '工单号', dataIndex: 'ticket_no' },
  { title: '标题', dataIndex: 'title' },
  { title: '类型', dataIndex: 'ticket_type' },
  { title: '状态', dataIndex: 'status' },
]

onMounted(async () => {
  const { data: d } = await api.get('/project/dashboard')
  data.value = d
})
</script>
