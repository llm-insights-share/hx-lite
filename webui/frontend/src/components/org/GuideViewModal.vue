<template>
  <a-modal
    :open="open"
    title="Guide 详情"
    width="1000px"
    :footer="null"
    :z-index="1100"
    destroy-on-close
    @cancel="close"
  >
    <a-form v-if="record" layout="vertical">
      <a-form-item label="Asset ID">
        <a-input :value="record.asset_id" disabled />
      </a-form-item>
      <a-form-item label="名称">
        <a-input :value="record.name || (record.asset_id || '').slice(0, 20)" disabled />
      </a-form-item>
      <a-row :gutter="12">
        <a-col :span="12">
          <a-form-item label="来源">
            <a-input :value="record.source || '—'" disabled />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="Version">
            <a-input :value="record.version || '1.0.0'" disabled />
          </a-form-item>
        </a-col>
      </a-row>
      <a-form-item label="Kind">
        <a-alert
          v-if="legacyKind"
          type="warning"
          show-icon
          style="margin-bottom: 8px"
          :message="`当前为遗留类型 ${legacyKind}`"
        />
        <div class="kind-grid">
          <div
            v-for="k in kindCards"
            :key="k.value"
            class="kind-card"
            :class="{ active: (record.kind || 'guide.skill') === k.value }"
          >
            <span class="kind-badge" :class="k.category">{{ k.category }}</span>
            <div class="kind-title">
              <component :is="k.icon" class="kind-card-icon" :class="k.category" />
              <span>{{ k.title }}</span>
            </div>
            <div class="kind-id">{{ k.value }}</div>
            <div class="kind-desc">{{ k.desc }}</div>
          </div>
        </div>
      </a-form-item>
      <a-form-item label="资产内容">
        <div v-if="pkgLoading" class="muted">加载包文件…</div>
        <div v-else-if="isMultiFilePackage" class="pkg-browse">
          <div class="pkg-tree">
            <a-directory-tree
              :tree-data="pkgTreeData"
              :selected-keys="pkgSelectedKeys"
              :default-expand-all="true"
              @select="onPkgTreeSelect"
            />
          </div>
          <div class="pkg-preview">
            <div v-if="!pkgPreviewPath" class="muted">选择左侧文件预览</div>
            <div v-else-if="pkgPreviewLoading" class="muted">加载中…</div>
            <div v-else-if="pkgPreviewKind === 'md'" class="md-preview" v-html="pkgPreviewHtml" />
            <pre v-else-if="pkgPreviewKind === 'text'" class="pkg-text">{{ pkgPreviewText }}</pre>
            <iframe v-else-if="pkgPreviewKind === 'pdf'" class="pkg-iframe" :src="pkgPreviewUrl" />
            <div v-else-if="pkgPreviewKind === 'html'" class="md-preview" v-html="pkgPreviewHtml" />
            <div v-else-if="pkgPreviewKind === 'table'" class="pkg-table-wrap" v-html="pkgPreviewHtml" />
            <img v-else-if="pkgPreviewKind === 'image'" :src="pkgPreviewUrl" class="pkg-image" />
            <pre v-else-if="pkgPreviewKind === 'code'" class="pkg-code"><code :class="'lang-' + pkgPreviewLang">{{ pkgPreviewText }}</code></pre>
            <div v-else class="muted">{{ pkgPreviewText || `无法预览此格式，可下载查看：${pkgPreviewPath}` }}</div>
          </div>
        </div>
        <div v-else class="pkg-preview single">
          <div v-if="pkgPreviewLoading" class="muted">加载中…</div>
          <div v-else-if="pkgPreviewKind === 'md'" class="md-preview" v-html="pkgPreviewHtml" />
          <pre v-else-if="pkgPreviewKind === 'text'" class="pkg-text">{{ pkgPreviewText }}</pre>
          <iframe v-else-if="pkgPreviewKind === 'pdf'" class="pkg-iframe" :src="pkgPreviewUrl" />
          <div v-else-if="pkgPreviewKind === 'html'" class="md-preview" v-html="pkgPreviewHtml" />
          <div v-else-if="pkgPreviewKind === 'table'" class="pkg-table-wrap" v-html="pkgPreviewHtml" />
          <img v-else-if="pkgPreviewKind === 'image'" :src="pkgPreviewUrl" class="pkg-image" />
          <pre v-else-if="pkgPreviewKind === 'code'" class="pkg-code"><code :class="'lang-' + pkgPreviewLang">{{ pkgPreviewText }}</code></pre>
          <div v-else-if="fallbackContent" class="md-preview" v-html="fallbackHtml" />
          <div v-else class="muted">无内容</div>
        </div>
      </a-form-item>
    </a-form>
    <div class="footer">
      <a-button @click="close">关闭</a-button>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import DOMPurify from 'dompurify'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { api } from '../../api'
