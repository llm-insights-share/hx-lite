<template>
  <div>
    <h2>初始配置生成</h2>
    <a-card style="margin-top: 12px; max-width: 720px">
      <a-steps :current="step" :items="steps" style="margin-bottom: 24px" />
      <div v-if="step === 0">
        <a-form layout="vertical">
          <a-form-item label="组织 ID"><a-input v-model:value="form.org_id" /></a-form-item>
          <a-form-item label="组织名称"><a-input v-model:value="form.org_name" /></a-form-item>
        </a-form>
        <a-button type="primary" @click="step = 1">下一步</a-button>
      </div>
      <div v-else-if="step === 1">
        <a-alert
          type="info"
          show-icon
          message="将生成 lite/standard/strict/enterprise 四档 Profile、全量 Stage/Task、Guide/Sensor，以及各 Task 的 Command/Skill 壳。"
        />
        <div style="margin-top: 16px">
          <a-button @click="step = 0">上一步</a-button>
          <a-button type="primary" style="margin-left: 8px" @click="step = 2">下一步</a-button>
        </div>
      </div>
      <div v-else>
        <a-button type="primary" :loading="loading" @click="generate">⚡ 一键生成全部配置</a-button>
        <a-result v-if="result" status="success" title="生成完成" style="margin-top: 16px">
          <template #subTitle>
            profiles={{ result.profiles }} · tasks={{ result.tasks_catalog }} · guides={{ result.guides }} ·
            sensors={{ result.sensors }} · commands={{ result.commands }}
          </template>
        </a-result>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { api } from '../../api'

const step = ref(0)
const loading = ref(false)
const result = ref<any>(null)
const form = reactive({ org_id: 'default', org_name: 'Default Org' })
const steps = [{ title: '组织信息' }, { title: '确认范围' }, { title: '生成' }]

async function generate() {
  loading.value = true
  try {
    const { data } = await api.post('/org/bootstrap', form)
    result.value = data
    message.success('初始化完成')
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '失败')
  } finally {
    loading.value = false
  }
}
</script>
