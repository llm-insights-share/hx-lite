<template>
  <a-layout>
    <a-layout-sider width="220" theme="dark">
      <div class="side-title">项目 HX</div>
      <a-menu
        v-model:selectedKeys="selected"
        theme="dark"
        mode="inline"
        :items="items"
        @click="onClick"
      />
    </a-layout-sider>
    <a-layout-content class="content">
      <router-view />
    </a-layout-content>
  </a-layout>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const router = useRouter()
const route = useRoute()
const selected = ref<string[]>(['dashboard'])

const items = [
  {
    type: 'group',
    label: '概览',
    children: [
      { key: 'dashboard', label: '仪表盘' },
      { key: 'list', label: '项目列表' },
    ],
  },
  {
    type: 'group',
    label: '资产管理',
    children: [
      { key: 'guides', label: 'Guide 管理' },
      { key: 'sensors', label: 'Sensor 管理' },
      { key: 'shells', label: 'Shell 管理' },
      { key: 'asset-submit', label: '资产提交' },
      { key: 'artifacts', label: '产物列表' },
      { key: 'tasks', label: '自定义 Task' },
    ],
  },
  {
    type: 'group',
    label: '工具',
    children: [
      { key: 'github-sync', label: 'GitHub 同步' },
      { key: 'tickets', label: '审批工单' },
      { key: 'nhx-usage', label: 'nhx使用' },
    ],
  },
]

watch(
  () => route.path,
  (p) => {
    const parts = p.split('/').filter(Boolean)
    if (parts[0] === 'project' && parts[1] && /^\d+$/.test(parts[1])) {
      selected.value = ['list']
      return
    }
    selected.value = [parts[1] || 'dashboard']
  },
  { immediate: true },
)

function onClick({ key }: { key: string }) {
  router.push(`/project/${key}`)
}
</script>

<style scoped>
.side-title {
  padding: 16px 20px 8px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.content {
  padding: 20px 24px;
  background: #f5f7fa;
  min-height: calc(100vh - 64px);
}
</style>
