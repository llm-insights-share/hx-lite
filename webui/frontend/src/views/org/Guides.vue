<template>
  <div>
    <div class="head">
      <h2>Guide & Check</h2>
      <div class="head-actions">
        <a-select
          v-if="activeTab === 'g'"
          v-model:value="kindFilter"
          allow-clear
          placeholder="全部 Kind"
          style="width: 200px"
          :options="kindFilterOpts"
          show-search
          option-filter-prop="label"
        />
        <a-input-search
          v-model:value="listFilter"
          allow-clear
          :placeholder="listFilterPlaceholder"
          style="width: 280px"
        />
        <a-button type="primary" @click="openCreateGuide">+ Guide</a-button>
        <a-button @click="openCreateSensor">+ Check</a-button>
      </div>
    </div>
    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="g" tab="Guides">
        <a-table :dataSource="filteredGuides" :columns="gCols" row-key="id" :pagination="{ pageSize: 10 }">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'asset'">
              <div class="asset-id">{{ record.asset_id }}</div>
              <div class="asset-name">{{ record.name || '—' }}</div>
            </template>
            <template v-else-if="column.key === 'kind'">
              <span class="kind-cell" :class="guideKindCategory(record.kind)">
                <component :is="guideKindIcon(record.kind)" class="kind-icon" />
                <span>{{ record.kind }}</span>
              </span>
            </template>
            <template v-else-if="column.key === 'mode'">
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
      <a-tab-pane key="s" tab="Checks">
        <a-table :dataSource="filteredSensors" :columns="sCols" row-key="id" :pagination="{ pageSize: 10 }">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'asset'">
              <div class="asset-id">{{ record.asset_id }}</div>
              <div class="asset-name">{{ record.name || '—' }}</div>
            </template>
            <template v-else-if="column.key === 'check_type'">
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
        <a-form-item label="名称" required>
          <a-input
            v-model:value="guideForm.name"
            :maxlength="20"
            show-count
            placeholder="不超过 20 字"
            :disabled="guideReadonly"
          />
        </a-form-item>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="来源">
              <a-input
                v-model:value="guideForm.source"
                :maxlength="16"
                show-count
                placeholder="不超过 16 字"
                :disabled="guideReadonly"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Version">
              <a-input v-model:value="guideForm.version" :disabled="guideReadonly" />
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="Kind">
          <a-alert
            v-if="legacyKind"
            type="warning"
            show-icon
            style="margin-bottom: 8px"
            :message="`当前为遗留类型 ${legacyKind}，可改选下方类型之一`"
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
              <div class="kind-title">
                <component :is="k.icon" class="kind-card-icon" :class="k.category" />
                <span>{{ k.title }}</span>
              </div>
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
        message="human：通过前须先上传该任务产物，再创建并批准 human-check 工单；触发时仅提醒「尚未批准」，不做文件/脚本检查；beforeSubmit 不阻断提交。"
      />
      <a-form layout="vertical">
        <a-form-item label="Asset ID">
          <a-input v-model:value="sensorForm.asset_id" :disabled="sensorReadonly || !!sensorForm.id" />
        </a-form-item>
        <a-form-item label="名称" required>
          <a-input
            v-model:value="sensorForm.name"
            :maxlength="20"
            show-count
            placeholder="不超过 20 字"
            :disabled="sensorReadonly"
          />
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

    <GuideViewModal v-model:open="guideViewOpen" :record="guideViewRecord" />
    <SensorViewModal v-model:open="sensorViewOpen" :record="sensorViewRecord" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Modal, message } from 'ant-design-vue'
