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
        <div
          v-if="scenario.blocked"
          class="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5"
        >
          <Icon name="alert-triangle" :size="18" class="text-rose-600 shrink-0 mt-0.5" />
          <p class="font-sans text-[0.875rem] text-rose-700 leading-normal">
            {{ scenario.blockedReason ?? "Сценарий временно заблокирован автором." }}
          </p>
        </div>
        <StepProgress :steps="previewSteps" />

        <!-- Ручные значения всех шагов: обязательные блокируют запуск. -->
        <RunManualInputsForm
          v-if="manualInputs.length"
          :fields="manualInputs"
          :busy="starting || scenario.blocked"
          @submit="startRun"
        />
        <div v-else>
          <Button variant="primary" :disabled="starting || scenario.blocked" @click="startRun({})">
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

      <!-- waiting: input:required — обязательного значения не оказалось во входах -->
      <template v-else-if="phase === 'waiting' && pendingInputs">
        <div>
          <h3 class="font-sans font-bold text-[1.0625rem] tracking-tight text-zinc-900 mb-1.5">
            Нужны данные для шага «{{ pendingInputs.stepTitle }}»
          </h3>
          <p class="font-sans text-sm text-zinc-500">
            Без этих значений шаг не сможет выполниться.
          </p>
        </div>
        <RunManualInputsForm
          :fields="pendingInputs.fields"
          submit-text="Продолжить"
          @submit="submitPendingInputs"
        />
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

        <!-- Данные результата: коллекция -->
        <template v-if="resultView?.kind === 'list'">
          <p class="font-sans text-sm font-semibold text-zinc-900">
            Получено записей: {{ resultView.count }}
          </p>
          <Card v-for="(row, i) in resultView.items" :key="i" padding="lg">
            <KeyValueGrid :items="row" :columns="1" />
          </Card>
          <p v-if="hiddenResultCount" class="font-sans text-sm text-zinc-500 -mt-2">
            …и ещё {{ hiddenResultCount }} — полный ответ ниже
          </p>
        </template>

        <!-- Данные результата: объект -->
        <Card v-else-if="resultView?.kind === 'object'" padding="lg">
          <KeyValueGrid :items="resultView.items" :columns="1" />
        </Card>

        <!-- Данные результата: скаляр -->
        <Card v-else-if="resultView?.kind === 'scalar'" padding="lg">
          <p class="font-sans text-[0.9375rem] text-zinc-900">{{ resultView.value }}</p>
        </Card>

        <CodeBlock v-if="lastResult != null" :code="lastResult" label="Полный ответ" />

        <Card v-if="stepTimings.length" padding="lg">
          <KeyValueGrid :items="stepTimings" :columns="1" />
        </Card>
        <div class="flex items-center gap-[18px]">
          <Button variant="dark" @click="reset">Запустить снова</Button>
          <button
            type="button"
            class="font-sans text-[0.9375rem] font-semibold text-violet-600 hover:text-violet-700"
            @click="emit('playground')"
          >
            Посмотреть, как это работает →
          </button>
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
import type {
  ManualInputDescriptor,
  Step,
  StepPage,
  ServerWsEvent,
  RunStatusPayload,
  RunStepResult,
} from "@fuse/shared";

const props = defineProps<{ scenarioId: string }>();
const emit = defineEmits<{
  loaded: [{ title: string; tagline?: string }];
  playground: [];
}>();

const { $api } = useNuxtApp() as any;
const route = useRoute();
const router = useRouter();

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

/** Значения, которых воркер не нашёл во входах и просит по ходу выполнения. */
interface PendingInputsState {
  stepIndex: number;
  stepTitle: string;
  fields: ManualInputDescriptor[];
}

type Phase = "idle" | "starting" | "running" | "waiting" | "done" | "error" | "cancelled";

const loading = ref(true);
const scenario = ref<{
  title: string;
  tagline?: string;
  steps: Step[];
  blocked?: boolean;
  blockedReason?: string;
} | null>(null);
const starting = ref(false);
const phase = ref<Phase>("idle");
const stepProgress = ref<StepProgress[]>([]);
const currentPage = ref<PageState | null>(null);
/** Ручные значения сценария, которые спрашивает форма перед запуском. */
const manualInputs = ref<ManualInputDescriptor[]>([]);
const pendingInputs = ref<PendingInputsState | null>(null);
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

