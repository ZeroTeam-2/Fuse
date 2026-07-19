<template>
  <div class="max-w-[1180px] xl:max-w-[1320px] mx-auto px-5 lg:px-8 pt-8 pb-20">
    <NuxtLink
      to="/my/scenarios"
      class="font-sans text-sm text-zinc-500 inline-flex items-center gap-1.5 mb-6 hover:text-zinc-700"
    >
      ‹ Мои сценарии
    </NuxtLink>

    <div v-if="loading" class="font-sans text-[0.9375rem] text-zinc-400 py-20 text-center">
      Загрузка сценария…
    </div>

    <template v-else-if="store.scenario">
      <div class="flex items-center gap-4 mb-7 flex-wrap">
        <span
          class="w-[52px] h-[52px] rounded-xl bg-violet-100 text-violet-600 inline-flex items-center justify-center shrink-0"
        >
          <Icon name="share-2" :size="22" />
        </span>
        <div class="flex-1 min-w-[180px]">
          <h1
            class="font-sans font-extrabold text-[1.625rem] md:text-[2.125rem] tracking-tight text-zinc-900"
          >
            {{ store.scenario.title }}
          </h1>
          <div class="font-sans text-sm text-zinc-500">
            Шагов: {{ store.stepCount }}
            <template v-if="store.distinctAppCount > 1">
              · API: {{ store.distinctAppCount }}
            </template>
          </div>
        </div>
        <NuxtLink :to="`/cards/${scenarioId}`">
          <Button variant="secondary">Превью</Button>
        </NuxtLink>
        <PublishButton
          :published="store.scenario.published"
          :disabled="store.scenario.blocked"
          @publish="togglePublish"
          @unpublish="togglePublish"
        />
        <Button variant="danger" @click="confirmDelete = true">
          <template #left><Icon name="trash-2" :size="16" /></template>
          Удалить
        </Button>
      </div>

      <div
        v-if="store.scenario.blocked"
        class="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 mb-7"
      >
        <Icon name="alert-triangle" :size="18" class="text-rose-600 shrink-0 mt-0.5" />
        <div class="font-sans text-[0.875rem] text-rose-700 leading-normal">
          <span class="font-bold">Сценарий заблокирован.</span>
          {{
            store.scenario.blockedReason ??
            "Один из шагов ссылается на удалённый API."
          }}
          Запуск недоступен, пока вы не удалите или не пересоберёте отмеченный шаг ниже.
        </div>
      </div>

      <Modal
        v-if="confirmDelete"
        title="Удалить сценарий?"
        :subtitle="`«${store.scenario.title}» будет удалён безвозвратно.`"
        :width="460"
        @close="confirmDelete = false"
      >
        <p class="font-sans text-[0.9375rem] text-zinc-600 leading-normal">
          Вместе со сценарием удалятся все его шаги и публикация в маркетплейсе. Это действие
          нельзя отменить.
        </p>
        <template #footer>
          <Button variant="ghost" @click="confirmDelete = false">Отмена</Button>
          <Button variant="danger" @click="deleteScenario">Удалить</Button>
        </template>
      </Modal>

      <p
        v-if="error"
        class="font-sans text-[0.8125rem] text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 mb-6"
      >
        {{ error }}
      </p>

      <div class="mb-8">
        <Tabs v-model="tab" :items="TABS" />
      </div>

      <!-- Основная -->
      <Card v-if="tab === 'main'" padding="xl" class="flex flex-col gap-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Input v-model="form.title" label="Название сценария" placeholder="Название сценария" />
          <Select
            v-model="form.category"
            label="Категория"
            placeholder="Без категории"
            searchable
            search-placeholder="Найти категорию…"
            :options="categoryOptions"
            @update:model-value="form.subcategory = ''"
          />
        </div>

        <Select
          v-if="subcategoryOptions.length"
          v-model="form.subcategory"
          label="Подкатегория"
          placeholder="Все"
          :options="subcategoryOptions"
        />

        <div class="flex flex-col gap-2">
          <label
            for="scenario-description"
            class="text-[0.8125rem] font-sans font-semibold text-zinc-900"
          >
            Описание для маркетплейса
          </label>
          <RichTextEditor
            id="scenario-description"
            v-model="form.description"
            placeholder="Что делает этот сценарий и кому он полезен?"
          />
        </div>

        <div class="flex justify-end">
          <Button variant="dark" :disabled="!form.title.trim() || savingMeta" @click="saveMeta">
            {{ savingMeta ? "Сохранение…" : "Сохранить" }}
          </Button>
        </div>
      </Card>

      <!-- Окружения -->
      <div v-else-if="tab === 'environments'">
        <div
          v-if="!store.distinctAppCount"
          class="border border-dashed border-zinc-300 rounded-2xl px-6 py-14 flex flex-col items-center text-center"
        >
          <span
            class="w-12 h-12 rounded-2xl bg-violet-50 text-violet-600 inline-flex items-center justify-center mb-4"
          >
            <Icon name="server" :size="22" />
          </span>
          <div class="font-sans text-[0.9375rem] text-zinc-600 max-w-[420px]">
            Добавьте шаг с endpoint — и здесь можно будет выбрать окружение для каждого
            поставщика. По умолчанию используется Prod.
          </div>
        </div>

        <Card v-else padding="xl" class="flex flex-col gap-5">
          <p class="font-sans text-[0.9375rem] text-zinc-500">
            Для каждого поставщика выберите окружение, в котором будут исполняться его шаги.
          </p>
          <div
            v-for="appId in store.distinctAppIds"
            :key="appId"
            class="flex flex-col sm:flex-row sm:items-center gap-3 border-b border-zinc-100 pb-4 last:border-0 last:pb-0"
          >
            <div class="flex items-center gap-2.5 sm:w-[220px] shrink-0">
              <span
                class="w-8 h-8 rounded-lg inline-flex items-center justify-center font-sans font-bold text-[0.8125rem] text-white shrink-0"
                :style="{ background: '#6366f1' }"
              >
                {{ (appNames[appId] ?? "API").charAt(0) }}
              </span>
              <span class="font-sans text-[0.9375rem] font-semibold text-zinc-900 min-w-0 truncate">
                {{ appNames[appId] ?? "API" }}
              </span>
            </div>
            <div class="flex-1 min-w-0">
              <Select
                :model-value="selectedEnv(appId)"
                :options="envOptions(appId)"
                placeholder="Prod"
                @update:model-value="setEnv(appId, $event ?? '')"
              />
            </div>
          </div>
        </Card>
      </div>

      <!-- Настройка шагов -->
      <div v-else-if="tab === 'steps'">
        <div
          v-if="!store.stepCount"
          class="border border-dashed border-zinc-300 rounded-2xl px-6 py-14 flex flex-col items-center text-center"
        >
          <span
            class="w-12 h-12 rounded-2xl bg-violet-50 text-violet-600 inline-flex items-center justify-center mb-4"
          >
            <Icon name="workflow" :size="22" />
          </span>
          <div class="font-sans text-[0.9375rem] text-zinc-600 max-w-[380px]">
            Пока ни одного шага. Добавьте первый — сценарий соберётся из вызовов ваших API.
          </div>
        </div>

        <div v-else class="flex flex-col gap-3.5">
          <div
            v-for="(step, i) in steps"
            :key="step.id"
            draggable="true"
            :class="[
              'rounded-2xl transition-all cursor-pointer',
              dragIndex === i ? 'opacity-40' : '',
              overIndex === i && dragIndex !== null && dragIndex !== i
                ? 'ring-2 ring-rose-400 ring-offset-2'
                : '',
            ]"
            @dragstart="dragIndex = i"
            @dragend="resetDrag"
            @dragover.prevent="overIndex = i"
            @drop="drop(i)"
            @click="openStep(i)"
          >
            <ScenarioStep
              :index="i + 1"
              :type-label="TYPE_LABELS[step.type]"
              :provider="providerOf(step)"
              :provider-dot="providerDot(step)"
              :method="methodOf(step)"
              :path="pathOf(step)"
              :title="step.title"
              :params="stepParams(i)"
              :broken="!!step.broken"
              @edit="openStep(i)"
              @remove="removeStep(i)"
            />
          </div>
        </div>

        <div class="flex justify-center pt-6">
          <ScenarioAddStepMenu size="lg" :icon-size="20" @pick="pickType" />
        </div>
      </div>
    </template>

    <ScenarioStepPicker
      v-if="pickedType"
      :scenario-id="scenarioId"
      :step-type="pickedType.key"
      :type-title="pickedType.title"
      @add="addStep"
      @close="pickedType = null"
    />

    <ScenarioStepConfig
      v-if="configIndex !== null && steps[configIndex]"
      :step="steps[configIndex]"
      :step-index="configIndex"
      :steps="steps"
      :schemas="schemas"
      @update="updateStep(configIndex, $event)"
      @edit-page="pageIndex = configIndex"
      @close="configIndex = null"
    />

    <ScenarioPageEditor
      v-if="pageIndex !== null && steps[pageIndex]"
      :step="steps[pageIndex]"
      :step-index="pageIndex"
      :steps="steps"
      :schemas="schemas"
      @save="savePage"
      @close="closePageEditor"
    />
  </div>
