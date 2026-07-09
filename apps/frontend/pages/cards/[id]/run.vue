<template>
  <div class="run-page">
    <div v-if="loading" class="state-text">Загрузка…</div>

    <div v-else-if="!scenario" class="state-text">Сценарий не найден</div>

    <template v-else>
      <div class="top-bar">
        <NuxtLink :to="`/cards/${scenarioId}`" class="back-link">← Назад</NuxtLink>
        <NuxtLink :to="`/cards/${scenarioId}/playground`" class="mode-link">Playground →</NuxtLink>
      </div>

      <div class="header-card">
        <h1 class="scenario-title">{{ scenario.title }}</h1>
        <p v-if="scenario.tagline" class="scenario-tagline">{{ scenario.tagline }}</p>
      </div>

      <div v-if="phase === 'idle'" class="idle-section">
        <div class="steps-preview">
          <div
            v-for="(step, i) in scenario.steps"
            :key="i"
            class="step-preview"
          >
            <span class="step-num">{{ i + 1 }}</span>
            <div class="step-preview-body">
              <span class="step-preview-title">{{ step.title }}</span>
              <span class="step-type-badge">{{ step.type }}</span>
            </div>
          </div>
        </div>
        <button class="primary-btn" :disabled="starting" @click="startRun">
          {{ starting ? "Запуск…" : "Получить результат" }}
        </button>
      </div>

      <div
        v-else-if="phase === 'starting' || phase === 'running'"
        class="progress-section"
      >
        <div class="step-list">
          <div
            v-for="step in stepProgress"
            :key="step.index"
            :class="['step-row', step.status]"
          >
            <span class="step-status-icon">{{ statusIcon(step.status) }}</span>
            <div class="step-row-body">
              <span class="step-row-title">{{ step.title }}</span>
              <span v-if="step.durationMs != null" class="step-row-duration">{{ step.durationMs }} мс</span>
            </div>
          </div>
        </div>
        <button
          v-if="phase === 'running'"
          class="cancel-btn"
          @click="cancelRun"
        >
          Отменить
        </button>
      </div>

      <div v-if="phase === 'waiting' && currentPage" class="page-section">
        <div v-if="currentPage.page.type === 'fields'" class="fields-page">
          <h2 class="page-title">{{ currentPage.page.title }}</h2>
          <p v-if="currentPage.page.hint" class="page-hint">{{ currentPage.page.hint }}</p>
          <form @submit.prevent="submitFields">
            <div
              v-for="field in currentPage.page.fields"
              :key="field.key"
              class="field-group"
            >
              <label class="field-label">
                {{ field.label }}
                <span v-if="field.required" class="required-mark">*</span>
              </label>
              <input
                v-model="formData[field.key]"
                type="text"
                class="field-input"
                :placeholder="field.placeholder || ''"
              />
            </div>
            <button type="submit" class="primary-btn">{{ currentPage.page.buttonText }}</button>
          </form>
        </div>

        <div v-else-if="currentPage.page.type === 'file'" class="file-page">
          <h2 class="page-title">{{ currentPage.page.title }}</h2>
          <p v-if="currentPage.page.hint" class="page-hint">{{ currentPage.page.hint }}</p>
          <div
            class="dropzone"
            :class="{ dragover: isDragOver }"
            @click="triggerFileInput"
            @dragover.prevent="isDragOver = true"
            @dragleave.prevent="isDragOver = false"
            @drop.prevent="onFileDrop"
          >
            <span v-if="!selectedFile" class="dropzone-placeholder">
              Перетащите файл сюда или нажмите для выбора
              <span v-if="currentPage.page.maxMb">(макс. {{ currentPage.page.maxMb }} МБ)</span>
            </span>
            <span v-else class="dropzone-file">
              {{ selectedFile.name }} ({{ formatFileSize(selectedFile.size) }})
            </span>
          </div>
          <input
            ref="fileInput"
            type="file"
            class="file-hidden"
            :accept="currentPage.page.accept || undefined"
            @change="onFileSelect"
          />
          <p v-if="fileError" class="error-text">{{ fileError }}</p>
          <button
            class="primary-btn"
            :disabled="!selectedFile || !!fileError"
            @click="submitFile"
          >
            {{ currentPage.page.buttonText }}
          </button>
        </div>

        <div v-else-if="currentPage.page.type === 'text'" class="text-page">
          <h2 class="page-title">{{ currentPage.page.title }}</h2>
          <div class="text-body">{{ currentPage.page.body }}</div>
          <button class="primary-btn" @click="submitText">Продолжить</button>
        </div>
      </div>

      <div v-if="phase === 'done'" class="done-section">
        <div class="result-icon done">✓</div>
        <h2 class="result-title">Результат готов</h2>
        <div v-if="totalDurationMs > 0" class="result-duration">
          Общее время: {{ totalDurationMs }} мс
        </div>
        <div class="result-list">
          <div
            v-for="step in stepProgress"
            :key="step.index"
            class="result-item"
          >
            <span class="result-item-title">{{ step.title }}</span>
            <span v-if="step.durationMs != null" class="result-item-time">{{ step.durationMs }} мс</span>
          </div>
        </div>
        <button class="primary-btn" @click="reset">Запустить снова</button>
      </div>

      <div v-if="phase === 'error'" class="error-section">
        <div class="result-icon error">✕</div>
        <h2 class="result-title">Ошибка выполнения</h2>
        <p class="error-detail">{{ errorMessage }}</p>
        <button class="primary-btn" @click="reset">Запустить снова</button>
      </div>

      <div v-if="phase === 'cancelled'" class="cancelled-section">
        <div class="result-icon cancelled">⊘</div>
        <h2 class="result-title">Выполнение отменено</h2>
        <button class="primary-btn" @click="reset">Запустить снова</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Step, StepPage, ServerWsEvent, RunStatus } from "@fuse/shared";