// Полезная нагрузка последнего успешного шага — то, ради чего пользователь и
// запускал сценарий. Раньше здесь показывались только тайминги, поэтому даже
// успешный запуск выглядел как «на выходе ничего нет».
const lastResult = computed<unknown>(() => {
  for (let i = stepProgress.value.length - 1; i >= 0; i--) {
    const step = stepProgress.value[i];
    if (step.status === "completed" && step.result != null) return step.result;
  }
  return undefined;
});

function toItems(value: Record<string, unknown>) {
  return Object.entries(value).map(([key, v]) => ({
    label: key,
    value:
      v == null
        ? "—"
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v),
  }));
}

type ResultView =
  | { kind: "list"; count: number; items: ReturnType<typeof toItems>[] }
  | { kind: "object"; items: ReturnType<typeof toItems> }
  | { kind: "scalar"; value: string }
  | null;

const PREVIEW_LIMIT = 5;

const resultView = computed<ResultView>(() => {
  const raw = lastResult.value;
  if (raw == null) return null;

  if (Array.isArray(raw)) {
    const rows = raw
      .slice(0, PREVIEW_LIMIT)
      .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
      .map(toItems);
    return { kind: "list", count: raw.length, items: rows };
  }

  if (typeof raw === "object") {
    return { kind: "object", items: toItems(raw as Record<string, unknown>) };
  }

  return { kind: "scalar", value: String(raw) };
});

const hiddenResultCount = computed(() =>
  resultView.value?.kind === "list"
    ? Math.max(0, resultView.value.count - PREVIEW_LIMIT)
    : 0,
);

const stepTimings = computed(() =>
  stepProgress.value
    .filter((s) => s.durationMs != null)
    .map((s) => ({ label: s.title, value: `${s.durationMs} мс` })),
);

// Запуск завершился — сторожить тишину больше нечего.
watch(phase, (value) => {
  if (value === "done" || value === "error" || value === "cancelled") {
    socketApi.value?.stopWatchdog();
  }
});

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
    // Карточка маркетплейса публична — панель видна и гостю, до входа.
    const { data } = await $api.GET(`/api/marketplace/${props.scenarioId}`, {});
    if (data) {
      const s = data;
      scenario.value = {
        title: s.title,
        tagline: s.tagline,
        steps: (s.steps ?? []) as Step[],
        blocked: s.blocked,
        blockedReason: s.blockedReason,
      };
      emit("loaded", { title: s.title, tagline: s.tagline });
    }
  } catch {
    scenario.value = null;
  } finally {
    loading.value = false;
  }
}

/**
 * Что спросить у пользователя перед стартом, считает сервер: тем же
 * перечислением воркер потом проверяет полноту входов. Список приходит
 * без значений, которые спросит страница ввода своего шага.
 */
async function fetchManualInputs() {
  try {
    const { data } = await $api.GET(`/api/marketplace/${props.scenarioId}/manual-inputs`, {});
    manualInputs.value = (data ?? []) as ManualInputDescriptor[];
  } catch {
    manualInputs.value = [];
  }
}

async function startRun(inputs: Record<string, unknown> = {}) {
  // Запуск создаёт run под пользователем — гостя сначала просим войти.
  if (!useAuthStore().isAuthenticated) {
    useLoginModal().openLogin("Войдите, чтобы запустить сценарий.");
    return;
  }
  starting.value = true;
  phase.value = "starting";
  try {
    const { data, error: apiError } = await $api.POST("/api/runs", {
      body: { scenarioId: props.scenarioId, inputs },
    });
    if (apiError || !data) {
      starting.value = false;
      phase.value = "error";
      // Сценарий может быть заблокирован (шаг ссылается на удалённый API) —
      // сервер возвращает 400 с понятным текстом, показываем его как есть.
      errorMessage.value =
        (apiError as { message?: string } | undefined)?.message ??
        "Не удалось создать запуск";
      return;
    }
    runId.value = (data as { id?: string; _id?: string }).id
      ?? (data as { _id?: string })._id
      ?? "";
    if (!runId.value) return;

    starting.value = false;
    phase.value = "running";
    processedCount = 0;

    // runId уезжает в URL: без этого перезагрузка страницы теряла запуск
    // насовсем (сокет не к чему было подключать, и снапшот восстановить
    // состояние не мог — пользователь видел пустой экран запуска).
    attachToRun(runId.value);
    router.replace({ query: { ...route.query, run: runId.value } });
  } catch {
    starting.value = false;
    phase.value = "error";
    errorMessage.value = "Не удалось создать запуск";
  }
}

