<template>
  <div class="diff-viewer">
    <div class="diff-toolbar">
      <a-space wrap>
        <a-tag v-if="parsed.empty">无变更</a-tag>
        <template v-else>
          <a-tag>{{ parsed.filesChanged }} 个文件</a-tag>
          <a-tag color="success">+{{ parsed.additions }}</a-tag>
          <a-tag color="error">-{{ parsed.deletions }}</a-tag>
        </template>
      </a-space>
      <a-radio-group v-model:value="mode" button-style="solid" size="small">
        <a-radio-button value="visual">可视化</a-radio-button>
        <a-radio-button value="raw">原文</a-radio-button>
      </a-radio-group>
    </div>

    <pre v-if="mode === 'raw'" class="diff-raw">{{ diffText }}</pre>

    <div v-else-if="parsed.empty" class="diff-empty">没有可推送的变更</div>

    <div v-else class="diff-body">
      <aside class="diff-files">
        <button
          v-for="(f, i) in parsed.files"
          :key="f.path + i"
          type="button"
          class="diff-file-item"
          :class="{ active: i === activeIndex }"
          @click="activeIndex = i"
        >
          <span class="status-badge" :class="f.status">{{ statusLabel(f.status) }}</span>
          <span class="file-path" :title="f.path">{{ f.path }}</span>
          <span class="file-stats">
            <span v-if="f.additions" class="add">+{{ f.additions }}</span>
            <span v-if="f.deletions" class="del">-{{ f.deletions }}</span>
          </span>
        </button>
      </aside>

      <section class="diff-pane" v-if="activeFile">
        <div class="diff-file-header">
          <span class="status-badge" :class="activeFile.status">{{ statusLabel(activeFile.status) }}</span>
          <span class="header-path">
            <template v-if="activeFile.status === 'renamed' && activeFile.oldPath">
              {{ activeFile.oldPath }} → {{ activeFile.path }}
            </template>
            <template v-else>{{ activeFile.path }}</template>
          </span>
        </div>
        <div v-if="activeFile.binary" class="diff-empty pane">二进制文件变更（无文本 diff）</div>
        <div v-else-if="!activeFile.lines.length" class="diff-empty pane">无行级变更</div>
        <div v-else class="diff-lines">
          <div
            v-for="(line, li) in activeFile.lines"
            :key="li"
            class="diff-line"
            :class="line.kind"
          >
            <span class="ln old">{{ line.oldNo ?? '' }}</span>
            <span class="ln new">{{ line.newNo ?? '' }}</span>
            <span class="sign">{{ signOf(line.kind) }}</span>
            <span class="code">{{ line.text }}</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { parseUnifiedDiff, type FileChangeStatus, type DiffLineKind } from '../utils/parseUnifiedDiff'

const props = defineProps<{ diffText: string }>()

const mode = ref<'visual' | 'raw'>('visual')
const activeIndex = ref(0)

const parsed = computed(() => parseUnifiedDiff(props.diffText))

const activeFile = computed(() => parsed.value.files[activeIndex.value] ?? null)

watch(
  () => props.diffText,
  () => {
    activeIndex.value = 0
    mode.value = 'visual'
  },
)

function statusLabel(s: FileChangeStatus): string {
  if (s === 'added') return 'A'
  if (s === 'deleted') return 'D'
  if (s === 'renamed') return 'R'
  return 'M'
}

function signOf(kind: DiffLineKind): string {
  if (kind === 'add') return '+'
  if (kind === 'del') return '-'
  if (kind === 'hunk' || kind === 'meta') return ''
  return ' '
}
</script>

<style scoped>
.diff-viewer {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.diff-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #f8fafc;
}

.diff-raw {
  margin: 0;
  max-height: 520px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.45;
  background: #0b1220;
  color: #d1e7dd;
  padding: 12px;
}

.diff-empty {
  padding: 24px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
}

.diff-empty.pane {
  padding: 32px 16px;
}

.diff-body {
  display: flex;
  min-height: 360px;
  max-height: 520px;
}

.diff-files {
  width: 280px;
  flex-shrink: 0;
  overflow: auto;
  border-right: 1px solid #e5e7eb;
  background: #fafafa;
}

.diff-file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-bottom: 1px solid #f1f5f9;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-size: 12px;
}

.diff-file-item:hover {
  background: #f1f5f9;
}

.diff-file-item.active {
  background: #e8f1ff;
}

.file-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #334155;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.file-stats {
  flex-shrink: 0;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.file-stats .add {
  color: #15803d;
  margin-right: 4px;
}

.file-stats .del {
  color: #b91c1c;
}

.status-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.status-badge.added {
  color: #15803d;
  background: #dcfce7;
}

.status-badge.deleted {
  color: #b91c1c;
  background: #fee2e2;
}

.status-badge.modified {
  color: #a16207;
  background: #fef3c7;
}

.status-badge.renamed {
  color: #1d4ed8;
  background: #dbeafe;
}

.diff-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.diff-file-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #f8fafc;
  font-size: 12px;
}

.header-path {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-lines {
  flex: 1;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
}

.diff-line {
  display: grid;
  grid-template-columns: 44px 44px 16px 1fr;
  white-space: pre-wrap;
  word-break: break-all;
}

.diff-line .ln {
  padding: 0 6px;
  text-align: right;
  color: #94a3b8;
  user-select: none;
  background: #f8fafc;
  border-right: 1px solid #eef2f7;
}

.diff-line .sign {
  text-align: center;
  user-select: none;
}

.diff-line .code {
  padding: 0 8px;
}

.diff-line.add {
  background: #ecfdf5;
}

.diff-line.add .sign {
  color: #15803d;
}

.diff-line.add .ln {
  background: #d1fae5;
}

.diff-line.del {
  background: #fef2f2;
}

.diff-line.del .sign {
  color: #b91c1c;
}

.diff-line.del .ln {
  background: #fecaca;
}

.diff-line.hunk {
  background: #eff6ff;
  color: #1d4ed8;
}

.diff-line.hunk .ln,
.diff-line.meta .ln {
  background: transparent;
  border-right-color: transparent;
}

.diff-line.hunk .code,
.diff-line.meta .code {
  grid-column: 4 / -1;
}

.diff-line.meta {
  color: #64748b;
  background: #f8fafc;
}

@media (max-width: 768px) {
  .diff-body {
    flex-direction: column;
    max-height: none;
  }

  .diff-files {
    width: 100%;
    max-height: 160px;
    border-right: 0;
    border-bottom: 1px solid #e5e7eb;
  }

  .diff-lines {
    max-height: 360px;
  }
}
</style>
