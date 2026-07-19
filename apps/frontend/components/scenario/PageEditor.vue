<script setup lang="ts">
// Полноэкранный конструктор страницы шага: слева палитра UIKit-элементов,
// в центре «лист страницы» с drag & drop на сетку из 6 колонок и ресайзом,
// справа инспектор свойств выделенного блока с привязкой к данным.
import type {
  PageBlock,
  PageBlockType,
  PageRow,
  Step,
  StepPage,
  StepSchema,
} from "@fuse/shared";
import {
  OUTPUT_KEY_PATTERN,
  blockCategory,
  blockOutputKey,
  duplicateOutputKeys,
} from "@fuse/shared";

const props = defineProps<{
  step: Step;
  stepIndex: number;
  steps: Step[];
  schemas: StepSchema[];
}>();

const emit = defineEmits<{ save: [page: StepPage]; close: [] }>();

// ---- id ------------------------------------------------------------------
let seq = 0;
function uid(prefix = "b"): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `${prefix}_${++seq}`;
}

// ---- Палитра -------------------------------------------------------------
interface PaletteItem {
  type: PageBlockType;
  name: string;
  icon: string;
  desc: string;
  span: PageBlock["span"];
}
const PALETTE: PaletteItem[] = [
  { type: "input", name: "Поле ввода", icon: "text-cursor-input", desc: "Однострочный ввод", span: 3 },
  { type: "select", name: "Выпадающий список", icon: "chevrons-up-down", desc: "Выбор из вариантов", span: 3 },
  { type: "dropzone", name: "Загрузка файла", icon: "upload", desc: "Drag & drop файла", span: 6 },
  { type: "richtext", name: "Форматируемый текст", icon: "pilcrow", desc: "Редактор с разметкой", span: 6 },
  { type: "paragraph", name: "Абзац", icon: "align-left", desc: "Текст / вывод данных", span: 6 },
];
const META: Record<PageBlockType, PaletteItem> = Object.fromEntries(
  PALETTE.map((p) => [p.type, p]),
) as Record<PageBlockType, PaletteItem>;
const CATS = [
  { key: "input" as const, title: "Ввод", hint: "заполняет пользователь", dot: "bg-indigo-500" },
  { key: "display" as const, title: "Отображение", hint: "показывает результат", dot: "bg-violet-500" },
];
function paletteFor(cat: "input" | "display"): PaletteItem[] {
  return PALETTE.filter((p) => blockCategory(p.type) === cat);
}

function newBlock(type: PageBlockType): PageBlock {
  const base: PageBlock = { id: uid(), type, span: META[type].span };
  if (type === "input") return { ...base, label: "Новое поле", placeholder: "Введите значение" };
  if (type === "select") return { ...base, label: "Список", placeholder: "Выберите вариант" };
  if (type === "dropzone") return { ...base, label: "Загрузка файла" };
  if (type === "richtext") return { ...base, label: "Текст с форматированием" };
  if (type === "paragraph") return { ...base, text: "Поясняющий текст для пользователя. Отредактируйте в свойствах справа." };
  return base;
}

function starterRows(): PageRow[] {
  return [
    { id: uid("r"), items: [{ id: uid(), type: "paragraph", span: 6, text: "Заполните поля ниже, чтобы запустить шаг." }] },
  ];
}

// ---- Состояние -----------------------------------------------------------
// Конструктор открывается только для шага «Страница»; раскладка копируется,
// чтобы правки не текли в стор до «Готово».
const initialPage = props.step.type === "page" ? props.step.page : undefined;
const title = ref(initialPage?.title || props.step.title || "Страница шага");
const rows = ref<PageRow[]>(
  initialPage?.rows?.length
    ? (JSON.parse(JSON.stringify(initialPage.rows)) as PageRow[])
    : starterRows(),
);

const dragging = ref(false);
type DropTarget =
  | { kind: "gap"; beforeRowId: string | null }
  | { kind: "row"; rowId: string; beforeItemId: string | null }
  | null;
const dropTarget = ref<DropTarget>(null);
const selectedId = ref<string | null>(null);
// { kind:'new', type } либо { kind:'move', id }
let dragInfo: { kind: "new"; type: PageBlockType } | { kind: "move"; id: string } | null = null;

const GAP = 14;

const totalItems = computed(() => rows.value.reduce((n, r) => n + r.items.length, 0));

const selected = computed<{ rowId: string; block: PageBlock } | null>(() => {
  for (const r of rows.value) {
    for (const b of r.items) if (b.id === selectedId.value) return { rowId: r.id, block: b };
  }
  return null;
});

// ---- Привязки ------------------------------------------------------------
interface BindOption {
  value: string;
  label: string;
  description?: string;
}
/** Отображение: выходы только предыдущих шагов, у которых есть выходы. */
const displayBindings = computed<BindOption[]>(() => {
  const opts: BindOption[] = [];
  for (let i = 0; i < props.stepIndex; i++) {
    const outputs = props.schemas[i]?.outputs ?? [];
    if (!outputs.length) continue;
    const stepTitle = props.steps[i]?.title || `Шаг ${i + 1}`;
    for (const o of outputs) {
      opts.push({ value: `s${i}:${o.key}`, label: o.label || o.key, description: `Шаг ${i + 1} · ${stepTitle}` });
    }
  }
  return opts;
});
/**
 * Источник вариантов select — выходы предыдущих шагов. Массивное поле
 * развернётся в список опций на рантайме; тип поля подсказан в описании,
 * чтобы было видно, где массив.
 */