import DOMPurify from 'dompurify'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { api } from '../../api'
import GuideViewModal from '../../components/org/GuideViewModal.vue'
import SensorViewModal from '../../components/org/SensorViewModal.vue'
import moreIcon from '../../assets/more.png'
import {
  GUIDE_KIND_CARDS,
  guideKindCategory,
  guideKindIcon,
  toGuideKindCards,
  type GuideKindCard,
} from '../../utils/guideKind'
import { renderMarkdownDocument } from '../../utils/markdownDoc'
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
const activeTab = ref('g')
const listFilter = ref('')
const kindFilter = ref<string | undefined>(undefined)
const openGuide = ref(false)
const openSensor = ref(false)
const guideViewOpen = ref(false)
const guideViewRecord = ref<any | null>(null)
const sensorViewOpen = ref(false)
const sensorViewRecord = ref<any | null>(null)
const guideModalMode = ref<'create' | 'edit'>('create')
const sensorModalMode = ref<'create' | 'edit'>('create')
const savingGuide = ref(false)
const contentSource = ref<'view' | 'text' | 'markdown' | 'upload' | 'github'>('markdown')
const guideReadonly = computed(() => false)
const sensorReadonly = computed(() => false)
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
const pkgPreviewKind = ref<'md' | 'text' | 'pdf' | 'html' | 'table' | 'image' | 'code' | 'other'>('other')
const pkgPreviewHtml = ref('')
const pkgPreviewText = ref('')
const pkgPreviewUrl = ref('')
const pkgPreviewLang = ref('')

const githubSkillOpts = computed(() =>
  githubSkills.value.map((s) => ({
    value: s.path,
    label: s.path && s.path !== '.' ? `${s.id}  (${s.path})` : s.id,
  })),
)

const listFilterPlaceholder = computed(() =>
  activeTab.value === 's' ? '按 Check ID 或名称筛选' : '按 Guide ID 或名称筛选',
)

const kindFilterOpts = computed(() =>
  kindCards.value.map((k) => ({ value: k.value, label: k.title })),
)

function matchAssetFilter(record: any, q: string) {
  if (!q) return true
  const id = String(record?.asset_id || '').toLowerCase()
  const name = String(record?.name || '').toLowerCase()
  return id.includes(q) || name.includes(q)
}

const filteredGuides = computed(() => {
  const q = listFilter.value.trim().toLowerCase()
  const kind = kindFilter.value
  return guides.value.filter((g) => {
    if (kind && g.kind !== kind) return false
    return matchAssetFilter(g, q)
  })
})

const filteredSensors = computed(() => {
  const q = listFilter.value.trim().toLowerCase()
  if (!q) return sensors.value
  return sensors.value.filter((s) => matchAssetFilter(s, q))
})

