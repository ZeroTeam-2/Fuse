<template>
  <div>
    <div v-if="loading" class="font-sans text-sm text-zinc-400 py-16 text-center">Загрузка…</div>

    <div v-else-if="!scenario" class="font-sans text-sm text-zinc-400 py-16 text-center">
      Сценарий не найден
    </div>

    <Card v-else padding="xl" class="flex flex-col gap-6">
      <!-- idle -->
      <template v-if="phase === 'idle'">
        <div>
          <h3 class="font-sans font-bold text-[1.0625rem] tracking-tight text-zinc-900 mb-1.5">
            Запуск сценария
          </h3>
          <p class="font-sans text-sm text-zinc-500 max-w-[460px]">
            Сценарий сам выполнит {{ scenario.steps.length }} шаг(ов) и вернёт готовый результат —
            без ручной сборки.
          </p>
        </div>
        <StepProgress :steps="previewSteps" />
        <div>
          <Button variant="primary" :disabled="starting" @click="startRun">
            {{ starting ? "Запуск…" : "Получить результат" }}
            <template #right><Icon name="arrow-right" :size="18" /></template>
          </Button>
        </div>
      </template>

      <!-- starting / running -->
      <template v-else-if="phase === 'starting' || phase === 'running'">
        <StepProgress
          :heading="{ label: 'Выполняем сценарий…', status: 'active' }"
          :steps="runSteps"
        />
        <div v-if="phase === 'running'">
          <Button variant="secondary" size="sm" @click="cancelRun">Отменить</Button>
        </div>
      </template>

      <!-- waiting: page:required -->
      <template v-else-if="phase === 'waiting' && currentPage">
        <!-- fields -->
        <template v-if="currentPage.page.type === 'fields'">
          <div>
            <h3 class="font-sans font-bold text-[1.0625rem] tracking-tight text-zinc-900 mb-1.5">
              {{ currentPage.page.title }}
            </h3>
            <p v-if="currentPage.page.hint" class="font-sans text-sm text-zinc-500">
              {{ currentPage.page.hint }}
            </p>
          </div>
          <form class="flex flex-col gap-4" @submit.prevent="submitFields">
            <Input
              v-for="field in currentPage.page.fields"
              :key="field.key"
              v-model="formData[field.key]"
              :label="field.required ? `${field.label} *` : field.label"
              :placeholder="field.placeholder || ''"
            />
            <div>
              <Button variant="primary" type="submit">{{ currentPage.page.buttonText }}</Button>
            </div>
          </form>
        </template>

        <!-- file -->
        <template v-else-if="currentPage.page.type === 'file'">
          <div>
            <h3 class="font-sans font-bold text-[1.0625rem] tracking-tight text-zinc-900 mb-1.5">
              {{ currentPage.page.title }}
            </h3>
            <p v-if="currentPage.page.hint" class="font-sans text-sm text-zinc-500">
              {{ currentPage.page.hint }}
            </p>
          </div>
          <div
            :class="[
              'rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors',
              isDragOver ? 'border-rose-600 bg-rose-50' : 'border-zinc-300 hover:border-rose-400 hover:bg-zinc-50',
            ]"
            @click="triggerFileInput"
            @dragover.prevent="isDragOver = true"
            @dragleave.prevent="isDragOver = false"
            @drop.prevent="onFileDrop"
          >
            <span v-if="!selectedFile" class="font-sans text-sm text-zinc-500">
              Перетащите файл сюда или нажмите для выбора
              <span v-if="currentPage.page.maxMb">(макс. {{ currentPage.page.maxMb }} МБ)</span>
            </span>
            <span v-else class="font-sans text-sm font-semibold text-zinc-900">
              {{ selectedFile.name }} ({{ formatFileSize(selectedFile.size) }})
            </span>
          </div>
          <input
            ref="fileInput"
            type="file"
            class="hidden"
            :accept="currentPage.page.accept || undefined"
            @change="onFileSelect"
          />
          <p v-if="fileError" class="font-sans text-[0.8125rem] text-rose-600">{{ fileError }}</p>
          <div>
            <Button variant="primary" :disabled="!selectedFile || !!fileError" @click="submitFile">
              {{ currentPage.page.buttonText }}
            </Button>
          </div>
        </template>

        <!-- text -->
        <template v-else-if="currentPage.page.type === 'text'">
          <div>
            <h3 class="font-sans font-bold text-[1.0625rem] tracking-tight text-zinc-900 mb-1.5">
              {{ currentPage.page.title }}
            </h3>
            <div class="font-sans text-[0.9375rem] text-zinc-700 leading-relaxed whitespace-pre-wrap">
              {{ currentPage.page.body }}
            </div>
          </div>
          <div>
            <Button variant="primary" @click="submitText">Продолжить</Button>
          </div>
        </template>
      </template>

      <!-- done -->
      <template v-else-if="phase === 'done'">
        <div class="flex items-center gap-2.5">
          <span
            class="w-6 h-6 rounded-full bg-green-600 text-white inline-flex items-center justify-center"
          >
            <Icon name="check" :size="14" :stroke-width="3" />
          </span>
          <span class="font-sans font-bold text-[0.9375rem] text-zinc-900">Результат готов</span>
        </div>
        <p v-if="totalDurationMs > 0" class="font-sans text-sm text-zinc-500 -mt-2">
          Общее время: {{ totalDurationMs }} мс
        </p>
        <Card v-if="resultItems.length" padding="lg">
          <KeyValueGrid :items="resultItems" :columns="1" />
        </Card>
        <div>
          <Button variant="dark" @click="reset">Запустить снова</Button>
        </div>
      </template>

      <!-- error -->
      <template v-else-if="phase === 'error'">
        <div class="flex items-center gap-2.5">
          <span
            class="w-6 h-6 rounded-full bg-rose-600 text-white inline-flex items-center justify-center"
          >
            <Icon name="x" :size="14" :stroke-width="3" />
          </span>
          <span class="font-sans font-bold text-[0.9375rem] text-zinc-900">Ошибка выполнения</span>
        </div>
        <p class="font-sans text-sm text-rose-600 max-w-[480px]">{{ errorMessage }}</p>
        <div>
          <Button variant="dark" @click="reset">Запустить снова</Button>
        </div>
      </template>

      <!-- cancelled -->
      <template v-else-if="phase === 'cancelled'">
        <div class="flex items-center gap-2.5">
          <span
            class="w-6 h-6 rounded-full bg-zinc-200 text-zinc-500 inline-flex items-center justify-center"
          >
            <Icon name="ban" :size="14" :stroke-width="2.5" />
          </span>
          <span class="font-sans font-bold text-[0.9375rem] text-zinc-900">Выполнение отменено</span>
        </div>
        <div>
          <Button variant="dark" @click="reset">Запустить снова</Button>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