</template>

<script setup lang="ts">
import {
  CATEGORIES,
  blockOutputName,
  isInputBlock,
  pageBlockCount,
  pageBlocks,
} from "@fuse/shared";
import type { Environment, Step, StepFilter, StepPage, StepSchema, StepType } from "@fuse/shared";

const { $api } = useNuxtApp() as any;
const route = useRoute();
const store = useScenarioEditorStore();

const scenarioId = route.params.id as string;

const TABS = [
  { value: "main", label: "Основная" },
  { value: "steps", label: "Настройка шагов" },
  { value: "environments", label: "Окружения" },
];

const TYPE_LABELS: Record<string, string> = {
  api: "Endpoint API",
  scenario: "Другой сценарий",
  delay: "Задержка",
  file: "Файл",
  periodic: "Периодический запрос",
  page: "Страница",
};

const DOT_COLORS = ["#8b5cf6", "#6366f1", "#10b981", "#f59e0b", "#0ea5e9", "#ec4899"];

const loading = ref(true);
const savingMeta = ref(false);
const error = ref("");
const tab = ref("main");
const confirmDelete = ref(false);

const form = reactive({ title: "", description: "", category: "", subcategory: "" });

const appNames = ref<Record<string, string>>({});
const schemas = ref<StepSchema[]>([]);
const appEnvironments = ref<Record<string, Environment[]>>({});

