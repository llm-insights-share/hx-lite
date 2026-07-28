<template>
  <div>
    <div class="head">
      <h2>用户管理</h2>
      <a-button type="primary" @click="openCreate">+ 新增用户</a-button>
    </div>
    <a-table :dataSource="rows" :columns="columns" row-key="id" :pagination="false" :loading="loading">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <a-tag :color="record.is_active ? 'green' : 'default'">
            {{ record.is_active ? '正常' : '已 Block' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'roles'">
          <a-tag v-for="r in roleList(record.roles)" :key="r">{{ r }}</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space>
            <a-button
              size="small"
              :disabled="record.id === auth.user?.id"
              @click="toggleActive(record)"
            >
              {{ record.is_active ? 'Block' : '解封' }}
            </a-button>
            <a-popconfirm
              title="确认删除该用户？"
              :disabled="record.id === auth.user?.id"
              @confirm="remove(record.id)"
            >
              <a-button danger size="small" :disabled="record.id === auth.user?.id">删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal
      v-model:open="openForm"
      title="新增用户"
      :confirmLoading="saving"
      @ok="save"
    >
      <a-form layout="vertical">
        <a-form-item label="邮箱" required>
          <a-input v-model:value="form.email" placeholder="user@example.com" />
        </a-form-item>
        <a-form-item label="用户名" required>
          <a-input v-model:value="form.username" placeholder="username" />
        </a-form-item>
        <a-form-item label="显示名">
          <a-input v-model:value="form.display_name" />
        </a-form-item>
        <a-form-item label="密码" required>
          <a-input-password v-model:value="form.password" placeholder="至少 6 位" />
        </a-form-item>
        <a-form-item label="角色">
          <a-select
            v-model:value="form.roles"
            mode="multiple"
            style="width: 100%"
            :options="roleOpts"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { api } from '../../api'
import { useAuthStore } from '../../stores/auth'

type Row = {
  id: number
  username: string
  email: string
  display_name: string
  roles: string
  is_active: boolean
}

const auth = useAuthStore()
const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const rows = ref<Row[]>([])
const openForm = ref(false)
const form = reactive({
  email: '',
  username: '',
  display_name: '',
  password: '',
  roles: ['member'] as string[],
})

const roleOpts = [
  { value: 'org_admin', label: 'org_admin' },
  { value: 'project_owner', label: 'project_owner' },
  { value: 'approver', label: 'approver' },
  { value: 'member', label: 'member' },
]

const columns = [
  { title: 'ID', dataIndex: 'id', width: 60 },
  { title: '用户名', dataIndex: 'username' },
  { title: '邮箱', dataIndex: 'email' },
  { title: '显示名', dataIndex: 'display_name' },
  { title: '角色', key: 'roles' },
  { title: '状态', key: 'status', width: 100 },
  { title: '操作', key: 'action', width: 160 },
]

function roleList(roles: string) {
  return (roles || '').split(',').map((r) => r.trim()).filter(Boolean)
}

async function load() {
  loading.value = true
  try {
    const { data } = await api.get('/org/users')
    rows.value = data
  } catch (e: any) {
    if (e?.response?.status === 403) {
      message.error('仅 org_admin 可管理用户')
      router.push('/org/dashboard')
      return
    }
    message.error(e?.response?.data?.detail || '加载失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  Object.assign(form, {
    email: '',
    username: '',
    display_name: '',
    password: '',
    roles: ['member'],
  })
  openForm.value = true
}

async function save() {
  if (!form.email || !form.username || !form.password) {
    message.warning('请填写邮箱、用户名和密码')
    return
  }
  if (form.password.length < 6) {
    message.warning('密码至少 6 位')
    return
  }
  saving.value = true
  try {
    await api.post('/org/users', {
      email: form.email,
      username: form.username,
      display_name: form.display_name,
      password: form.password,
      roles: (form.roles.length ? form.roles : ['member']).join(','),
    })
    message.success('已创建')
    openForm.value = false
    await load()
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '创建失败')
  } finally {
    saving.value = false
  }
}

async function toggleActive(record: Row) {
  try {
    await api.patch(`/org/users/${record.id}/active`, { is_active: !record.is_active })
    message.success(record.is_active ? '已 Block' : '已解封')
    await load()
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '操作失败')
  }
}

async function remove(id: number) {
  try {
    await api.delete(`/org/users/${id}`)
    message.success('已删除')
    await load()
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '删除失败')
  }
}

onMounted(async () => {
  if (!auth.user) {
    try {
      await auth.fetchMe()
    } catch {
      /* ignore */
    }
  }
  if (!auth.isOrgAdmin) {
    message.error('仅 org_admin 可管理用户')
    router.push('/org/dashboard')
    return
  }
  await load()
})
</script>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
</style>
