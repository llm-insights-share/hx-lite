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
        <a-dropdown
          :trigger="['click']"
          placement="bottomRight"
        >
          <a class="user-link">
            <a-avatar class="user-avatar" :src="auth.user?.avatar_url || undefined" :size="28">
              <template #icon><UserOutlined /></template>
            </a-avatar>
            <span class="user">{{ auth.user?.display_name || auth.user?.username }}</span>
          </a>
          <template #overlay>
            <a-menu @click="onUserMenu">
              <a-menu-item key="email" disabled>{{ auth.user?.email || '未设置邮箱' }}</a-menu-item>
              <a-menu-divider />
              <a-menu-item key="settings">设置</a-menu-item>
              <a-menu-item key="logout">退出</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
      </div>
    </a-layout-header>
    <router-view />

    <a-drawer
      v-model:open="settingsOpen"
      title="个人设置"
      placement="right"
      :width="480"
      destroy-on-close
    >
      <UserSettingsView :active="settingsOpen" />
    </a-drawer>
  </a-layout>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { UserOutlined } from '@ant-design/icons-vue'
import { useAuthStore } from '../stores/auth'
import UserSettingsView from '../views/UserSettingsView.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const settingsOpen = ref(false)

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

watch(
  () => route.query.settings,
  (v) => {
    if (v === '1') {
      settingsOpen.value = true
      const { settings: _, ...rest } = route.query
      router.replace({ path: route.path, query: rest })
    }
  },
  { immediate: true },
)

onMounted(() => auth.fetchMe().catch(() => auth.logout()))

function onTop({ key }: { key: string }) {
  router.push(key === 'project' ? '/project' : '/org')
}

function onUserMenu({ key }: { key: string }) {
  if (key === 'email') return
  if (key === 'settings') {
    settingsOpen.value = true
    return
  }
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
.user-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.user-avatar {
  background: #1677ff;
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