const pickedType = ref<{ key: StepType; title: string } | null>(null);
const configIndex = ref<number | null>(null);
const pageIndex = ref<number | null>(null);
/**
 * Индекс только что добавленного page-шага, ещё не сохранённого: сервер
 * отклоняет пустую страницу, поэтому шаг persist'ится по «Готово» конструктора,
 * а закрытие без сохранения убирает черновик.
 */
const draftPageIndex = ref<number | null>(null);
const dragIndex = ref<number | null>(null);
const overIndex = ref<number | null>(null);

const steps = computed<Step[]>(() => store.scenario?.steps ?? []);

const categoryOptions = computed(() => CATEGORIES.map((c) => c.name));
const subcategoryOptions = computed(
  () => CATEGORIES.find((c) => c.name === form.category)?.subcategories ?? [],
);

function appIdOf(step: Step) {
  return step.type === "api" || step.type === "periodic" || step.type === "file"
    ? step.appId
    : undefined;
}

function providerOf(step: Step) {
  const id = appIdOf(step);
  if (step.broken) return "Удалённое приложение";
  if (id) return appNames.value[id] ?? "API";
  return TYPE_LABELS[step.type] ?? "Шаг";
}

function providerDot(step: Step) {
  const id = appIdOf(step) ?? step.type;
  let hash = 0;
  for (const ch of id) hash = (hash + ch.charCodeAt(0)) % DOT_COLORS.length;
  return DOT_COLORS[hash];
}

function methodOf(step: Step) {
  if (step.type === "api") return step.method;
  if (step.type === "periodic") return step.pollMethod;
  return "";
}

function pathOf(step: Step) {
  if (step.type === "api") return step.path;
  if (step.type === "periodic") return step.pollPath;
  if (step.type === "delay") return `${step.seconds} с`;
  if (step.type === "page") return `${pageBlockCount(step.page)} элем.`;
  return "";
}

const OPERATOR_LABELS: Record<string, string> = {
  eq: "=",
  ne: "≠",
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
  contains: "содержит",
};

