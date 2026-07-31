<template>
  <div class="max-w-[1180px] xl:max-w-[1320px] mx-auto px-5 lg:px-8 pt-8 lg:pt-12 pb-20">
    <div class="max-w-[620px] mb-9">
      <h1
        class="font-sans font-extrabold text-[2rem] md:text-[2.75rem] leading-tight tracking-tight text-zinc-900 mb-3"
      >
        Запуски
      </h1>
      <p class="font-sans text-base text-zinc-500 leading-normal">
        Сценарии исполняются в фоне — можно закрыть страницу и вернуться позже. Когда запуск
        завершится, придёт уведомление в колокольчике.
      </p>
    </div>

    <div class="mb-7">
      <Tabs :model-value="tab" :items="tabItems" @change="switchTab" />
    </div>

    <div v-if="loading && !runs.length" class="font-sans text-sm text-zinc-400 py-16 text-center">
      Загрузка…
    </div>

    <template v-else-if="!runs.length">
      <div
        v-if="tab === 'active'"
        class="text-center py-20 border border-dashed border-zinc-200 rounded-2xl bg-white"
      >
        <span
          class="w-12 h-12 rounded-xl bg-zinc-100 text-zinc-400 inline-flex items-center justify-center mb-4"
        >
          <Icon name="check-check" :size="22" />
        </span>
        <div class="font-sans font-bold text-[1.0625rem] text-zinc-900 mb-1">
          Активных запусков нет
        </div>
        <div class="font-sans text-[0.9375rem] text-zinc-500 max-w-[380px] mx-auto">
          Запустите сценарий из маркетплейса — он появится здесь и продолжит работу в фоне.
        </div>
      </div>
      <div
        v-else
        class="text-center py-20 border border-dashed border-zinc-200 rounded-2xl bg-white"
      >
        <span
          class="w-12 h-12 rounded-xl bg-zinc-100 text-zinc-400 inline-flex items-center justify-center mb-4"
        >
          <Icon name="history" :size="22" />
        </span>
        <div class="font-sans font-bold text-[1.0625rem] text-zinc-900 mb-1">История пуста</div>
        <div class="font-sans text-[0.9375rem] text-zinc-500 max-w-[380px] mx-auto">
          Завершённые запуски со всеми файлами и результатами будут собираться здесь.
        </div>
      </div>
    </template>

    <template v-else>
      <div class="flex flex-col gap-3">
        <RunRow
          v-for="item in runs"
          :key="item.id"
          :item="item"
          @cancel="cancelRun"
          @retry="retryRun"
          @remove="askRemove"
        />
      </div>

      <div v-if="totalPages > 1" class="flex items-center justify-between mt-9">
        <span class="font-sans text-sm text-zinc-400">{{ rangeLabel }}</span>
        <Pagination v-model:page="page" :page-count="totalPages" @change="load" />
      </div>
    </template>

    <!-- Отклонение от эталона (там удаление мгновенное): вместе с запуском
         безвозвратно стираются его файлы из хранилища — просим подтверждение. -->
    <Modal
      v-if="removing"
      title="Удалить запуск из истории?"
      :subtitle="`«${removing.scenarioTitle}» — вместе с запуском будут удалены все его файлы из хранилища. Это действие необратимо.`"
      :width="520"
      @close="removing = null"
    >
      <template #footer>
        <Button variant="ghost" :disabled="deleting" @click="removing = null">Отмена</Button>
        <Button variant="danger" :disabled="deleting" @click="confirmRemove">
          {{ deleting ? "Удаление…" : "Удалить навсегда" }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
// Раздел «Запуски» — Vue-порт экрана Runs из эталона DS
// (assets/Fuse Design System/ui_kits/fuse-app/Runs.jsx): вкладки
// активные/завершённые, строки-аккордеоны, пустые состояния.
import type { Run, RunListItem } from "@fuse/shared";

const { $api } = useNuxtApp() as any;
const notificationsStore = useNotificationsStore();

const LIMIT = 10;

const tab = ref<"active" | "done">("active");
const runs = ref<RunListItem[]>([]);
const loading = ref(true);
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const counts = ref<{ active: number | null; done: number | null }>({
  active: null,
  done: null,
});

const removing = ref<RunListItem | null>(null);
const deleting = ref(false);

const tabItems = computed(() => [
  {
    value: "active",
    label: counts.value.active == null ? "Активные" : `Активные · ${counts.value.active}`,
  },
  {
    value: "done",
    label: counts.value.done == null ? "Завершённые" : `Завершённые · ${counts.value.done}`,
  },
]);

const rangeLabel = computed(() => {
  const start = (page.value - 1) * LIMIT + 1;
  return `${start}–${start + runs.value.length - 1} из ${total.value}`;
});

function statusFilter(which: "active" | "done"): string {
  return (which === "active" ? ACTIVE_RUN_STATUSES : TERMINAL_RUN_STATUSES).join(",");
}

async function load() {
  loading.value = true;
  try {
    const { data } = await $api.GET("/api/runs", {
      params: {
        query: { page: page.value, limit: LIMIT, status: statusFilter(tab.value) },
      },
    });
    const res = data as
      | { data?: RunListItem[]; total?: number; totalPages?: number }
      | undefined;
    runs.value = res?.data ?? [];
    total.value = res?.total ?? runs.value.length;
    totalPages.value = res?.totalPages ?? 1;
    counts.value[tab.value === "active" ? "active" : "done"] = total.value;
  } finally {
    loading.value = false;
  }
}

/** Счётчик второй вкладки — лёгким запросом на 1 элемент (нужен только total). */
async function loadOtherCount() {
  const other = tab.value === "active" ? "done" : "active";
  try {
    const { data } = await $api.GET("/api/runs", {
      params: { query: { page: 1, limit: 1, status: statusFilter(other) } },
    });
    counts.value[other] = (data as { total?: number } | undefined)?.total ?? 0;
  } catch {
    // Счётчик — украшение, вкладка работает и без него.
  }
}

function switchTab(value: string) {
  tab.value = value === "done" ? "done" : "active";
  page.value = 1;
  void load();
}

async function refresh() {
  await Promise.all([load(), loadOtherCount()]);
}

async function cancelRun(item: RunListItem) {
  await $api.POST("/api/runs/{id}/cancel", { params: { path: { id: item.id } } });
  await refresh();
}

/** Новый запуск с теми же входами; исходный остаётся в истории как был. */
async function retryRun(item: RunListItem) {
  const { data } = await $api.GET("/api/runs/{id}", {
    params: { path: { id: item.id } },
  });
  const source = data as Run | undefined;
  await $api.POST("/api/runs", {
    body: { scenarioId: item.scenarioId, inputs: source?.inputs ?? {} },
  });
  tab.value = "active";
  page.value = 1;
  await refresh();
}

function askRemove(item: RunListItem) {
  removing.value = item;
}

async function confirmRemove() {
  if (!removing.value || deleting.value) return;
  deleting.value = true;
  try {
    await $api.DELETE("/api/runs/{id}", {
      params: { path: { id: removing.value.id } },
    });
    removing.value = null;
    await refresh();
  } finally {
    deleting.value = false;
  }
}

// Актуализация без перезагрузки: терминальное событие или ожидание ввода
// приходит уведомлением — по нему список перечитывается. Плюс refetch при
// возврате фокуса вкладки браузера (запасной канал, как watchdog в RunPanel).
watch(
  () => notificationsStore.items[0]?.id,
  (id, prev) => {
    if (id && id !== prev) void refresh();
  },
);

function onVisibility() {
  if (document.visibilityState === "visible") void refresh();
}

onMounted(() => {
  void refresh();
  document.addEventListener("visibilitychange", onVisibility);
});
onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", onVisibility);
});
</script>
