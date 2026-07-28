<template>
  <div>
    <div class="head">
      <h2>壳编辑器</h2>
      <a-button type="primary" @click="openCreate = true">+ 新建</a-button>
    </div>
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 12px"
      message="每个 Task 同时产出 Command Shell 与 Skill Shell。两种壳各自可编辑、可预览；正文 body/appendix 共用。"
    />
    <a-row :gutter="16">
      <a-col :span="8">
        <a-card title="Task 壳" size="small">
          <a-list :data-source="rows" :locale="{ emptyText: '暂无，请先一键初始化' }" size="small">
            <template #renderItem="{ item }">
              <a-list-item
                :class="{ active: item.id === current?.id }"
                style="cursor: pointer"
                @click="select(item)"
              >
                <a-list-item-meta :title="item.slash_name" :description="`${item.stage}.${item.task}`" />
              </a-list-item>
            </template>
          </a-list>
        </a-card>
      </a-col>
      <a-col :span="16">
        <a-card v-if="current" :title="'/' + current.slash_name">
          <a-tabs v-model:activeKey="shellTab">
            <a-tab-pane key="command" tab="Command Shell">
              <div class="mode-bar">
                <a-radio-group v-model:value="commandMode" button-style="solid" size="small">
                  <a-radio-button value="edit">编辑</a-radio-button>
                  <a-radio-button value="preview">预览</a-radio-button>
                </a-radio-group>
                <span class="path-hint">→ `.cursor/commands/{{ current.slash_name }}.md` · Hub `commands/`</span>
              </div>
              <template v-if="commandMode === 'edit'">
                <a-form layout="vertical">
                  <a-form-item label="Description">
                    <a-input v-model:value="current.description" />
                  </a-form-item>
                  <a-form-item label="Body">
                    <a-textarea v-model:value="current.body" :rows="14" class="mono" />
                  </a-form-item>
                  <a-form-item label="Appendix（绑定 guides/sensors）">
                    <a-textarea v-model:value="current.appendix" :rows="10" class="mono" />
                  </a-form-item>
                </a-form>
              </template>
              <div v-else class="md-preview" v-html="commandPreviewHtml" />
            </a-tab-pane>

            <a-tab-pane key="skill" tab="Skill Shell">
              <div class="mode-bar">
                <a-radio-group v-model:value="skillMode" button-style="solid" size="small">
                  <a-radio-button value="edit">编辑</a-radio-button>
                  <a-radio-button value="preview">预览</a-radio-button>
                </a-radio-group>
                <span class="path-hint">→ `.cursor/skills/{{ current.slash_name }}/SKILL.md` · Hub `skill-shells/`</span>
              </div>
              <template v-if="skillMode === 'edit'">
                <a-form layout="vertical">
                  <a-form-item label="Skill name（frontmatter name）">
                    <a-input :value="current.slash_name" disabled />
                  </a-form-item>
                  <a-form-item label="Description（frontmatter description）">
                    <a-input v-model:value="current.description" />
                  </a-form-item>
                  <a-form-item label="Body">
                    <a-textarea v-model:value="current.body" :rows="14" class="mono" />
                  </a-form-item>
                  <a-form-item label="Appendix（绑定 guides/sensors）">
                    <a-textarea v-model:value="current.appendix" :rows="10" class="mono" />
                  </a-form-item>
                </a-form>
              </template>
              <div v-else class="md-preview" v-html="skillPreviewHtml" />
            </a-tab-pane>
          </a-tabs>

          <a-space style="margin-top: 12px">
            <a-button type="primary" @click="save">保存</a-button>
            <a-popconfirm title="删除？" @confirm="remove">
              <a-button danger>删除</a-button>
            </a-popconfirm>
          </a-space>
        </a-card>
        <a-empty v-else description="选择左侧 Task 壳" />
      </a-col>
    </a-row>

    <a-modal v-model:open="openCreate" title="新建 Task 壳" @ok="create">
      <a-form layout="vertical">
        <a-form-item label="Stage"><a-input v-model:value="form.stage" /></a-form-item>
        <a-form-item label="Task"><a-input v-model:value="form.task" /></a-form-item>
        <a-form-item label="Description"><a-input v-model:value="form.description" /></a-form-item>
        <a-form-item label="Body"><a-textarea v-model:value="form.body" :rows="8" /></a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { api } from '../../api'

const rows = ref<any[]>([])
const current = ref<any>(null)
const openCreate = ref(false)
const shellTab = ref('command')
const commandMode = ref<'edit' | 'preview'>('edit')
const skillMode = ref<'edit' | 'preview'>('edit')
const form = reactive({
  stage: 'dev',
  task: '',
  description: '',
  body: '',
  appendix: '',
  slash_name: '',
})

const fullText = computed(() => {
  if (!current.value) return ''
  return `${current.value.body || ''}\n\n${current.value.appendix || ''}`.trim() + '\n'
})

const commandMarkdown = computed(() => fullText.value)

const skillMarkdown = computed(() => {
  if (!current.value) return ''
  const id = current.value.slash_name || 'shell'
  const desc = current.value.description || `task shell ${current.value.stage}/${current.value.task}`
  return `---\nname: ${id}\ndescription: ${desc}\n---\n\n${fullText.value}`
})

function renderMd(src: string): string {
  try {
    const raw = marked.parse(src || '', { async: false }) as string
    return DOMPurify.sanitize(raw)
  } catch {
    return ''
  }
}

const commandPreviewHtml = computed(() => renderMd(commandMarkdown.value))
const skillPreviewHtml = computed(() => renderMd(skillMarkdown.value))

async function load() {
  const { data } = await api.get('/org/commands')
  rows.value = data
  if (current.value) {
    current.value = data.find((x: any) => x.id === current.value.id) || null
  }
}

function select(item: any) {
  current.value = { ...item }
  shellTab.value = 'command'
  commandMode.value = 'edit'
  skillMode.value = 'edit'
}

async function save() {
  if (!current.value) return
  await api.put(`/org/commands/${current.value.id}`, {
    stage: current.value.stage,
    task: current.value.task,
    slash_name: current.value.slash_name,
    description: current.value.description,
    body: current.value.body,
    appendix: current.value.appendix,
  })
  message.success('已保存')
  await load()
}

async function remove() {
  if (!current.value) return
  await api.delete(`/org/commands/${current.value.id}`)
  current.value = null
  await load()
}

async function create() {
  await api.post('/org/commands', form)
  message.success('已创建')
  openCreate.value = false
  await load()
}

onMounted(load)
</script>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.active {
  background: #e6f4ff;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.mode-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.path-hint {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
}
.md-preview {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 14px;
  overflow: auto;
  max-height: 520px;
  background: #fafafa;
  font-size: 13px;
  line-height: 1.55;
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
.md-preview :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
}
.md-preview :deep(th),
.md-preview :deep(td) {
  border: 1px solid #e5e7eb;
  padding: 4px 8px;
}
</style>