const optionSourceBindings = computed<BindOption[]>(() => {
  const opts: BindOption[] = [];
  for (let i = 0; i < props.stepIndex; i++) {
    const outputs = props.schemas[i]?.outputs ?? [];
    if (!outputs.length) continue;
    const stepTitle = props.steps[i]?.title || `Шаг ${i + 1}`;
    for (const o of outputs) {
      opts.push({ value: `s${i}:${o.key}`, label: o.label || o.key, description: `${o.type} · Шаг ${i + 1} · ${stepTitle}` });
    }
  }
  return opts;
});
const optionSourceSelectOptions = computed(() => [
  { value: "", label: "Не выбрано" },
  ...optionSourceBindings.value,
]);
const bindingSelectOptions = computed(() => {
  if (!selected.value) return [];
  return [{ value: "", label: "Не привязано" }, ...displayBindings.value];
});

/**
 * Чип на блоке: у блока ввода — его ключ выхода (под ним значение попадёт в
 * результат шага), у блока отображения — подпись привязанного поля источника.
 */
function bindingLabel(block: PageBlock): string {
  if (blockCategory(block.type) === "input") return blockOutputKey(block);
  if (!block.binding) return "";
  const opt = displayBindings.value.find((o) => o.value === block.binding);
  return opt?.label ?? block.binding;
}

// ---- Ключи выходов блоков ввода -------------------------------------------
/**
 * Ключ выхода валидируется на месте: формат идентификатора и уникальность в
 * пределах страницы. С ошибками «Готово» недоступно — иначе их же вернул бы
 * сервер при сохранении шагов.
 */
function outputKeyError(block: PageBlock): string {
  if (block.binding && !OUTPUT_KEY_PATTERN.test(block.binding)) {
    return "Только латиница, цифры и подчёркивание, не с цифры.";
  }
  const key = blockOutputKey(block);
  const clash = rows.value
    .flatMap((r) => r.items)
    .some(
      (b) =>
        b.id !== block.id &&
        blockCategory(b.type) === "input" &&
        blockOutputKey(b) === key,
    );
  return clash ? `Ключ «${key}» уже занят другим блоком.` : "";
}

const hasKeyErrors = computed(() => {
  const page: StepPage = { title: title.value, rows: rows.value };
  if (duplicateOutputKeys(page).length > 0) return true;
  return rows.value
    .flatMap((r) => r.items)
    .some(
      (b) =>
        blockCategory(b.type) === "input" &&
        b.binding &&
        !OUTPUT_KEY_PATTERN.test(b.binding),
    );
});

const canSave = computed(() => totalItems.value > 0 && !hasKeyErrors.value);

// ---- Мутации -------------------------------------------------------------
function select(id: string) {
  selectedId.value = id;
}
function clearSelection() {
  selectedId.value = null;
}
function pruneEmpty(list: PageRow[]): PageRow[] {
  return list.filter((r) => r.items.length);
}
function remove(rowId: string, itemId: string) {
  rows.value = pruneEmpty(
    rows.value.map((r) => (r.id === rowId ? { ...r, items: r.items.filter((b) => b.id !== itemId) } : r)),
  );
  if (selectedId.value === itemId) selectedId.value = null;
}
function resize(rowId: string, itemId: string, span: PageBlock["span"]) {
  rows.value = rows.value.map((r) =>
    r.id === rowId ? { ...r, items: r.items.map((b) => (b.id === itemId ? { ...b, span } : b)) } : r,
  );
}
function patch(rowId: string, itemId: string, p: Partial<PageBlock>) {
  rows.value = rows.value.map((r) =>
    r.id === rowId ? { ...r, items: r.items.map((b) => (b.id === itemId ? { ...b, ...p } : b)) } : r,
  );
}
function patchSelected(p: Partial<PageBlock>) {
  if (selected.value) patch(selected.value.rowId, selected.value.block.id, p);
}
function onBindingChange(value: string) {
  patchSelected({ binding: value || undefined });
}
function onOutputKeyChange(value: string) {
  patchSelected({ binding: value.trim() || undefined });
}

// ---- Варианты select -----------------------------------------------------
function selectOptions(block: PageBlock): string[] {
  return block.options ?? [];
}
function addOption() {
  if (!selected.value) return;
  patchSelected({ options: [...selectOptions(selected.value.block), ""] });
}
function updateOption(index: number, value: string) {
  if (!selected.value) return;
  const next = [...selectOptions(selected.value.block)];
  next[index] = value;
  patchSelected({ options: next });
}
function removeOption(index: number) {
  if (!selected.value) return;
  const next = selectOptions(selected.value.block).filter((_, i) => i !== index);
  patchSelected({ options: next });
}

