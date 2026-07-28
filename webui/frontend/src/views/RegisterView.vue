<template>
  <div class="wrap">
    <a-card class="login-card" style="width: 400px">
      <div class="login-brand">
        <img src="/logo.svg" alt="HX" class="login-logo" />
        <div>
          <div class="login-title">注册账号</div>
          <div class="login-sub">{{ cliHint ? 'nhx CLI 注册后将凭证写回终端' : '邮箱注册，无需验证即可登录' }}</div>
        </div>
      </div>
      <a-alert
        v-if="cliHint"
        type="info"
        show-icon
        message="来自 nhx login：注册成功后凭证会写回终端"
        style="margin-bottom: 12px"
      />
      <a-form :model="formState" layout="vertical" @finish="onSubmit">
        <a-form-item
          label="邮箱"
          name="email"
          :rules="[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '邮箱格式不正确' },
          ]"
        >
          <a-input v-model:value="formState.email" placeholder="you@example.com" />
        </a-form-item>
        <a-form-item
          label="用户名"
          name="username"
          :rules="[
            { required: true, message: '请输入用户名' },
            { pattern: /^[a-zA-Z0-9._-]{2,64}$/, message: '2–64 位字母/数字/._-' },
          ]"
        >
          <a-input v-model:value="formState.username" placeholder="username" />
        </a-form-item>
        <a-form-item label="显示名" name="display_name">
          <a-input v-model:value="formState.display_name" placeholder="可选" />
        </a-form-item>
        <a-form-item
          label="密码"
          name="password"
          :rules="[
            { required: true, message: '请输入密码' },
            { min: 6, message: '至少 6 位' },
          ]"
        >
          <a-input-password v-model:value="formState.password" />
        </a-form-item>
        <a-form-item
          label="确认密码"
          name="confirm"
          :rules="[
            { required: true, message: '请再次输入密码' },
            { validator: validateConfirm },
          ]"
        >
          <a-input-password v-model:value="formState.confirm" />
        </a-form-item>
        <a-button type="primary" html-type="submit" block :loading="loading">注册并登录</a-button>
        <div class="foot">
          已有账号？
          <router-link :to="loginTo">去登录</router-link>
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
import {
  captureNhxCallbackFromUrl,
  getNhxCallback,
  redirectToNhxCallback,
  registerLinkWithCallback,
} from '../utils/nhxCallback'

const auth = useAuthStore()
const router = useRouter()
const formState = reactive({
  email: '',
  username: '',
  display_name: '',
  password: '',
  confirm: '',
})
const loading = ref(false)
const cliHint = ref(false)
const loginTo = computed(() => registerLinkWithCallback('/login'))

onMounted(() => {
  captureNhxCallbackFromUrl()
  cliHint.value = !!getNhxCallback()
})

async function validateConfirm(_rule: unknown, value: string) {
  if (value !== formState.password) {
    return Promise.reject('两次密码不一致')
  }
  return Promise.resolve()
}

async function onSubmit() {
  loading.value = true
  try {
    await auth.register({
      email: formState.email,
      username: formState.username,
      password: formState.password,
      display_name: formState.display_name,
    })
    message.success('注册成功')
    if (redirectToNhxCallback(auth.token!, formState.username)) return
    router.push('/org')
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '注册失败')
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