const route = useRoute();
const { $api } = useNuxtApp() as any;

const scenarioId = computed(() => route.params.id as string);

interface StepProgress {
  index: number;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
  durationMs?: number;
  result?: unknown;
}

interface PageState {
  stepIndex: number;
  stepTitle: string;
  page: StepPage;
}

type Phase = "idle" | "starting" | "running" | "waiting" | "done" | "error" | "cancelled";

const loading = ref(true);
const scenario = ref<{ title: string; tagline?: string; steps: Step[] } | null>(null);
const starting = ref(false);
const phase = ref<Phase>("idle");
const stepProgress = ref<StepProgress[]>([]);
const currentPage = ref<PageState | null>(null);
const totalDurationMs = ref(0);
const errorMessage = ref("");
const formData = ref<Record<string, string>>({});
const selectedFile = ref<File | null>(null);
const fileError = ref("");
const isDragOver = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

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

function statusIcon(status: StepProgress["status"]): string {
  switch (status) {
    case "completed": return "✓";
    case "running": return "⟳";
    case "failed": return "✕";
    default: return "○";
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

async function startRun() {
  starting.value = true;
  phase.value = "starting";
  try {
    const { data } = await $api.POST("/api/runs", {
      body: { scenarioId: scenarioId.value },
    });
    if (!data.value) return;
    runId.value = (data.value as { id?: string; _id?: string }).id
      ?? (data.value as { _id?: string })._id
      ?? "";
    if (!runId.value) return;

    starting.value = false;
    phase.value = "running";
    processedCount = 0;

    socketApi.value = useRunSocket(runId.value);
    socketApi.value.connect();
  } catch {
    starting.value = false;
    phase.value = "error";
    errorMessage.value = "Не удалось создать запуск";
  }
}

function handleWsEvent(event: ServerWsEvent) {
  switch (event.type) {
    case "step:start": {
      const existing = stepProgress.value.find((s) => s.index === event.payload.stepIndex);
      if (existing) {
        existing.status = "running";
      } else {
        stepProgress.value.push({
          index: event.payload.stepIndex,
          title: event.payload.stepTitle,
          status: "running",
        });
      }
      break;
    }
    case "step:done": {
      const step = stepProgress.value.find((s) => s.index === event.payload.stepIndex);
      if (step) {
        step.status = "completed";
        step.durationMs = event.payload.durationMs;
        step.result = event.payload.result;
      }
      break;
    }
    case "page:required": {
      phase.value = "waiting";
      currentPage.value = {
        stepIndex: event.payload.stepIndex,
        stepTitle: event.payload.stepTitle,
        page: event.payload.page as StepPage,
      };
      formData.value = {};
      selectedFile.value = null;
      fileError.value = "";
      break;
    }
    case "run:done": {
      totalDurationMs.value = event.payload.totalDurationMs ?? 0;
      phase.value = "done";
      currentPage.value = null;
      break;
    }
    case "run:error": {
      errorMessage.value = event.payload.error;
      phase.value = "error";
      currentPage.value = null;
      break;
    }
    case "run:status": {
      const payload = event.payload as { status: RunStatus };
      if (payload.status === "completed") {
        phase.value = "done";
      } else if (payload.status === "failed") {
        phase.value = "error";
      } else if (payload.status === "cancelled") {
        phase.value = "cancelled";
      } else if (payload.status === "running" && phase.value === "waiting") {
        phase.value = "running";
      }
      break;
    }
  }
}

function submitFields() {
  if (!currentPage.value || !socketApi.value) return;
  socketApi.value.submitPage(currentPage.value.stepIndex, { ...formData.value });
  currentPage.value = null;
  phase.value = "running";
}

function submitText() {
  if (!currentPage.value || !socketApi.value) return;
  socketApi.value.submitPage(currentPage.value.stepIndex, {});
  currentPage.value = null;
  phase.value = "running";
}

function triggerFileInput() {
  fileInput.value?.click();
}

function onFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    validateAndSetFile(target.files[0]);
  }
}

