<script setup lang="ts">
// Right-side drawer: configure where each input of a step comes from, review the
// outputs it hands to later steps, and attach an input page.
import type { FilterOperator, SchemaField, Step, StepFilter, StepSchema } from "@fuse/shared";

const props = defineProps<{
  step: Step;
  stepIndex: number;
  steps: Step[];
  // Input/output schema per step index, resolved by the page.
  schemas: StepSchema[];
}>();

const emit = defineEmits<{
  update: [step: Step];
  "edit-page": [];
  close: [];
}>();

const TYPE_LABELS: Record<string, string> = {
  api: "Endpoint API",
  scenario: "Другой сценарий",
  delay: "Задержка",
  file: "Файл",
  periodic: "Периодический запрос",
};

const GROUPS = [
  { loc: "path", title: "Path-параметры", dot: "bg-indigo-500" },
  { loc: "query", title: "Query-параметры", dot: "bg-sky-500" },
  { loc: "header", title: "Заголовки · Header", dot: "bg-amber-500" },
  { loc: "body", title: "Тело запроса · Body", dot: "bg-emerald-500" },
] as const;

const PAGE_LABELS: Record<string, string> = {
  fields: "Ввод полей",
  file: "Загрузка файла",
  text: "Отображение текста",
};

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: "eq", label: "=" },
  { value: "ne", label: "≠" },
  { value: "gt", label: ">" },
  { value: "lt", label: "<" },
  { value: "gte", label: "≥" },
  { value: "lte", label: "≤" },
  { value: "contains", label: "содержит" },
];

interface FilterState {
  field: string;
  op: FilterOperator | "";
  mode: "user" | "const" | "ref";
  constValue: string;
  refStep: string;
  refField: string;
}

interface FieldState {
  mode: "user" | "const" | "ref";
  constValue: string;
  refStep: string;
  /** Ключ поля результата — поля ЭЛЕМЕНТА, когда источник отдаёт массив. */
  refField: string;
  /** Пусто — массив это сам результат шага; иначе ключ поля-списка в нём. */
  refArrayPath: string;
  filter: FilterState;
}

function emptyFilter(): FilterState {
  return { field: "", op: "", mode: "const", constValue: "", refStep: "", refField: "" };
}

const state = reactive<Record<string, FieldState>>({});

const schema = computed(() => props.schemas[props.stepIndex] ?? { inputs: [], outputs: [] });

const typeLabel = computed(() => TYPE_LABELS[props.step.type] ?? "Шаг");
const method = computed(() =>
  props.step.type === "api"
    ? props.step.method
    : props.step.type === "periodic"
      ? props.step.pollMethod
      : "",
);
const path = computed(() =>
  props.step.type === "api"
    ? props.step.path
    : props.step.type === "periodic"
      ? props.step.pollPath
      : "",
);

const inputs = computed(() => schema.value.inputs ?? []);
const outputs = computed(() => schema.value.outputs ?? []);

const delaySeconds = computed(() => (props.step.type === "delay" ? props.step.seconds : 0));
const pollInterval = computed(() =>
  props.step.type === "periodic" ? props.step.pollIntervalSec : 0,
);
const pageTypeLabel = computed(() =>
  props.step.page ? (PAGE_LABELS[props.step.page.type] ?? "") : "",
);

/**
 * Откуда придёт значение ручного ввода: со страницы этого шага (если её поле
 * привязано к значению) либо из общей формы перед запуском. Раньше панель
 * обещала «пользователь введёт при запуске», не уточняя — кто и где спросит,
 * а собрать значение у шага без страницы было вообще некому.
 */
function manualSourceHint(localKey: string): string {
  const page = props.step.page;
  const fields = page?.type === "fields" ? page.fields : [];

  const boundByPage = fields.some((field) =>
    field.target ? field.target === localKey : field.key === localKey,
  );

  return boundByPage
    ? "Значение запросит страница этого шага."
    : "Значение запросит форма перед запуском сценария.";
}

const CONST_HINT = "Можно подставить результат шага: {{s0:company_id}}";

const prevStepOptions = computed(() =>
  props.steps
    .slice(0, props.stepIndex)
    .map((s, i) => ({ value: String(i), label: `Шаг ${i + 1} · ${s.title}` }))
    .filter((_, i) => (props.schemas[i]?.outputs.length ?? 0) > 0),
);

const modeOptions = computed(() => {
  const base = [
    { value: "user", label: "Ручной ввод" },
    { value: "const", label: "Константа" },
  ];
  if (prevStepOptions.value.length) base.push({ value: "ref", label: "Из шага" });
  return base;
});