// Источник вариантов select: «Вручную» (статический список) либо «Из шага»
// (`optionsSource` из выхода пройденного шага). Режим следует за выбранным
// блоком и переключается сегментами инспектора.
const optionsMode = ref<"manual" | "dynamic">("manual");
watch(
  () => selected.value?.block.id,
  () => {
    optionsMode.value = selected.value?.block.optionsSource ? "dynamic" : "manual";
  },
  { immediate: true },
);
function setOptionsMode(mode: "manual" | "dynamic") {
  optionsMode.value = mode;
  // Активной остаётся одна модель вариантов: ручной режим снимает источник,
  // динамический — расчищает статический список, чтобы он не подменял его.
  if (mode === "manual") patchSelected({ optionsSource: undefined });
  else patchSelected({ options: [] });
}
function onOptionsSourceChange(value: string) {
  patchSelected({ optionsSource: value || undefined });
}

// ---- Ограничения файла dropzone ------------------------------------------
// Сырая строка форматов живёт отдельно от модели: join/split на каждом вводе
// съедал бы запятые и пробелы прямо под курсором.
const acceptRaw = ref("");
watch(
  () => selected.value?.block.id,
  () => {
    acceptRaw.value = (selected.value?.block.accept ?? []).join(", ");
  },
  { immediate: true },
);
function onAcceptChange(value: string) {
  acceptRaw.value = value;
  const accept = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  patchSelected({ accept: accept.length ? accept : undefined });
}
function onMaxFileMbChange(value: string) {
  const num = Number(value);
  patchSelected({ maxFileMb: Number.isFinite(num) && num > 0 ? num : undefined });
}

// ---- Drag lifecycle ------------------------------------------------------
function dragStartNew(type: PageBlockType, e: DragEvent) {
  e.dataTransfer!.effectAllowed = "copy";
  e.dataTransfer!.setData("text/plain", type);
  dragInfo = { kind: "new", type };
  dragging.value = true;
  selectedId.value = null;
}
function dragStartMove(id: string, e: DragEvent) {
  e.stopPropagation();
  e.dataTransfer!.effectAllowed = "move";
  e.dataTransfer!.setData("text/plain", id);
  dragInfo = { kind: "move", id };
  dragging.value = true;
}
function dragEnd() {
  dragInfo = null;
  dragging.value = false;
  dropTarget.value = null;
}

// Какой блок (по id) сидит перед курсором в строке; null — в конец.
function computeBeforeItem(gridEl: HTMLElement, clientX: number): string | null {
  const items = [...gridEl.querySelectorAll("[data-item]")];
  for (const el of items) {
    const r = el.getBoundingClientRect();
    if (clientX < r.left + r.width / 2) return el.getAttribute("data-item");
  }
  return null;
}
function setGap(beforeRowId: string | null) {
  dropTarget.value = { kind: "gap", beforeRowId };
}
function setRow(e: DragEvent, rowId: string) {
  dropTarget.value = { kind: "row", rowId, beforeItemId: computeBeforeItem(e.currentTarget as HTMLElement, e.clientX) };
}

function takeDragged(draft: PageRow[]): PageBlock | null {
  if (!dragInfo) return null;
  if (dragInfo.kind === "new") return newBlock(dragInfo.type);
  for (const r of draft) {
    const i = r.items.findIndex((b) => b.id === (dragInfo as { id: string }).id);
    if (i >= 0) return r.items.splice(i, 1)[0];
  }
  return null;
}

// Дроп применяется по ЯВНО переданному таргету, а не по dropTarget.value:
// состояние dragover может не успеть закоммититься к моменту drop.
function applyDrop(target: Exclude<DropTarget, null>) {
  if (!dragInfo) return dragEnd();
  const draft = rows.value.map((r) => ({ ...r, items: [...r.items] }));
  const block = takeDragged(draft);
  if (!block) {
    dragEnd();
    return;
  }
  if (target.kind === "gap") {
    const row: PageRow = { id: uid("r"), items: [block] };
    const idx = target.beforeRowId ? draft.findIndex((r) => r.id === target.beforeRowId) : draft.length;
    draft.splice(idx < 0 ? draft.length : idx, 0, row);
  } else {
    const row = draft.find((r) => r.id === target.rowId);
    if (!row) {
      draft.push({ id: uid("r"), items: [block] });
    } else {
      const idx = target.beforeItemId ? row.items.findIndex((b) => b.id === target.beforeItemId) : row.items.length;
      row.items.splice(idx < 0 ? row.items.length : idx, 0, block);
    }
  }
  rows.value = pruneEmpty(draft);
  dragEnd();
}

