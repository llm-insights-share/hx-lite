<template>
  <div class="settings-page">
    <h2>设置</h2>

    <section class="settings-section">
      <h3 class="section-title">组织 GitHub 设置</h3>
      <a-card class="config-card" size="small">
        <template #title>
          <button type="button" class="card-toggle" @click="githubOpen = !githubOpen">
            <span>{{ githubOpen ? '收起配置' : '展开配置' }}</span>
            <span class="chevron" :class="{ open: githubOpen }">▾</span>
          </button>
        </template>
        <div v-show="githubOpen" class="card-body">
          <a-form layout="vertical">
            <a-form-item label="组织名称">
              <a-input v-model:value="form.org_name" />
            </a-form-item>
            <a-form-item label="组织 GitHub 仓库 URL">
              <a-input v-model:value="form.github_repo" placeholder="https://github.com/org/hx-hub.git" />
            </a-form-item>
            <a-form-item label="默认分支">
              <a-input v-model:value="form.github_branch" />
            </a-form-item>
            <a-form-item label="GitHub Token（可选，优先生效；也可设环境变量 HX_WEBUI_GITHUB_TOKEN）">
              <a-input-password v-model:value="form.github_token" />
            </a-form-item>
            <a-alert
              type="warning"
              show-icon
              style="margin-bottom: 16px"
              message="Fine-grained PAT 须授予该仓库 Contents: Read and write（建议 Metadata: Read-only）。仅有 Metadata/只读 Contents 会导致 push 403。"
            />
          </a-form>
          <a-button type="primary" :loading="githubSaving" @click="saveGithub">保存设置</a-button>
        </div>
      </a-card>
    </section>

    <section class="settings-section">
      <h3 class="section-title">自定义 Guide 类型</h3>
      <a-card class="config-card" size="small">
        <template #title>
          <button type="button" class="card-toggle" @click="kindsOpen = !kindsOpen">
            <span>{{ kindsOpen ? '收起配置' : '展开配置' }}</span>
            <span class="chevron" :class="{ open: kindsOpen }">▾</span>
          </button>
        </template>
        <div v-show="kindsOpen" class="card-body">
          <p class="muted">
            内置类型含 skill / template / constraint / exemplar / scaffold / glossary / capability。
            可在此增加组织自定义 <code>guide.&lt;slug&gt;</code>，创建 Guide 时可选。
          </p>

          <div v-if="!form.guide_kinds.length" class="empty-hint">暂无自定义类型</div>

          <div
            v-for="(record, index) in form.guide_kinds"
            :key="index"
            class="kind-item"
          >
            <a-button
              type="text"
              danger
              class="kind-remove"
              title="删除"
              @click="removeKind(index)"
            >
              <template #icon><DeleteOutlined /></template>
            </a-button>
            <a-form layout="vertical" class="kind-id-row">
              <a-form-item label="ID" class="kind-field-id">
                <a-input
                  v-model:value="record.id"
                  placeholder="guide.playbook"
                  :disabled="!!record._locked"
                />
              </a-form-item>
              <a-form-item label="Category" class="kind-field-cat">
                <a-select v-model:value="record.category" style="width: 100%">
                  <a-select-option value="inferential">inferential</a-select-option>
                  <a-select-option value="computational">computational</a-select-option>
                </a-select>
              </a-form-item>
            </a-form>
            <a-form layout="vertical">
              <a-form-item label="标题">
                <a-input v-model:value="record.title" placeholder="显示名称，如 Playbook" />
              </a-form-item>
              <a-form-item label="说明" class="kind-desc-item">
                <a-textarea
                  v-model:value="record.desc"
                  :rows="2"
                  placeholder="可选：该类型用途说明"
                />
              </a-form-item>
            </a-form>
          </div>

          <div class="kinds-actions">
            <a-button @click="addKind">添加类型</a-button>
            <a-button type="primary" :loading="kindsSaving" @click="saveGuideKinds">保存设置</a-button>
          </div>
        </div>
      </a-card>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { DeleteOutlined } from '@ant-design/icons-vue'