import { GUIDE_KIND_CARDS, toGuideKindCards, type GuideKindCard } from '../../utils/guideKind'
import { renderMarkdownDocument } from '../../utils/markdownDoc'

const props = defineProps<{
  open: boolean
  record: any | null
}>()

const emit = defineEmits<{ 'update:open': [boolean] }>()

const kindCards = ref<GuideKindCard[]>([...GUIDE_KIND_CARDS])
const cardKindSet = computed(() => new Set(kindCards.value.map((k) => k.value)))

const legacyKind = computed(() => {
  const kind = props.record?.kind
  return kind && !cardKindSet.value.has(kind) ? kind : ''
})

async function loadGuideKinds() {
  try {
    const { data } = await api.get('/org/guide-kinds')
    const all = data?.all || []
    if (Array.isArray(all) && all.length) {
      kindCards.value = toGuideKindCards(all)
    }
  } catch {
    kindCards.value = [...GUIDE_KIND_CARDS]
  }
}

const fallbackContent = ref('')
const pkgFiles = ref<string[]>([])
const pkgLoading = ref(false)
const pkgSelectedKeys = ref<string[]>([])
const pkgPreviewPath = ref('')
const pkgPreviewLoading = ref(false)
const pkgPreviewKind = ref<'md' | 'text' | 'pdf' | 'html' | 'table' | 'image' | 'code' | 'other'>('other')
const pkgPreviewHtml = ref('')
const pkgPreviewText = ref('')
const pkgPreviewUrl = ref('')
const pkgPreviewLang = ref('')

const fallbackHtml = computed(() => {
  try {
    return renderMarkdownDocument(fallbackContent.value || '')
  } catch {
    return ''
  }
})

const isMultiFilePackage = computed(() => {
  if ((props.record?.content_mode || '') === 'package' && pkgFiles.value.length > 0) return true
  const files = pkgFiles.value
  if (files.length > 1) return true
  if (files.length === 1 && files[0].includes('/')) return true
  return false
})

type TreeNode = { title: string; key: string; children?: TreeNode[]; isLeaf?: boolean }

const pkgTreeData = computed(() => buildFileTree(pkgFiles.value))

function buildFileTree(files: string[]): TreeNode[] {
  const root: Record<string, any> = {}
  for (const f of files) {
    const parts = f.split('/').filter(Boolean)
    let cur = root
    parts.forEach((part, i) => {
      if (!cur[part]) {
        cur[part] = { __children: {}, __file: i === parts.length - 1 ? f : null }
      }
      if (i === parts.length - 1) cur[part].__file = f
      cur = cur[part].__children
    })
  }
  function toNodes(obj: Record<string, any>, prefix = ''): TreeNode[] {
    return Object.keys(obj)
      .sort()
      .map((name) => {
        const node = obj[name]
        const key = prefix ? `${prefix}/${name}` : name
        const children = toNodes(node.__children, key)
        if (children.length) {
          return { title: name, key: `dir:${key}`, children }
        }
        return { title: name, key: node.__file || key, isLeaf: true }
      })
  }
  return toNodes(root)
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'])
const CODE_EXTS: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  java: 'java',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  vue: 'vue',
  svelte: 'svelte',
  swift: 'swift',
  kt: 'kotlin',
  dart: 'dart',
  lua: 'lua',
  r: 'r',
  php: 'php',
  toml: 'toml',
  ini: 'ini',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
}

function extMimeType(ext: string): string {
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
  }
  return map[ext] || 'application/octet-stream'
}

async function extractPptxText(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  const slides: { idx: number; text: string }[] = []
  const slideRe = /^ppt\/slides\/slide(\d+)\.xml$/
  for (const [name, file] of Object.entries(zip.files)) {
    const m = name.match(slideRe)
    if (!m) continue
    const xml = await file.async('string')
    const texts: string[] = []
    const tagRe = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g
    let match: RegExpExecArray | null
    while ((match = tagRe.exec(xml)) !== null) {
      const t = match[1].trim()
      if (t) texts.push(t)
    }
    slides.push({ idx: parseInt(m[1], 10), text: texts.join('\n') })
  }
  slides.sort((a, b) => a.idx - b.idx)
  return slides.map((s) => `--- Slide ${s.idx} ---\n${s.text || '(空白幻灯片)'}`).join('\n\n')
}

function resetPkgPreview() {
  pkgFiles.value = []
  pkgLoading.value = false
  pkgSelectedKeys.value = []
  pkgPreviewPath.value = ''
  pkgPreviewLoading.value = false
  pkgPreviewKind.value = 'other'
  pkgPreviewHtml.value = ''
  pkgPreviewText.value = ''
  pkgPreviewLang.value = ''
  fallbackContent.value = ''
  if (pkgPreviewUrl.value) {
    URL.revokeObjectURL(pkgPreviewUrl.value)
    pkgPreviewUrl.value = ''
  }
}