/** Плоские выходы шага — операнд условия должен быть скаляром, элемент списка тут не нужен. */
function fieldsForStep(refStep: string) {
  const idx = Number(refStep);
  if (!refStep || Number.isNaN(idx)) return [];
  return (props.schemas[idx]?.outputs ?? []).map((o) => ({
    value: o.key,
    label: o.label || o.key,
    description: o.type,
  }));
}

/**
 * «Поле результата» всегда называет поле, которое реально подставится в параметр.
 * Когда шаг-источник отдаёт коллекцию, его выходы — это уже поля элемента; когда
 * список лежит полем внутри объекта, разворачиваем его элемент здесь же, а не
 * предлагаем выбрать сам список (из массива нечего подставить в параметр).
 * Значение опции кодирует и список, и поле: `{arrayPath}::{key}`.
 */
function resultFieldOptions(refStep: string) {
  const idx = Number(refStep);
  if (!refStep || Number.isNaN(idx)) return [];

  const source = props.schemas[idx];
  if (!source) return [];

  if (source.outputIsArray) {
    return (source.outputs ?? []).map((o) => ({
      value: `::${o.key}`,
      label: o.label || o.key,
      description: `${o.type} · элемент коллекции`,
    }));
  }

  const options: { value: string; label: string; description: string }[] = [];
  for (const o of source.outputs ?? []) {
    if (o.type === "array" && o.items?.length) {
      for (const item of o.items) {
        options.push({
          value: `${o.key}::${item.key}`,
          label: item.label || item.key,
          description: `${item.type} · элемент списка ${o.key}`,
        });
      }
      continue;
    }
    options.push({ value: `::${o.key}`, label: o.label || o.key, description: o.type });
  }
  return options;
}

function resultFieldValue(s: FieldState) {
  return s.refField ? `${s.refArrayPath}::${s.refField}` : "";
}

/** Массив есть — значит без условия непонятно, какой из элементов подставлять. */
function needsFilter(s?: FieldState) {
  if (!s || s.mode !== "ref" || !s.refStep || !s.refField) return false;
  if (s.refArrayPath) return true;
  return props.schemas[Number(s.refStep)]?.outputIsArray === true;
}

/** Поля элемента отобранного массива — по ним строится условие. */
function itemFieldsFor(s: FieldState): SchemaField[] {
  const source = props.schemas[Number(s.refStep)];
  if (!source) return [];
  if (s.refArrayPath) {
    return source.outputs.find((o) => o.key === s.refArrayPath)?.items ?? [];
  }
  return source.outputs ?? [];
}

function itemFieldOptions(key: string) {
  return itemFieldsFor(state[key]).map((f) => ({
    value: f.key,
    label: f.label || f.key,
    description: f.type,
  }));
}

/** Спека: для boolean осмысленны только `=`/`≠`, «содержит» — только для строк. */
function operatorOptions(key: string) {
  const s = state[key];
  const type = itemFieldsFor(s).find((f) => f.key === s.filter.field)?.type;

  if (type === "boolean") return OPERATORS.filter((o) => o.value === "eq" || o.value === "ne");
  if (type && type !== "string") return OPERATORS.filter((o) => o.value !== "contains");
  return OPERATORS;
}

function groupFields(loc: string) {
  return inputs.value.filter((f) => (f.loc ?? "body") === loc);
}

/**
 * Где лежит массив, известно из схемы, но `arrayPath` пишется в фильтр только
 * вместе с готовым условием — поэтому при загрузке восстанавливаем его из схемы:
 * ключ поля результата, которого нет среди выходов, приехал из какого-то списка.
 */
function arrayPathFor(refStep: string, refField: string, filter?: StepFilter): string {
  if (filter?.arrayPath) return filter.arrayPath;

  const source = props.schemas[Number(refStep)];
  if (!source || source.outputIsArray) return "";
  if (source.outputs.some((o) => o.key === refField)) return "";

  const owner = source.outputs.find(
    (o) => o.type === "array" && o.items?.some((i) => i.key === refField),
  );
  return owner?.key ?? "";
}

function hydrateFilter(filter?: StepFilter): FilterState {
  if (!filter) return emptyFilter();

  const ref = filter.value.mode === "ref" ? (filter.value.ref ?? "").match(/^s(\d+):(.+)$/) : null;

  return {
    field: filter.field,
    op: filter.op,
    mode: filter.value.mode,
    constValue: filter.value.const ?? "",
    refStep: ref ? ref[1] : "",
    refField: ref ? ref[2] : "",
  };
}

