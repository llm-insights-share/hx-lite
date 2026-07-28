<template>
  <div>
    <div class="head">
      <h2>Guide & Sensor</h2>
      <div>
        <a-button type="primary" @click="openCreateGuide">+ Guide</a-button>
        <a-button style="margin-left: 8px" @click="openCreateSensor">+ Sensor</a-button>
      </div>
    </div>
    <a-tabs>
      <a-tab-pane key="g" tab="Guides">
        <a-table :dataSource="guides" :columns="gCols" row-key="id" :pagination="{ pageSize: 10 }">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'mode'">
              <a-tag>{{ record.content_mode || 'markdown' }}</a-tag>
            </template>
            <template v-else-if="column.key === 'status'">
              <a-tag :color="statusColor(record.status)">{{ statusLabel(record.status) }}</a-tag>
            </template>
            <template v-else-if="column.key === 'action'">
              <span class="row-actions">
                <template v-for="(act, idx) in guideActionSplit(record).visible" :key="act.key">
                  <a-button
                    size="small"
                    :danger="act.danger"
                    :type="act.primary ? 'primary' : 'default'"
                    :ghost="!!act.primary"
                    :style="idx ? 'margin-left: 6px' : undefined"
                    @click="runRowAction(act)"
                  >
                    {{ act.label }}
                  </a-button>
                </template>
                <a-dropdown
                  v-if="guideActionSplit(record).more.length"
                  :trigger="['click']"
                  placement="bottomRight"
                >
                  <a-button size="small" type="text" class="more-btn">
                    <img :src="moreIcon" alt="更多" class="more-icon" />
                  </a-button>
                  <template #overlay>
                    <a-menu>
                      <a-menu-item
                        v-for="act in guideActionSplit(record).more"
                        :key="act.key"
                        :danger="act.danger"
                        @click="runRowAction(act)"
                      >
                        {{ act.label }}
                      </a-menu-item>
                    </a-menu>
                  </template>
                </a-dropdown>
              </span>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
      <a-tab-pane key="s" tab="Sensors">
        <a-table :dataSource="sensors" :columns="sCols" row-key="id" :pagination="{ pageSize: 10 }">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'check_type'">
              <a-tag :color="normalizeCheckType(record.check_type) === 'human' ? 'purple' : 'default'">
                {{ normalizeCheckType(record.check_type) }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'triggers'">
              <span class="triggers-cell">{{ formatTriggersShort(record.triggers) }}</span>
            </template>
            <template v-else-if="column.key === 'status'">
              <a-tag :color="statusColor(record.status)">{{ statusLabel(record.status) }}</a-tag>
            </template>
            <template v-else-if="column.key === 'action'">
              <span class="row-actions">
                <template v-for="(act, idx) in sensorActionSplit(record).visible" :key="act.key">
                  <a-button
                    size="small"
                    :danger="act.danger"
                    :type="act.primary ? 'primary' : 'default'"
                    :ghost="!!act.primary"
                    :style="idx ? 'margin-left: 6px' : undefined"
                    @click="runRowAction(act)"
                  >
                    {{ act.label }}
                  </a-button>
                </template>
                <a-dropdown
                  v-if="sensorActionSplit(record).more.length"
                  :trigger="['click']"
                  placement="bottomRight"
                >
                  <a-button size="small" type="text" class="more-btn">
                    <img :src="moreIcon" alt="更多" class="more-icon" />
                  </a-button>
                  <template #overlay>
                    <a-menu>
                      <a-menu-item
                        v-for="act in sensorActionSplit(record).more"
                        :key="act.key"
                        :danger="act.danger"
                        @click="runRowAction(act)"
                      >
                        {{ act.label }}
                      </a-menu-item>
                    </a-menu>
                  </template>
                </a-dropdown>
              </span>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
    </a-tabs>

    <a-modal
      v-model:open="openGuide"
      :title="guideModalTitle"
      width="1000px"
      :confirmLoading="savingGuide"
      :ok-button-props="guideReadonly ? { style: { display: 'none' } } : undefined"
      :cancel-text="guideReadonly ? '关闭' : '取消'"
      @ok="saveGuide"
    >
      <a-form layout="vertical">
        <a-form-item label="Asset ID" required>
          <a-input
            v-model:value="guideForm.asset_id"
            :disabled="guideReadonly || (!!guideForm.id && !!guideForm.package_path)"
          />
        </a-form-item>
        <a-form-item label="Version">
          <a-input v-model:value="guideForm.version" style="width: 160px" :disabled="guideReadonly" />
        </a-form-item>

        <a-form-item label="Kind">
          <a-alert
            v-if="legacyKind"
            type="warning"
            show-icon
            style="margin-bottom: 8px"
            :message="`当前为遗留类型 ${legacyKind}，可改选下方 8 类之一`"
          />
          <div class="kind-grid">
            <button
              v-for="k in kindCards"
              :key="k.value"
              type="button"
              class="kind-card"
              :class="{ active: guideForm.kind === k.value, disabled: guideReadonly }"
              :disabled="guideReadonly"
              @click="!guideReadonly && selectKind(k.value)"
            >
              <span class="kind-badge" :class="k.category">{{ k.category }}</span>
              <div class="kind-title">{{ k.title }}</div>
              <div class="kind-id">{{ k.value }}</div>
              <div class="kind-desc">{{ k.desc }}</div>
            </button>
          </div>
        </a-form-item>

        <a-form-item v-if="!guideReadonly" label="内容来源">
          <a-radio-group v-model:value="contentSource" button-style="solid">
            <a-radio-button v-if="guideForm.id" value="view">预览</a-radio-button>
            <a-radio-button value="text">纯文本</a-radio-button>
            <a-radio-button value="markdown">Markdown</a-radio-button>
            <a-radio-button value="upload">上传</a-radio-button>
            <a-radio-button v-if="guideForm.kind === 'guide.skill'" value="github">GitHub</a-radio-button>
          </a-radio-group>
        </a-form-item>

        <a-form-item v-if="guideForm.id && (contentSource === 'view' || guideReadonly)" label="资产内容">
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
              <div v-else class="muted">无法预览此格式，可下载查看：{{ pkgPreviewPath }}</div>
            </div>
          </div>
          <div v-else class="pkg-preview single">
            <div v-if="pkgPreviewLoading" class="muted">加载中…</div>
            <div v-else-if="pkgPreviewKind === 'md'" class="md-preview" v-html="pkgPreviewHtml" />
            <pre v-else-if="pkgPreviewKind === 'text'" class="pkg-text">{{ pkgPreviewText }}</pre>
            <iframe v-else-if="pkgPreviewKind === 'pdf'" class="pkg-iframe" :src="pkgPreviewUrl" />
            <div v-else-if="pkgPreviewKind === 'html'" class="md-preview" v-html="pkgPreviewHtml" />
            <div v-else-if="pkgPreviewKind === 'table'" class="pkg-table-wrap" v-html="pkgPreviewHtml" />
            <div v-else-if="guideForm.content" class="md-preview" v-html="mdPreviewHtml" />
            <div v-else class="muted">无内容</div>
          </div>
        </a-form-item>

        <a-form-item v-else-if="contentSource === 'text'" label="Content">
          <a-textarea v-model:value="guideForm.content" :rows="14" placeholder="纯文本内容" />
        </a-form-item>

        <a-form-item v-else-if="contentSource === 'markdown'" label="Markdown">
          <div class="md-split">
            <a-textarea v-model:value="guideForm.content" :rows="16" placeholder="# 标题&#10;正文…" class="md-editor" />
            <div class="md-preview" v-html="mdPreviewHtml" />
          </div>
        </a-form-item>

        <template v-else-if="contentSource === 'github'">
          <a-form-item label="GitHub 仓库" required>
            <a-input
              v-model:value="githubRepo"
              placeholder="owner/repo 或 https://github.com/owner/repo"
              allow-clear
            />
          </a-form-item>
          <a-form-item label="分支 / Tag（可选）">
            <a-input v-model:value="githubRef" placeholder="默认分支" style="width: 240px" allow-clear />
          </a-form-item>
          <a-form-item label="Skills（可多选）">
            <div style="margin-bottom: 8px">
              <a-button type="primary" ghost :loading="listingSkills" @click="listGithubSkills">列出 Skills</a-button>
              <span v-if="githubSkills.length" class="muted" style="margin-left: 10px">
                共 {{ githubSkills.length }} 个
              </span>
            </div>
            <a-select
              v-model:value="selectedSkillPaths"
              mode="multiple"
              style="width: 100%"
              placeholder="选择要安装的 Skill（可多选）"
              :options="githubSkillOpts"
              show-search
              option-filter-prop="label"
              allow-clear
              @change="onSkillsSelect"
            />
          </a-form-item>
        </template>

        <a-form-item v-else-if="contentSource === 'upload'" label="上传文件 / 文件夹">
          <a-alert
            v-if="guideForm.package_path"
            type="info"
            show-icon
            style="margin-bottom: 8px"
            :message="`已有包：${guideForm.package_path}（重新上传将覆盖）`"
          />
          <a-radio-group v-model:value="uploadMode" style="margin-bottom: 8px">
            <a-radio value="file">单文件</a-radio>
            <a-radio value="folder">文件夹</a-radio>
          </a-radio-group>
          <div>
            <input
              v-if="uploadMode === 'file'"
              type="file"
              @change="onFilePick"
            />
            <input
              v-else
              type="file"
              webkitdirectory
              multiple
              @change="onFolderPick"
            />
          </div>
          <ul v-if="uploadFileList.length" class="file-list">
            <li v-for="f in uploadFileList.slice(0, 40)" :key="f.rel">{{ f.rel }} <span class="muted">({{ f.size }} B)</span></li>
            <li v-if="uploadFileList.length > 40" class="muted">…共 {{ uploadFileList.length }} 个文件</li>
          </ul>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="openSensor"
      :title="sensorModalTitle"
      @ok="saveSensor"
      width="720px"
      :destroyOnClose="false"
      :z-index="1000"
      :ok-button-props="sensorReadonly ? { style: { display: 'none' } } : undefined"
      :cancel-text="sensorReadonly ? '关闭' : '取消'"
    >
      <a-alert
        v-if="normalizeCheckType(sensorForm.check_type) === 'human'"
        type="warning"
        show-icon
        style="margin-bottom: 12px"
        message="human：触发时仅提醒「尚未批准」，不做文件/脚本检查；beforeSubmit 不阻断提交。"
      />
      <a-form layout="vertical">
        <a-form-item label="Asset ID">
          <a-input v-model:value="sensorForm.asset_id" :disabled="sensorReadonly || !!sensorForm.id" />
        </a-form-item>
        <a-form-item label="Check Type">
          <a-select
            v-model:value="sensorForm.check_type"
            :options="CHECK_TYPE_OPTS"
            style="width: 100%"
            :disabled="sensorReadonly"
            @change="onSensorCheckTypeChange"
          />
        </a-form-item>
        <a-form-item>
          <template #label>
            <span class="content-label">
              触发通道
              <a-popover placement="topLeft" trigger="click" :overlayStyle="{ maxWidth: '400px' }">
                <template #content>
                  <div class="sensor-help">
                    <div class="sensor-help-title">{{ TRIGGER_CHANNELS_HELP.title }}</div>
                    <pre class="sensor-help-example" style="white-space: pre-wrap">{{ TRIGGER_CHANNELS_HELP.body }}</pre>
                  </div>
                </template>
                <a-button type="link" size="small" class="help-btn" @click.prevent>?</a-button>
              </a-popover>
            </span>
          </template>
          <a-select
            v-model:value="sensorForm.triggers"
            mode="multiple"
            :options="TRIGGER_CHANNEL_OPTS"
            style="width: 100%"
            placeholder="多选触发通道"
            :disabled="sensorReadonly"
          />
        </a-form-item>
        <a-form-item v-if="sensorForm.triggers.includes('hook:afterFileEdit')" label="Scope（afterFileEdit glob，每行一个）">
          <a-textarea
            :value="sensorForm.scope.join('\n')"
            :rows="3"
            placeholder="docs/prd/**"
            :disabled="sensorReadonly"
            @update:value="(v: string) => (sensorForm.scope = v.split('\n').map((s) => s.trim()).filter(Boolean))"
          />
        </a-form-item>
        <a-form-item v-if="normalizeCheckType(sensorForm.check_type) === 'inline'" label="内置函数">
          <div class="inline-fns">
            <a-tag
              v-for="fn in INLINE_FUNCTIONS"
              :key="fn.label"
              color="blue"
              class="fn-tag"
              @click="!sensorReadonly && insertInlineFn(fn.expr)"
            >
              {{ fn.label }}
            </a-tag>
          </div>
          <ul class="fn-desc">
            <li v-for="fn in INLINE_FUNCTIONS" :key="fn.expr">
              <code>{{ fn.label }}</code> — {{ fn.desc }}
            </li>
          </ul>
        </a-form-item>
        <a-form-item>
          <template #label>
            <span class="content-label">
              配置内容
              <a-popover placement="leftTop" trigger="click" :overlayStyle="{ maxWidth: '420px' }">
                <template #content>
                  <div class="sensor-help">
                    <div class="sensor-help-title">{{ helpFor(sensorForm.check_type).title }}</div>
                    <p>{{ helpFor(sensorForm.check_type).body }}</p>
                    <div class="sensor-help-sub">样例</div>
                    <pre class="sensor-help-example">{{ helpFor(sensorForm.check_type).example }}</pre>
                  </div>
                </template>
                <a-button type="link" size="small" class="help-btn" @click.prevent>?</a-button>
              </a-popover>
            </span>
          </template>
          <a-textarea
            v-model:value="sensorForm.content"
            :rows="10"
            :disabled="sensorReadonly"
            placeholder="仅 check 专属字段（如 expr / rules_text / bash）；triggers/scope 在上方表单"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Modal, message } from 'ant-design-vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { api } from '../../api'