// ---- Ресайз ручкой -------------------------------------------------------
let rz: { itemLeft: number; step: number; rowId: string; itemId: string } | null = null;
function onHandleDown(e: PointerEvent, rowId: string, itemId: string) {
  e.preventDefault();
  e.stopPropagation();
  const handle = e.currentTarget as HTMLElement;
  const grid = handle.closest("[data-row-grid]") as HTMLElement;
  const item = handle.closest("[data-item]") as HTMLElement;
  if (!grid || !item) return;
  const gridRect = grid.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  rz = { itemLeft: itemRect.left, step: (gridRect.width + GAP) / 6, rowId, itemId };
  handle.setPointerCapture(e.pointerId);
}
function onHandleMove(e: PointerEvent, currentSpan: number) {
  if (!rz) return;
  const raw = (e.clientX - rz.itemLeft) / rz.step;
  const span = Math.max(1, Math.min(6, Math.round(raw))) as PageBlock["span"];
  if (span !== currentSpan) resize(rz.rowId, rz.itemId, span);
}
function onHandleUp(e: PointerEvent) {
  if (!rz) return;
  const target = rz;
  rz = null;
  try {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  } catch {
    /* pointer уже отпущен */
  }
  void target;
}

// ---- Inline-редактирование абзаца ----------------------------------------
const editingId = ref<string | null>(null);
function setEditing(id: string, value: boolean) {
  editingId.value = value ? id : editingId.value === id ? null : editingId.value;
}

// ---- Клавиатура ----------------------------------------------------------
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (selectedId.value) selectedId.value = null;
    else emit("close");
    return;
  }
  if ((e.key === "Delete" || e.key === "Backspace") && selected.value) {
    const tag = document.activeElement?.tagName ?? "";
    if (!/INPUT|TEXTAREA/.test(tag) && !editingId.value) {
      e.preventDefault();
      remove(selected.value.rowId, selected.value.block.id);
    }
  }
}
onMounted(() => document.addEventListener("keydown", onKey));
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));

// ---- Сохранение ----------------------------------------------------------
function save() {
  if (!canSave.value) return;
  const page: StepPage = { title: title.value, rows: JSON.parse(JSON.stringify(rows.value)) };
  emit("save", page);
  emit("close");
}
</script>

