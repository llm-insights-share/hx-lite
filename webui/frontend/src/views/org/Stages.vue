<template>
  <div>
    <div class="head">
      <h2>Stage & Task</h2>
      <div class="filters">
        <a-select v-model:value="profileKey" style="width: 160px" @change="load">
          <a-select-option value="*">所有</a-select-option>
          <a-select-option v-for="p in profiles" :key="p.key" :value="p.key">{{ p.key }}</a-select-option>
        </a-select>
        <a-select v-model:value="stage" style="width: 120px; margin-left: 8px" allow-clear placeholder="Stage" @change="load">
          <a-select-option v-for="s in stages" :key="s" :value="s">{{ s }}</a-select-option>
        </a-select>
        <a-button type="primary" style="margin-left: 8px" @click="openCreate">+ 新建 Task</a-button>
      </div>
    </div>
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 12px"
      message="任务直接绑定 Guide / Check。人工审查：把 check_type=human 的 Check（如 prd-approved）绑到目标 Task。"
    />
    <a-table :dataSource="rows" :columns="columns" row-key="id" :pagination="{ pageSize: 12 }">
      <template #bodyCell="{ column, record, text }">
        <template v-if="column.key === 'required'">
          <CheckCircleFilled v-if="record.required" class="req-yes" title="必须" />
          <MinusCircleOutlined v-else class="req-no" title="非必须" />
        </template>
        <template v-else-if="column.key === 'guides'">
          <span
            class="guides-cell"
            @dragover.prevent="onGuideDragOver($event, record)"
            @drop.prevent="onGuideDrop($event, record)"
          >
            <a-tag
              v-for="(g, gIdx) in record.guides"
              :key="g"
              draggable="true"
              class="guide-tag guide-tag-clickable"
              :class="{
                'guide-tag-dragging': isGuideDragging(record.id, gIdx),
                'guide-tag-drop-target': isGuideDropTarget(record.id, gIdx),
              }"
              :title="'拖动排序 · 点击查看'"
              @dragstart="onGuideDragStart($event, record, gIdx)"
              @dragend="onGuideDragEnd"
              @dragover.prevent="onGuideTagDragOver($event, record, gIdx)"
              @dragleave="onGuideTagDragLeave($event, record, gIdx)"
              @drop.prevent="onGuideDrop($event, record, gIdx)"
              @click.stop="onGuideTagClick(g)"
            >
              <component
                :is="guideKindIcon(guideKindById(g))"
                class="guide-tag-icon"
                :class="guideKindCategory(guideKindById(g))"
              />
              {{ g }}
            </a-tag>
          </span>
        </template>
        <template v-else-if="column.key === 'sensors'">
          <a-tag
            v-for="s in record.sensors || []"
            :key="s"
            class="sensor-tag-clickable"
            :color="isHumanSensor(s) ? 'purple' : 'processing'"
            @click.stop="openSensorDetail(s)"
          >
            {{ s }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-button size="small" @click="openEdit(record)">编辑</a-button>
          <a-popconfirm title="确认删除？" @confirm="remove(record.id)">
            <a-button danger size="small" style="margin-left: 6px">删除</a-button>
          </a-popconfirm>
        </template>
        <template v-else>{{ text }}</template>
      </template>
    </a-table>

    <a-modal
      v-model:open="open"
      :title="form.id ? '编辑 Task' : '新建 Task'"
      @ok="save"
      width="720px"
    >
      <a-form layout="vertical">
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="Profile">
              <a-input v-model:value="form.profile_key" :disabled="!!form.id" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Stage">
              <a-select
                v-model:value="form.stage"
                :options="stages.map((s) => ({ value: s, label: s }))"
              />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="Task ID">
          <a-input v-model:value="form.task_id" />
        </a-form-item>
        <a-form-item label="标题(中)"><a-input v-model:value="form.title_zh" /></a-form-item>
        <a-form-item label="Guide 资产">
          <a-select
            v-model:value="form.guides"
            mode="multiple"
            style="width: 100%"
            :options="guideOpts"
            placeholder="选择 Guide（可多选）"
            option-filter-prop="label"
            show-search
          />
        </a-form-item>
        <a-form-item label="Check 资产">
          <a-select
            v-model:value="form.sensors"
            mode="multiple"
            style="width: 100%"
            :options="sensorOpts"
            placeholder="直接绑定 Check；人工审查选 human 类型"
            option-filter-prop="label"
            show-search
          />
        </a-form-item>
        <a-form-item label="必须"><a-switch v-model:checked="form.required" /></a-form-item>
      </a-form>
    </a-modal>

    <GuideViewModal v-model:open="guideViewOpen" :record="guideViewRecord" />
    <SensorViewModal v-model:open="sensorViewOpen" :record="sensorViewRecord" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { CheckCircleFilled, MinusCircleOutlined } from '@ant-design/icons-vue'
import { api } from '../../api'
import GuideViewModal from '../../components/org/GuideViewModal.vue'
import SensorViewModal from '../../components/org/SensorViewModal.vue'
import { guideKindCategory, guideKindIcon } from '../../utils/guideKind'

const stages = ['req', 'arch', 'dev', 'test']
const profiles = ref<any[]>([])
const rows = ref<any[]>([])
const guides = ref<any[]>([])
const sensors = ref<any[]>([])
const profileKey = ref('*')
const stage = ref<string | undefined>()
const open = ref(false)
const form = reactive({
  id: null as number | null,
  profile_key: '*',
  stage: 'dev',
  task_id: '',
  title_zh: '',
  title_en: '',
  required: true,
  guides: [] as string[],
  sensors: [] as string[],
  enabled: true,
})

const guideOpts = computed(() =>
  guides.value.map((g) => ({
    value: g.asset_id,
    label: g.name ? `${g.asset_id} — ${g.name}` : `${g.asset_id} (${g.kind})`,
  })),
)

const guideKindMap = computed(() => {
  const m = new Map<string, string>()
  for (const g of guides.value) {
    if (g?.asset_id) m.set(g.asset_id, g.kind || 'guide.skill')
  }
  return m
})

function guideKindById(assetId: string) {
  return guideKindMap.value.get(assetId) || 'guide.skill'
}
const sensorOpts = computed(() =>
  sensors.value.map((s) => ({
    value: s.asset_id,
    label: s.name
      ? `${s.asset_id} — ${s.name}`
      : `${s.asset_id} · ${s.check_type || 'rules'}`,
  })),
)

const humanSensorIds = computed(() => {
  const ids = new Set<string>()
  for (const s of sensors.value) {
    if (s.check_type === 'human' || s.check_type === 'manual') ids.add(s.asset_id)
  }
  return ids
})

function isHumanSensor(assetId: string) {
  return humanSensorIds.value.has(assetId) || /approv|human|manual/i.test(assetId)
}

const guideViewOpen = ref(false)
const guideViewRecord = ref<any | null>(null)
const sensorViewOpen = ref(false)
const sensorViewRecord = ref<any | null>(null)

function openGuideDetail(assetId: string) {
  const record = guides.value.find((g) => g.asset_id === assetId)
  if (!record) {
    message.warning(`未找到 Guide：${assetId}`)
    return
  }
  guideViewRecord.value = record
  guideViewOpen.value = true
}

/** In-cell Guides reorder via HTML5 DnD; click still opens detail. */
const dragState = ref<{ rowId: number; fromIdx: number } | null>(null)
/** Index of the tag currently overlapped (insert-before target). */
const dropTarget = ref<{ rowId: number; toIdx: number } | null>(null)
const didDrag = ref(false)
const guidesSaving = ref(false)

function isGuideDragging(rowId: number, idx: number) {
  return !!dragState.value && dragState.value.rowId === rowId && dragState.value.fromIdx === idx
}

function isGuideDropTarget(rowId: number, idx: number) {
  if (!dragState.value || !dropTarget.value) return false
  if (dragState.value.rowId !== rowId || dropTarget.value.rowId !== rowId) return false
  if (dragState.value.fromIdx === idx) return false
  return dropTarget.value.toIdx === idx
}

function onGuideDragStart(e: DragEvent, record: any, fromIdx: number) {
  didDrag.value = true
  dragState.value = { rowId: record.id, fromIdx }
  dropTarget.value = null
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(fromIdx))
  }
}