function close() {
  emit('update:open', false)
}

function onPkgTreeSelect(keys: (string | number)[]) {
  const key = String(keys[0] || '')
  if (!key || key.startsWith('dir:')) return
  pkgSelectedKeys.value = [key]
  void previewPackageFile(key)
}

function fileExt(path: string) {
  const n = path.split('/').pop() || path
  const i = n.lastIndexOf('.')
  return i >= 0 ? n.slice(i + 1).toLowerCase() : ''
}

function decodeAxiosDetail(e: any): string {
  const data = e?.response?.data
  if (!data) return ''
  if (typeof data === 'string') {
    try {
      const j = JSON.parse(data)
      return j?.detail || data
    } catch {
      return data
    }
  }
  if (data instanceof ArrayBuffer) {
    try {
      const text = new TextDecoder('utf-8').decode(data)
      const j = JSON.parse(text)
      return j?.detail || text
    } catch {
      return ''
    }
  }
  return data?.detail || ''
}

async function previewPackageFile(relPath: string) {
  const guideId = props.record?.id
  if (!guideId) return
  pkgPreviewPath.value = relPath
  pkgPreviewLoading.value = true
  pkgPreviewLang.value = ''
  if (pkgPreviewUrl.value) {
    URL.revokeObjectURL(pkgPreviewUrl.value)
    pkgPreviewUrl.value = ''
  }
  pkgPreviewHtml.value = ''
  pkgPreviewText.value = ''
  try {
    const ext = fileExt(relPath)
    const res = await api.get(`/org/guides/${guideId}/package-file`, {
      params: { path: relPath },
      responseType: 'arraybuffer',
    })
    const buf = res.data as ArrayBuffer

    if (ext === 'md' || ext === 'markdown') {
      const text = new TextDecoder('utf-8').decode(buf)
      pkgPreviewKind.value = 'md'
      pkgPreviewHtml.value = renderMarkdownDocument(text)
    } else if (['txt', 'json', 'yaml', 'yml', 'csv', 'tsv', 'log', 'env'].includes(ext)) {
      pkgPreviewKind.value = 'text'
      pkgPreviewText.value = new TextDecoder('utf-8').decode(buf)
    } else if (IMAGE_EXTS.has(ext)) {
      pkgPreviewKind.value = 'image'
      const blob = new Blob([buf], { type: extMimeType(ext) })
      pkgPreviewUrl.value = URL.createObjectURL(blob)
    } else if (ext === 'pdf') {
      pkgPreviewKind.value = 'pdf'
      const blob = new Blob([buf], { type: 'application/pdf' })
      pkgPreviewUrl.value = URL.createObjectURL(blob)
    } else if (ext === 'docx') {
      const result = await mammoth.convertToHtml({ arrayBuffer: buf })
      pkgPreviewKind.value = 'html'
      pkgPreviewHtml.value = DOMPurify.sanitize(result.value || '')
    } else if (ext === 'xlsx' || ext === 'xls') {
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const html = XLSX.utils.sheet_to_html(sheet)
      pkgPreviewKind.value = 'table'
      pkgPreviewHtml.value = DOMPurify.sanitize(html)
    } else if (ext === 'pptx') {
      const text = await extractPptxText(buf)
      pkgPreviewKind.value = 'text'
      pkgPreviewText.value = text || '(无法提取幻灯片文本)'
    } else if (ext in CODE_EXTS) {
      const text = new TextDecoder('utf-8').decode(buf)
      pkgPreviewKind.value = 'code'
      pkgPreviewLang.value = CODE_EXTS[ext]
      pkgPreviewText.value = text
    } else {
      try {
        const text = new TextDecoder('utf-8').decode(buf)
        if (/[\x00-\x08\x0e-\x1f]/.test(text.slice(0, 200))) {
          pkgPreviewKind.value = 'other'
        } else {
          pkgPreviewKind.value = 'text'
          pkgPreviewText.value = text
        }
      } catch {
        pkgPreviewKind.value = 'other'
      }
    }
  } catch (e: any) {
    const detail = decodeAxiosDetail(e) || '预览失败'
    message.error(detail)
    pkgPreviewKind.value = 'other'
    pkgPreviewText.value = detail
  } finally {
    pkgPreviewLoading.value = false
  }
}

function showContentFallback(content: string) {
  if (!content) return
  pkgPreviewKind.value = 'md'
  try {
    pkgPreviewHtml.value = renderMarkdownDocument(content)
  } catch {
    pkgPreviewKind.value = 'text'
    pkgPreviewText.value = content
  }
}

