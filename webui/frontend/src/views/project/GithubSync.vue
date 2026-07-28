<template>
  <div>
    <h2>GitHub 同步</h2>
    <a-table :dataSource="rows" :columns="columns" row-key="project_id" style="margin-top: 12px">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'action'">
          <a-button size="small" type="primary" :disabled="!record.github_repo" @click="sync(record.project_id)">
            同步
          </a-button>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { message } from 'ant-design-vue'
import { api } from '../../api'

const rows = ref<any[]>([])
const columns = [
  { title: '项目', dataIndex: 'project_name' },
  { title: '仓库', dataIndex: 'github_repo' },
  { title: '上次同步', dataIndex: 'last_sync' },
  { title: '状态', dataIndex: 'last_status' },
  { title: '产物数', dataIndex: 'artifact_count' },
  { title: '操作', key: 'action', width: 100 },
]

async function load() {
  const { data } = await api.get('/github/sync-overview')
  rows.value = data
}

async function sync(id: number) {
  const { data } = await api.post(`/projects/${id}/github/sync`)
  message[data.ok ? 'success' : 'error'](data.message)
  await load()
}

onMounted(load)
</script>