import { api } from '../../api'

type CustomKind = {
  id: string
  title: string
  desc: string
  category: 'inferential' | 'computational'
  _locked?: boolean
}

const githubSaving = ref(false)
const kindsSaving = ref(false)
const githubOpen = ref(true)
const kindsOpen = ref(true)

const form = reactive({
  org_name: '',
  github_repo: '',
  github_branch: 'main',
  github_token: '',
  guide_kinds: [] as CustomKind[],
})

function addKind() {
  form.guide_kinds.push({
    id: 'guide.',
    title: '',
    desc: '',
    category: 'inferential',
  })
  kindsOpen.value = true
}

function removeKind(index: number) {
  form.guide_kinds.splice(index, 1)
}

onMounted(async () => {
  const { data } = await api.get('/org/settings')
  Object.assign(form, {
    org_name: data.org_name,
    github_repo: data.github_repo,
    github_branch: data.github_branch,
    github_token: data.github_token || '',
    guide_kinds: (data.guide_kinds || []).map((k: CustomKind) => ({
      id: k.id,
      title: k.title || '',
      desc: k.desc || '',
      category: k.category === 'computational' ? 'computational' : 'inferential',
      _locked: true,
    })),
  })
})

async function saveGithub() {
  githubSaving.value = true
  try {
    await api.put('/org/settings', {
      org_name: form.org_name,
      github_repo: form.github_repo,
      github_branch: form.github_branch,
      github_token: form.github_token,
    })
    message.success('GitHub 设置已保存')
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '保存失败')
  } finally {
    githubSaving.value = false
  }
}

async function saveGuideKinds() {
  for (const k of form.guide_kinds) {
    const id = (k.id || '').trim()
    if (!/^guide\.[a-z][a-z0-9_-]{0,31}$/.test(id)) {
      message.error(`无效类型 ID：${id || '(空)'}（需匹配 guide.<slug>）`)
      return
    }
  }
  kindsSaving.value = true
  try {
    await api.put('/org/settings', {
      guide_kinds: form.guide_kinds.map(({ id, title, desc, category }) => ({
        id: id.trim(),
        title: (title || id).trim(),
        desc: (desc || '').trim(),
        category,
      })),
    })
    message.success('自定义 Guide 类型已保存')
    form.guide_kinds.forEach((k) => {
      k._locked = true
    })
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '保存失败')
  } finally {
    kindsSaving.value = false
  }
}
</script>

<style scoped>
.settings-page {
  max-width: 720px;
}
.settings-section {
  margin-top: 20px;
}
.section-title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}
.config-card :deep(.ant-card-head) {
  min-height: 40px;
  padding: 0 12px;
}
.config-card :deep(.ant-card-body) {
  padding: 0;
}
.card-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
}
.card-toggle:hover {
  color: #1677ff;
}
.chevron {
  display: inline-block;
  transition: transform 0.2s ease;
  transform: rotate(-90deg);
}
.chevron.open {
  transform: rotate(0deg);
}
.card-body {
  padding: 16px;
  border-top: 1px solid #f0f0f0;
}
.muted {
  color: #666;
  font-size: 13px;
  margin: 0 0 14px;
}
.empty-hint {
  color: #94a3b8;
  font-size: 13px;
  margin-bottom: 12px;
}
.kind-item {
  position: relative;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 12px 40px 4px 14px;
  margin-bottom: 12px;
  background: #fafafa;
}
.kind-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 1;
}
.kind-id-row {
  display: grid;
  grid-template-columns: 1fr 160px;
  gap: 12px;
}
.kind-id-row :deep(.ant-form-item),
.kind-item :deep(.ant-form-item) {
  margin-bottom: 12px;
}
.kind-desc-item {
  margin-bottom: 8px !important;
}
.kinds-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}
</style>
