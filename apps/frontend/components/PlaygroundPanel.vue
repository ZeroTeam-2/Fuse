<template>
  <div>
    <div v-if="loading" class="font-sans text-sm text-zinc-400 py-16 text-center">Загрузка…</div>

    <div v-else-if="!scenario" class="font-sans text-sm text-zinc-400 py-16 text-center">
      Сценарий не найден
    </div>

    <Card v-else padding="none">
      <div class="flex items-center justify-between gap-3 px-6 py-5 border-b border-zinc-200">
        <div class="flex items-center gap-2.5">
          <!-- Есть ручные значения — запуск идёт из формы ниже: она и блокирует
               кнопку, пока обязательные поля не заполнены. -->
          <Button
            v-if="!showInputsForm"
            variant="primary"
            :disabled="running || phase === 'done' || scenario.blocked"
            @click="runAll({})"
          >
            {{ running ? "Выполнение…" : "Выполнить все" }}
            <template #right><Icon name="play" :size="18" /></template>
          </Button>
          <Button v-if="phase === 'waiting' && waitingForStep !== null" variant="secondary" @click="advanceStep">
            Выполнить шаг
          </Button>
        </div>
        <Button variant="secondary" size="sm" @click="reset">Сбросить</Button>
      </div>

      <!-- Ручные значения без страницы — те же поля, что и в простом режиме. -->
      <div v-if="showInputsForm" class="px-6 py-5 border-b border-zinc-200">
        <RunManualInputsForm
          :fields="formFields"
          submit-text="Выполнить все"
          :busy="running || scenario.blocked"
          @submit="runAll"
        />
      </div>

      <div
        v-if="scenario.blocked"
        class="flex items-start gap-3 border-b border-rose-200 bg-rose-50 px-6 py-3.5"
      >
        <Icon name="alert-triangle" :size="18" class="text-rose-600 shrink-0 mt-0.5" />
        <p class="font-sans text-[0.875rem] text-rose-700 leading-normal">
          {{ scenario.blockedReason ?? "Сценарий временно заблокирован автором." }}
        </p>
      </div>

      <div class="p-6 flex flex-col gap-[22px]">
        <div v-for="(step, i) in scenario.steps" :key="i" class="flex flex-col gap-2.5">
          <div class="flex items-center gap-2.5">
            <span
              :class="[
                'w-6 h-6 rounded-full inline-flex items-center justify-center font-sans font-bold text-xs shrink-0',
                numberTone(i),
              ]"
            >
              <Icon v-if="stepStatus(i) === 'completed'" name="check" :size="14" :stroke-width="3" />
              <Icon v-else-if="stepStatus(i) === 'failed'" name="x" :size="14" :stroke-width="3" />
              <template v-else>{{ i + 1 }}</template>
            </span>

            <span class="font-sans font-bold text-[0.9375rem] text-zinc-900">{{ step.title }}</span>

            <template v-if="step.type === 'api'">
              <MethodBadge :method="step.method" />
              <span class="font-mono text-xs text-zinc-500 bg-zinc-100 rounded-md px-2 py-0.5">
                {{ step.path }}
              </span>
            </template>
            <Badge v-else tone="neutral" size="sm">{{ step.type }}</Badge>

            <span v-if="stepTimings[i] != null" class="ml-auto font-mono text-xs text-zinc-400">
              {{ stepTimings[i] }} мс
            </span>
            <span
              v-else-if="stepStatus(i) === 'running'"
              class="ml-auto font-mono text-xs text-violet-600"
            >
              выполняется…
            </span>
          </div>

          <CodeBlock v-if="resultOf(i) !== undefined" :code="resultOf(i)" />

          <p
            v-if="stepErrors[i]"
            class="font-sans text-[0.8125rem] text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5"
          >
            {{ stepErrors[i] }}
          </p>

          <!-- inline top-up: обязательного значения не оказалось во входах -->
          <div
            v-if="pendingInputs && pendingInputs.stepIndex === i"
            class="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 flex flex-col gap-4"
          >
            <p class="font-sans text-[0.8125rem] text-zinc-500">
              Шагу не хватает данных — введите их, чтобы продолжить.
            </p>
            <RunManualInputsForm
              :fields="pendingInputs.fields"
              submit-text="Продолжить"
              @submit="submitPendingInputs"
            />
          </div>

          <!-- inline page: awaiting user input on this step -->
          <div
            v-else-if="waitingForStep === i && step.page"
            class="rounded-2xl border border-zinc-200 bg-zinc-50 p-5"
          >
            <RunPageRunner
              :page="step.page"
              :resolved="pageResolved"
              size="sm"
              @submit="submitPage(i, $event)"
            />
          </div>
        </div>

        <div
          v-if="phase === 'done'"
          class="text-center bg-green-50 border border-green-200 rounded-2xl p-5"
        >
          <div class="font-sans font-bold text-[1.0625rem] text-green-600 mb-1">
            Сценарий выполнен
          </div>
          <div class="font-sans text-sm text-green-700 mb-3.5">
            {{ doneSummary }}
          </div>
          <Button variant="secondary" size="sm" @click="reset">Запустить заново</Button>
        </div>
      </div>
    </Card>
  </div>