function onFileDrop(e: DragEvent) {
  isDragOver.value = false;
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    validateAndSetFile(files[0]);
  }
}

function validateAndSetFile(file: File) {
  fileError.value = "";
  const page = currentPage.value?.page;
  if (page && page.type === "file") {
    if (page.maxMb && file.size > page.maxMb * 1024 * 1024) {
      fileError.value = `Файл превышает максимальный размер ${page.maxMb} МБ`;
      return;
    }
    if (page.accept) {
      const accepted = page.accept.split(",").map((a) => a.trim());
      const ext = "." + (file.name.split(".").pop() || "");
      if (!accepted.includes(file.type) && !accepted.includes(ext)) {
        fileError.value = `Неподдерживаемый формат. Допустимо: ${page.accept}`;
        return;
      }
    }
  }
  selectedFile.value = file;
}

function submitFile() {
  if (!currentPage.value || !socketApi.value || !selectedFile.value) return;
  socketApi.value.submitPage(currentPage.value.stepIndex, {
    fileName: selectedFile.value.name,
    fileSize: selectedFile.value.size,
    fileType: selectedFile.value.type,
  });
  currentPage.value = null;
  phase.value = "running";
}

function cancelRun() {
  if (!socketApi.value) return;
  socketApi.value.cancelRun();
  phase.value = "cancelled";
  currentPage.value = null;
}

