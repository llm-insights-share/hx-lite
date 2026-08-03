<template>
  <a-layout>
    <a-layout-sider width="220" theme="dark">
      <div class="side-title">组织 HX</div>
      <a-menu
        v-model:selectedKeys="selected"
        theme="dark"
        mode="inline"
        :items="menuItems"
        @click="onClick"
      />
    </a-layout-sider>
    <a-layout-content class="content">
      <router-view />
    </a-layout-content>
  </a-layout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const selected = ref<string[]>(['dashboard'])

const menuItems = computed(() => {
  const tools: { key: string; label: string }[] = [
    { key: 'bootstrap', label: '初始配置生成' },
    { key: 'asset-submissions', label: '入库申请' },
    { key: 'github', label: 'GitHub 推送' },
  ]
  if (auth.isOrgAdmin) {
    tools.push({ key: 'users', label: '用户管理' })
  }
  tools.push({ key: 'settings', label: '设置' })
  return [
    { type: 'group', label: '概览', children: [{ key: 'dashboard', label: '仪表盘' }] },
    {
      type: 'group',
      label: '配置管理',
      children: [
        { key: 'profiles', label: 'Profile 管理' },
        { key: 'stages', label: 'Stage & Task' },
        { key: 'guides', label: 'Guide & Check' },
        { key: 'commands', label: '壳编辑器' },
      ],
    },
    {
      type: 'group',
      label: '工具',
      children: tools,
    },
  ]
})

watch(
  () => route.path,
  (p) => {
    const seg = p.split('/').pop() || 'dashboard'
    selected.value = [seg]
  },
  { immediate: true },
)

function onClick({ key }: { key: string }) {
  router.push(`/org/${key}`)
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