/** «где inn = 7707083893» — чтобы отбор элемента был виден, не открывая шаг. */
function filterSummary(filter?: StepFilter): string {
  if (!filter) return "";

  const value =
    filter.value.mode === "const"
      ? filter.value.const
      : filter.value.mode === "ref"
        ? (filter.value.ref ?? "").replace(/^s(\d+):/, (_m, i) => `шаг ${Number(i) + 1} · `)
        : "ввод пользователя";

  return `, где ${filter.field} ${OPERATOR_LABELS[filter.op] ?? filter.op} ${value}`;
}

/**
 * Имя поля источника в сводке: у шага-страницы ключ по умолчанию — это id
 * блока, вместо него показываем отображаемое имя (кастомный ключ либо лейбл).
 */
function refFieldName(idx: number, key: string): string {
  if (steps.value[idx]?.type !== "page") return key;
  return schemas.value[idx]?.outputs.find((o) => o.key === key)?.label || key;
}

function stepParams(i: number) {
  const step = steps.value[i];

  // У шага-страницы входов нет — сводка показывает его выходы: видно, какие
  // значения страница отдаёт следующим шагам. Имя — кастомный ключ, иначе
  // лейбл блока; лейбл дублируем рядом, когда показан кастомный ключ.
  if (step.type === "page") {
    return pageBlocks(step.page)
      .filter(isInputBlock)
      .map((b) => ({
        kind: "ВЫХОД",
        name: blockOutputName(b),
        source: b.binding && b.label ? b.label : "Ввод на странице",
      }));
  }

  const mappings = step.mappings ?? {};
  const consts = step.consts ?? {};
  const filters = step.filters ?? {};
  return (schemas.value[i]?.inputs ?? []).map((f) => {
    const source = mappings[f.key];
    const ref = typeof source === "string" ? source.match(/^s(\d+):(.+)$/) : null;
    return {
      kind: (f.loc ?? "body").toUpperCase(),
      name: f.key,
      source: ref
        ? `Шаг ${Number(ref[1]) + 1} · ${refFieldName(Number(ref[1]), ref[2])}${filterSummary(filters[f.key])}`
        : source === "const"
          ? `Константа: ${consts[f.key] || "—"}`
          : "Ввод пользователя",
    };
  });
}

async function loadScenario() {
  const { data } = await $api.GET(`/api/scenarios/${scenarioId}`, {});
  if (!data) {
    error.value = "Не удалось загрузить сценарий";
    return;
  }
  store.setScenario(data);
  form.title = data.title ?? "";
  form.description = data.description ?? "";
  form.category = data.category ?? "";
  form.subcategory = data.subcategory ?? "";
}

async function loadApps() {
  const { data } = await $api.GET("/api/apps", { params: { query: { limit: 100 } } });
  if (data) {
    appNames.value = Object.fromEntries(
      (data.data ?? []).map((a: { id: string; name: string }) => [a.id, a.name]),
    );
  }
}

async function loadSchemas() {
  const results = await Promise.all(
    steps.value.map((_, i) =>
      $api.GET(`/api/scenarios/${scenarioId}/step-schema/${i}`, {}),
    ),
  );
  schemas.value = results.map(
    (r: any) => (r.data as StepSchema) ?? { inputs: [], outputs: [], outputIsArray: false },
  );
}

// Steps are persisted on every change, then schemas are re-resolved because the
// backend derives them from the saved order. Environment choices ride along so
// providers dropped with their last step lose their stale selection too.
async function persistSteps() {
  if (!store.scenario) return;
  store.pruneEnvironmentSelections();
  const { error: apiError } = await $api.PATCH(`/api/scenarios/${scenarioId}`, {
    body: {
      steps: store.scenario.steps,
      environmentSelections: store.scenario.environmentSelections ?? [],
    },
  });
  if (apiError) {
    error.value = "Не удалось сохранить шаги";
    return;
  }
  error.value = "";
  await loadSchemas();
  await loadEnvironmentsForApps();
}

// Environments of every provider used in the scenario. Fetched per app (GET by
// id also seeds a legacy app's Prod), so the tab can offer them in a Select.
async function loadEnvironmentsForApps() {
  await Promise.all(
    store.distinctAppIds.map(async (id) => {
      if (appEnvironments.value[id]) return;
      const { data } = await $api.GET(`/api/apps/${id}`, {});
      if (data) appEnvironments.value[id] = data.environments ?? [];
    }),
  );
}