function onGuideDragEnd() {
  dragState.value = null
  dropTarget.value = null
}

function onGuideDragOver(e: DragEvent, record: any) {
  if (!dragState.value || dragState.value.rowId !== record.id) return
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onGuideTagDragOver(e: DragEvent, record: any, toIdx: number) {
  onGuideDragOver(e, record)
  if (!dragState.value || dragState.value.rowId !== record.id) return
  if (dragState.value.fromIdx === toIdx) {
    dropTarget.value = null
    return
  }
  dropTarget.value = { rowId: record.id, toIdx }
}

function onGuideTagDragLeave(e: DragEvent, record: any, toIdx: number) {
  // Ignore leave into a child node of the same tag.
  const related = e.relatedTarget as Node | null
  const current = e.currentTarget as Node | null
  if (related && current && current.contains(related)) return
  if (dropTarget.value?.rowId === record.id && dropTarget.value?.toIdx === toIdx) {
    dropTarget.value = null
  }
}

function onGuideTagClick(assetId: string) {
  if (didDrag.value) {
    didDrag.value = false
    return
  }
  openGuideDetail(assetId)
}

/** Move item so it sits immediately before the overlapped target. */
function reorderGuidesBefore(list: string[], fromIdx: number, toIdx: number): string[] | null {
  if (fromIdx === toIdx || fromIdx < 0 || fromIdx >= list.length) return null
  if (toIdx < 0 || toIdx >= list.length) return null
  const next = [...list]
  const [moved] = next.splice(fromIdx, 1)
  let insertAt = toIdx
  if (fromIdx < toIdx) insertAt = toIdx - 1
  next.splice(insertAt, 0, moved)
  // No-op if order unchanged (e.g. already immediately before target).
  if (next.every((id, i) => id === list[i])) return null
  return next
}

async function onGuideDrop(_e: DragEvent, record: any, toIdx?: number) {
  const state = dragState.value
  const target = dropTarget.value
  dragState.value = null
  dropTarget.value = null
  if (!state || state.rowId !== record.id) return

  const list = [...(record.guides || [])] as string[]
  const fromIdx = state.fromIdx
  // Prefer the highlighted overlap target; fall back to drop tag index.
  const overlapIdx = target && target.rowId === record.id ? target.toIdx : toIdx
  if (typeof overlapIdx !== 'number') return

  const reordered = reorderGuidesBefore(list, fromIdx, overlapIdx)
  if (!reordered) return
  if (guidesSaving.value) return

  const prev = [...(record.guides || [])]
  record.guides = reordered

  guidesSaving.value = true
  try {
    await api.put(`/org/tasks/${record.id}`, {
      profile_key: record.profile_key,
      stage: record.stage,
      task_id: record.task_id,
      title_zh: record.title_zh || '',
      title_en: record.title_en || '',
      required: !!record.required,
      guides: reordered,
      sensors: [...(record.sensors || [])],
      enabled: record.enabled !== false,
    })
    message.success('Guides 顺序已保存')
  } catch (err: unknown) {
    record.guides = prev
    const msg = err instanceof Error ? err.message : String(err)
    message.error(`保存失败：${msg}`)
    await load()
  } finally {
    guidesSaving.value = false
  }
}

function openSensorDetail(assetId: string) {
  const record = sensors.value.find((s) => s.asset_id === assetId)
  if (!record) {
    message.warning(`未找到 Check：${assetId}`)
    return
  }
  sensorViewRecord.value = record
  sensorViewOpen.value = true
}

const columns = [
  { title: 'Stage', dataIndex: 'stage', width: 80 },
  { title: 'Task', dataIndex: 'task_id' },
  { title: '标题', dataIndex: 'title_zh' },
  { title: '必须', key: 'required', dataIndex: 'required', width: 72, align: 'center' },
  { title: 'Guides', key: 'guides' },
  { title: 'Checks', key: 'sensors' },
  { title: '操作', key: 'action', width: 150 },
]

async function loadAssets() {
  const [g, s] = await Promise.all([api.get('/org/guides'), api.get('/org/sensors')])
  guides.value = g.data
  sensors.value = s.data
}

async function load() {
  const params: any = { profile_key: profileKey.value }
  if (stage.value) params.stage = stage.value
  const { data } = await api.get('/org/tasks', { params })
  rows.value = data
}

function resetForm() {
  Object.assign(form, {
    id: null,
    profile_key: profileKey.value || '*',
    stage: stage.value || 'dev',
    task_id: '',
    title_zh: '',
    title_en: '',
    required: true,
    guides: [],
    sensors: [],
    enabled: true,
  })
}

function openCreate() {
  resetForm()
  open.value = true
}

function openEdit(record: any) {
  Object.assign(form, {
    id: record.id,
    profile_key: record.profile_key,
    stage: record.stage,
    task_id: record.task_id,
    title_zh: record.title_zh || '',
    title_en: record.title_en || '',
    required: !!record.required,
    guides: [...(record.guides || [])],
    sensors: [...(record.sensors || [])],
    enabled: record.enabled !== false,
  })
  open.value = true
}

async function save() {
  if (!form.task_id.trim()) {
    message.warning('请填写 Task ID')
    return
  }
  const payload = {
    profile_key: form.profile_key,
    stage: form.stage,
    task_id: form.task_id.trim(),
    title_zh: form.title_zh,
    title_en: form.title_en,
    required: form.required,
    guides: form.guides,
    sensors: form.sensors,
    enabled: form.enabled,
  }
  if (form.id) await api.put(`/org/tasks/${form.id}`, payload)
  else await api.post('/org/tasks', payload)
  message.success('已保存')
  open.value = false
  resetForm()
  await load()
}

async function remove(id: number) {
  await api.delete(`/org/tasks/${id}`)
  await load()
}

onMounted(async () => {
  const { data } = await api.get('/org/profiles')
  profiles.value = data
  await Promise.all([loadAssets(), load()])
})
</script>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.filters {
  display: flex;
  align-items: center;
}
.req-yes {
  color: #1677ff;
  font-size: 16px;
}
.req-no {
  color: #bfbfbf;
  font-size: 16px;
}
.muted {
  color: #94a3b8;
  font-size: 12px;
}
.guides-cell {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px 0;
  min-height: 22px;
  vertical-align: middle;
}
.guide-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
  cursor: grab;
  user-select: none;
}
.guide-tag:active {
  cursor: grabbing;
}
.guide-tag-dragging {
  opacity: 0.45;
}
.guide-tag-drop-target {
  background: #ffe4e6 !important;
  border-color: #fda4af !important;
  color: #9f1239 !important;
}
.sensor-tag-clickable {
  cursor: pointer;
}
.guide-tag-icon {
  font-size: 12px;
  color: #64748b;
}
.guide-tag-icon.computational {
  color: #0e7490;
}
.guide-tag-icon.inferential {
  color: #6d28d9;
}
</style>
