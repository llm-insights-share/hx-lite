<template>
  <div>
    <div class="head">
      <h2>Command/Skill 壳使用</h2>
      <div class="actions">
        <a-button :loading="loading" :disabled="!projectId" @click="refreshPage">更新</a-button>
        <a-button type="primary" :disabled="!markdown" @click="download">下载 Markdown</a-button>
      </div>
    </div>

    <a-form layout="inline" style="margin-bottom: 12px">
      <a-form-item label="项目">
        <a-select
          v-model:value="projectId"
          style="width: 240px"
          :options="projectOpts"
          placeholder="选择项目"
          @change="onProjectChange"
        />
      </a-form-item>
      <a-form-item label="Stage">
        <a-select
          v-model:value="filterStage"
          style="width: 160px"
          allow-clear
          placeholder="全部"
          :options="stageOpts"
        />
      </a-form-item>
    </a-form>

    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 12px"
      message="根据当前项目支持的 Task Command/Skill 壳动态生成 IDE 使用说明（含输入样例与输出说明）。本地需先 nhx sync / adapter sync。"
    />

    <a-spin :spinning="loading">
      <a-alert v-if="error" type="error" show-icon :message="error" style="margin-bottom: 12px" />
      <div v-else-if="!projectId" class="empty">请选择项目</div>
      <div v-else class="md-preview" v-html="html"></div>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { api } from '../../api'
import {
  buildShellUsageMarkdown,
  downloadMarkdown,
  type ShellUsageRow,
} from '../../utils/shellUsageMd'

const projects = ref<any[]>([])
const projectId = ref<number>()
const allRows = ref<ShellUsageRow[]>([])
const filterStage = ref<string | undefined>()
const loading = ref(false)
const error = ref('')

const projectOpts = computed(() => projects.value.map((p) => ({ value: p.id, label: p.name })))
const currentProject = computed(() => projects.value.find((p) => p.id === projectId.value) || {})
const stageOpts = computed(() => {
  const set = new Set<string>()
  for (const r of allRows.value) {
    if (r.stage) set.add(r.stage)
  }
  return [...set].sort().map((s) => ({ value: s, label: s }))
})

const markdown = computed(() => {
  if (!projectId.value) return ''
  return buildShellUsageMarkdown(currentProject.value, allRows.value, {
    stageFilter: filterStage.value,
  })
})

const html = computed(() => {
  try {
    const raw = marked.parse(markdown.value || '', { async: false }) as string
    return DOMPurify.sanitize(raw)
  } catch {
    return ''
  }
})

async function load() {
  if (!projectId.value) return
  loading.value = true
  error.value = ''
  try {
    const { data } = await api.get(`/projects/${projectId.value}/shells`)
    allRows.value = data || []
  } catch (e: any) {
    allRows.value = []
    error.value = e?.response?.data?.detail || e?.message || '加载壳列表失败'
  } finally {
    loading.value = false
  }
}

function onProjectChange() {
  filterStage.value = undefined
  void load()
}

function refreshPage() {
  void load()
}

function download() {
  const p = currentProject.value
  const base = (p.slug || p.name || 'project').toString().replace(/[^\w\-]+/g, '-')
  downloadMarkdown(`${base}-command-skill-usage.md`, markdown.value)
}

onMounted(async () => {
  try {
    const { data } = await api.get('/projects')
    projects.value = data || []
    if (projects.value[0]) {
      projectId.value = projects.value[0].id
      await load()
    }
  } catch (e: any) {
    error.value = e?.message || '加载项目失败'
  }
})
</script>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.head h2 {
  margin: 0;
}
.actions {
  display: flex;
  gap: 8px;
}
.empty {
  color: rgba(0, 0, 0, 0.45);
  padding: 24px 0;
}
.md-preview {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  overflow: auto;
  background: #fafafa;
  font-size: 13px;
  line-height: 1.6;
  max-height: calc(100vh - 260px);
}
.md-preview :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0 16px;
}
.md-preview :deep(th),
.md-preview :deep(td) {
  border: 1px solid #d0d7de;
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}
.md-preview :deep(pre) {
  background: #0f172a;
  color: #e2e8f0;
  padding: 10px;
  border-radius: 6px;
  overflow: auto;
}
.md-preview :deep(code) {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
.md-preview :deep(h2) {
  margin-top: 1.25em;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 4px;
}
.md-preview :deep(h3) {
  margin-top: 1em;
}
</style>