function hydrate() {
  const mappings = props.step.mappings ?? {};
  const consts = props.step.consts ?? {};
  const filters = props.step.filters ?? {};

  for (const field of inputs.value) {
    const source = mappings[field.key];
    const ref = typeof source === "string" ? source.match(/^s(\d+):(.+)$/) : null;
    const filter = filters[field.key];

    state[field.key] = {
      mode: ref ? "ref" : source === "const" ? "const" : "user",
      constValue: consts[field.key] ?? "",
      refStep: ref ? ref[1] : "",
      refField: ref ? ref[2] : "",
      refArrayPath: ref ? arrayPathFor(ref[1], ref[2], filter) : "",
      filter: hydrateFilter(filter),
    };
  }
}

/** Наполовину заданное условие не сохраняем — как и наполовину заданный маппинг. */
function completeFilter(s: FieldState): StepFilter | null {
  const f = s.filter;
  if (!f.field || !f.op) return null;

  if (f.mode === "const") {
    if (!f.constValue) return null;
    return filterOf(s, { mode: "const", const: f.constValue });
  }

  if (f.mode === "ref") {
    if (!f.refStep || !f.refField) return null;
    return filterOf(s, { mode: "ref", ref: `s${f.refStep}:${f.refField}` });
  }

  return filterOf(s, { mode: "user" });
}

function filterOf(s: FieldState, value: StepFilter["value"]): StepFilter {
  return {
    ...(s.refArrayPath ? { arrayPath: s.refArrayPath } : {}),
    field: s.filter.field,
    op: s.filter.op as FilterOperator,
    value,
  };
}

function emitUpdate() {
  const mappings: Record<string, string> = {};
  const consts: Record<string, string> = {};
  const filters: Record<string, StepFilter> = {};

  for (const field of inputs.value) {
    const s = state[field.key];
    if (!s) continue;
    if (s.mode === "const") {
      mappings[field.key] = "const";
      consts[field.key] = s.constValue;
    } else if (s.mode === "ref") {
      if (!s.refStep || !s.refField) continue;
      mappings[field.key] = `s${s.refStep}:${s.refField}`;

      if (needsFilter(s)) {
        const filter = completeFilter(s);
        if (filter) filters[field.key] = filter;
      }
    } else {
      mappings[field.key] = "user";
    }
  }

  emit("update", { ...props.step, mappings, consts, filters } as Step);
}

function setMode(key: string, mode: string) {
  state[key].mode = mode as FieldState["mode"];
  if (mode !== "ref") {
    state[key].refStep = "";
    state[key].refField = "";
    state[key].refArrayPath = "";
    state[key].filter = emptyFilter();
  }
  emitUpdate();
}

function setRefStep(key: string, value: string) {
  state[key].refStep = value;
  state[key].refField = "";
  state[key].refArrayPath = "";
  state[key].filter = emptyFilter();
  emitUpdate();
}

function setRefField(key: string, value: string) {
  const [arrayPath, field] = value.split("::");
  state[key].refArrayPath = arrayPath ?? "";
  state[key].refField = field ?? "";
  // Условие строится на полях элемента — при смене списка оно перестаёт быть валидным.
  state[key].filter = emptyFilter();
  emitUpdate();
}

function setFilterField(key: string, value: string) {
  state[key].filter.field = value;
  // Оператор мог быть недоступен для нового типа поля (например, «содержит» у числа).
  if (!operatorOptions(key).some((o) => o.value === state[key].filter.op)) {
    state[key].filter.op = "";
  }
  emitUpdate();
}

function setFilterOp(key: string, value: string) {
  state[key].filter.op = value as FilterOperator;
  emitUpdate();
}

function setFilterMode(key: string, value: string) {
  state[key].filter.mode = value as FilterState["mode"];
  if (value !== "ref") {
    state[key].filter.refStep = "";
    state[key].filter.refField = "";
  }
  emitUpdate();
}

function setFilterRefStep(key: string, value: string) {
  state[key].filter.refStep = value;
  state[key].filter.refField = "";
  emitUpdate();
}

function setFilterRefField(key: string, value: string) {
  state[key].filter.refField = value;
  emitUpdate();
}

function updateDelay(seconds: number) {
  emit("update", { ...props.step, seconds } as Step);
}

function updateInterval(pollIntervalSec: number) {
  emit("update", { ...props.step, pollIntervalSec } as Step);
}

