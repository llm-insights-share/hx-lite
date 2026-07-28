<template>
  <a-layout style="min-height: 100vh">
    <a-layout-header class="top">
      <div class="brand" @click="router.push('/org')">
        <img class="brand-logo" src="/logo.svg" alt="HX" />
        <span class="brand-text">HX WebUI</span>
      </div>
      <a-menu
        v-model:selectedKeys="topKeys"
        mode="horizontal"
        theme="dark"
        :items="topItems"
        @click="onTop"
      />
      <div class="right">
        <span class="user">{{ auth.user?.display_name || auth.user?.username }}</span>
        <a-button type="link" @click="onLogout">退出</a-button>
      </div>
    </a-layout-header>
    <router-view />
  </a-layout>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const topKeys = ref<string[]>(['org'])
const topItems = [
  { key: 'org', label: '组织 HX 维护' },
  { key: 'project', label: '项目 HX 管理' },
]

watch(
  () => route.path,
  (p) => {
    topKeys.value = [p.startsWith('/project') ? 'project' : 'org']
  },
  { immediate: true },
)

onMounted(() => auth.fetchMe().catch(() => auth.logout()))

function onTop({ key }: { key: string }) {
  router.push(key === 'project' ? '/project' : '/org')
}

function onLogout() {
  auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.top {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 20px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}
.brand-logo {
  width: 28px;
  height: 28px;
  display: block;
  border-radius: 4px;
  background: #fff;
}
.brand-text {
  color: #fff;
  font-weight: 700;
  letter-spacing: 0.04em;
  font-size: 15px;
}
.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.user {
  color: rgba(255, 255, 255, 0.75);
  font-size: 13px;
}
:deep(.ant-menu) {
  flex: 1;
  min-width: 0;
  background: transparent;
}
</style>