async function loadPackagePreview(guideId: number) {
  pkgLoading.value = true
  pkgPreviewPath.value = ''
  pkgSelectedKeys.value = []
  try {
    const { data } = await api.get(`/org/guides/${guideId}/package`)
    pkgFiles.value = data.files || []
    if (data.content && !fallbackContent.value) fallbackContent.value = data.content
    if (pkgFiles.value.length) {
      const skill =
        pkgFiles.value.find((f) => f.replace(/\\/g, '/').split('/').pop()?.toLowerCase() === 'skill.md') ||
        pkgFiles.value[0]
      pkgSelectedKeys.value = [skill]
      await previewPackageFile(skill)
    } else if (fallbackContent.value) {
      showContentFallback(fallbackContent.value)
    }
  } catch {
    pkgFiles.value = []
    if (fallbackContent.value) showContentFallback(fallbackContent.value)
  } finally {
    pkgLoading.value = false
  }
}

watch(
  () => [props.open, props.record?.id] as const,
  ([open, id]) => {
    if (!open || !id) {
      resetPkgPreview()
      return
    }
    void loadGuideKinds()
    resetPkgPreview()
    fallbackContent.value = props.record?.content || ''
    void loadPackagePreview(id)
  },
)
</script>

<style scoped>
.footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
.muted {
  color: #94a3b8;
}
.kind-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}
.kind-card {
  text-align: left;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fff;
  opacity: 0.72;
}
.kind-card.active {
  border-color: #1677ff;
  box-shadow: 0 0 0 1px #1677ff inset;
  opacity: 1;
}
.kind-badge {
  display: inline-block;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #64748b;
  text-transform: uppercase;
}
.kind-badge.computational {
  background: #ecfeff;
  color: #0e7490;
}
.kind-badge.inferential {
  background: #f5f3ff;
  color: #6d28d9;
}
.kind-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-weight: 600;
  font-size: 13px;
}
.kind-card-icon {
  font-size: 14px;
  color: #64748b;
}
.kind-card-icon.computational {
  color: #0e7490;
}
.kind-card-icon.inferential {
  color: #6d28d9;
}
.kind-id {
  margin-top: 2px;
  font-size: 11px;
  color: #94a3b8;
  font-family: ui-monospace, monospace;
}
.kind-desc {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}
.pkg-browse {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 12px;
  min-height: 360px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}
.pkg-tree {
  border-right: 1px solid #e5e7eb;
  padding: 8px;
  overflow: auto;
  max-height: 420px;
  background: #fafafa;
}
.pkg-preview {
  padding: 12px;
  overflow: auto;
  max-height: 420px;
}
.pkg-preview.single {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  min-height: 280px;
}
.pkg-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.pkg-iframe {
  width: 100%;
  height: 400px;
  border: 0;
}
.pkg-image {
  max-width: 100%;
  max-height: 420px;
  object-fit: contain;
  border-radius: 6px;
  background: repeating-conic-gradient(#f0f0f0 0% 25%, #fff 0% 50%) 0 0 / 16px 16px;
}
.pkg-code {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.55;
  background: #0f172a;
  color: #e2e8f0;
  padding: 12px 14px;
  border-radius: 8px;
  overflow: auto;
  max-height: 420px;
}
.pkg-code code {
  font-family: inherit;
  font-size: inherit;
}
.pkg-table-wrap {
  overflow: auto;
}
.pkg-table-wrap :deep(table) {
  border-collapse: collapse;
  width: 100%;
  font-size: 12px;
}
.pkg-table-wrap :deep(td),
.pkg-table-wrap :deep(th) {
  border: 1px solid #e5e7eb;
  padding: 4px 8px;
}
.md-preview {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 14px;
  overflow: auto;
  max-height: 420px;
  background: #fafafa;
  font-size: 13px;
  line-height: 1.55;
}
.md-preview :deep(table.fm-meta) {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 16px;
  font-size: 13px;
  background: #fff;
  table-layout: fixed;
}
.md-preview :deep(table.fm-meta th),
.md-preview :deep(table.fm-meta td) {
  border: 1px solid #c9d1d9;
  padding: 10px 14px;
  vertical-align: top;
  text-align: left;
}
.md-preview :deep(table.fm-meta th) {
  width: 120px;
  background: #eef1f4;
  font-weight: 700;
  color: #1f2328;
  white-space: nowrap;
}
.md-preview :deep(table.fm-meta td) {
  background: #fff;
  color: #1f2328;
  line-height: 1.55;
  word-break: break-word;
}
.md-preview :deep(h1),
.md-preview :deep(h2),
.md-preview :deep(h3) {
  margin-top: 0.6em;
  margin-bottom: 0.35em;
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
</style>
