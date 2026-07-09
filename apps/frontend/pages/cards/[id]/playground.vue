<template>
  <div class="playground-page">
    <div v-if="loading" class="state-text">Загрузка…</div>

    <div v-else-if="!scenario" class="state-text">Сценарий не найден</div>

    <template v-else>
      <div class="top-bar">
        <NuxtLink :to="`/cards/${scenarioId}`" class="back-link">← Назад</NuxtLink>
        <NuxtLink :to="`/cards/${scenarioId}/run`" class="mode-link">Запуск →</NuxtLink>
      </div>

      <div class="header-card">
        <h1 class="scenario-title">{{ scenario.title }}</h1>
        <p v-if="scenario.tagline" class="scenario-tagline">{{ scenario.tagline }}</p>
      </div>

      <div class="toolbar">
        <button
          class="toolbar-btn primary"
          :disabled="running || phase === 'done'"
          @click="runAll"
        >
          {{ running ? "Выполнение…" : "Выполнить все" }}
        </button>
        <button
          v-if="phase === 'waiting'"
          class="toolbar-btn"
          @click="advanceStep"
        >
          Выполнить шаг
        </button>
        <button class="toolbar-btn ghost" @click="reset">Сбросить</button>
      </div>

      <div v-if="totalDurationMs > 0 && phase === 'done'" class="total-banner">
        Сценарий выполнен за {{ totalDurationMs }} мс
      </div>

      <div class="steps-container">
        <div
          v-for="(step, i) in scenario.steps"
          :key="i"
          :class="['pg-step', stepStatus(i)]"
        >
          <div class="pg-step-header">
            <span class="pg-step-num">{{ i + 1 }}</span>
            <div class="pg-step-meta">
              <span class="pg-step-title">{{ step.title }}</span>
              <div class="pg-step-tags">
                <span v-if="step.type === 'api'" :class="['method-badge', methodClass(step.method)]">{{ step.method }}</span>
                <span v-if="step.type === 'api'" class="path-badge">{{ step.path }}</span>
                <span v-if="step.type === 'api' && step.appId" class="service-badge">{{ step.appId }}</span>
                <span class="type-badge">{{ step.type }}</span>
              </div>
            </div>
            <span v-if="stepTimings[i] != null" class="pg-step-time">{{ stepTimings[i] }} мс</span>
          </div>

          <div v-if="stepResultsData[i]" class="pg-step-result">
            <pre class="json-block">{{ formatJson(stepResultsData[i]) }}</pre>
          </div>

          <div v-if="stepErrors[i]" class="pg-step-error">
            {{ stepErrors[i] }}
          </div>

          <div v-if="waitingForStep === i && step.page" class="pg-step-page">
            <div v-if="step.page.type === 'fields'" class="inline-fields">
              <div
                v-for="field in step.page.fields"
                :key="field.key"
                class="field-group"
              >
                <label class="field-label">
                  {{ field.label }}
                  <span v-if="field.required" class="required-mark">*</span>
                </label>
                <input
                  v-model="pageFormData[field.key]"
                  type="text"
                  class="field-input"
                  :placeholder="field.placeholder || ''"
                />
              </div>
              <button class="inline-submit-btn" @click="submitPageForm(i)">{{ step.page.buttonText }}</button>
            </div>

            <div v-else-if="step.page.type === 'text'" class="inline-text">
              <div class="text-body">{{ step.page.body }}</div>
              <button class="inline-submit-btn" @click="submitPageForm(i, {})">Продолжить</button>
            </div>

            <div v-else-if="step.page.type === 'file'" class="inline-file">
              <div
                class="mini-dropzone"
                @click="triggerFileInput(i)"
                @dragover.prevent="isDragOver = true"
                @dragleave.prevent="isDragOver = false"
                @drop.prevent="onFileDrop($event, i)"
              >
                <span v-if="!pgFiles[i]" class="mini-dropzone-text">
                  Перетащите файл или нажмите
                  <span v-if="step.page.maxMb">(макс. {{ step.page.maxMb }} МБ)</span>
                </span>
                <span v-else class="mini-dropzone-file">{{ pgFiles[i]?.name }}</span>
              </div>
              <input
                :ref="el => setFileInput(el, i)"
                type="file"
                class="file-hidden"
                :accept="step.page.accept || undefined"
                @change="onFileSelect($event, i)"
              />
              <button
                class="inline-submit-btn"
                :disabled="!pgFiles[i]"
                @click="submitFileForm(i)"
              >{{ step.page.buttonText }}</button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Step, StepPage, ServerWsEvent } from "@fuse/shared";

