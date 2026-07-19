<script setup lang="ts">
// Строка-аккордеон раздела «Запуски» — Vue-порт RunRow из эталона DS
// (assets/Fuse Design System/ui_kits/fuse-app/Runs.jsx). Свёрнуто — статус и
// прогресс одной строкой; развёрнуто — панели (прогресс / результат / файлы)
// на SegmentedControl и панель действий. Детали запуска (шаги, файлы)
// догружаются при первом раскрытии.
import type { Run, RunListItem, RunStepResult, UploadedFileRef } from "@fuse/shared";
import { isUploadedFileRef } from "@fuse/shared";

const props = defineProps<{ item: RunListItem }>();
const emit = defineEmits<{
  cancel: [item: RunListItem];
  retry: [item: RunListItem];
  remove: [item: RunListItem];
}>();

const { $api } = useNuxtApp() as any;

const open = ref(false);
const seg = ref<string | null>(null);
const details = ref<Run | null>(null);
const loadingDetails = ref(false);

const cfg = computed(() => RUN_STATUS_UI[props.item.status] ?? RUN_STATUS_UI.pending);
const isActive = computed(() => !isTerminalRunStatus(props.item.status));
const runUrl = computed(() => `/cards/${props.item.scenarioId}/run?run=${props.item.id}`);

