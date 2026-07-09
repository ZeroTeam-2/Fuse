<template>
  <div class="picker-overlay" @click.self="$emit('close')">
    <div class="picker-modal">
      <div class="picker-header">
        <h2 class="picker-title">Добавить шаг</h2>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="type-tabs">
        <button
          v-for="t in types"
          :key="t.value"
          :class="['type-tab', { active: selectedType === t.value }]"
          @click="selectType(t.value)"
        >
          {{ t.label }}
        </button>
      </div>

      <div class="picker-body">
        <div class="step-title-field">
          <label class="field-label">Название шага</label>
          <input v-model="stepTitle" type="text" class="text-input" placeholder="Название шага" />
        </div>

        <template v-if="selectedType === 'api'">
          <div class="field-group">
            <label class="field-label">Приложение</label>
            <select v-model="selectedAppId" class="text-input" @change="loadEndpoints">
              <option value="">Выберите приложение</option>
              <option v-for="a in apps" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </div>
          <div v-if="endpoints.length" class="field-group">
            <label class="field-label">Endpoint</label>
            <div class="endpoint-list">
              <button
                v-for="ep in endpoints"
                :key="ep.id"
                :class="['endpoint-item', { selected: selectedEndpoint?.id === ep.id }]"
                @click="selectEndpoint(ep)"
              >
                <span class="ep-method" :style="methodStyle(ep.method)">{{ ep.method }}</span>
                <span class="ep-path">{{ ep.path }}</span>
                <span v-if="ep.summary" class="ep-summary">{{ ep.summary }}</span>
              </button>
            </div>
          </div>
        </template>

        <template v-if="selectedType === 'delay'">
          <div class="field-group">
            <label class="field-label">Задержка (сек)</label>
            <div class="preset-row">
              <button v-for="s in [1, 3, 5, 10]" :key="s" :class="['preset-btn', { active: delaySec === s }]" @click="delaySec = s">{{ s }}с</button>
            </div>
            <input v-model.number="delaySec" type="number" min="1" max="600" class="text-input" />
          </div>
        </template>

        <template v-if="selectedType === 'scenario'">
          <div class="field-group">
            <label class="field-label">Сценарий</label>
            <select v-model="selectedScenarioId" class="text-input">
              <option value="">Выберите сценарий</option>
              <option v-for="s in availableScenarios" :key="s.id" :value="s.id">{{ s.title }}</option>
            </select>
          </div>
        </template>

        <template v-if="selectedType === 'file'">
          <div class="field-group">
            <label class="field-label">Режим: авто (single ≤ 10МБ, chunked > 10МБ)</label>
            <p class="hint">Режим определяется автоматически по размеру файла</p>
          </div>
        </template>

        <template v-if="selectedType === 'periodic'">
          <div class="field-group">
            <label class="field-label">Приложение</label>
            <select v-model="selectedAppId" class="text-input" @change="loadEndpoints">
              <option value="">Выберите приложение</option>
              <option v-for="a in apps" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </div>
          <div v-if="endpoints.length" class="field-group">
            <label class="field-label">Endpoint для опроса</label>
            <div class="endpoint-list">
              <button
                v-for="ep in endpoints"
                :key="ep.id"
                :class="['endpoint-item', { selected: selectedEndpoint?.id === ep.id }]"
                @click="selectEndpoint(ep)"
              >
                <span class="ep-method" :style="methodStyle(ep.method)">{{ ep.method }}</span>
                <span class="ep-path">{{ ep.path }}</span>
              </button>
            </div>
          </div>
          <div v-if="selectedEndpoint" class="field-group">
            <label class="field-label">Интервал опроса (сек, 1-600)</label>
            <input v-model.number="pollIntervalSec" type="number" min="1" max="600" class="text-input" />
          </div>
        </template>
      </div>

      <div class="picker-footer">
        <button class="cancel-btn" @click="$emit('close')">Отмена</button>
        <button class="confirm-btn" :disabled="!canConfirm" @click="confirm">Добавить шаг</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Step, StepType } from "@fuse/shared";

const props = defineProps<{ scenarioId: string }>();
const emit = defineEmits<{
  add: [step: Step];
  close: [];
}>();

const { $api } = useNuxtApp() as any;

const types = [
  { value: "api" as StepType, label: "Endpoint API" },
  { value: "scenario" as StepType, label: "Другой сценарий" },
  { value: "delay" as StepType, label: "Задержка" },
  { value: "file" as StepType, label: "Файл" },
  { value: "periodic" as StepType, label: "Периодический запрос" },
];

const selectedType = ref<StepType>("api");
const stepTitle = ref("");
const apps = ref<any[]>([]);
const endpoints = ref<any[]>([]);
const selectedAppId = ref("");
const selectedEndpoint = ref<any | null>(null);
const delaySec = ref(3);
const selectedScenarioId = ref("");
const availableScenarios = ref<any[]>([]);
const pollIntervalSec = ref(5);

const canConfirm = computed(() => {
  if (!stepTitle.value) return false;
  if (selectedType.value === "api" && !selectedEndpoint.value) return false;
  if (selectedType.value === "scenario" && !selectedScenarioId.value) return false;
  if (selectedType.value === "periodic" && !selectedEndpoint.value) return false;
  return true;
});