// RunPanel — the scenario execution flow (WS-driven), reused by the scenario
// view "Запуск" tab and the standalone /cards/[id]/run route.
import type { Step, StepPage, ServerWsEvent, RunStatus } from "@fuse/shared";

const props = defineProps<{ scenarioId: string }>();
const emit = defineEmits<{ loaded: [{ title: string; tagline?: string }] }>();

const { $api } = useNuxtApp() as any;

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

// Map internal step status → DS StepProgress status (done/active/pending).
function dsStatus(s: StepProgress["status"]): "done" | "active" | "pending" {
  if (s === "completed") return "done";
  if (s === "running") return "active";
  return "pending";
}

const previewSteps = computed(() =>
  (scenario.value?.steps ?? []).map((st) => ({
    label: st.title,
    status: "pending" as const,
    meta: st.type,
  })),
);

const runSteps = computed(() =>
  stepProgress.value.map((s) => ({
    label: s.title,
    status: dsStatus(s.status),
    meta: s.durationMs != null ? `${s.durationMs} мс` : undefined,
  })),
);

const resultItems = computed(() =>
  stepProgress.value.map((s) => ({
    label: s.title,
    value: s.durationMs != null ? `${s.durationMs} мс` : "—",
  })),
);

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

async function fetchScenario() {
  loading.value = true;
  try {
    const { data } = await $api.GET(`/api/scenarios/${props.scenarioId}`, {});
    if (data) {
      const s = data;
      scenario.value = {
        title: s.title,
        tagline: s.tagline,
        steps: (s.steps ?? []) as Step[],
      };
      emit("loaded", { title: s.title, tagline: s.tagline });
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
      body: { scenarioId: props.scenarioId },
    });
    if (!data) return;
    runId.value = (data as { id?: string; _id?: string }).id
      ?? (data as { _id?: string })._id
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
