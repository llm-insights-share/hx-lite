<template>
  <div>
    <div class="head">
      <h2>nhx 使用</h2>
    </div>

    <a-spin :spinning="loading">
      <a-alert v-if="error" type="error" show-icon :message="error" style="margin-bottom: 12px" />
      <div v-else class="md-preview" v-html="html"></div>
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const loading = ref(false)
const error = ref('')
const html = ref('')

async function loadManual() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch('/docs/nhx-command-manual.zh-CN.md', { cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`加载失败（HTTP ${res.status}）`)
    }
    const md = await res.text()
    html.value = DOMPurify.sanitize(marked.parse(md, { async: false }) as string)
  } catch (e: any) {
    error.value = e?.message || '无法加载 nhx 使用手册'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadManual()
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
.md-preview {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  overflow: auto;
  background: #fafafa;
  font-size: 13px;
  line-height: 1.6;
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
</style>