function selectType(t: StepType) {
  selectedType.value = t;
  selectedEndpoint.value = null;
}

async function loadApps() {
  const { data } = await $api.GET("/api/apps", { params: { query: { limit: 100 } } });
  if (data.value) apps.value = data.value.data ?? [];
}

async function loadEndpoints() {
  if (!selectedAppId.value) return;
  const { data } = await $api.GET(`/api/apps/${selectedAppId.value}`, {});
  if (data.value) endpoints.value = data.value.endpoints ?? [];
  selectedEndpoint.value = null;
}

async function loadScenarios() {
  const { data } = await $api.GET("/api/scenarios", { params: { query: { limit: 100 } } });
  if (data.value) {
    availableScenarios.value = (data.value.data ?? []).filter((s: any) => s.id !== props.scenarioId);
  }
}

function selectEndpoint(ep: any) {
  selectedEndpoint.value = ep;
  if (!stepTitle.value) stepTitle.value = ep.summary || ep.path;
}

function methodStyle(m: string) {
  const colors: Record<string, string> = { GET: "#0e9f6e", POST: "#e11d48", PUT: "#d97706", DELETE: "#dc2626", PATCH: "#6366f1" };
  const bg: Record<string, string> = { GET: "#e7f8f1", POST: "#fdeaef", PUT: "#fef3e2", DELETE: "#fdecec", PATCH: "#eef2ff" };
  return { color: colors[m] || "#6366f1", background: bg[m] || "#eef2ff" };
}

function confirm() {
  const id = crypto.randomUUID();
  let step: Step;

  if (selectedType.value === "api" && selectedEndpoint.value) {
    step = {
      id, type: "api", title: stepTitle.value,
      appId: selectedAppId.value, endpointId: selectedEndpoint.value.id,
      method: selectedEndpoint.value.method, path: selectedEndpoint.value.path,
      mappings: {}, consts: {},
    };
  } else if (selectedType.value === "delay") {
    step = { id, type: "delay", title: stepTitle.value, seconds: delaySec.value };
  } else if (selectedType.value === "scenario") {
    step = { id, type: "scenario", title: stepTitle.value, refScenarioId: selectedScenarioId.value, mappings: {} };
  } else if (selectedType.value === "file") {
    step = { id, type: "file", title: stepTitle.value, mappings: {} };
  } else if (selectedType.value === "periodic" && selectedEndpoint.value) {
    step = {
      id, type: "periodic", title: stepTitle.value,
      appId: selectedAppId.value, pollMethod: selectedEndpoint.value.method,
      pollPath: selectedEndpoint.value.path, pollIntervalSec: pollIntervalSec.value,
      mappings: {},
    };
  } else {
    return;
  }

  emit("add", step);
}

onMounted(() => {
  loadApps();
  loadScenarios();
});
</script>

<style scoped>
.picker-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 200; }
.picker-modal { background: #fff; border-radius: 14px; width: 640px; max-width: 90vw; max-height: 85vh; display: flex; flex-direction: column; }
.picker-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #f4f4f5; }
.picker-title { font-size: 18px; font-weight: 700; color: #18181b; margin: 0; }
.close-btn { width: 28px; height: 28px; border: none; background: #f4f4f5; border-radius: 8px; cursor: pointer; font-size: 14px; color: #52525b; }
.type-tabs { display: flex; gap: 4px; padding: 12px 24px; border-bottom: 1px solid #f4f4f5; flex-wrap: wrap; }
.type-tab { padding: 6px 12px; border-radius: 8px; border: 1px solid #e4e4e7; background: #fff; font-size: 13px; font-weight: 500; color: #52525b; cursor: pointer; }
.type-tab.active { background: #6366f1; color: #fff; border-color: #6366f1; }
.picker-body { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
.step-title-field, .field-group { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 13px; font-weight: 500; color: #52525b; }
.text-input { padding: 10px 12px; border: 1px solid #e4e4e7; border-radius: 8px; font-size: 14px; color: #18181b; }
.endpoint-list { display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto; }
.endpoint-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid #e4e4e7; border-radius: 8px; background: #fff; cursor: pointer; text-align: left; }
.endpoint-item.selected { border-color: #6366f1; background: #f5f3ff; }
.ep-method { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
.ep-path { font-size: 13px; color: #18181b; font-family: monospace; }
.ep-summary { font-size: 12px; color: #a1a1aa; margin-left: auto; }
.preset-row { display: flex; gap: 8px; margin-bottom: 8px; }
.preset-btn { padding: 6px 16px; border-radius: 8px; border: 1px solid #e4e4e7; background: #fff; cursor: pointer; font-size: 13px; color: #52525b; }
.preset-btn.active { background: #eef2ff; border-color: #6366f1; color: #6366f1; }
.hint { font-size: 13px; color: #a1a1aa; margin: 0; }
.picker-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px; border-top: 1px solid #f4f4f5; }
.cancel-btn { padding: 8px 16px; border-radius: 8px; border: 1px solid #e4e4e7; background: #fff; font-size: 14px; color: #52525b; cursor: pointer; }
.confirm-btn { padding: 8px 16px; border-radius: 8px; border: none; background: #6366f1; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
.confirm-btn:disabled { opacity: 0.4; }
</style>
