<template>
  <div>
    <h2>设置</h2>
    <a-card style="margin-top: 12px; max-width: 640px">
      <a-form layout="vertical">
        <a-form-item label="组织名称"><a-input v-model:value="form.org_name" /></a-form-item>
        <a-form-item label="组织 GitHub 仓库 URL">
          <a-input v-model:value="form.github_repo" placeholder="https://github.com/org/hx-hub.git" />
        </a-form-item>
        <a-form-item label="默认分支"><a-input v-model:value="form.github_branch" /></a-form-item>
        <a-form-item label="GitHub Token（可选，优先生效；也可设环境变量 HX_WEBUI_GITHUB_TOKEN）">
          <a-input-password v-model:value="form.github_token" />
        </a-form-item>
        <a-alert
          type="warning"
          show-icon
          style="margin-bottom: 12px"
          message="Fine-grained PAT 须授予该仓库 Contents: Read and write（建议 Metadata: Read-only）。仅有 Metadata/只读 Contents 会导致 push 403。"
        />
        <a-button type="primary" :loading="loading" @click="save">保存设置</a-button>
      </a-form>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { api } from '../../api'

const loading = ref(false)
const form = reactive({
  org_name: '',
  github_repo: '',
  github_branch: 'main',
  github_token: '',
})

onMounted(async () => {
  const { data } = await api.get('/org/settings')
  Object.assign(form, {
    org_name: data.org_name,
    github_repo: data.github_repo,
    github_branch: data.github_branch,
    github_token: data.github_token || '',
  })
})

async function save() {
  loading.value = true
  try {
    await api.put('/org/settings', form)
    message.success('已保存')
  } finally {
    loading.value = false
  }
}
</script>