</template>

<script setup lang="ts">
// PlaygroundPanel — step-by-step view of a run: every step shows its raw JSON
// result. Reused by the scenario view "Запуск" tab (Playground segment) and the
// standalone /cards/[id]/playground route.
import type { ManualInputDescriptor, Step, ServerWsEvent } from "@fuse/shared";

const props = defineProps<{ scenarioId: string }>();
const emit = defineEmits<{ loaded: [{ title: string; tagline?: string }] }>();

const { $api } = useNuxtApp() as any;

const loading = ref(true);
const scenario = ref<{
  title: string;
  tagline?: string;
  steps: Step[];
  blocked?: boolean;
  blockedReason?: string;
} | null>(null);
const running = ref(false);
const phase = ref<"idle" | "running" | "waiting" | "done" | "error">("idle");
const stepStatuses = ref<Record<number, "pending" | "running" | "completed" | "failed">>({});
const stepResultsData = ref<Record<number, unknown>>({});
const stepTimings = ref<Record<number, number>>({});
const stepErrors = ref<Record<number, string>>({});
const totalDurationMs = ref(0);
const waitingForStep = ref<number | null>(null);
/** Ручные значения сценария — включая собираемые страницами шагов. */
const manualInputs = ref<ManualInputDescriptor[]>([]);
const pendingInputs = ref<{
  stepIndex: number;
  stepTitle: string;
  fields: ManualInputDescriptor[];
} | null>(null);

/**
 * Форма перед запуском спрашивает только значения без страницы (`source: "form"`);
 * покрытые страницей (`source: "page"`) собирает сама страница шага по ходу.
 */
const formFields = computed(() =>
  manualInputs.value.filter((field) => field.source === "form"),
);

const showInputsForm = computed(
  () => phase.value === "idle" && formFields.value.length > 0,
);
// Значения блоков отображения текущей ожидающей страницы, из результатов
// пройденных шагов (payload события `page:required`).
const pageResolved = ref<Record<string, unknown>>({});

const runId = ref("");
const socketApi = shallowRef<ReturnType<typeof useRunSocket> | null>(null);
let processedCount = 0;