import moreIcon from '../../assets/more.png'
import {
  CHECK_TYPE_OPTS,
  DEFAULT_TRIGGERS,
  INLINE_FUNCTIONS,
  TRIGGER_CHANNEL_OPTS,
  TRIGGER_CHANNELS_HELP,
  formatTriggersShort,
  helpFor,
  insertExprIntoContent,
  isSensorTemplateContent,
  leanSensorContent,
  normalizeCheckType,
  normalizeScope,
  normalizeTriggers,
  templateFor,
} from '../../constants/sensorTemplates'

type RowAction = {
  key: string
  label: string
  danger?: boolean
  primary?: boolean
  confirm?: string
  run: () => void | Promise<void>
}

const ACTION_INLINE_MAX = 3

const guides = ref<any[]>([])
const sensors = ref<any[]>([])
const openGuide = ref(false)
const openSensor = ref(false)
const guideModalMode = ref<'create' | 'edit' | 'view'>('create')
const sensorModalMode = ref<'create' | 'edit' | 'view'>('create')
const savingGuide = ref(false)
const contentSource = ref<'view' | 'text' | 'markdown' | 'upload' | 'github'>('markdown')
const guideReadonly = computed(() => guideModalMode.value === 'view')
const sensorReadonly = computed(() => sensorModalMode.value === 'view')
const uploadMode = ref<'file' | 'folder'>('file')
const uploadFileList = ref<{ file: File; rel: string; size: number }[]>([])
const githubRepo = ref('')
const githubRef = ref('')
const listingSkills = ref(false)
const githubSkills = ref<{ id: string; path: string; skill_md_path: string }[]>([])
const selectedSkillPaths = ref<string[]>([])

