<template>
  <div>
    <div class="head">
      <h2>产物列表</h2>
      <a-button type="primary" @click="open = true">上传产物</a-button>
    </div>
    <a-table :dataSource="rows" :columns="columns" row-key="id">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'action'">
          <a-button size="small" @click="showVersions(record)">版本</a-button>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="open" title="上传产物" @ok="upload">
      <a-form layout="vertical">
        <a-form-item label="项目">
          <a-select v-model:value="form.project_id" :options="projectOpts" style="width: 100%" />
        </a-form-item>
        <a-form-item label="名称"><a-input v-model:value="form.name" /></a-form-item>
        <a-form-item label="Stage"><a-input v-model:value="form.stage" /></a-form-item>
        <a-form-item label="Task"><a-input v-model:value="form.task" /></a-form-item>
        <a-form-item label="备注"><a-input v-model:value="form.note" /></a-form-item>
        <a-form-item label="文件"><input type="file" @change="onFile" /></a-form-item>
      </a-form>
    </a-modal>

    <a-drawer v-model:open="drawer" title="版本历史" width="480">
      <a-timeline>
        <a-timeline-item v-for="v in versions" :key="v.id">
          v{{ v.version }} · {{ v.created_by }} · {{ v.note || '无备注' }}
          <div class="mono">{{ v.storage_path }}</div>
        </a-timeline-item>
      </a-timeline>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { api } from '../../api'

const rows = ref<any[]>([])
const projects = ref<any[]>([])
const open = ref(false)
const drawer = ref(false)
const versions = ref<any[]>([])
const file = ref<File | null>(null)
const form = reactive({ project_id: undefined as number | undefined, name: '', stage: '', task: '', note: '' })
const projectOpts = computed(() => projects.value.map((p) => ({ value: p.id, label: p.name })))
const columns = [
  { title: '名称', dataIndex: 'name' },
  { title: '项目', dataIndex: 'project_name' },
  { title: 'Stage', dataIndex: 'stage' },
  { title: 'Task', dataIndex: 'task' },
  { title: '最新版本', dataIndex: 'latest_version' },
  { title: '操作', key: 'action', width: 100 },
]

async function load() {
  const [a, p] = await Promise.all([api.get('/artifacts'), api.get('/projects')])
  rows.value = a.data
  projects.value = p.data
}

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  file.value = input.files?.[0] || null
}

async function upload() {
  if (!form.project_id || !file.value || !form.name) {
    message.warning('请填写完整')
    return
  }
  const fd = new FormData()
  fd.append('project_id', String(form.project_id))
  fd.append('name', form.name)
  fd.append('stage', form.stage)
  fd.append('task', form.task)
  fd.append('note', form.note)
  fd.append('file', file.value)
  await api.post('/artifacts', fd)
  message.success('已上传')
  open.value = false
  await load()
}

async function showVersions(record: any) {
  const { data } = await api.get(`/artifacts/${record.id}/versions`)
  versions.value = data
  drawer.value = true
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
.mono {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: #64748b;
}
</style>
