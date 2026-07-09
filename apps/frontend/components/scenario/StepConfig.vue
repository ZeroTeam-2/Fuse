<template>
  <div class="step-config">
    <h3 class="config-title">{{ step.title }}</h3>
    <span class="config-type">{{ typeLabels[step.type] }}</span>

    <div v-if="step.type === 'api'" class="api-config">
      <div class="info-row">
        <span class="method-badge" :style="methodStyle(step.method)">{{ step.method }}</span>
        <code class="path-code">{{ step.path }}</code>
      </div>

      <div v-if="schema" class="mapping-section">
        <h4 class="section-label">Входные данные</h4>
        <div v-for="field in schema.inputs" :key="field.key" class="mapping-row">
          <div class="field-info">
            <span class="field-key">{{ field.key }}</span>
            <span v-if="field.loc" class="field-loc">{{ field.loc }}</span>
            <span v-if="field.required" class="field-required">*</span>
          </div>
          <select v-model="mappings[field.key]" class="mapping-select" @change="emitUpdate">
            <option value="user">Ввод пользователя</option>
            <option value="const">Константа</option>
            <option v-for="up in upstreamOutputs" :key="up.token" :value="up.token">
              {{ up.label }} (шаг {{ up.stepIdx + 1 }})
            </option>
          </select>
          <input
            v-if="mappings[field.key] === 'const'"
            v-model="consts[field.key]"
            type="text"
            class="const-input"
            :placeholder="field.key === 'Authorization' ? 'Bearer {{access_token}}' : 'Значение'"
            @input="emitUpdate"
          />
        </div>

        <h4 class="section-label">Выходные данные</h4>
        <div class="output-list">
          <div v-for="out in schema.outputs" :key="out.key" class="output-item">
            <span class="output-key">{{ out.key }}</span>
            <span v-if="out.ex !== undefined" class="output-ex">{{ out.ex }}</span>
          </div>
          <div v-if="!schema.outputs.length" class="empty-outputs">Нет выходных полей</div>
        </div>
      </div>
    </div>

    <div v-else-if="step.type === 'delay'" class="delay-config">
      <label class="field-label">Секунд задержки</label>
      <input :value="step.seconds" type="number" min="1" max="600" class="text-input" readonly />
    </div>

    <div v-else-if="step.type === 'scenario'" class="scenario-config">
      <p class="config-note">Вложенный сценарий: входы → выходы</p>
    </div>

    <div v-else-if="step.type === 'file'" class="file-config">
      <p class="config-note">Загрузка файла (авто-режим по размеру)</p>
      <p class="config-note">≤ 10 МБ: single upload · > 10 МБ: chunked</p>
    </div>

    <div v-else-if="step.type === 'periodic'" class="periodic-config">
      <div class="info-row">
        <span class="method-badge" :style="methodStyle(step.pollMethod)">{{ step.pollMethod }}</span>
        <code class="path-code">{{ step.pollPath }}</code>
      </div>
      <label class="field-label">Интервал (сек)</label>
      <input :value="step.pollIntervalSec" type="number" class="text-input" readonly />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Step, SchemaField } from "@fuse/shared";

const props = defineProps<{
  step: Step;
  stepIndex: number;
  scenarioId: string;
}>();

const emit = defineEmits<{ update: [step: Step] }>();

const { $api } = useNuxtApp() as any;

const typeLabels: Record<string, string> = {
  api: "Endpoint API",
  scenario: "Другой сценарий",
  delay: "Задержка",
  file: "Файл",
  periodic: "Периодический запрос",
};

const schema = ref<{ inputs: SchemaField[]; outputs: SchemaField[] } | null>(null);
const mappings = reactive<Record<string, string>>({ ...props.step.mappings });
const consts = reactive<Record<string, string>>({ ...props.step.consts });
const upstreamOutputs = ref<{ token: string; label: string; stepIdx: number }[]>([]);

async function loadSchema() {
  try {
    const [schemaRes, upstreamRes] = await Promise.all([
      $api.GET(`/api/scenarios/${props.scenarioId}/step-schema/${props.stepIndex}`, {}),
      $api.GET(`/api/scenarios/${props.scenarioId}/step-schema/${props.stepIndex}`, {}),
    ]);
    if (schemaRes.data.value) {
      schema.value = schemaRes.data.value;
    }
  } catch {
    // schema not available
  }
}

function emitUpdate() {
  emit("update", { ...props.step, mappings: { ...mappings }, consts: { ...consts } });
}

function methodStyle(m: string) {
  const colors: Record<string, string> = { GET: "#0e9f6e", POST: "#e11d48", PUT: "#d97706", DELETE: "#dc2626", PATCH: "#6366f1" };
  const bg: Record<string, string> = { GET: "#e7f8f1", POST: "#fdeaef", PUT: "#fef3e2", DELETE: "#fdecec", PATCH: "#eef2ff" };
  return { color: colors[m] || "#6366f1", background: bg[m] || "#eef2ff" };
}

watch(() => props.stepIndex, loadSchema, { immediate: true });
</script>

<style scoped>
.step-config { display: flex; flex-direction: column; gap: 16px; }
.config-title { font-size: 16px; font-weight: 700; color: #18181b; margin: 0; }
.config-type { font-size: 12px; color: #71717a; }
.api-config, .delay-config, .scenario-config, .file-config, .periodic-config { display: flex; flex-direction: column; gap: 12px; }
.info-row { display: flex; align-items: center; gap: 8px; }
.method-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
.path-code { font-size: 13px; color: #52525b; font-family: monospace; }
.mapping-section { display: flex; flex-direction: column; gap: 12px; }
.section-label { font-size: 13px; font-weight: 600; color: #52525b; margin: 0; }
.mapping-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.field-info { display: flex; align-items: center; gap: 4px; min-width: 140px; }
.field-key { font-size: 13px; font-weight: 500; color: #18181b; }
.field-loc { font-size: 10px; color: #a1a1aa; background: #f4f4f5; padding: 1px 4px; border-radius: 3px; }
.field-required { color: #e11d48; }
.mapping-select { padding: 6px 10px; border: 1px solid #e4e4e7; border-radius: 6px; font-size: 13px; color: #18181b; flex: 1; min-width: 120px; }
.const-input { padding: 6px 10px; border: 1px solid #e4e4e7; border-radius: 6px; font-size: 13px; flex: 1; min-width: 100px; }
.output-list { display: flex; flex-direction: column; gap: 4px; }
.output-item { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f4f4f5; }
.output-key { font-size: 13px; font-weight: 500; color: #18181b; }
.output-ex { font-size: 12px; color: #71717a; }
.empty-outputs { font-size: 13px; color: #a1a1aa; }
.field-label { font-size: 13px; font-weight: 500; color: #52525b; }
.text-input { padding: 8px 10px; border: 1px solid #e4e4e7; border-radius: 6px; font-size: 14px; }
.config-note { font-size: 13px; color: #71717a; margin: 0; }
</style>