const isMultiFilePackage = computed(() => {
  // Package mode: always use left tree + right preview when there is any file inventory.
  if ((guideForm.content_mode || '') === 'package' && pkgFiles.value.length > 0) return true
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

const kindCards = ref<GuideKindCard[]>([...GUIDE_KIND_CARDS])

const guideForm = reactive<any>({
  id: null,
  asset_id: '',
  name: '',
  kind: 'guide.skill',
  version: '1.0.0',
  status: 'draft',
  source: '',
  content: '',
  content_mode: 'markdown',
  package_path: '',
  package_files_json: '[]',
})

const sensorForm = reactive({
  id: null as number | null,
  asset_id: '',
  name: '',
  kind: 'sensor.rule',
  version: '1.0.0',
  status: 'draft',
  check_type: 'rules',
  content: '',
  config_json: '{}',
  triggers: [...DEFAULT_TRIGGERS] as string[],
  scope: [] as string[],
})

const guideModalTitle = computed(() => (guideForm.id ? '编辑 Guide' : '新建 Guide'))
const sensorModalTitle = computed(() => (sensorForm.id ? '编辑 Check' : '新建 Check'))

const cardKindSet = computed(() => new Set(kindCards.value.map((k) => k.value)))
const legacyKind = computed(() =>
  guideForm.kind && !cardKindSet.value.has(guideForm.kind) ? guideForm.kind : '',
)

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

const mdPreviewHtml = computed(() => {
  try {
    return renderMarkdownDocument(guideForm.content || '')
  } catch {
    return ''
  }
})

const gCols = [
  { title: 'ID', key: 'asset' },
  { title: 'Kind', key: 'kind', width: 180 },
  { title: 'Mode', key: 'mode', width: 100 },
  { title: 'Status', key: 'status', width: 90 },
  { title: '操作', key: 'action', width: 200 },
]
const sCols = [
  { title: 'ID', key: 'asset' },
  { title: 'Kind', dataIndex: 'kind' },
  { title: 'Check Type', key: 'check_type', dataIndex: 'check_type' },
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
  pkgPreviewLang.value = ''
  if (pkgPreviewUrl.value) {
    URL.revokeObjectURL(pkgPreviewUrl.value)
    pkgPreviewUrl.value = ''
  }
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'])
const CODE_EXTS: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', java: 'java', go: 'go', rs: 'rust', rb: 'ruby',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
  css: 'css', scss: 'scss', less: 'less',
  html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
  sql: 'sql', sh: 'shell', bash: 'shell', zsh: 'shell',
  vue: 'vue', svelte: 'svelte', swift: 'swift', kt: 'kotlin',
  dart: 'dart', lua: 'lua', r: 'r', php: 'php', toml: 'toml',
  ini: 'ini', dockerfile: 'dockerfile', makefile: 'makefile',
}

function extMimeType(ext: string): string {
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
    bmp: 'image/bmp', ico: 'image/x-icon',
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
  return slides
    .map((s) => `--- Slide ${s.idx} ---\n${s.text || '(空白幻灯片)'}`)
    .join('\n\n')
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
    name: '',
    kind: 'guide.skill',
    version: '1.0.0',
    status: 'draft',
    source: '',
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

async function openCreateGuide() {
  resetGuideForm()
  guideModalMode.value = 'create'
  await loadGuideKinds()
  openGuide.value = true
}

function fillGuideForm(record: any) {
  Object.assign(guideForm, {
    id: record.id,
    asset_id: record.asset_id,
    name: record.name || (record.asset_id || '').slice(0, 20),
    kind: record.kind || 'guide.skill',
    version: record.version || '1.0.0',
    status: record.status || 'draft',
    source: record.source || '',
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
  guideViewRecord.value = record
  guideViewOpen.value = true
}

function editGuide(record: any) {
  guideModalMode.value = 'edit'
  fillGuideForm(record)
  void loadGuideKinds().then(() => {
    openGuide.value = true
  })
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
  pkgPreviewPath.value = ''
  pkgSelectedKeys.value = []
  try {
    const { data } = await api.get(`/org/guides/${guideId}/package`)
    pkgFiles.value = data.files || []
    if (data.content && !guideForm.content) guideForm.content = data.content
    if (pkgFiles.value.length) {
      const skill =
        pkgFiles.value.find((f) => f.replace(/\\/g, '/').split('/').pop()?.toLowerCase() === 'skill.md') ||
        pkgFiles.value[0]
      pkgSelectedKeys.value = [skill]
      await previewPackageFile(skill)
    } else if (guideForm.content) {
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
  pkgPreviewLang.value = ''
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

    // Markdown
    if (ext === 'md' || ext === 'markdown') {
      const text = new TextDecoder('utf-8').decode(buf)
      pkgPreviewKind.value = 'md'
      pkgPreviewHtml.value = renderMarkdownDocument(text)
    }
    // Plain text / config
    else if (['txt', 'json', 'yaml', 'yml', 'csv', 'tsv', 'log', 'env'].includes(ext)) {
      pkgPreviewKind.value = 'text'
      pkgPreviewText.value = new TextDecoder('utf-8').decode(buf)
    }
    // Images
    else if (IMAGE_EXTS.has(ext)) {
      pkgPreviewKind.value = 'image'
      const blob = new Blob([buf], { type: extMimeType(ext) })
      pkgPreviewUrl.value = URL.createObjectURL(blob)
    }
    // PDF
    else if (ext === 'pdf') {
      pkgPreviewKind.value = 'pdf'
      const blob = new Blob([buf], { type: 'application/pdf' })
      pkgPreviewUrl.value = URL.createObjectURL(blob)
    }
    // Word
    else if (ext === 'docx') {
      const result = await mammoth.convertToHtml({ arrayBuffer: buf })
      pkgPreviewKind.value = 'html'
      pkgPreviewHtml.value = DOMPurify.sanitize(result.value || '')
    }
    // Excel
    else if (ext === 'xlsx' || ext === 'xls') {
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const html = XLSX.utils.sheet_to_html(sheet)
      pkgPreviewKind.value = 'table'
      pkgPreviewHtml.value = DOMPurify.sanitize(html)
    }
    // PowerPoint
    else if (ext === 'pptx') {
      const text = await extractPptxText(buf)
      pkgPreviewKind.value = 'text'
      pkgPreviewText.value = text || '(无法提取幻灯片文本)'
    }
    // Code files with language hint
    else if (ext in CODE_EXTS) {
      const text = new TextDecoder('utf-8').decode(buf)
      pkgPreviewKind.value = 'code'
      pkgPreviewLang.value = CODE_EXTS[ext]
      pkgPreviewText.value = text
    }
    // Fallback: try text, else binary
    else {
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

async function saveGuide() {
  // contentSource === 'view' means preview tab; still allow saving name/meta in edit mode
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
  const guideName = (guideForm.name || '').trim() || guideForm.asset_id.trim().slice(0, 20)
  if (guideName.length > 20) {
    message.warning('名称不能超过 20 个字')
    return Promise.reject()
  }
  const guideSource = (guideForm.source || '').trim()
  if (guideSource.length > 16) {
    message.warning('来源不能超过 16 个字')
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
        fd.append('name', guideName)
        fd.append('kind', guideForm.kind)
        fd.append('stage', '')
        fd.append('task', '')
        fd.append('version', guideForm.version || '1.0.0')
        fd.append('status', guideForm.status || 'draft')
        fd.append('source', guideSource)
        if (guideForm.id) fd.append('guide_id', String(guideForm.id))
        for (const item of uploadFileList.value) {
          fd.append('files', item.file)
          fd.append('relative_paths', item.rel)
        }
        await api.post('/org/guides/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      } else if (guideForm.id) {
        // keep package, still update name/meta
        const payload = {
          asset_id: guideForm.asset_id.trim(),
          name: guideName,
          kind: guideForm.kind,
          stage: '',
          task: '',
          version: guideForm.version,
          status: guideForm.status,
          source: guideSource,
          content: guideForm.content,
          content_mode: guideForm.content_mode || 'package',
        }
        await api.put(`/org/guides/${guideForm.id}`, payload)
      } else {
        message.info('未选择新文件，保留原有包')
        openGuide.value = false
        return
      }
    } else {
      const contentMode =
        contentSource.value === 'text'
          ? 'text'
          : contentSource.value === 'markdown'
            ? 'markdown'
            : guideForm.content_mode || (guideForm.package_path ? 'package' : 'markdown')
      const payload = {
        asset_id: guideForm.asset_id.trim(),
        name: guideName,
        kind: guideForm.kind,
        stage: '',
        task: '',
        version: guideForm.version,
        status: guideForm.status,
        source: guideSource,
        content: guideForm.content,
        content_mode: contentMode,
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
    name: record.name || (record.asset_id || '').slice(0, 20),
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
  sensorViewRecord.value = record
  sensorViewOpen.value = true
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
    name: '',
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
  if (!sensorForm.asset_id?.trim()) {
    message.warning('请填写 Asset ID')
    return Promise.reject()
  }
  const sensorName = (sensorForm.name || '').trim() || sensorForm.asset_id.trim().slice(0, 20)
  if (sensorName.length > 20) {
    message.warning('名称不能超过 20 个字')
    return Promise.reject()
  }
  const ct = normalizeCheckType(sensorForm.check_type)
  const payload = {
    asset_id: sensorForm.asset_id,
    name: sensorName,
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

onMounted(async () => {
  await loadGuideKinds()
  await load()
})
</script>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.asset-id {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.88);
  line-height: 1.35;
}
.asset-name {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.3;
  margin-top: 2px;
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
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 13px;
  color: #0f172a;
  margin-bottom: 4px;
}
.kind-card-icon {
  font-size: 16px;
  flex-shrink: 0;
}
.kind-card-icon.computational {
  color: #0e7490;
}
.kind-card-icon.inferential {
  color: #6d28d9;
}
.kind-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.kind-icon {
  font-size: 14px;
  color: #64748b;
}
.kind-cell.computational .kind-icon {
  color: #0e7490;
}
.kind-cell.inferential .kind-icon {
  color: #6d28d9;
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