function envOptions(appId: string) {
  return (appEnvironments.value[appId] ?? []).map((e) => ({
    value: e.id,
    label: e.name,
    description: e.variables.find((v) => v.key === "baseUrl")?.value,
  }));
}

function selectedEnv(appId: string): string {
  const sel = store.scenario?.environmentSelections?.find((s) => s.appId === appId);
  if (sel) return sel.environmentId;
  const prod = (appEnvironments.value[appId] ?? []).find((e) => e.name === "Prod");
  return prod?.id ?? "";
}

async function setEnv(appId: string, environmentId: string) {
  store.setEnvironmentSelection(appId, environmentId);
  if (!store.scenario) return;
  await $api.PATCH(`/api/scenarios/${scenarioId}`, {
    body: { environmentSelections: store.scenario.environmentSelections },
  });
}

function pickType(t: { key: StepType; title: string }) {
  pickedType.value = t;
}

async function addStep(step: Step) {
  store.addStep(step);
  pickedType.value = null;

  // Page-шаг рождается с пустой раскладкой, которую сервер не примет, —
  // сразу открываем конструктор, сохранение произойдёт по «Готово».
  if (step.type === "page") {
    draftPageIndex.value = store.stepCount - 1;
    pageIndex.value = draftPageIndex.value;
    return;
  }

  await persistSteps();
}

async function updateStep(index: number, step: Step) {
  store.updateStep(index, step);
  await persistSteps();
}

async function removeStep(index: number) {
  store.removeStep(index);
  if (configIndex.value === index) configIndex.value = null;
  await persistSteps();
}

function openStep(index: number) {
  configIndex.value = index;
}

async function savePage(page: StepPage) {
  if (pageIndex.value === null) return;
  const index = pageIndex.value;
  const step = steps.value[index];
  // Черновик снимается ДО await: конструктор вслед за `save` эмитит `close`,
  // и обработчик закрытия не должен принять сохранённый шаг за черновик.
  draftPageIndex.value = null;
  pageIndex.value = null;
  // Раскладка — единственная настройка page-шага: блоки ввода сами объявляют
  // его выходы, никакие маппинги при сохранении не переписываются.
  if (step) await updateStep(index, { ...step, page } as Step);
}

/** Закрытие конструктора без сохранения: черновик page-шага не оставляем. */
function closePageEditor() {
  if (draftPageIndex.value !== null) {
    store.removeStep(draftPageIndex.value);
    draftPageIndex.value = null;
  }
  pageIndex.value = null;
}

function resetDrag() {
  dragIndex.value = null;
  overIndex.value = null;
}

async function drop(index: number) {
  const from = dragIndex.value;
  resetDrag();
  if (from === null || from === index) return;
  store.moveStep(from, index);
  configIndex.value = null;
  await persistSteps();
}

async function saveMeta() {
  if (!form.title.trim()) return;
  savingMeta.value = true;
  error.value = "";
  try {
    const { data, error: apiError } = await $api.PATCH(`/api/scenarios/${scenarioId}`, {
      body: {
        title: form.title.trim(),
        description: form.description,
        category: form.category,
        subcategory: form.subcategory,
      },
    });
    if (apiError || !data) {
      error.value = "Не удалось сохранить изменения";
      return;
    }
    if (store.scenario) store.scenario.title = form.title.trim();
  } finally {
    savingMeta.value = false;
  }
}

async function togglePublish() {
  if (!store.scenario) return;
  if (!store.scenario.published && !store.stepCount) {
    error.value = "Добавьте хотя бы один шаг перед публикацией";
    return;
  }
  const { data, error: apiError } = await $api.PATCH(
    `/api/scenarios/${scenarioId}/publish`,
    {},
  );
  if (apiError || !data) {
    error.value = "Не удалось изменить статус публикации";
    return;
  }
  error.value = "";
  store.scenario.published = data.published;
}

async function deleteScenario() {
  try {
    await $api.DELETE("/api/scenarios/{id}", {
      params: { path: { id: scenarioId } },
    });
    await navigateTo("/my/scenarios");
  } catch {
    confirmDelete.value = false;
  }
}

onMounted(async () => {
  try {
    await Promise.all([loadScenario(), loadApps()]);
    await loadSchemas();
    await loadEnvironmentsForApps();
  } finally {
    loading.value = false;
  }
});
</script>