function removePage() {
  const next = { ...props.step };
  delete next.page;
  emit("update", next as Step);
}

// Schemas are re-fetched after every save, so `inputs` is a fresh array even when
// nothing changed. Re-hydrating on that would wipe a half-made choice: "Из шага"
// writes no mapping until both the step and the field are picked, so hydrate would
// read no source and snap the field back to "Ручной ввод". Watch what actually
// changed instead of the array identity.
const hydrateKey = computed(
  () => `${props.stepIndex}|${inputs.value.map((f) => f.key).join(",")}`,
);

watch(hydrateKey, hydrate, { immediate: true });
</script>

<template>
  <div class="fixed inset-0 z-[1000] flex justify-end">
    <div class="flex-1 bg-zinc-900/30 backdrop-blur-[1px]" @click="emit('close')" />
    <div
      class="w-[600px] max-w-full h-full bg-white border-l border-zinc-200 shadow-2xl flex flex-col"
    >
      <div class="flex items-start gap-3 px-7 pt-6 pb-5 border-b border-zinc-200">
        <div class="flex-1 min-w-0">
          <Badge tone="info" class="mb-2.5">{{ typeLabel }}</Badge>
          <div class="font-sans font-bold text-[1.25rem] tracking-tight text-zinc-900 truncate">
            {{ step.title }}
          </div>
          <div v-if="path" class="flex items-center gap-2 mt-2">
            <MethodBadge :method="method" />
            <code class="font-mono text-[0.8125rem] text-zinc-500 truncate">{{ path }}</code>
          </div>
        </div>
        <IconButton variant="outline" label="Закрыть" :size="34" @click="emit('close')">
          <Icon name="x" :size="16" />
        </IconButton>
      </div>

      <div class="flex-1 overflow-y-auto px-7 py-7 flex flex-col">
        <!-- Входные данные -->
        <div>
          <div class="flex items-start gap-3 mb-5">
            <span
              class="w-9 h-9 rounded-xl shrink-0 inline-flex items-center justify-center bg-indigo-50 text-indigo-600"
            >
              <Icon name="download" :size="18" />
            </span>
            <div class="min-w-0">
              <div class="font-sans text-[0.9375rem] font-bold text-zinc-900">Входные данные</div>
              <div class="font-sans text-[0.8125rem] text-zinc-500 mt-0.5">
                Укажите, откуда брать значение для каждого параметра.
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-7">
            <div v-for="g in GROUPS" :key="g.loc">
              <template v-if="groupFields(g.loc).length">
                <div class="flex items-center gap-2 mb-3.5">
                  <span :class="['w-2 h-2 rounded-full', g.dot]" />
                  <div
                    class="font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-zinc-500"
                  >
                    {{ g.title }}
                  </div>
                </div>
                <div class="flex flex-col gap-3.5">
                  <div
                    v-for="f in groupFields(g.loc)"
                    :key="f.key"
                    class="border border-zinc-200 rounded-2xl p-4 flex flex-col gap-4"
                  >
                    <div>
                      <div class="flex items-center gap-2">
                        <code class="font-mono text-sm font-semibold text-zinc-900">{{ f.key }}</code>
                        <span
                          class="shrink-0 inline-flex items-center font-mono text-[0.6875rem] font-semibold tracking-wide text-sky-600"
                          >{{ f.type }}</span
                        >
                        <span
                          v-if="f.required"
                          class="font-sans text-[0.6875rem] font-semibold text-rose-600 ml-auto"
                          >обязательный</span
                        >
                      </div>
                      <div
                        v-if="f.label && f.label !== f.key"
                        class="font-sans text-[0.8125rem] text-zinc-400 mt-1.5"
                      >
                        {{ f.label }}
                      </div>
                    </div>

                    <SegmentedControl
                      size="sm"
                      :model-value="state[f.key]?.mode"
                      :options="modeOptions"
                      @update:model-value="setMode(f.key, $event as string)"
                    />

                    <Input
                      v-if="state[f.key]?.mode === 'const'"
                      v-model="state[f.key].constValue"
                      mono
                      placeholder="Значение константы"
                      :hint="CONST_HINT"
                      @update:model-value="emitUpdate"
                    />

                    <div v-else-if="state[f.key]?.mode === 'ref'" class="flex flex-col gap-2.5">
                      <Select
                        label="Шаг-источник"
                        placeholder="Выберите шаг"
                        :model-value="state[f.key].refStep"
                        :options="prevStepOptions"
                        @update:model-value="setRefStep(f.key, $event as string)"
                      />
                      <Select
                        label="Поле результата"
                        placeholder="Выберите поле"
                        :model-value="resultFieldValue(state[f.key])"
                        :options="resultFieldOptions(state[f.key].refStep)"
                        @update:model-value="setRefField(f.key, $event as string)"
                      />

                      <!-- Шаг-источник отдаёт коллекцию: без условия непонятно, какой элемент брать. -->
                      <div
                        v-if="needsFilter(state[f.key])"
                        class="border border-zinc-200 rounded-xl p-3.5 flex flex-col gap-2.5 bg-zinc-50/60"
                      >
                        <div class="flex items-center gap-2">
                          <Icon name="filter" :size="14" class="text-zinc-400" />
                          <div
                            class="font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-zinc-500"
                          >
                            Условие отбора
                          </div>
                        </div>
                        <div class="font-sans text-[0.8125rem] text-zinc-500">
                          Шаг возвращает несколько записей — укажите, какую из них брать.
                        </div>

                        <div class="grid grid-cols-2 gap-2.5">
                          <Select
                            label="Поле элемента"
                            placeholder="Выберите поле"
                            :model-value="state[f.key].filter.field"
                            :options="itemFieldOptions(f.key)"
                            @update:model-value="setFilterField(f.key, $event as string)"
                          />
                          <Select
                            label="Оператор"
                            placeholder="Оператор"
                            :disabled="!state[f.key].filter.field"
                            :model-value="state[f.key].filter.op"
                            :options="operatorOptions(f.key)"
                            @update:model-value="setFilterOp(f.key, $event as string)"
                          />
                        </div>

                        <SegmentedControl
                          size="sm"
                          :model-value="state[f.key].filter.mode"
                          :options="modeOptions"
                          @update:model-value="setFilterMode(f.key, $event as string)"
                        />

                        <Input
                          v-if="state[f.key].filter.mode === 'const'"
                          v-model="state[f.key].filter.constValue"
                          mono
                          placeholder="Значение для сравнения"
                          :hint="CONST_HINT"
                          @update:model-value="emitUpdate"
                        />

                        <div
                          v-else-if="state[f.key].filter.mode === 'ref'"
                          class="flex flex-col gap-2.5"
                        >
                          <Select
                            label="Шаг-источник значения"
                            placeholder="Выберите шаг"
                            :model-value="state[f.key].filter.refStep"
                            :options="prevStepOptions"
                            @update:model-value="setFilterRefStep(f.key, $event as string)"
                          />
                          <Select
                            label="Поле значения"
                            placeholder="Выберите поле"
                            :model-value="state[f.key].filter.refField"
                            :options="fieldsForStep(state[f.key].filter.refStep)"
                            @update:model-value="setFilterRefField(f.key, $event as string)"
                          />
                        </div>

                        <div v-else class="font-sans text-[0.8125rem] text-zinc-400">
                          {{ manualSourceHint(`filter:${f.key}`) }}
                        </div>
                      </div>
                    </div>

                    <div v-else class="font-sans text-[0.8125rem] text-zinc-400">
                      {{ manualSourceHint(f.key) }}
                    </div>
                  </div>
                </div>
              </template>
            </div>

            <div
              v-if="!inputs.length"
              class="font-sans text-[0.8125rem] text-zinc-400 border border-dashed border-zinc-200 rounded-xl px-4 py-5 text-center"
            >
              У этого шага нет входных параметров.
            </div>
          </div>
        </div>

        <!-- Настройки типа шага -->
        <div v-if="step.type === 'delay'" class="border-t border-zinc-200 mt-8 pt-8">
          <div class="flex items-start gap-3 mb-5">
            <span
              class="w-9 h-9 rounded-xl shrink-0 inline-flex items-center justify-center bg-sky-50 text-sky-600"
            >
              <Icon name="clock" :size="18" />
            </span>
            <div class="min-w-0">
              <div class="font-sans text-[0.9375rem] font-bold text-zinc-900">Длительность</div>
              <div class="font-sans text-[0.8125rem] text-zinc-500 mt-0.5">
                Пауза перед следующим шагом.
              </div>
            </div>
          </div>
          <Input
            :model-value="delaySeconds"
            type="number"
            label="Секунд"
            @update:model-value="updateDelay(Number($event))"
          />
        </div>

        <div v-if="step.type === 'periodic'" class="border-t border-zinc-200 mt-8 pt-8">
          <div class="flex items-start gap-3 mb-5">
            <span
              class="w-9 h-9 rounded-xl shrink-0 inline-flex items-center justify-center bg-sky-50 text-sky-600"
            >
              <Icon name="refresh-cw" :size="18" />
            </span>
            <div class="min-w-0">
              <div class="font-sans text-[0.9375rem] font-bold text-zinc-900">Опрос</div>
              <div class="font-sans text-[0.8125rem] text-zinc-500 mt-0.5">
                Endpoint опрашивается, пока не вернёт результат.
              </div>
            </div>
          </div>
          <Input
            :model-value="pollInterval"
            type="number"
            label="Интервал, секунд"
            @update:model-value="updateInterval(Number($event))"
          />
        </div>

        <!-- Выходные данные -->
        <div class="border-t border-zinc-200 mt-8 pt-8">
          <div class="flex items-start gap-3 mb-5">
            <span
              class="w-9 h-9 rounded-xl shrink-0 inline-flex items-center justify-center bg-violet-50 text-violet-600"
            >
              <Icon name="upload" :size="18" />
            </span>
            <div class="min-w-0">
              <div class="font-sans text-[0.9375rem] font-bold text-zinc-900">Выходные данные</div>
              <div class="font-sans text-[0.8125rem] text-zinc-500 mt-0.5">
                Поля, которые шаг возвращает дальше.
              </div>
            </div>
          </div>
          <div v-if="outputs.length" class="border border-zinc-200 rounded-2xl overflow-hidden">
            <div
              v-for="(o, i) in outputs"
              :key="o.key"
              :class="['px-4 py-3 flex flex-col gap-1', i ? 'border-t border-zinc-100' : '']"
            >
              <div class="flex items-center gap-2">
                <code class="font-mono text-sm font-semibold text-zinc-900">{{ o.key }}</code>
                <span
                  class="shrink-0 inline-flex items-center font-mono text-[0.6875rem] font-semibold tracking-wide text-sky-600"
                  >{{ o.type }}</span
                >
                <code
                  v-if="o.ex !== undefined"
                  class="ml-auto font-mono text-[0.75rem] text-emerald-600 truncate max-w-[45%]"
                  >{{ o.ex }}</code
                >
              </div>
              <div v-if="o.label && o.label !== o.key" class="font-sans text-[0.8125rem] text-zinc-400">
                {{ o.label }}
              </div>
            </div>
          </div>
          <div
            v-else
            class="font-sans text-[0.8125rem] text-zinc-400 border border-dashed border-zinc-200 rounded-xl px-4 py-5 text-center"
          >
            У этого шага нет выходных полей.
          </div>
          <div v-if="outputs.length" class="font-sans text-[0.75rem] text-zinc-400 mt-2.5">
            Эти поля доступны как вход для следующих шагов.
          </div>
        </div>

        <!-- Страница ввода -->
        <div class="border-t border-zinc-200 mt-8 pt-8">
          <div class="flex items-start gap-3 mb-5">
            <span
              class="w-9 h-9 rounded-xl shrink-0 inline-flex items-center justify-center bg-amber-50 text-amber-600"
            >
              <Icon name="layout-template" :size="18" />
            </span>
            <div class="min-w-0">
              <div class="font-sans text-[0.9375rem] font-bold text-zinc-900">Страница ввода</div>
              <div class="font-sans text-[0.8125rem] text-zinc-500 mt-0.5">
                Экран, который увидит пользователь перед этим шагом.
              </div>
            </div>
          </div>
          <div v-if="step.page" class="border border-zinc-200 rounded-2xl p-4 flex items-center gap-3.5">
            <div class="min-w-0 flex-1">
              <div class="font-sans text-sm font-bold text-zinc-900 truncate">
                {{ step.page.title }}
              </div>
              <div class="font-sans text-[0.8125rem] text-zinc-500 mt-0.5">
                {{ pageTypeLabel }}
              </div>
            </div>
            <Button variant="secondary" size="sm" @click="emit('edit-page')">Изменить</Button>
            <Button variant="ghost" size="sm" @click="removePage">Удалить</Button>
          </div>
          <div v-else class="flex flex-col items-center gap-3 border border-dashed border-zinc-200 rounded-xl px-4 py-6">
            <div class="font-sans text-[0.8125rem] text-zinc-400 text-center">
              Страница не настроена — пользователь увидит шаг без отдельного экрана.
            </div>
            <Button variant="secondary" size="sm" @click="emit('edit-page')">
              <template #left><Icon name="plus" :size="15" /></template>
              Добавить страницу
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
