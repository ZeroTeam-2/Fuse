<template>
  <div>
    <div v-if="loading" class="font-sans text-sm text-zinc-400 py-16 text-center">Загрузка…</div>

    <div v-else-if="!scenario" class="font-sans text-sm text-zinc-400 py-16 text-center">
      Сценарий не найден
    </div>

    <Card v-else padding="none">
      <div class="flex items-center justify-between gap-3 px-6 py-5 border-b border-zinc-200">
        <div class="flex items-center gap-2.5">
          <Button variant="primary" :disabled="running || phase === 'done'" @click="runAll">
            {{ running ? "Выполнение…" : "Выполнить все" }}
            <template #right><Icon name="play" :size="18" /></template>
          </Button>
          <Button v-if="phase === 'waiting'" variant="secondary" @click="advanceStep">
            Выполнить шаг
          </Button>
        </div>
        <Button variant="secondary" size="sm" @click="reset">Сбросить</Button>
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

          <!-- inline page: awaiting user input on this step -->
          <div
            v-if="waitingForStep === i && step.page"
            class="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 flex flex-col gap-4"
          >
            <template v-if="step.page.type === 'fields'">
              <form class="flex flex-col gap-4" @submit.prevent="submitPageForm(i)">
                <Input
                  v-for="field in step.page.fields"
                  :key="field.key"
                  v-model="pageFormData[field.key]"
                  :label="field.required ? `${field.label} *` : field.label"
                  :placeholder="field.placeholder || ''"
                />
                <div>
                  <Button variant="primary" size="sm" type="submit">
                    {{ step.page.buttonText }}
                  </Button>
                </div>
              </form>
            </template>

            <template v-else-if="step.page.type === 'text'">
              <div
                class="font-sans text-[0.9375rem] text-zinc-700 leading-relaxed whitespace-pre-wrap"
              >
                {{ step.page.body }}
              </div>
              <div>
                <Button variant="primary" size="sm" @click="submitPageForm(i, {})">
                  Продолжить
                </Button>
              </div>
            </template>

            <template v-else-if="step.page.type === 'file'">
              <div
                :class="[
                  'rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
                  isDragOver
                    ? 'border-rose-600 bg-rose-50'
                    : 'border-zinc-300 hover:border-rose-400 hover:bg-white',
                ]"
                @click="triggerFileInput(i)"
                @dragover.prevent="isDragOver = true"
                @dragleave.prevent="isDragOver = false"
                @drop.prevent="onFileDrop($event, i)"
              >
                <span v-if="!pgFiles[i]" class="font-sans text-sm text-zinc-500">
                  Перетащите файл сюда или нажмите для выбора
                  <span v-if="step.page.maxMb">(макс. {{ step.page.maxMb }} МБ)</span>
                </span>
                <span v-else class="font-sans text-sm font-semibold text-zinc-900">
                  {{ pgFiles[i]?.name }}
                </span>
              </div>
              <input
                :ref="(el) => setFileInput(el, i)"
                type="file"
                class="hidden"
                :accept="step.page.accept || undefined"
                @change="onFileSelect($event, i)"
              />
              <div>
                <Button
                  variant="primary"
                  size="sm"
                  :disabled="!pgFiles[i]"
                  @click="submitFileForm(i)"
                >
                  {{ step.page.buttonText }}
                </Button>
              </div>
            </template>
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
import type { Step, ServerWsEvent } from "@fuse/shared";

const props = defineProps<{ scenarioId: string }>();
const emit = defineEmits<{ loaded: [{ title: string; tagline?: string }] }>();

const { $api } = useNuxtApp() as any;

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
      };
      emit("loaded", { title: data.title, tagline: data.tagline });
    }
  } catch {
    scenario.value = null;
  } finally {
    loading.value = false;
  }
}

async function runAll() {
  // Запуск создаёт run под пользователем — гостя сначала просим войти.
  if (!useAuthStore().isAuthenticated) {
    useLoginModal().openLogin("Войдите, чтобы запустить сценарий.");
    return;
  }
  running.value = true;
  phase.value = "running";
  resetStepData();

  try {
    const { data } = await $api.POST("/api/runs", {
      body: { scenarioId: props.scenarioId },
    });
    if (!data) {
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