// Запуск завершился — сторожить тишину больше нечего.
watch(phase, (value) => {
  if (value === "done" || value === "error") {
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

function stepStatus(i: number): "pending" | "running" | "completed" | "failed" {
  return stepStatuses.value[i] ?? "pending";
}

const NUMBER_TONES = {
  pending: "bg-zinc-100 text-zinc-400",
  running: "bg-violet-100 text-violet-600",
  completed: "bg-green-600 text-white",
  failed: "bg-rose-600 text-white",
} as const;

function numberTone(i: number): string {
  return NUMBER_TONES[stepStatus(i)];
}

// Step results arrive over WS as `unknown`; CodeBlock renders a string or
// pretty-prints an object.
function resultOf(i: number): string | object | undefined {
  const r = stepResultsData.value[i];
  if (r == null) return undefined;
  return typeof r === "object" ? (r as object) : String(r);
}

const doneSummary = computed(() => {
  const total = scenario.value?.steps.length ?? 0;
  const word = total % 10 === 1 && total % 100 !== 11 ? "шаг" : "шагов";
  const time = totalDurationMs.value > 0 ? ` за ${totalDurationMs.value} мс` : "";
  return `Все ${total} ${word} прошли успешно${time}`;
});

async function fetchScenario() {
  loading.value = true;
  try {
    // Карточка маркетплейса публична — playground виден и гостю, до входа.
    const { data } = await $api.GET(`/api/marketplace/${props.scenarioId}`, {});
    if (data) {
      scenario.value = {
        title: data.title,
        tagline: data.tagline,
        steps: (data.steps ?? []) as Step[],
        blocked: data.blocked,
        blockedReason: data.blockedReason,
      };
      emit("loaded", { title: data.title, tagline: data.tagline });
    }
  } catch {
    scenario.value = null;
  } finally {
    loading.value = false;
  }
}

/** Тот же список, что и в простом режиме: считает сервер, проверяет воркер. */
async function fetchManualInputs() {
  try {
    const { data } = await $api.GET(`/api/marketplace/${props.scenarioId}/manual-inputs`, {});
    manualInputs.value = (data ?? []) as ManualInputDescriptor[];
  } catch {
    manualInputs.value = [];
  }
}

async function runAll(inputs: Record<string, unknown> = {}) {
  // Запуск создаёт run под пользователем — гостя сначала просим войти.
  if (!useAuthStore().isAuthenticated) {
    useLoginModal().openLogin("Войдите, чтобы запустить сценарий.");
    return;
  }
  running.value = true;
  phase.value = "running";
  resetStepData();

  try {
    const { data, error: apiError } = await $api.POST("/api/runs", {
      body: { scenarioId: props.scenarioId, inputs },
    });
    if (apiError || !data) {
      running.value = false;
      phase.value = "error";
      return;
    }
    runId.value = (data as { id?: string; _id?: string }).id
      ?? (data as { _id?: string })._id
      ?? "";
    if (!runId.value) {
      running.value = false;
      phase.value = "error";
      return;
    }

    processedCount = 0;
    socketApi.value = useRunSocket(runId.value, { onSilence: resyncRun });
    socketApi.value.connect();
  } catch {
    running.value = false;
    phase.value = "error";
  }
}

function advanceStep() {
  if (waitingForStep.value == null) return;
  submitPage(waitingForStep.value, {});
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
      pendingInputs.value = null;
      waitingForStep.value = event.payload.stepIndex;
      pageResolved.value = event.payload.resolved ?? {};
      break;
    }
    case "input:required": {
      phase.value = "waiting";
      running.value = false;
      waitingForStep.value = null;
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
      running.value = false;
      waitingForStep.value = null;
      pendingInputs.value = null;
      break;
    }
    case "run:error": {
      stepStatuses.value[event.payload.stepIndex] = "failed";
      stepErrors.value[event.payload.stepIndex] = event.payload.error;
      phase.value = "error";
      running.value = false;
      waitingForStep.value = null;
      pendingInputs.value = null;
      break;
    }
    case "run:status": {
      applyRunSnapshot(event.payload as RunSnapshot);
      break;
    }
  }
}

interface RunSnapshot {
  status: string;
  currentStep?: number;
  stepResults?: {
    stepIndex: number;
    status: "pending" | "running" | "completed" | "failed";
    result?: unknown;
    durationMs?: number;
    error?: string;
  }[];
  error?: string;
}

/** Состояние запуска целиком: и снапшот сокета, и ответ на перечитывание по тишине. */
function applyRunSnapshot(snapshot: RunSnapshot) {
  for (const sr of snapshot.stepResults ?? []) {
    stepStatuses.value[sr.stepIndex] = sr.status;
    if (sr.result !== undefined) stepResultsData.value[sr.stepIndex] = sr.result;
    if (sr.durationMs != null) stepTimings.value[sr.stepIndex] = sr.durationMs;
    if (sr.error) stepErrors.value[sr.stepIndex] = sr.error;
  }

  if (snapshot.status === "completed") {
    phase.value = "done";
    running.value = false;
    waitingForStep.value = null;
    pendingInputs.value = null;
    if (!totalDurationMs.value) {
      totalDurationMs.value = Object.values(stepTimings.value).reduce(
        (sum, ms) => sum + (ms ?? 0),
        0,
      );
    }
    return;
  }

  if (snapshot.status === "failed") {
    phase.value = "error";
    running.value = false;
    waitingForStep.value = null;
    pendingInputs.value = null;
    return;
  }

  if (snapshot.status === "cancelled") {
    phase.value = "idle";
    running.value = false;
    waitingForStep.value = null;
    pendingInputs.value = null;
    return;
  }

  // Запуск ждёт ввода, а живое событие (`page:required`/`input:required`) до
  // клиента не дошло: сокет входит в комнату ПОСЛЕ POST /api/runs, и для
  // мгновенного шага воркер успевает дойти до страницы раньше — тогда состояние
  // приезжает только снапшотом. Без этой ветки playground навсегда застревал в
  // «Выполнение…»: страница ввода не показывалась.
  if (snapshot.status === "waiting_input") {
    const stepIndex = snapshot.currentStep ?? 0;
    const step = scenario.value?.steps?.[stepIndex];
    running.value = false;
    phase.value = "waiting";
    if (step?.page) {
      // Данные блоков отображения/динамических вариантов при восстановлении
      // взять неоткуда (событие уже прошло) — блоки покажутся пустыми, а select
      // сохранит статические варианты; ввод по-прежнему собирается.
      pendingInputs.value = null;
      waitingForStep.value = stepIndex;
    } else {
      // Шаг без страницы ждёт добора обязательного значения — спрашиваем его.
      waitingForStep.value = null;
      const fields = formFields.value.filter(
        (field) => field.required && field.stepPath[0] === stepIndex,
      );
      pendingInputs.value = fields.length
        ? { stepIndex, stepTitle: step?.title ?? "", fields }
        : null;
    }
  }
}

/**
 * Поток событий молчит дольше положенного — перечитываем состояние запуска из
 * БД. Без этого потерянный поток событий оставляет playground в вечном
 * «Выполнение…» (см. `useRunSocket`).
 */
async function resyncRun() {
  if (!runId.value || phase.value !== "running") return;

  try {
    const { data } = await $api.GET(`/api/runs/${runId.value}`, {});
    if (data) applyRunSnapshot(data as RunSnapshot);
  } catch {
    // Сеть моргнула — следующая проверка сторожа попробует снова.
  }
}

function submitPage(stepIndex: number, data: Record<string, unknown>) {
  if (!socketApi.value) return;
  socketApi.value.submitPage(stepIndex, data);
  waitingForStep.value = null;
  phase.value = "running";
  running.value = true;
}

function submitPendingInputs(values: Record<string, unknown>) {
  if (!pendingInputs.value || !socketApi.value) return;
  socketApi.value.submitInputs(pendingInputs.value.stepIndex, values);
  pendingInputs.value = null;
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
  pageResolved.value = {};
}

function reset() {
  socketApi.value?.disconnect();
  socketApi.value = null;
  processedCount = 0;
  phase.value = "idle";
  running.value = false;
  resetStepData();
  pendingInputs.value = null;
  runId.value = "";
}

onMounted(async () => {
  await Promise.all([fetchScenario(), fetchManualInputs()]);
});

onUnmounted(() => {
  socketApi.value?.disconnect();
});
</script>