function attachToRun(id: string) {
  runId.value = id;
  processedCount = 0;
  socketApi.value = useRunSocket(id, { onSilence: resyncRun });
  socketApi.value.connect();
}

/**
 * Поток событий молчит дольше положенного — перечитываем состояние запуска из
 * БД и применяем его тем же кодом, что и снапшот сокета. Без этого потерянный
 * поток (запуск исполнил другой процесс, воркер умер, gateway моргнул)
 * оставляет пользователя в вечном «Выполняем сценарий…».
 */
async function resyncRun() {
  if (!runId.value) return;
  // В фазе ожидания ввода тишина нормальна — ждём пользователя. Перечитывание
  // здесь ещё и затёрло бы уже набранные в форме значения.
  if (phase.value !== "running" && phase.value !== "starting") return;

  try {
    const { data } = await $api.GET(`/api/runs/${runId.value}`, {});
    if (!data) return;

    const run = data as {
      status: RunStatusPayload["status"];
      currentStep?: number;
      stepResults?: unknown[];
      error?: string;
    };

    applySnapshot({
      status: run.status,
      currentStep: run.currentStep ?? 0,
      stepResults: run.stepResults ?? [],
      error: run.error,
    });
  } catch {
    // Сеть моргнула — следующая проверка сторожа попробует снова.
  }
}

/**
 * Восстановление после перезагрузки: подключаемся к запуску из URL, а текущее
 * состояние приезжает снапшотом `run:status` сразу при подключении к комнате.
 */
function resumeFromUrl() {
  const id = route.query.run;
  if (typeof id !== "string" || !id) return;
  phase.value = "running";
  attachToRun(id);
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
      pendingInputs.value = null;
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
    // Обязательного значения не оказалось во входах запуска — воркер остановился
    // и просит его: спрашиваем теми же полями, что и форма перед запуском.
    case "input:required": {
      phase.value = "waiting";
      currentPage.value = null;
      pendingInputs.value = {
        stepIndex: event.payload.stepIndex,
        stepTitle: event.payload.stepTitle,
        fields: event.payload.fields,
      };
      break;
    }
    case "run:done": {
      totalDurationMs.value = event.payload.totalDurationMs ?? 0;
      phase.value = "done";
      currentPage.value = null;
      pendingInputs.value = null;
      break;
    }
    case "run:error": {
      errorMessage.value = event.payload.error;
      phase.value = "error";
      currentPage.value = null;
      pendingInputs.value = null;
      break;
    }
    // Снапшот состояния: сервер шлёт его сразу при подключении к комнате, потому
    // что worker мог начать (и даже закончить) запуск до того, как сокет успел
    // подписаться. Без этого пропущенные события терялись навсегда.
    case "run:status": {
      applySnapshot(event.payload);
      break;
    }
  }
}

// Шаг никогда не «откатывается»: снапшот может прийти после инкрементальных
// событий, и тогда он не должен затирать более свежий статус.
const STATUS_RANK: Record<StepProgress["status"], number> = {
  pending: 0,
  running: 1,
  completed: 2,
  failed: 2,
};

