<template>
  <div>
    <h2>项目仪表盘</h2>
    <a-row :gutter="16" style="margin-top: 16px">
      <a-col :span="6" v-for="s in stats" :key="s.label">
        <a-card><a-statistic :title="s.label" :value="s.value" /></a-card>
      </a-col>
    </a-row>

    <a-row :gutter="16" style="margin-top: 16px">
      <a-col :span="12">
        <a-card class="usage-card" :bordered="true">
          <div class="usage-head usage-head-left">
            <div class="usage-label">用户总数</div>
            <div class="usage-total">{{ userTotal }}</div>
          </div>
          <div class="usage-chart-wrap">
            <svg
              class="usage-chart"
              viewBox="0 0 400 120"
              preserveAspectRatio="none"
              role="img"
              aria-label="近30天活跃用户走势"
            >
              <path v-if="userAreaPath" :d="userAreaPath" class="usage-area user-area" />
              <path v-if="userLinePath" :d="userLinePath" class="usage-line user-line" />
            </svg>
            <div v-if="!userSeriesHasData" class="usage-empty">近30天暂无数据</div>
            <div class="usage-axis">
              <span>{{ userSeries[0]?.date || '' }}</span>
              <span>{{ userSeries[userSeries.length - 1]?.date || '' }}</span>
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :span="12">
        <a-card class="usage-card" :bordered="true">
          <div class="usage-head usage-head-right">
            <div class="usage-label">任务总数</div>
            <div class="usage-total">{{ taskTotal }}</div>
          </div>
          <div class="usage-chart-wrap">
            <svg
              class="usage-chart"
              viewBox="0 0 400 120"
              preserveAspectRatio="none"
              role="img"
              aria-label="近30天执行任务走势"
            >
              <path v-if="taskAreaPath" :d="taskAreaPath" class="usage-area task-area" />
              <path v-if="taskLinePath" :d="taskLinePath" class="usage-line task-line" />
            </svg>
            <div v-if="!taskSeriesHasData" class="usage-empty">近30天暂无数据</div>
            <div class="usage-axis">
              <span>{{ taskSeries[0]?.date || '' }}</span>
              <span>{{ taskSeries[taskSeries.length - 1]?.date || '' }}</span>
            </div>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <a-card title="待处理工单" style="margin-top: 16px">
      <a-table :dataSource="data?.recent_tickets || []" :columns="cols" row-key="id" size="small" :pagination="false" />
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'

type SeriesPoint = { date: string; value: number }

const data = ref<any>(null)

const stats = computed(() => [
  { label: '项目数', value: data.value?.project_count ?? 0 },
  { label: '待审批工单', value: data.value?.pending_tickets ?? 0 },
  { label: '产物数', value: data.value?.artifact_count ?? 0 },
  { label: '产物版本总数', value: data.value?.version_count ?? 0 },
])

const userTotal = computed(() => data.value?.shell_run_user_count_total ?? 0)
const taskTotal = computed(() => data.value?.shell_run_count_total ?? 0)

const userSeries = computed<SeriesPoint[]>(() =>
  normalizeSeries(data.value?.shell_run_user_series_30d),
)
const taskSeries = computed<SeriesPoint[]>(() =>
  normalizeSeries(data.value?.shell_run_count_series_30d),
)

const userSeriesHasData = computed(() => userSeries.value.some((p) => (p.value || 0) > 0))
const taskSeriesHasData = computed(() => taskSeries.value.some((p) => (p.value || 0) > 0))

const userLinePath = computed(() => buildLinePath(userSeries.value))
const userAreaPath = computed(() => buildAreaPath(userSeries.value))
const taskLinePath = computed(() => buildLinePath(taskSeries.value))
const taskAreaPath = computed(() => buildAreaPath(taskSeries.value))

const cols = [
  { title: '工单号', dataIndex: 'ticket_no' },
  { title: '标题', dataIndex: 'title' },
  { title: '类型', dataIndex: 'ticket_type' },
  { title: '状态', dataIndex: 'status' },
]

function normalizeSeries(raw: unknown): SeriesPoint[] {
  if (!Array.isArray(raw) || !raw.length) {
    return Array.from({ length: 30 }, (_, i) => ({ date: '', value: 0 }))
  }
  return raw.map((p: any) => ({
    date: String(p?.date || ''),
    value: Number(p?.value) || 0,
  }))
}

function buildPoints(series: SeriesPoint[], width = 400, height = 120, padY = 8) {
  const n = series.length || 1
  const maxV = Math.max(...series.map((p) => p.value), 1)
  return series.map((p, i) => {
    const x = n === 1 ? width / 2 : (i / (n - 1)) * width
    const y = height - padY - (p.value / maxV) * (height - padY * 2)
    return { x, y }
  })
}

function buildLinePath(series: SeriesPoint[]): string {
  const pts = buildPoints(series)
  if (!pts.length) return ''
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
}

function buildAreaPath(series: SeriesPoint[]): string {
  const pts = buildPoints(series)
  if (!pts.length) return ''
  const height = 120
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  const last = pts[pts.length - 1]
  const first = pts[0]
  return `${line} L${last.x.toFixed(2)},${height} L${first.x.toFixed(2)},${height} Z`
}

onMounted(async () => {
  const { data: d } = await api.get('/project/dashboard')
  data.value = d
})
</script>

<style scoped>
.usage-card {
  min-height: 220px;
}
.usage-head {
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
}
.usage-head-left {
  align-items: flex-start;
}
.usage-head-right {
  align-items: flex-end;
  text-align: right;
}
.usage-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
  line-height: 1.4;
}
.usage-total {
  font-size: 28px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.88);
  line-height: 1.2;
}
.usage-chart-wrap {
  position: relative;
  margin-top: 4px;
}
.usage-chart {
  width: 100%;
  height: 120px;
  display: block;
}
.usage-area {
  opacity: 0.18;
}
.user-area {
  fill: #1677ff;
}
.task-area {
  fill: #13c2c2;
}
.usage-line {
  fill: none;
  stroke-width: 2;
}
.user-line {
  stroke: #1677ff;
}
.task-line {
  stroke: #13c2c2;
}
.usage-empty {
  position: absolute;
  inset: 0 0 22px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(0, 0, 0, 0.35);
  font-size: 12px;
  pointer-events: none;
}
.usage-axis {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.45);
}
</style>
