<template>
  <div class="wrap">
    <a-card class="login-card" style="width: 380px">
      <div class="login-brand">
        <img src="/logo.svg" alt="HX" class="login-logo" />
        <div>
          <div class="login-title">HX WebUI</div>
          <div class="login-sub">{{ cliHint ? 'nhx CLI 登录' : '组织与项目 HX 配置' }}</div>
        </div>
      </div>
      <a-alert
        v-if="cliHint"
        type="info"
        show-icon
        message="来自 nhx login：登录或注册成功后，凭证会写回终端"
        style="margin-bottom: 12px"
      />
      <a-form :model="formState" layout="vertical" @finish="onSubmit">
        <a-form-item label="用户名" name="username" :rules="[{ required: true, message: '请输入用户名' }]">
          <a-input v-model:value="formState.username" placeholder="admin" />
        </a-form-item>
        <a-form-item label="密码" name="password" :rules="[{ required: true, message: '请输入密码' }]">
          <a-input-password v-model:value="formState.password" placeholder="admin123" />
        </a-form-item>
        <a-alert
          type="info"
          show-icon
          message="默认账号 admin / admin123"
          style="margin-bottom: 12px"
        />
        <a-button type="primary" html-type="submit" block :loading="loading">登录</a-button>
        <div class="foot">
          没有账号？
          <router-link :to="registerTo">注册</router-link>
        </div>
      </a-form>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { useAuthStore } from '../stores/auth'
import { getToken } from '../api'
import {
  captureNhxCallbackFromUrl,
  getNhxCallback,
  redirectToNhxCallback,
  registerLinkWithCallback,
} from '../utils/nhxCallback'

const auth = useAuthStore()
const router = useRouter()
const formState = reactive({
  username: 'admin',
  password: 'admin123',
})
const loading = ref(false)
const cliHint = ref(false)

const registerTo = computed(() => registerLinkWithCallback('/register'))

onMounted(async () => {
  captureNhxCallbackFromUrl()
  cliHint.value = !!getNhxCallback()
  // Already logged in WebUI while nhx is waiting — finish CLI callback immediately
  if (cliHint.value && getToken() && auth.token) {
    try {
      if (!auth.user) await auth.fetchMe()
      const username = auth.user?.username || formState.username
      if (redirectToNhxCallback(auth.token, username)) return
    } catch {
      /* fall through to form */
    }
  }
})

async function onSubmit() {
  loading.value = true
  try {
    await auth.login(formState.username, formState.password)
    message.success('登录成功')
    if (redirectToNhxCallback(auth.token!, formState.username)) return
    router.push('/org')
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.wrap {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: linear-gradient(160deg, #0f172a, #1e293b 40%, #0b1220);
}
.login-card {
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}
.login-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}
.login-logo {
  width: 48px;
  height: 48px;
  display: block;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.06);
}
.login-title {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: 0.02em;
}
.login-sub {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}
.foot {
  margin-top: 16px;
  text-align: center;
  font-size: 13px;
  color: #64748b;
}
</style>