const route = useRoute();
const { $api } = useNuxtApp() as any;

const scenarioId = computed(() => route.params.id as string);

const loading = ref(true);
const scenario = ref<{ title: string; tagline?: string; steps: Step[] } | null>(null);
const running = ref(false);
const phase = ref<"idle" | "running" | "waiting" | "done" | "error">("idle");
const stepStatuses = ref<Record<number, "pending" | "running" | "completed" | "failed">>({});
const stepResultsData = ref<Record<number, unknown>>({});
const stepTimings = ref<Record<number, number>>({});
const stepErrors = ref<Record<number, string>>({});
const totalDurationMs = ref(0);
const waitingForStep = ref<number | null>(null);
const pageFormData = ref<Record<string, string>>({});
const pgFiles = ref<Record<number, File | null>>({});
const isDragOver = ref(false);
const fileInputs = ref<Record<number, HTMLInputElement | null>>({});

const runId = ref("");
const socketApi = shallowRef<ReturnType<typeof useRunSocket> | null>(null);
let processedCount = 0;

watch(
  () => socketApi.value?.events.value.length ?? 0,
  (newLen) => {
    if (!socketApi.value) return;
    const events = socketApi.value.events.value;
    while (processedCount < newLen && processedCount < events.length) {
      handleWsEvent(events[processedCount]);
      processedCount++;
    }
  },
);

function methodClass(method: string): string {
  const map: Record<string, string> = {
    GET: "m-get",
    POST: "m-post",
    PUT: "m-put",
    DELETE: "m-delete",
    PATCH: "m-patch",
  };
  return map[method] ?? "m-get";
}

function stepStatus(i: number): string {
  return stepStatuses.value[i] ?? "pending";
}

function formatJson(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

async function fetchScenario() {
  loading.value = true;
  try {
    const { data } = await $api.GET(`/api/scenarios/${scenarioId.value}`, {});
    if (data.value) {
      const s = data.value;
      scenario.value = {
        title: s.title,
        tagline: s.tagline,
        steps: (s.steps ?? []) as Step[],
      };
    }
  } catch {
    scenario.value = null;
  } finally {
    loading.value = false;
  }
}

async function runAll() {
  running.value = true;
  phase.value = "running";
  resetStepData();

  try {
    const { data } = await $api.POST("/api/runs", {
      body: { scenarioId: scenarioId.value },
    });
    if (!data.value) {
      running.value = false;
      phase.value = "error";
      return;
    }
    runId.value = (data.value as { id?: string; _id?: string }).id
      ?? (data.value as { _id?: string })._id
      ?? "";
    if (!runId.value) {
      running.value = false;
      phase.value = "error";
      return;
    }

    processedCount = 0;
    socketApi.value = useRunSocket(runId.value);
    socketApi.value.connect();
  } catch {
    running.value = false;
    phase.value = "error";
  }
}

function advanceStep() {
  if (waitingForStep.value == null) return;
  submitPageForm(waitingForStep.value, {});
}

function handleWsEvent(event: ServerWsEvent) {
  switch (event.type) {
    case "step:start": {
      stepStatuses.value[event.payload.stepIndex] = "running";
      break;
    }
    case "step:done": {
      stepStatuses.value[event.payload.stepIndex] = "completed";
      stepResultsData.value[event.payload.stepIndex] = event.payload.result;
      stepTimings.value[event.payload.stepIndex] = event.payload.durationMs;
      break;
    }
    case "page:required": {
      phase.value = "waiting";
      running.value = false;
      waitingForStep.value = event.payload.stepIndex;
      pageFormData.value = {};
      break;
    }
    case "run:done": {
      totalDurationMs.value = event.payload.totalDurationMs ?? 0;
      phase.value = "done";
      running.value = false;
      waitingForStep.value = null;
      break;
    }
    case "run:error": {
      stepStatuses.value[event.payload.stepIndex] = "failed";
      stepErrors.value[event.payload.stepIndex] = event.payload.error;
      phase.value = "error";
      running.value = false;
      waitingForStep.value = null;
      break;
    }
    case "run:status": {
      const payload = event.payload as { status: string };
      if (payload.status === "completed") {
        phase.value = "done";
        running.value = false;
      }
      break;
    }
  }
}

function submitPageForm(stepIndex: number, overrideData?: Record<string, unknown>) {
  if (!socketApi.value) return;
  const data = overrideData ?? { ...pageFormData.value };
  socketApi.value.submitPage(stepIndex, data);
  waitingForStep.value = null;
  phase.value = "running";
  running.value = true;
}

function triggerFileInput(stepIndex: number) {
  fileInputs.value[stepIndex]?.click();
}

function setFileInput(el: unknown, stepIndex: number) {
  fileInputs.value[stepIndex] = el as HTMLInputElement | null;
}

function onFileSelect(e: Event, stepIndex: number) {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    pgFiles.value[stepIndex] = target.files[0];
  }
}

