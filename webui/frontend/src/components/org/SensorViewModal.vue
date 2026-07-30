<template>
  <a-modal
    :open="open"
    title="Sensor 详情"
    width="720px"
    :footer="null"
    :z-index="1100"
    destroy-on-close
    @cancel="close"
  >
    <template v-if="record">
      <a-alert
        v-if="checkType === 'human'"
        type="warning"
        show-icon
        style="margin-bottom: 12px"
        message="human：触发时仅提醒「尚未批准」，不做文件/脚本检查；beforeSubmit 不阻断提交。"
      />
      <a-form layout="vertical">
        <a-form-item label="Asset ID">
          <a-input :value="record.asset_id" disabled />
        </a-form-item>
        <a-form-item label="名称">
          <a-input :value="record.name || (record.asset_id || '').slice(0, 20)" disabled />
        </a-form-item>
        <a-form-item label="Check Type">
          <a-select :value="checkType" :options="CHECK_TYPE_OPTS" style="width: 100%" disabled />
        </a-form-item>
        <a-form-item label="触发通道">
          <a-select
            :value="triggers"
            mode="multiple"
            :options="TRIGGER_CHANNEL_OPTS"
            style="width: 100%"
            disabled
          />
        </a-form-item>
        <a-form-item v-if="triggers.includes('hook:afterFileEdit')" label="Scope（afterFileEdit glob，每行一个）">
          <a-textarea :value="scope.join('\n')" :rows="3" disabled />
        </a-form-item>
        <a-form-item label="配置内容">
          <a-textarea :value="content" :rows="12" disabled class="content-area" />
        </a-form-item>
      </a-form>
    </template>
    <div class="footer">
      <a-button @click="close">关闭</a-button>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  CHECK_TYPE_OPTS,
  TRIGGER_CHANNEL_OPTS,
  leanSensorContent,
  normalizeCheckType,
  normalizeScope,
  normalizeTriggers,
  templateFor,
} from '../../constants/sensorTemplates'

const props = defineProps<{
  open: boolean
  record: any | null
}>()

const emit = defineEmits<{ 'update:open': [boolean] }>()

const checkType = computed(() => normalizeCheckType(props.record?.check_type))
const triggers = computed(() => normalizeTriggers(props.record?.triggers))
const scope = computed(() => normalizeScope(props.record?.scope))
const content = computed(() =>
  leanSensorContent(props.record?.content || templateFor(checkType.value)),
)

function close() {
  emit('update:open', false)
}
</script>

<style scoped>
.footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
.content-area {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
</style>