const pkgFiles = ref<string[]>([])
const pkgLoading = ref(false)
const pkgSelectedKeys = ref<string[]>([])
const pkgPreviewPath = ref('')
const pkgPreviewLoading = ref(false)
const pkgPreviewKind = ref<'md' | 'text' | 'pdf' | 'html' | 'table' | 'other'>('other')
const pkgPreviewHtml = ref('')
const pkgPreviewText = ref('')
const pkgPreviewUrl = ref('')

const githubSkillOpts = computed(() =>
  githubSkills.value.map((s) => ({
    value: s.path,
    label: s.path && s.path !== '.' ? `${s.id}  (${s.path})` : s.id,
  })),
)

const isMultiFilePackage = computed(() => {
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

const kindCards = [
  {
    value: 'guide.skill',
    title: 'Skill / 技能规范',
    category: 'inferential',
    desc: 'coding-conventions、prd-writing…',
  },
  {
    value: 'guide.template',
    title: 'Template / 模板',
    category: 'computational',
    desc: 'proposal-template、design-template…',
  },
  {
    value: 'guide.constraint',
    title: 'Constraint / 硬约束',
    category: 'computational',
    desc: 'layering-rules、budget-rules…',
  },
  {
    value: 'guide.exemplar',
    title: 'Exemplar / 范例',
    category: 'inferential',
    desc: '好/坏示例对照',
  },
  {
    value: 'guide.scaffold',
    title: 'Scaffold / 脚手架',
    category: 'inferential',
    desc: '工程脚手架注入 Context Pack',
  },
  {
    value: 'guide.codemod',
    title: 'Codemod / 改造指南',
    category: 'inferential',
    desc: '批量改造步骤与脚本指引',
  },
  {
    value: 'guide.glossary',
    title: 'Glossary / 术语表',
    category: 'inferential',
    desc: '领域术语约束 Agent 用词',
  },
  {
    value: 'guide.capability',
    title: 'Capability / 能力说明',
    category: 'inferential',
    desc: 'capability 写作与边界指引',
  },
]

const guideForm = reactive<any>({
  id: null,
  asset_id: '',
  kind: 'guide.skill',
  version: '1.0.0',
  status: 'draft',
  content: '',
  content_mode: 'markdown',
  package_path: '',
  package_files_json: '[]',
})

const sensorForm = reactive({
  id: null as number | null,
  asset_id: '',
  kind: 'sensor.rule',
  version: '1.0.0',
  status: 'draft',
  check_type: 'rules',
  content: '',
  config_json: '{}',
  triggers: [...DEFAULT_TRIGGERS] as string[],
  scope: [] as string[],
})

const guideModalTitle = computed(() => {
  if (guideModalMode.value === 'view') return 'Guide 详情'
  if (guideForm.id) return '编辑 Guide'
  return '新建 Guide'
})
const sensorModalTitle = computed(() => {
  if (sensorModalMode.value === 'view') return 'Sensor 详情'
  if (sensorForm.id) return '编辑 Sensor'
  return '新建 Sensor'
})

const cardKindSet = new Set(kindCards.map((k) => k.value))
const legacyKind = computed(() =>
  guideForm.kind && !cardKindSet.has(guideForm.kind) ? guideForm.kind : '',
)

const mdPreviewHtml = computed(() => {
  try {
    return renderMarkdownDocument(guideForm.content || '')
  } catch {
    return ''
  }
})

/** Parse leading YAML front matter between --- markers (skill SKILL.md formatter). */
function parseYamlFrontMatter(src: string): { meta: Record<string, string>; body: string } {
  const text = (src || '').replace(/^\uFEFF/, '')
  if (!text.startsWith('---')) return { meta: {}, body: src }
  const afterOpen = text.slice(3).replace(/^\r?\n/, '')
  const endMatch = afterOpen.match(/\r?\n---[ \t]*(?:\r?\n|$)/)
  if (!endMatch || endMatch.index === undefined) return { meta: {}, body: src }
  const yamlBlock = afterOpen.slice(0, endMatch.index)
  const body = afterOpen.slice(endMatch.index + endMatch[0].length)
  const meta: Record<string, string> = {}
  let currentKey = ''
  for (const line of yamlBlock.split(/\r?\n/)) {
    if (!line.trim()) continue
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (kv && !/^[ \t]/.test(line)) {
      currentKey = kv[1]
      let val = kv[2] ?? ''
      if (
        (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
        (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
      ) {
        val = val.slice(1, -1)
      }
      if (val === '>' || val === '|' || val === '>-' || val === '|-') {
        meta[currentKey] = ''
      } else {
        meta[currentKey] = val
      }
      continue
    }
    if (currentKey && /^[ \t]/.test(line)) {
      const cont = line.replace(/^[ \t]+/, '')
      meta[currentKey] = meta[currentKey] ? `${meta[currentKey]} ${cont}` : cont
    }
  }
  return { meta, body }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderFrontMatterTable(meta: Record<string, string>): string {
  const keys = Object.keys(meta)
  if (!keys.length) return ''
  const preferred = ['name', 'description']
  const ordered = [
    ...preferred.filter((k) => k in meta),
    ...keys.filter((k) => !preferred.includes(k)),
  ]
  const rows = ordered
    .map(
      (k) =>
        `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(meta[k])}</td></tr>`,
    )
    .join('')
  return `<table class="fm-meta"><tbody>${rows}</tbody></table>`
}

function renderMarkdownDocument(src: string): string {
  const { meta, body } = parseYamlFrontMatter(src)
  const table = renderFrontMatterTable(meta)
  const mdHtml = marked.parse(body || '', { async: false }) as string
  return DOMPurify.sanitize(table + mdHtml)
}

const gCols = [
  { title: 'ID', dataIndex: 'asset_id' },
  { title: 'Kind', dataIndex: 'kind' },
  { title: 'Mode', key: 'mode', width: 100 },
  { title: 'Status', key: 'status', width: 90 },
  { title: '操作', key: 'action', width: 200 },
]
const sCols = [
  { title: 'ID', dataIndex: 'asset_id' },
  { title: 'Kind', dataIndex: 'kind' },
  { title: 'Check', key: 'check_type', dataIndex: 'check_type' },
  { title: 'Triggers', key: 'triggers', width: 140 },
  { title: 'Status', key: 'status', width: 90 },
  { title: '操作', key: 'action', width: 200 },
]

function statusLabel(s: string) {
  return ({ draft: '草稿', trial: '试用', enforced: '强制' } as any)[s] || s || '草稿'
}
function statusColor(s: string) {
  return ({ draft: 'default', trial: 'processing', enforced: 'success' } as any)[s] || 'default'
}

function splitRowActions(actions: RowAction[]) {
  if (actions.length <= ACTION_INLINE_MAX) {
    return { visible: actions, more: [] as RowAction[] }
  }
  // >3：保留前两个（详情、编辑），其余收入「更多」
  return { visible: actions.slice(0, 2), more: actions.slice(2) }
}

function runRowAction(act: RowAction) {
  if (act.confirm) {
    Modal.confirm({
      title: act.confirm,
      okText: '确定',
      cancelText: '取消',
      okType: act.danger ? 'danger' : 'primary',
      onOk: () => act.run(),
    })
    return
  }
  void act.run()
}

function guideActions(record: any): RowAction[] {
  const actions: RowAction[] = [
    { key: 'detail', label: '详情', run: () => viewGuide(record) },
    { key: 'edit', label: '编辑', run: () => editGuide(record) },
  ]
  const status = record.status || 'draft'
  if (status === 'draft') {
    actions.push(
      {
        key: 'trial',
        label: '转试用',
        confirm: '转为试用？',
        run: () => setGuideStatus(record.id, 'trial'),
      },
      {
        key: 'enforced',
        label: '转强制',
        primary: true,
        confirm: '转为强制？',
        run: () => setGuideStatus(record.id, 'enforced'),
      },
    )
  } else if (status === 'trial') {
    actions.push({
      key: 'enforced',
      label: '转为强制',
      primary: true,
      confirm: '将试用转为强制？',
      run: () => setGuideStatus(record.id, 'enforced'),
    })
  }
  actions.push({
    key: 'del',
    label: '删除',
    danger: true,
    confirm: '删除？',
    run: () => delGuide(record.id),
  })
  return actions
}

function sensorActions(record: any): RowAction[] {
  const actions: RowAction[] = [
    { key: 'detail', label: '详情', run: () => viewSensor(record) },
    { key: 'edit', label: '编辑', run: () => editSensor(record) },
  ]
  const status = record.status || 'draft'
  if (status === 'draft') {
    actions.push(
      {
        key: 'trial',
        label: '转试用',
        confirm: '转为试用？',
        run: () => setSensorStatus(record.id, 'trial'),
      },
      {
        key: 'enforced',
        label: '转强制',
        primary: true,
        confirm: '转为强制？',
        run: () => setSensorStatus(record.id, 'enforced'),
      },
    )
  } else if (status === 'trial') {
    actions.push({
      key: 'enforced',
      label: '转为强制',
      primary: true,
      confirm: '将试用转为强制？',
      run: () => setSensorStatus(record.id, 'enforced'),
    })
  }
  actions.push({
    key: 'del',
    label: '删除',
    danger: true,
    confirm: '删除？',
    run: () => delSensor(record.id),
  })
  return actions
}

function guideActionSplit(record: any) {
  return splitRowActions(guideActions(record))
}

function sensorActionSplit(record: any) {
  return splitRowActions(sensorActions(record))
}

async function load() {
  const [g, s] = await Promise.all([api.get('/org/guides'), api.get('/org/sensors')])
  guides.value = g.data
  sensors.value = s.data
}

function resetGithubState() {
  githubRepo.value = ''
  githubRef.value = ''
  githubSkills.value = []
  selectedSkillPaths.value = []
  listingSkills.value = false
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
  if (pkgPreviewUrl.value) {
    URL.revokeObjectURL(pkgPreviewUrl.value)
    pkgPreviewUrl.value = ''
  }
}

function selectKind(kind: string) {
  guideForm.kind = kind
  if (kind !== 'guide.skill' && contentSource.value === 'github') {
    contentSource.value = 'markdown'
    resetGithubState()
  }
}

watch(
  () => guideForm.kind,
  (kind) => {
    if (kind !== 'guide.skill' && contentSource.value === 'github') {
      contentSource.value = 'markdown'
      resetGithubState()
    }
  },
)

function resetGuideForm() {
  Object.assign(guideForm, {
    id: null,
    asset_id: '',
    kind: 'guide.skill',
    version: '1.0.0',
    status: 'draft',
    content: '',
    content_mode: 'markdown',
    package_path: '',
    package_files_json: '[]',
  })
  contentSource.value = 'markdown'
  uploadMode.value = 'file'
  uploadFileList.value = []
  resetGithubState()
  resetPkgPreview()
}

function openCreateGuide() {
  resetGuideForm()
  guideModalMode.value = 'create'
  openGuide.value = true
}

function fillGuideForm(record: any) {
  Object.assign(guideForm, {
    id: record.id,
    asset_id: record.asset_id,
    kind: record.kind || 'guide.skill',
    version: record.version || '1.0.0',
    status: record.status || 'draft',
    content: record.content || '',
    content_mode: record.content_mode || 'markdown',
    package_path: record.package_path || '',
    package_files_json: record.package_files_json || '[]',
  })
  uploadFileList.value = []
  resetGithubState()
  resetPkgPreview()
  contentSource.value = 'view'
  void loadPackagePreview(record.id)
}

function viewGuide(record: any) {
  guideModalMode.value = 'view'
  fillGuideForm(record)
  openGuide.value = true
}

function editGuide(record: any) {
  guideModalMode.value = 'edit'
  fillGuideForm(record)
  openGuide.value = true
}

function onFilePick(ev: Event) {
  const input = ev.target as HTMLInputElement
  const f = input.files?.[0]
  uploadFileList.value = f ? [{ file: f, rel: f.name, size: f.size }] : []
}

function onFolderPick(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files || [])
  uploadFileList.value = files.map((f) => ({
    file: f,
    rel: (f as any).webkitRelativePath || f.name,
    size: f.size,
  }))
}

async function listGithubSkills() {
  if (!githubRepo.value.trim()) {
    message.warning('请填写 GitHub 仓库（owner/repo）')
    return
  }
  listingSkills.value = true
  selectedSkillPaths.value = []
  githubSkills.value = []
  try {
    const { data } = await api.get('/org/guides/github-skills', {
      params: {
        repo: githubRepo.value.trim(),
        ref: githubRef.value.trim() || undefined,
      },
    })
    githubSkills.value = data.skills || []
    if (!githubSkills.value.length) {
      message.info('未找到含 SKILL.md 的目录（已排除任务 skill 壳）')
    }
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '列出 Skills 失败')
  } finally {
    listingSkills.value = false
  }
}

function onSkillsSelect(paths: string[]) {
  if (!paths?.length) return
  if (!guideForm.asset_id?.trim() && paths.length === 1) {
    const skill = githubSkills.value.find((s) => s.path === paths[0])
    if (skill) guideForm.asset_id = skill.id
  }
}

async function loadPackagePreview(guideId: number) {
  pkgLoading.value = true
  try {
    const { data } = await api.get(`/org/guides/${guideId}/package`)
    pkgFiles.value = data.files || []
    if (data.content && !guideForm.content) guideForm.content = data.content
    if (pkgFiles.value.length === 1) {
      await previewPackageFile(pkgFiles.value[0])
    } else if (!pkgFiles.value.length && guideForm.content) {
      pkgPreviewKind.value = 'md'
      try {
        pkgPreviewHtml.value = renderMarkdownDocument(guideForm.content || '')
      } catch {
        pkgPreviewKind.value = 'text'
        pkgPreviewText.value = guideForm.content || ''
      }
    }
  } catch {
    pkgFiles.value = []
    if (guideForm.content) {
      pkgPreviewKind.value = 'md'
      try {
        pkgPreviewHtml.value = renderMarkdownDocument(guideForm.content || '')
      } catch {
        pkgPreviewKind.value = 'text'
        pkgPreviewText.value = guideForm.content || ''
      }
    }
  } finally {
    pkgLoading.value = false
  }
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

async function previewPackageFile(relPath: string) {
  if (!guideForm.id) return
  pkgPreviewPath.value = relPath
  pkgPreviewLoading.value = true
  if (pkgPreviewUrl.value) {
    URL.revokeObjectURL(pkgPreviewUrl.value)
    pkgPreviewUrl.value = ''
  }
  pkgPreviewHtml.value = ''
  pkgPreviewText.value = ''
  try {
    const ext = fileExt(relPath)
    const res = await api.get(`/org/guides/${guideForm.id}/package-file`, {
      params: { path: relPath },
      responseType: 'arraybuffer',
    })
    const buf = res.data as ArrayBuffer
    if (ext === 'md' || ext === 'markdown' || ext === 'txt' || ext === 'json' || ext === 'yaml' || ext === 'yml') {
      const text = new TextDecoder('utf-8').decode(buf)
      if (ext === 'md' || ext === 'markdown') {
        pkgPreviewKind.value = 'md'
        pkgPreviewHtml.value = renderMarkdownDocument(text)
      } else {
        pkgPreviewKind.value = 'text'
        pkgPreviewText.value = text
      }
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
    message.error(e?.response?.data?.detail || '预览失败')
    pkgPreviewKind.value = 'other'
  } finally {
    pkgPreviewLoading.value = false
  }
}

async function saveGuide() {
  if (guideModalMode.value === 'view') {
    openGuide.value = false
    return
  }
  if (contentSource.value === 'view') {
    openGuide.value = false
    return
  }
  if (contentSource.value === 'github') {
    if (!githubRepo.value.trim()) {
      message.warning('请填写 GitHub 仓库')
      return Promise.reject()
    }
    if (!selectedSkillPaths.value.length) {
      message.warning('请先列出并选择要安装的 Skill')
      return Promise.reject()
    }
  } else if (!guideForm.asset_id?.trim()) {
    message.warning('请填写 Asset ID')
    return Promise.reject()
  }
  savingGuide.value = true
  try {
    if (contentSource.value === 'github') {
      const skills = selectedSkillPaths.value.map((path) => {
        const sk = githubSkills.value.find((s) => s.path === path)
        return {
          skill_path: path,
          asset_id:
            selectedSkillPaths.value.length === 1 && guideForm.asset_id?.trim()
              ? guideForm.asset_id.trim()
              : sk?.id,
        }
      })
      const { data } = await api.post('/org/guides/from-github-batch', {
        repo: githubRepo.value.trim(),
        skills,
        version: guideForm.version || '1.0.0',
        status: guideForm.status || 'draft',
        ref: githubRef.value.trim() || undefined,
      })
      const nOk = data.created?.length || 0
      const nSkip = data.skipped?.length || 0
      const nErr = data.errors?.length || 0
      message.success(`安装完成：成功 ${nOk} / 跳过 ${nSkip} / 失败 ${nErr}`)
      if (nErr && data.errors?.[0]?.detail) {
        message.warning(String(data.errors[0].detail))
      }
    } else if (contentSource.value === 'upload') {
      if (!uploadFileList.value.length && !guideForm.package_path) {
        message.warning('请选择要上传的文件或文件夹')
        return Promise.reject()
      }
      if (uploadFileList.value.length) {
        const fd = new FormData()
        fd.append('asset_id', guideForm.asset_id.trim())
        fd.append('kind', guideForm.kind)
        fd.append('stage', '')
        fd.append('task', '')
        fd.append('version', guideForm.version || '1.0.0')
        fd.append('status', guideForm.status || 'draft')
        if (guideForm.id) fd.append('guide_id', String(guideForm.id))
        for (const item of uploadFileList.value) {
          fd.append('files', item.file)
          fd.append('relative_paths', item.rel)
        }
        await api.post('/org/guides/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } else {
        message.info('未选择新文件，保留原有包')
        openGuide.value = false
        return
      }
    } else {
      const payload = {
        asset_id: guideForm.asset_id.trim(),
        kind: guideForm.kind,
        stage: '',
        task: '',
        version: guideForm.version,
        status: guideForm.status,
        content: guideForm.content,
        content_mode: contentSource.value === 'text' ? 'text' : 'markdown',
      }
      if (guideForm.id) await api.put(`/org/guides/${guideForm.id}`, payload)
      else await api.post('/org/guides', payload)
    }
    if (contentSource.value !== 'github') message.success('已保存')
    openGuide.value = false
    resetGuideForm()
    await load()
  } catch (e: any) {
    if (e) message.error(e?.response?.data?.detail || '保存失败')
    return Promise.reject(e)
  } finally {
    savingGuide.value = false
  }
}

async function delGuide(id: number) {
  await api.delete(`/org/guides/${id}`)
  await load()
}

async function setGuideStatus(id: number, status: 'trial' | 'enforced') {
  await api.patch(`/org/guides/${id}/status`, { status })
  message.success(status === 'trial' ? '已转为试用' : '已转为强制')
  await load()
}

async function setSensorStatus(id: number, status: 'trial' | 'enforced') {
  await api.patch(`/org/sensors/${id}/status`, { status })
  message.success(status === 'trial' ? '已转为试用' : '已转为强制')
  await load()
}

function openCreateSensor() {
  resetSensorForm()
  sensorModalMode.value = 'create'
  sensorForm.content = templateFor('rules')
  sensorForm.triggers = [...DEFAULT_TRIGGERS]
  openSensor.value = true
}

function fillSensorForm(record: any) {
  const ct = normalizeCheckType(record.check_type)
  Object.assign(sensorForm, {
    id: record.id,
    asset_id: record.asset_id,
    kind: record.kind || 'sensor.rule',
    version: record.version || '1.0.0',
    status: record.status || 'draft',
    check_type: ct,
    content: leanSensorContent(record.content || templateFor(ct)),
    config_json: record.config_json || '{}',
    triggers: normalizeTriggers(record.triggers),
    scope: normalizeScope(record.scope),
  })
}

function viewSensor(record: any) {
  sensorModalMode.value = 'view'
  fillSensorForm(record)
  openSensor.value = true
}

function editSensor(record: any) {
  sensorModalMode.value = 'edit'
  fillSensorForm(record)
  openSensor.value = true
}

function resetSensorForm() {
  Object.assign(sensorForm, {
    id: null,
    asset_id: '',
    kind: 'sensor.rule',
    version: '1.0.0',
    status: 'draft',
    check_type: 'rules',
    content: '',
    config_json: '{}',
    triggers: [...DEFAULT_TRIGGERS],
    scope: [],
  })
}

function onSensorCheckTypeChange(val: string) {
  const ct = normalizeCheckType(val)
  sensorForm.check_type = ct
  if (isSensorTemplateContent(sensorForm.content)) {
    sensorForm.content = templateFor(ct)
  }
  if (ct === 'human' && !sensorForm.triggers.includes('hook:beforeSubmit')) {
    sensorForm.triggers = normalizeTriggers(['hook:beforeSubmit', ...sensorForm.triggers])
  }
}

function insertInlineFn(expr: string) {
  sensorForm.check_type = 'inline'
  sensorForm.content = insertExprIntoContent(sensorForm.content || templateFor('inline'), expr)
}

async function saveSensor() {
  if (sensorModalMode.value === 'view') {
    openSensor.value = false
    return
  }
  if (!sensorForm.asset_id?.trim()) {
    message.warning('请填写 Asset ID')
    return Promise.reject()
  }
  const ct = normalizeCheckType(sensorForm.check_type)
  const payload = {
    asset_id: sensorForm.asset_id,
    kind: ct === 'human' ? 'sensor.human' : sensorForm.kind,
    stage: '',
    task: '',
    version: sensorForm.version,
    status: sensorForm.status,
    check_type: ct,
    content: leanSensorContent(sensorForm.content),
    config_json: sensorForm.config_json,
    triggers: normalizeTriggers(sensorForm.triggers),
    scope: normalizeScope(sensorForm.scope),
  }
  if (sensorForm.id) await api.put(`/org/sensors/${sensorForm.id}`, payload)
  else await api.post('/org/sensors', payload)
  message.success('已保存')
  openSensor.value = false
  resetSensorForm()
  await load()
}

async function delSensor(id: number) {
  await api.delete(`/org/sensors/${id}`)
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
.kind-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.kind-card {
  text-align: left;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  padding: 10px 12px;
  cursor: pointer;
  min-height: 118px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.kind-card.disabled,
.kind-card:disabled {
  cursor: default;
  opacity: 0.9;
  pointer-events: none;
}
.kind-card:hover {
  border-color: #91caff;
}
.kind-card.active {
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.15);
}
.kind-badge {
  display: inline-block;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  margin-bottom: 6px;
  color: #334155;
  background: #f1f5f9;
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
  font-weight: 600;
  font-size: 13px;
  color: #0f172a;
  margin-bottom: 4px;
}
.kind-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #16a34a;
  margin-bottom: 4px;
}
.kind-desc {
  font-size: 12px;
  color: #64748b;
  line-height: 1.35;
}
.md-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  min-height: 320px;
}
.md-editor {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
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
.file-list {
  margin: 10px 0 0;
  padding-left: 18px;
  max-height: 160px;
  overflow: auto;
  font-size: 12px;
}
.muted {
  color: #94a3b8;
}
.row-actions {
  display: inline-flex;
  align-items: center;
  flex-wrap: nowrap;
}
.more-btn {
  padding: 0 4px;
  height: 24px;
  margin-left: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.more-icon {
  width: 16px;
  height: 16px;
  display: block;
  object-fit: contain;
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
.inline-fns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.fn-tag {
  cursor: pointer;
}
.fn-desc {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}
.content-label {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.help-btn {
  padding: 0 4px;
  height: auto;
  line-height: 1;
  font-weight: 600;
  font-size: 14px;
}
.sensor-help-title {
  font-weight: 600;
  margin-bottom: 6px;
}
.sensor-help-sub {
  font-weight: 600;
  margin: 10px 0 4px;
  font-size: 12px;
}
.sensor-help-example {
  margin: 0;
  padding: 8px 10px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  max-height: 280px;
  overflow: auto;
}
.sensor-help p {
  margin: 0;
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
}
.triggers-cell {
  font-size: 12px;
  color: #64748b;
}
@media (max-width: 960px) {
  .kind-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .md-split {
    grid-template-columns: 1fr;
  }
}
</style>