function onFileDrop(e: DragEvent, stepIndex: number) {
  isDragOver.value = false;
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    pgFiles.value[stepIndex] = files[0];
  }
}

function submitFileForm(stepIndex: number) {
  const file = pgFiles.value[stepIndex];
  if (!file || !socketApi.value) return;
  socketApi.value.submitPage(stepIndex, {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
  });
  waitingForStep.value = null;
  phase.value = "running";
  running.value = true;
}

function resetStepData() {
  stepStatuses.value = {};
  stepResultsData.value = {};
  stepTimings.value = {};
  stepErrors.value = {};
  totalDurationMs.value = 0;
  waitingForStep.value = null;
  pageFormData.value = {};
  pgFiles.value = {};
}

function reset() {
  socketApi.value?.disconnect();
  socketApi.value = null;
  processedCount = 0;
  phase.value = "idle";
  running.value = false;
  resetStepData();
  runId.value = "";
}

onMounted(fetchScenario);

onUnmounted(() => {
  socketApi.value?.disconnect();
});
</script>

<style scoped>
.playground-page { max-width: 900px; margin: 0 auto; padding: 24px 24px 48px; display: flex; flex-direction: column; gap: 20px; }
.top-bar { display: flex; justify-content: space-between; align-items: center; }
.back-link { font-size: 14px; color: #6366f1; text-decoration: none; font-weight: 500; }
.back-link:hover { text-decoration: underline; }
.mode-link { font-size: 14px; color: #71717a; text-decoration: none; font-weight: 500; }
.mode-link:hover { color: #18181b; }
.state-text { font-size: 15px; color: #71717a; text-align: center; padding: 64px 0; }
.header-card { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 20px; }
.scenario-title { font-size: 22px; font-weight: 800; color: #18181b; margin: 0; letter-spacing: -0.02em; }
.scenario-tagline { font-size: 14px; color: #71717a; margin: 6px 0 0; }
.toolbar { display: flex; gap: 8px; flex-wrap: wrap; }
.toolbar-btn { padding: 10px 18px; border-radius: 8px; border: 1px solid #e4e4e7; background: #fff; color: #18181b; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.15s, border-color 0.15s; }
.toolbar-btn:hover:not(:disabled) { background: #f4f4f5; }
.toolbar-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.toolbar-btn.primary { background: #6366f1; border-color: #6366f1; color: #fff; }
.toolbar-btn.primary:hover:not(:disabled) { background: #4f46e5; }
.toolbar-btn.ghost { background: transparent; border-color: #d4d4d8; color: #71717a; }
.total-banner { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px 20px; font-size: 15px; font-weight: 600; color: #16a34a; text-align: center; }
.steps-container { display: flex; flex-direction: column; gap: 10px; }
.pg-step { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; transition: border-color 0.15s; }
.pg-step.running { border-color: #c7d2fe; background: #fafbff; }
.pg-step.completed { border-color: #d4f4dd; }
.pg-step.failed { border-color: #fecaca; background: #fef9f9; }
.pg-step-header { display: flex; align-items: flex-start; gap: 12px; }
.pg-step-num { width: 24px; height: 24px; border-radius: 50%; background: #f4f4f5; color: #71717a; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
.pg-step.running .pg-step-num { background: #eef2ff; color: #6366f1; }
.pg-step.completed .pg-step-num { background: #f0fdf4; color: #16a34a; }
.pg-step.failed .pg-step-num { background: #fef2f2; color: #e11d48; }
.pg-step-meta { display: flex; flex-direction: column; gap: 6px; flex: 1; }
.pg-step-title { font-size: 15px; font-weight: 600; color: #18181b; }
.pg-step-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.method-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; min-width: 40px; text-align: center; }
.m-get { background: #dcfce7; color: #16a34a; }
.m-post { background: #fee2e2; color: #e11d48; }
.m-put { background: #ffedd5; color: #ea580c; }
.m-delete { background: #fee2e2; color: #e11d48; }
.m-patch { background: #eef2ff; color: #6366f1; }
.path-badge { font-size: 12px; font-weight: 600; color: #3f3f46; background: #f4f4f5; padding: 2px 8px; border-radius: 4px; font-family: monospace; }
.service-badge { font-size: 12px; font-weight: 500; color: #6366f1; background: #eef2ff; padding: 2px 8px; border-radius: 4px; }
.type-badge { font-size: 12px; font-weight: 500; color: #71717a; background: #f4f4f5; padding: 2px 8px; border-radius: 4px; }
.pg-step-time { font-size: 12px; color: #a1a1aa; font-weight: 500; flex-shrink: 0; }
.pg-step-result { background: #18181b; border-radius: 8px; padding: 14px; overflow-x: auto; }
.json-block { margin: 0; font-size: 13px; line-height: 1.5; color: #a1a1aa; font-family: monospace; white-space: pre-wrap; word-break: break-all; }
.pg-step-error { font-size: 13px; color: #e11d48; background: #fef2f2; border-radius: 6px; padding: 10px 14px; }
.pg-step-page { border-top: 1px solid #f4f4f5; padding-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.inline-fields { display: flex; flex-direction: column; gap: 10px; }
.field-group { display: flex; flex-direction: column; gap: 4px; }
.field-label { font-size: 13px; font-weight: 500; color: #3f3f46; }
.required-mark { color: #e11d48; }
.field-input { padding: 8px 10px; border: 1px solid #e4e4e7; border-radius: 6px; font-size: 14px; color: #18181b; outline: none; }
.field-input:focus { border-color: #6366f1; }
.inline-submit-btn { align-self: flex-start; padding: 8px 16px; border-radius: 6px; border: none; background: #6366f1; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; }
.inline-submit-btn:hover:not(:disabled) { background: #4f46e5; }
.inline-submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.inline-text { display: flex; flex-direction: column; gap: 10px; }
.text-body { font-size: 14px; color: #3f3f46; line-height: 1.6; white-space: pre-wrap; }
.inline-file { display: flex; flex-direction: column; gap: 8px; }
.file-hidden { display: none; }
.mini-dropzone { border: 2px dashed #d4d4d8; border-radius: 8px; padding: 16px; text-align: center; cursor: pointer; transition: border-color 0.15s; }
.mini-dropzone:hover { border-color: #6366f1; }
.mini-dropzone-text { font-size: 13px; color: #71717a; }
.mini-dropzone-file { font-size: 13px; color: #18181b; font-weight: 500; }
</style>