// Живой таймер выполняющегося запуска (эталонное «идёт 2:05»).
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;
watch(
  () => props.item.status === "running",
  (running) => {
    if (running && !clock) clock = setInterval(() => (now.value = Date.now()), 1000);
    if (!running && clock) {
      clearInterval(clock);
      clock = null;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (clock) clearInterval(clock);
});

const elapsed = computed(() => {
  if (props.item.status !== "running") return null;
  const started = new Date(props.item.createdAt).getTime();
  if (Number.isNaN(started)) return null;
  return formatElapsed((now.value - started) / 1000);
});

const timeLabel = computed(() => {
  if (props.item.status === "pending") return "в очереди";
  if (props.item.status === "running" && elapsed.value) return `идёт ${elapsed.value}`;
  return formatRelativeTime(props.item.updatedAt || props.item.createdAt);
});

async function loadDetails() {
  if (loadingDetails.value) return;
  loadingDetails.value = true;
  try {
    const { data } = await $api.GET("/api/runs/{id}", {
      params: { path: { id: props.item.id } },
    });
    if (data) details.value = data as Run;
  } finally {
    loadingDetails.value = false;
  }
}

function toggle() {
  open.value = !open.value;
  if (open.value && !details.value) void loadDetails();
}

// Статус в списке сменился (завершился, встал на ввод) — раскрытая панель
// не должна показывать устаревшие шаги.
watch(
  () => props.item.status,
  () => {
    if (open.value) void loadDetails();
  },
);

const inputFiles = computed<UploadedFileRef[]>(
  () => (details.value?.files ?? []).filter((f) => !f.objectName.startsWith("runs/")),
);
const outputFiles = computed<UploadedFileRef[]>(
  () => (details.value?.files ?? []).filter((f) => f.objectName.startsWith("runs/")),
);

const segments = computed<string[]>(() => {
  const list: string[] = [];
  if (isActive.value) list.push("Прогресс");
  else if (props.item.status === "completed") list.push("Результат");
  else list.push("Статус");
  if (inputFiles.value.length) list.push("Входные файлы");
  if (outputFiles.value.length) list.push("Результаты");
  return list;
});
const activeSeg = computed(() =>
  seg.value && segments.value.includes(seg.value) ? seg.value : segments.value[0],
);

const progressSteps = computed(() =>
  (details.value?.stepResults ?? []).map((sr: RunStepResult) => ({
    label: sr.stepTitle,
    status:
      sr.status === "completed" ? ("done" as const)
      : sr.status === "running" ? ("active" as const)
      : ("pending" as const),
    meta:
      sr.status === "failed" ? "ошибка"
      : sr.durationMs != null ? `${(sr.durationMs / 1000).toFixed(1)}с`
      : undefined,
  })),
);

/** Полезная нагрузка последнего успешного шага — как в сводке RunPanel. */
const lastResult = computed<unknown>(() => {
  const results = (details.value?.stepResults ?? [])
    .filter((sr) => sr.status === "completed" && sr.result !== undefined)
    .map((sr) => sr.result);
  return results.length ? results[results.length - 1] : null;
});

const resultFile = computed(() =>
  isUploadedFileRef(lastResult.value) ? (lastResult.value as UploadedFileRef) : null,
);

const resultItems = computed(() => {
  const value = lastResult.value;
  if (!value || resultFile.value) return [];
  if (typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .slice(0, 12)
    .map(([label, v]) => ({
      label,
      value: typeof v === "object" ? JSON.stringify(v) : String(v),
    }));
});
</script>

<template>
  <div
    class="bg-white border rounded-2xl transition-colors shadow-sm"
    :class="open ? 'border-zinc-300' : 'border-zinc-200'"
  >
    <!-- Свёрнутая шапка: вся строка — кнопка аккордеона -->
    <button
      type="button"
      class="w-full text-left bg-transparent border-0 cursor-pointer flex items-center gap-4 px-4 sm:px-5 py-4"
      @click="toggle"
    >
      <RunStatusTile :status="item.status" />
      <div class="min-w-0 flex-1">
        <div class="font-sans font-bold text-[0.9375rem] text-zinc-900 truncate">
          {{ item.scenarioTitle }}
        </div>
        <div class="font-sans text-[0.8125rem] text-zinc-400 flex items-center gap-2 flex-wrap">
          <span class="font-mono">{{ item.id.slice(-8) }}</span>
          <span class="text-zinc-300">·</span>
          <span>{{ timeLabel }}</span>
        </div>
      </div>
      <span
        v-if="item.status === 'running'"
        class="hidden sm:inline-flex items-center gap-2 bg-rose-50 text-rose-600 rounded-full px-3 py-1.5 font-sans text-[0.8125rem] font-semibold shrink-0"
      >
        <span class="w-3 h-3 rounded-full border-2 border-rose-200 border-t-rose-600 animate-spin" />
        шаг {{ Math.min(item.currentStep + 1, item.totalSteps || 1) }} из
        {{ item.totalSteps || "?" }}<template v-if="elapsed"> · {{ elapsed }}</template>
      </span>
      <span v-else class="shrink-0 hidden sm:block">
        <Badge :tone="cfg.tone" dot>{{ cfg.label }}</Badge>
      </span>
      <Icon
        name="chevron-down"
        :size="18"
        class="text-zinc-400 shrink-0 transition-transform"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <!-- Развёрнутая часть -->
    <div v-if="open" class="px-4 sm:px-5 pb-5 pt-4 border-t border-zinc-100">
      <SegmentedControl
        size="sm"
        :options="segments"
        :model-value="activeSeg"
        class="mb-4"
        @change="seg = $event"
      />

      <div v-if="loadingDetails && !details" class="font-sans text-sm text-zinc-400 py-6 text-center">
        Загрузка…
      </div>
      <template v-else>
        <StepProgress v-if="activeSeg === 'Прогресс'" :steps="progressSteps" />

        <div
          v-else-if="activeSeg === 'Статус' && item.status === 'failed'"
          class="bg-rose-50 border border-rose-200 rounded-2xl p-4"
        >
          <div class="flex items-center gap-2 font-sans font-bold text-[0.9375rem] text-rose-600 mb-1.5">
            <Icon name="alert-triangle" :size="17" />
            Запуск завершился с ошибкой
          </div>
          <div class="font-sans text-[0.875rem] text-rose-700">
            {{ item.error || details?.error || "Причина не указана" }}
          </div>
        </div>

        <div
          v-else-if="activeSeg === 'Статус' && item.status === 'cancelled'"
          class="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 font-sans text-[0.875rem] text-zinc-500 flex items-center gap-2"
        >
          <Icon name="x-circle" :size="17" class="text-zinc-400" />
          Запуск отменён до завершения.
        </div>

        <template v-else-if="activeSeg === 'Результат'">
          <!-- Финальная display-страница: отформатированный итоговый экран
               (текст/markdown, значения блоков), если сценарий им заканчивается. -->
          <Card v-if="details?.finalPage" padding="lg">
            <RunPageRunner
              :page="details.finalPage.page"
              :resolved="details.finalPage.resolved"
            />
          </Card>
          <RunFileCard v-else-if="resultFile" :file="resultFile" :run-id="item.id" kind="output" />
          <Card v-else-if="resultItems.length" padding="lg">
            <KeyValueGrid :items="resultItems" />
          </Card>
          <CodeBlock v-else-if="lastResult != null" :code="lastResult as object" label="Результат" />
          <div v-else class="font-sans text-sm text-zinc-400 py-4">Результат пуст.</div>
        </template>

        <div v-else-if="activeSeg === 'Входные файлы'" class="flex flex-col gap-2">
          <RunFileCard
            v-for="f in inputFiles"
            :key="f.objectName"
            :file="f"
            :run-id="item.id"
            kind="input"
          />
        </div>

        <div v-else-if="activeSeg === 'Результаты'" class="flex flex-col gap-2">
          <RunFileCard
            v-for="f in outputFiles"
            :key="f.objectName"
            :file="f"
            :run-id="item.id"
            kind="output"
          />
        </div>
      </template>

      <!-- Панель действий -->
      <div class="flex flex-wrap items-center gap-2.5 mt-6 pt-4 border-t border-zinc-100">
        <Button
          v-if="item.status === 'running' || item.status === 'waiting_input'"
          variant="secondary"
          size="sm"
          @click="emit('cancel', item)"
        >
          <template #left><Icon name="square" :size="15" /></template>
          Отменить запуск
        </Button>
        <Button
          v-if="item.status === 'pending'"
          variant="secondary"
          size="sm"
          @click="emit('cancel', item)"
        >
          <template #left><Icon name="x" :size="15" /></template>
          Убрать из очереди
        </Button>
        <Button
          v-if="item.status === 'waiting_input'"
          variant="dark"
          size="sm"
          @click="navigateTo(runUrl)"
        >
          <template #left><Icon name="pen-line" :size="15" /></template>
          Продолжить
        </Button>
        <Button
          v-if="item.status === 'completed'"
          variant="dark"
          size="sm"
          @click="navigateTo(runUrl)"
        >
          <template #left><Icon name="external-link" :size="15" /></template>
          Открыть результат
        </Button>
        <Button
          v-if="isTerminalRunStatus(item.status)"
          variant="secondary"
          size="sm"
          @click="emit('retry', item)"
        >
          <template #left><Icon name="rotate-cw" :size="15" /></template>
          Повторить запуск
        </Button>
        <button
          v-if="isTerminalRunStatus(item.status)"
          type="button"
          class="ml-auto inline-flex items-center gap-1.5 border-0 bg-transparent cursor-pointer font-sans text-[0.8125rem] font-semibold text-zinc-400 hover:text-rose-600 transition-colors px-2 py-1.5 rounded-lg"
          @click="emit('remove', item)"
        >
          <Icon name="trash-2" :size="15" />
          Удалить из истории
        </button>
      </div>
    </div>
  </div>
</template>