<template>
  <div
    class="fixed inset-0 z-[1100] bg-white flex flex-col [animation:fuse-fade-up_200ms_cubic-bezier(0.16,1,0.3,1)]"
  >
    <!-- header -->
    <div class="h-16 shrink-0 flex items-center gap-4 px-5 border-b border-zinc-200 bg-white">
      <button
        type="button"
        class="w-9 h-9 rounded-lg inline-flex items-center justify-center text-zinc-500 border border-zinc-200 hover:bg-zinc-100 cursor-pointer shrink-0"
        @click="emit('close')"
      >
        <Icon name="arrow-left" :size="17" />
      </button>
      <div class="flex-1 min-w-0">
        <div class="font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          Редактор страницы
        </div>
        <div class="font-sans text-[1.0625rem] font-bold text-zinc-900 truncate leading-tight">
          {{ title }}
        </div>
      </div>
      <span class="font-sans text-[0.8125rem] text-zinc-400">{{ totalItems }} элем.</span>
      <Button variant="secondary" @click="emit('close')">Отмена</Button>
      <Button variant="dark" :disabled="!canSave" @click="save">
        <template #left><Icon name="check" :size="16" /></template>
        Готово
      </Button>
    </div>

    <!-- body -->
    <div class="flex-1 flex min-h-0">
      <!-- палитра -->
      <aside class="w-[268px] shrink-0 border-r border-zinc-200 bg-white overflow-y-auto">
        <div class="px-5 pt-5 pb-2">
          <div class="font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-zinc-400">
            Элементы UIKit
          </div>
          <div class="font-sans text-[0.8125rem] text-zinc-500 mt-1.5">Перетащите на страницу</div>
        </div>
        <div v-for="c in CATS" :key="c.key" class="px-3.5 pt-3.5 pb-0.5">
          <div class="flex items-center gap-2 px-1.5 mb-2">
            <span :class="['w-1.5 h-1.5 rounded-full shrink-0', c.dot]" />
            <span class="font-sans text-[0.75rem] font-bold text-zinc-900">{{ c.title }}</span>
            <span class="font-sans text-[0.6875rem] text-zinc-400 truncate">· {{ c.hint }}</span>
          </div>
          <div class="flex flex-col gap-2">
            <div
              v-for="p in paletteFor(c.key)"
              :key="p.type"
              draggable="true"
              class="group flex gap-3 items-center px-3 py-2.5 rounded-xl border border-zinc-200 bg-white cursor-grab active:cursor-grabbing transition-all hover:border-zinc-300 hover:shadow-[0_2px_8px_rgba(24,24,27,0.06)] hover:-translate-y-px"
              @dragstart="dragStartNew(p.type, $event)"
              @dragend="dragEnd"
            >
              <span
                class="w-9 h-9 rounded-lg shrink-0 inline-flex items-center justify-center bg-zinc-100 text-zinc-500 group-hover:bg-rose-50 group-hover:text-rose-600 transition-colors"
              >
                <Icon :name="p.icon" :size="17" />
              </span>
              <span class="min-w-0 flex-1">
                <div class="font-sans text-[0.875rem] font-bold text-zinc-900">{{ p.name }}</div>
                <div class="font-sans text-[0.75rem] text-zinc-500 truncate">{{ p.desc }}</div>
              </span>
              <Icon name="grip-vertical" :size="15" class="text-zinc-300 shrink-0" />
            </div>
          </div>
        </div>
        <div
          class="px-5 py-4 mt-2 border-t border-zinc-100 font-sans text-[0.75rem] text-zinc-400 leading-relaxed"
        >
          Каждый элемент можно растянуть на 1–6 колонок. Тяните за правый край.
        </div>
      </aside>

      <!-- канвас -->
      <div class="flex-1 overflow-y-auto bg-zinc-100" @click="clearSelection">
        <div class="min-h-full flex justify-center py-10 px-6">
          <div
            class="w-full max-w-[760px] bg-white rounded-2xl border border-zinc-200 shadow-[0_1px_2px_rgba(24,24,27,0.06),0_12px_32px_rgba(24,24,27,0.06)] px-8 py-9 self-start"
          >
            <div class="mb-6">
              <div
                class="font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-zinc-400 mb-1.5"
              >
                Страница шага
              </div>
              <h2 class="font-sans font-extrabold text-[1.5rem] tracking-tight text-zinc-900">
                {{ title }}
              </h2>
            </div>

            <!-- пустая страница -->
            <div
              v-if="!rows.length"
              :class="[
                'rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center gap-3 px-6 py-16 transition-colors',
                dropTarget ? 'border-rose-500 bg-rose-50' : 'border-zinc-300 bg-zinc-50',
              ]"
              @dragover="dragging && ($event.preventDefault(), setGap(null))"
              @drop.prevent="applyDrop({ kind: 'gap', beforeRowId: null })"
            >
              <span
                class="w-12 h-12 rounded-2xl bg-white border border-zinc-200 inline-flex items-center justify-center text-zinc-400"
              >
                <Icon name="layout-template" :size="22" />
              </span>
              <div class="font-sans text-[0.9375rem] font-bold text-zinc-700">
                Перетащите элементы сюда
              </div>
              <div class="font-sans text-[0.8125rem] text-zinc-500 max-w-[300px]">
                Выберите элемент UIKit в панели слева и перенесите его на страницу.
              </div>
            </div>

            <!-- строки -->
            <div v-else class="relative">
              <!-- направляющие колонок -->
              <div
                :class="[
                  'pointer-events-none absolute inset-0 grid grid-cols-6 transition-opacity',
                  dragging ? 'opacity-100' : 'opacity-0',
                ]"
                :style="{ gap: GAP + 'px' }"
              >
                <div v-for="i in 6" :key="i" class="rounded-lg border border-dashed border-rose-200" />
              </div>

              <template v-for="(row, ri) in rows" :key="row.id">
                <!-- зона перед строкой -->
                <div
                  :class="['transition-all', dragging ? 'h-9 my-0.5' : 'h-2']"
                  @dragover="dragging && ($event.preventDefault(), setGap(ri === 0 ? row.id : rows[ri].id))"
                  @drop.prevent="applyDrop({ kind: 'gap', beforeRowId: row.id })"
                >
                  <div
                    v-if="dragging"
                    :class="[
                      'h-full rounded-lg border-2 border-dashed flex items-center justify-center transition-colors',
                      dropTarget && dropTarget.kind === 'gap' && dropTarget.beforeRowId === row.id
                        ? 'border-rose-500 bg-rose-50'
                        : 'border-transparent',
                    ]"
                  >
                    <span
                      v-if="dropTarget && dropTarget.kind === 'gap' && dropTarget.beforeRowId === row.id"
                      class="font-sans text-[0.6875rem] font-semibold text-rose-600 uppercase tracking-wide"
                    >
                      Новая строка
                    </span>
                  </div>
                </div>

                <!-- строка -->
                <div
                  data-row-grid
                  :class="[
                    'relative grid grid-cols-6 rounded-xl transition-colors',
                    dropTarget && dropTarget.kind === 'row' && dropTarget.rowId === row.id ? 'bg-rose-50/60' : '',
                  ]"
                  :style="{ gap: GAP + 'px' }"
                  @dragover="dragging && ($event.preventDefault(), setRow($event, row.id))"
                  @drop.prevent.stop="
                    applyDrop({
                      kind: 'row',
                      rowId: row.id,
                      beforeItemId: computeBeforeItem($event.currentTarget as HTMLElement, $event.clientX),
                    })
                  "
                >
                  <template v-for="block in row.items" :key="block.id">
                    <div
                      v-if="
                        dropTarget &&
                        dropTarget.kind === 'row' &&
                        dropTarget.rowId === row.id &&
                        dropTarget.beforeItemId === block.id
                      "
                      class="w-0.5 self-stretch bg-rose-500 rounded-full -mx-1 justify-self-start"
                      style="grid-column: span 1"
                    />
                    <!-- блок -->
                    <div
                      :data-item="block.id"
                      :draggable="editingId !== block.id"
                      :style="{ gridColumn: `span ${block.span}` }"
                      :class="[
                        'group relative rounded-xl transition-shadow',
                        editingId === block.id ? 'cursor-text' : 'cursor-grab active:cursor-grabbing',
                        selectedId === block.id
                          ? 'ring-2 ring-rose-500 ring-offset-2 ring-offset-white'
                          : 'ring-1 ring-transparent hover:ring-zinc-200',
                      ]"
                      @dragstart="dragStartMove(block.id, $event)"
                      @dragend="dragEnd"
                      @click.stop="select(block.id)"
                    >
                      <!-- чип привязки -->
                      <div
                        v-if="block.binding"
                        :class="[
                          'absolute -top-2.5 left-3 z-20 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border bg-white shadow-sm font-sans text-[0.625rem] font-semibold max-w-[70%]',
                          blockCategory(block.type) === 'input'
                            ? 'border-indigo-200 text-indigo-600'
                            : 'border-violet-200 text-violet-600',
                        ]"
                      >
                        <Icon
                          :name="blockCategory(block.type) === 'input' ? 'arrow-down-to-line' : 'arrow-up-from-line'"
                          :size="11"
                          class="shrink-0"
                        />
                        <span class="truncate">{{ bindingLabel(block) }}</span>
                      </div>

                      <!-- ручки -->
                      <div
                        :class="[
                          'absolute -top-3 right-3 z-20 flex items-center gap-1 px-1 py-0.5 rounded-full bg-zinc-900 text-white transition-opacity',
                          selectedId === block.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                        ]"
                      >
                        <span class="inline-flex items-center px-1 text-zinc-400"><Icon name="grip-horizontal" :size="14" /></span>
                        <span class="font-mono text-[0.6875rem] font-semibold px-1">{{ block.span }}/6</span>
                        <button
                          type="button"
                          aria-label="Удалить"
                          class="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-white/20 cursor-pointer"
                          @click.stop="remove(row.id, block.id)"
                        >
                          <Icon name="x" :size="13" />
                        </button>
                      </div>

                      <!-- превью -->
                      <div :class="['p-3 select-none', block.type === 'paragraph' ? '' : '[&_*]:pointer-events-none']">
                        <ScenarioPageParagraph
                          v-if="block.type === 'paragraph'"
                          :text="block.text"
                          @patch="patch(row.id, block.id, { text: $event })"
                          @editing="setEditing(block.id, $event)"
                        />
                        <div v-else-if="block.type === 'input'">
                          <div class="font-sans text-[0.8125rem] font-semibold text-zinc-900 mb-2">{{ block.label }}</div>
                          <div class="w-full px-3.5 py-3 bg-white border border-zinc-200 rounded-xl font-sans text-[0.9375rem] text-zinc-400 truncate">
                            {{ block.placeholder }}
                          </div>
                        </div>
                        <div v-else-if="block.type === 'select'">
                          <div class="font-sans text-[0.8125rem] font-semibold text-zinc-900 mb-2">{{ block.label }}</div>
                          <div class="w-full flex items-center gap-2 px-3.5 py-3 bg-white border border-zinc-200 rounded-xl font-sans text-[0.9375rem] text-zinc-400">
                            <span class="flex-1 truncate">{{ block.placeholder }}</span>
                            <Icon name="chevron-down" :size="16" />
                          </div>
                        </div>
                        <div v-else-if="block.type === 'dropzone'">
                          <div class="font-sans text-[0.8125rem] font-semibold text-zinc-900 mb-2">{{ block.label }}</div>
                          <div class="flex flex-col items-center justify-center text-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-5 py-7">
                            <span class="w-10 h-10 rounded-2xl bg-white border border-zinc-200 inline-flex items-center justify-center text-zinc-500"><Icon name="upload" :size="18" /></span>
                            <div class="font-sans text-[0.8125rem] font-semibold text-zinc-700">Перетащите файл сюда</div>
                            <div class="font-sans text-[0.75rem] text-zinc-400">или нажмите, чтобы выбрать</div>
                          </div>
                        </div>
                        <div v-else-if="block.type === 'richtext'">
                          <div class="font-sans text-[0.8125rem] font-semibold text-zinc-900 mb-2">{{ block.label }}</div>
                          <div class="border border-zinc-200 rounded-xl overflow-hidden bg-white">
                            <div class="flex gap-0.5 items-center px-2.5 py-1.5 border-b border-zinc-200 bg-zinc-50 text-zinc-400">
                              <Icon name="bold" :size="15" /><Icon name="italic" :size="15" /><Icon name="underline" :size="15" />
                              <span class="w-px h-[16px] bg-zinc-200 mx-1" /><Icon name="list" :size="15" /><Icon name="list-ordered" :size="15" />
                            </div>
                            <div class="px-4 py-3 min-h-[84px] font-sans text-[0.875rem] text-zinc-400">Начните печатать…</div>
                          </div>
                        </div>
                      </div>

                      <!-- ручка ресайза -->
                      <div
                        :class="[
                          'absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-12 rounded-full cursor-col-resize z-20 flex items-center justify-center transition-opacity',
                          selectedId === block.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                        ]"
                        @pointerdown="onHandleDown($event, row.id, block.id)"
                        @pointermove="onHandleMove($event, block.span)"
                        @pointerup="onHandleUp($event)"
                        @click.stop
                      >
                        <span class="w-1.5 h-10 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(225,29,72,0.15)]" />
                      </div>
                    </div>
                  </template>
                </div>

                <!-- зона после последней строки -->
                <div
                  v-if="ri === rows.length - 1"
                  :class="['transition-all', dragging ? 'h-9 my-0.5' : 'h-2']"
                  @dragover="dragging && ($event.preventDefault(), setGap(null))"
                  @drop.prevent="applyDrop({ kind: 'gap', beforeRowId: null })"
                >
                  <div
                    v-if="dragging"
                    :class="[
                      'h-full rounded-lg border-2 border-dashed flex items-center justify-center transition-colors',
                      dropTarget && dropTarget.kind === 'gap' && dropTarget.beforeRowId === null
                        ? 'border-rose-500 bg-rose-50'
                        : 'border-transparent',
                    ]"
                  >
                    <span
                      v-if="dropTarget && dropTarget.kind === 'gap' && dropTarget.beforeRowId === null"
                      class="font-sans text-[0.6875rem] font-semibold text-rose-600 uppercase tracking-wide"
                    >
                      Новая строка
                    </span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- инспектор -->
      <aside
        v-if="selected"
        class="w-[304px] shrink-0 border-l border-zinc-200 bg-white overflow-y-auto flex flex-col"
      >
        <div class="flex items-center gap-2.5 px-5 pt-5 pb-4 border-b border-zinc-100">
          <span class="w-9 h-9 rounded-lg shrink-0 inline-flex items-center justify-center bg-rose-50 text-rose-600">
            <Icon :name="META[selected.block.type].icon" :size="17" />
          </span>
          <div class="flex-1 min-w-0">
            <div class="font-sans text-[0.875rem] font-bold text-zinc-900 truncate">
              {{ META[selected.block.type].name }}
            </div>
            <div class="font-sans text-[0.75rem] text-zinc-400">Свойства элемента</div>
          </div>
          <button
            type="button"
            aria-label="Снять выделение"
            class="w-8 h-8 rounded-lg inline-flex items-center justify-center text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 cursor-pointer"
            @click="clearSelection"
          >
            <Icon name="x" :size="16" />
          </button>
        </div>

        <div class="px-5 py-5 flex flex-col gap-4">
          <!-- ключ выхода (ввод) / привязка к источнику (отображение) -->
          <div v-if="blockCategory(selected.block.type) === 'input'">
            <div class="flex items-center gap-2 mb-2.5">
              <span class="w-1.5 h-1.5 rounded-full shrink-0 bg-indigo-500" />
              <span class="font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                Ключ выхода
              </span>
            </div>
            <Input
              :model-value="selected.block.binding || ''"
              mono
              :placeholder="selected.block.id"
              @update:model-value="onOutputKeyChange(String($event))"
            />
            <p
              v-if="outputKeyError(selected.block)"
              class="font-sans text-[0.75rem] text-rose-600 mt-2"
            >
              {{ outputKeyError(selected.block) }}
            </p>
            <p v-else class="font-sans text-[0.75rem] text-zinc-400 mt-2">
              Под этим ключом введённое значение попадёт в результат шага — его
              заберут маппинги следующих шагов. Пусто — используется id блока.
            </p>
          </div>

          <div v-else>
            <div class="flex items-center gap-2 mb-2.5">
              <span class="w-1.5 h-1.5 rounded-full shrink-0 bg-violet-500" />
              <span class="font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                Привязка к данным
              </span>
            </div>
            <Select
              label="Поле результата пройденного шага"
              :model-value="selected.block.binding || ''"
              :options="bindingSelectOptions"
              placeholder="Не привязано"
              @change="onBindingChange"
            />
            <p
              v-if="!displayBindings.length"
              class="font-sans text-[0.75rem] text-amber-600 mt-2"
            >
              У предыдущих шагов нет выходов для привязки.
            </p>
          </div>

          <div class="h-px bg-zinc-100 -mx-1" />

          <!-- свойства по типу -->
          <Input
            v-if="selected.block.type !== 'paragraph'"
            :model-value="selected.block.label || ''"
            label="Подпись"
            @update:model-value="patchSelected({ label: String($event) })"
          />
          <Input
            v-if="selected.block.type === 'input' || selected.block.type === 'select'"
            :model-value="selected.block.placeholder || ''"
            label="Плейсхолдер"
            @update:model-value="patchSelected({ placeholder: String($event) })"
          />

          <!-- Варианты выпадающего списка -->
          <div v-if="selected.block.type === 'select'" class="flex flex-col gap-2.5">
            <span class="text-[0.8125rem] font-sans font-semibold text-zinc-900">Варианты</span>
            <!-- источник: вручную или из выхода пройденного шага -->
            <div class="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-zinc-100">
              <button
                v-for="m in [
                  { key: 'manual', label: 'Вручную' },
                  { key: 'dynamic', label: 'Из шага' },
                ]"
                :key="m.key"
                type="button"
                :class="[
                  'h-8 rounded-lg font-sans text-[0.8125rem] font-semibold transition-colors cursor-pointer',
                  optionsMode === m.key
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-800',
                ]"
                @click="setOptionsMode(m.key as 'manual' | 'dynamic')"
              >
                {{ m.label }}
              </button>
            </div>

            <!-- динамический источник -->
            <template v-if="optionsMode === 'dynamic'">
              <Select
                label="Поле-массив пройденного шага"
                :model-value="selected.block.optionsSource || ''"
                :options="optionSourceSelectOptions"
                placeholder="Не выбрано"
                @change="onOptionsSourceChange"
              />
              <p
                v-if="!optionSourceBindings.length"
                class="font-sans text-[0.75rem] text-amber-600"
              >
                У предыдущих шагов нет выходов, из которых можно взять варианты.
              </p>
              <p v-else class="font-sans text-[0.75rem] text-zinc-400">
                Значения массива этого поля станут вариантами списка при запуске.
              </p>
            </template>

            <!-- ручной список -->
            <template v-else>
              <div class="flex items-center justify-end">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 font-sans text-[0.75rem] font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                  @click="addOption"
                >
                  <Icon name="plus" :size="14" />Добавить
                </button>
              </div>
              <p
                v-if="!selectOptions(selected.block).length"
                class="font-sans text-[0.75rem] text-zinc-400"
              >
                Пока нет вариантов — добавьте те, из которых будет выбирать пользователь.
              </p>
              <div
                v-for="(opt, i) in selectOptions(selected.block)"
                :key="i"
                class="flex items-center gap-2"
              >
                <input
                  :value="opt"
                  :placeholder="`Вариант ${i + 1}`"
                  class="flex-1 min-w-0 px-3 py-2 bg-white border border-zinc-200 rounded-lg outline-none transition font-sans text-[0.875rem] text-zinc-900 focus:border-rose-600 focus:ring-4 focus:ring-rose-600/20"
                  @input="updateOption(i, ($event.target as HTMLInputElement).value)"
                />
                <button
                  type="button"
                  aria-label="Удалить вариант"
                  class="w-8 h-8 shrink-0 rounded-lg inline-flex items-center justify-center text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 cursor-pointer"
                  @click="removeOption(i)"
                >
                  <Icon name="x" :size="15" />
                </button>
              </div>
            </template>
          </div>

          <!-- ограничения файла dropzone -->
          <div v-if="selected.block.type === 'dropzone'" class="flex flex-col gap-2.5">
            <span class="text-[0.8125rem] font-sans font-semibold text-zinc-900">Ограничения файла</span>
            <Input
              :model-value="acceptRaw"
              label="Допустимые форматы"
              placeholder=".pdf, image/png"
              @update:model-value="onAcceptChange(String($event))"
            />
            <p class="font-sans text-[0.75rem] text-zinc-400">
              Расширения или MIME-типы через запятую. Пусто — любой формат.
            </p>
            <Input
              :model-value="selected.block.maxFileMb != null ? String(selected.block.maxFileMb) : ''"
              label="Макс. размер (МБ)"
              placeholder="Без лимита"
              @update:model-value="onMaxFileMbChange(String($event))"
            />
          </div>

          <label
            v-if="blockCategory(selected.block.type) === 'input'"
            class="inline-flex items-center gap-2 font-sans text-[0.8125rem] text-zinc-700 cursor-pointer"
          >
            <input
              type="checkbox"
              class="w-4 h-4 accent-rose-600 cursor-pointer"
              :checked="!!selected.block.required"
              @change="patchSelected({ required: ($event.target as HTMLInputElement).checked })"
            />
            Обязательное поле
          </label>

          <div v-if="selected.block.type === 'paragraph'" class="flex flex-col gap-2">
            <label class="text-[0.8125rem] font-sans font-semibold text-zinc-900">Текст</label>
            <textarea
              :value="selected.block.text || ''"
              rows="5"
              class="w-full px-3.5 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none transition focus:border-rose-600 focus:ring-4 focus:ring-rose-600/20 font-sans text-[0.9375rem] text-zinc-900 resize-none leading-relaxed"
              @input="patchSelected({ text: ($event.target as HTMLTextAreaElement).value })"
            />
          </div>

          <!-- ширина -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <div class="font-sans text-[0.8125rem] font-semibold text-zinc-900">Ширина</div>
              <span class="font-mono text-[0.75rem] font-semibold text-rose-600">{{ selected.block.span }}/6</span>
            </div>
            <div class="grid grid-cols-6 gap-1.5">
              <button
                v-for="n in 6"
                :key="n"
                type="button"
                :class="[
                  'h-9 rounded-lg font-sans text-[0.8125rem] font-semibold border transition-colors cursor-pointer',
                  selected.block.span === n
                    ? 'bg-zinc-900 border-zinc-900 text-white'
                    : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-100',
                ]"
                @click="patchSelected({ span: n as PageBlock['span'] })"
              >
                {{ n }}
              </button>
            </div>
            <div class="font-sans text-[0.75rem] text-zinc-400 mt-2">Колонки, которые занимает элемент.</div>
          </div>
        </div>

        <div class="mt-auto px-5 py-4 border-t border-zinc-100">
          <button
            type="button"
            class="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-sans text-[0.875rem] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors cursor-pointer"
            @click="remove(selected.rowId, selected.block.id)"
          >
            <Icon name="trash-2" :size="16" />Удалить элемент
          </button>
        </div>
      </aside>
    </div>
  </div>
</template>