function reset() {
  socketApi.value?.disconnect();
  socketApi.value = null;
  processedCount = 0;
  phase.value = "idle";
  stepProgress.value = [];
  currentPage.value = null;
  totalDurationMs.value = 0;
  errorMessage.value = "";
  formData.value = {};
  selectedFile.value = null;
  fileError.value = "";
  runId.value = "";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

onMounted(fetchScenario);

onUnmounted(() => {
  socketApi.value?.disconnect();
});
</script>

<style scoped>
.run-page { max-width: 720px; margin: 0 auto; padding: 24px 24px 48px; display: flex; flex-direction: column; gap: 20px; }
.top-bar { display: flex; justify-content: space-between; align-items: center; }
.back-link { font-size: 14px; color: #6366f1; text-decoration: none; font-weight: 500; }
.back-link:hover { text-decoration: underline; }
.mode-link { font-size: 14px; color: #71717a; text-decoration: none; font-weight: 500; }
.mode-link:hover { color: #18181b; }
.state-text { font-size: 15px; color: #71717a; text-align: center; padding: 64px 0; }
.header-card { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 20px; }
.scenario-title { font-size: 22px; font-weight: 800; color: #18181b; margin: 0; letter-spacing: -0.02em; }
.scenario-tagline { font-size: 14px; color: #71717a; margin: 6px 0 0; }
.idle-section { display: flex; flex-direction: column; gap: 16px; }
.steps-preview { display: flex; flex-direction: column; gap: 6px; }
.step-preview { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #fff; border: 1px solid #e4e4e7; border-radius: 10px; }
.step-num { width: 24px; height: 24px; border-radius: 50%; background: #f4f4f5; color: #71717a; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
.step-preview-body { display: flex; align-items: center; gap: 8px; flex: 1; }
.step-preview-title { font-size: 14px; font-weight: 500; color: #18181b; }
.step-type-badge { font-size: 11px; font-weight: 600; color: #71717a; background: #f4f4f5; padding: 2px 8px; border-radius: 100px; }
.primary-btn { padding: 12px 24px; border-radius: 10px; border: none; background: #6366f1; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
.primary-btn:hover:not(:disabled) { background: #4f46e5; }
.primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cancel-btn { padding: 10px 20px; border-radius: 10px; border: 1px solid #e4e4e7; background: #fff; color: #71717a; font-size: 14px; font-weight: 500; cursor: pointer; align-self: center; }
.cancel-btn:hover { background: #f4f4f5; color: #18181b; }
.progress-section { display: flex; flex-direction: column; gap: 16px; }
.step-list { display: flex; flex-direction: column; gap: 4px; }
.step-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #fff; border: 1px solid #e4e4e7; border-radius: 10px; }
.step-row.completed { border-color: #d4f4dd; background: #f0fdf4; }
.step-row.running { border-color: #c7d2fe; background: #eef2ff; }
.step-row.failed { border-color: #fecaca; background: #fef2f2; }
.step-status-icon { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; }
.step-row.completed .step-status-icon { color: #16a34a; }
.step-row.running .step-status-icon { color: #6366f1; }
.step-row.failed .step-status-icon { color: #e11d48; }
.step-row-body { display: flex; align-items: center; justify-content: space-between; flex: 1; }
.step-row-title { font-size: 14px; font-weight: 500; color: #18181b; }
.step-row-duration { font-size: 12px; color: #a1a1aa; font-weight: 400; }
.page-section { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.page-title { font-size: 18px; font-weight: 700; color: #18181b; margin: 0; }
.page-hint { font-size: 14px; color: #71717a; margin: 0; }
.field-group { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 14px; font-weight: 500; color: #3f3f46; }
.required-mark { color: #e11d48; }
.field-input { padding: 10px 12px; border: 1px solid #e4e4e7; border-radius: 8px; font-size: 14px; color: #18181b; outline: none; transition: border-color 0.15s; }
.field-input:focus { border-color: #6366f1; }
.file-hidden { display: none; }
.dropzone { border: 2px dashed #d4d4d8; border-radius: 12px; padding: 32px; text-align: center; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
.dropzone:hover, .dropzone.dragover { border-color: #6366f1; background: #eef2ff; }
.dropzone-placeholder { font-size: 14px; color: #71717a; }
.dropzone-file { font-size: 14px; color: #18181b; font-weight: 500; }
.error-text { font-size: 13px; color: #e11d48; }
.text-body { font-size: 15px; color: #3f3f46; line-height: 1.6; white-space: pre-wrap; }
.done-section, .error-section, .cancelled-section { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; padding: 32px 0; }
.result-icon { font-size: 48px; width: 72px; height: 72px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.result-icon.done { background: #f0fdf4; color: #16a34a; }
.result-icon.error { background: #fef2f2; color: #e11d48; }
.result-icon.cancelled { background: #f4f4f5; color: #71717a; }
.result-title { font-size: 20px; font-weight: 700; color: #18181b; margin: 0; }
.result-duration { font-size: 14px; color: #71717a; }
.result-list { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.result-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: #fff; border: 1px solid #e4e4e7; border-radius: 8px; }
.result-item-title { font-size: 14px; font-weight: 500; color: #18181b; }
.result-item-time { font-size: 12px; color: #a1a1aa; }
.error-detail { font-size: 14px; color: #e11d48; max-width: 480px; }
</style>
