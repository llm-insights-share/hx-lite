<template>
  <div>
    <h2>仪表盘</h2>
    <a-row :gutter="16" style="margin-top: 16px">
      <a-col :span="4" v-for="s in stats" :key="s.label" style="flex: 1; max-width: 20%">
        <a-card>
          <a-statistic :title="s.label" :value="s.value" />
        </a-card>
      </a-col>
    </a-row>
    <a-card title="组织设置摘要" style="margin-top: 16px">
      <p>组织：{{ data?.settings?.org_name }}</p>
      <p>GitHub：{{ data?.settings?.github_repo || '未配置' }}</p>
      <p>分支：{{ data?.settings?.github_branch || 'main' }}</p>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'

const data = ref<any>(null)
const stats = computed(() => [
  { label: 'Profiles', value: data.value?.profiles ?? 0 },
  { label: 'Tasks', value: data.value?.tasks ?? 0 },
  { label: 'Guides', value: data.value?.guides ?? 0 },
  { label: 'Sensors', value: data.value?.sensors ?? 0 },
  { label: 'Commands', value: data.value?.commands ?? 0 },
])

onMounted(async () => {
  const { data: d } = await api.get('/org/dashboard')
  data.value = d
})
</script>