function applySnapshot(payload: RunStatusPayload) {
  for (const sr of (payload.stepResults ?? []) as RunStepResult[]) {
    const existing = stepProgress.value.find((s) => s.index === sr.stepIndex);
    if (!existing) {
      stepProgress.value.push({
        index: sr.stepIndex,
        title: sr.stepTitle,
        status: sr.status,
        durationMs: sr.durationMs,
        result: sr.result,
      });
      continue;
    }
    if (STATUS_RANK[sr.status] >= STATUS_RANK[existing.status]) {
      existing.status = sr.status;
      existing.durationMs = sr.durationMs ?? existing.durationMs;
      existing.result = sr.result ?? existing.result;
    }
  }
  stepProgress.value.sort((a, b) => a.index - b.index);

  switch (payload.status) {
    case "completed":
      phase.value = "done";
      currentPage.value = null;
      pendingInputs.value = null;
      if (!totalDurationMs.value) {
        totalDurationMs.value = stepProgress.value.reduce(
          (sum, s) => sum + (s.durationMs ?? 0),
          0,
        );
      }
      break;
    case "failed":
      // Запуск мог упасть ещё до подключения сокета — тогда run:error клиент
      // не увидел, и текст ошибки приезжает только здесь.
      errorMessage.value =
        payload.error ||
        stepProgress.value.find((s) => s.status === "failed")?.title ||
        "Выполнение завершилось ошибкой";
      phase.value = "error";
      currentPage.value = null;
      pendingInputs.value = null;
      break;
    case "cancelled":
      phase.value = "cancelled";
      currentPage.value = null;
      pendingInputs.value = null;
      break;
    case "waiting_input":
      // Ни страницы, ни списка запрошенных значений в снапшоте нет — шаг ждёт
      // либо своей страницы (она есть в сценарии), либо добора (тогда считаем,
      // чего именно не хватает, по входам запуска).
      if (scenario.value?.steps?.[payload.currentStep]?.page) {
        restoreWaitingPage(payload.currentStep);
      } else {
        void restoreWaitingInputs(payload.currentStep);
      }
      break;
    case "pending":
    case "running":
      if (phase.value !== "waiting") phase.value = "running";
      break;
  }
}

function restoreWaitingPage(stepIndex: number) {
  const step = scenario.value?.steps?.[stepIndex];
  if (!step?.page) return;
  currentPage.value = {
    stepIndex,
    stepTitle: step.title,
    page: step.page,
  };
  pendingInputs.value = null;
  formData.value = {};
  selectedFile.value = null;
  fileError.value = "";
  phase.value = "waiting";
}

/**
 * После перезагрузки страницы список запрошенных значений взять неоткуда:
 * пересобираем его сами — обязательные значения шага, которых нет во входах
 * запуска. Иначе пользователь остался бы на бесконечном «Выполняем сценарий…».
 */
async function restoreWaitingInputs(stepIndex: number) {
  const stepFields = manualInputs.value.filter(
    (field) => field.required && field.stepPath[0] === stepIndex,
  );
  if (!stepFields.length) return;

  let inputs: Record<string, unknown> = {};
  try {
    const { data } = await $api.GET(`/api/runs/${runId.value}`, {});
    inputs = ((data as { inputs?: Record<string, unknown> })?.inputs ?? {});
  } catch {
    inputs = {};
  }

  const missing = stepFields.filter((field) => {
    const value = inputs[field.key];
    return value === undefined || value === null || value === "";
  });
  if (!missing.length) return;

  currentPage.value = null;
  pendingInputs.value = {
    stepIndex,
    stepTitle: missing[0].stepTitle,
    fields: missing,
  };
  phase.value = "waiting";
}

function submitFields() {
  if (!currentPage.value || !socketApi.value) return;
  socketApi.value.submitPage(currentPage.value.stepIndex, { ...formData.value });
  currentPage.value = null;
  phase.value = "running";
}

function submitPendingInputs(values: Record<string, unknown>) {
  if (!pendingInputs.value || !socketApi.value) return;
  socketApi.value.submitInputs(pendingInputs.value.stepIndex, values);
  pendingInputs.value = null;
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
  const { run: _dropped, ...rest } = route.query;
  router.replace({ query: rest });
  phase.value = "idle";
  stepProgress.value = [];
  currentPage.value = null;
  pendingInputs.value = null;
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

onMounted(async () => {
  await Promise.all([fetchScenario(), fetchManualInputs()]);
  resumeFromUrl();
});

onUnmounted(() => {
  socketApi.value?.disconnect();
});
</script>
