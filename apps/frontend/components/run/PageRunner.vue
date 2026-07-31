<script setup lang="ts">
// Обобщённый рантайм-рендер страницы шага: строки × блоки на сетке из 6 колонок.
// Блоки ввода собирают значения (по id блока), блоки отображения показывают
// подставленные данные пройденных шагов из `resolved`. Один компонент на панель
// запуска и playground — вместо трёх веток по типам страницы.
import type { PageBlock, StepPage } from "@fuse/shared";
import { blockCategory, validateFileAgainstBlock } from "@fuse/shared";
import type { FileUploadHandle } from "../../composables/useFileUpload";

const props = withDefaults(
  defineProps<{
    page: StepPage;
    /** Значения блоков отображения из результатов пройденных шагов, по id блока. */
    resolved?: Record<string, unknown>;
    submitText?: string;
    size?: "sm" | "md";
    busy?: boolean;
  }>(),
  { submitText: "Продолжить", size: "md", busy: false },
);

const emit = defineEmits<{ submit: [data: Record<string, unknown>] }>();

const values = reactive<Record<string, unknown>>({});
// Загрузки dropzone-блоков: файл уезжает в хранилище ДО сабмита страницы,
// в `page:submit` идёт только ссылка на объект (`state.result`).
const uploads = reactive<Record<string, FileUploadHandle>>({});
const fileErrors = reactive<Record<string, string>>({});
const { upload: startUpload } = useFileUpload();

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function requiredBlocks(): PageBlock[] {
  const out: PageBlock[] = [];
  for (const row of props.page.rows) {
    for (const b of row.items) {
      if (blockCategory(b.type) === "input" && b.required) out.push(b);
    }
  }
  return out;
}

function blockValue(block: PageBlock): unknown {
  if (block.type === "dropzone") return uploads[block.id]?.state.result ?? null;
  return values[block.id];
}

const canSubmit = computed(
  () => !props.busy && requiredBlocks().every((b) => !isBlank(blockValue(b))),
);

/**
 * Display-only страница (без блоков ввода) не собирает данных и не сабмитится:
 * worker публикует её и продолжает сам, кнопка «Продолжить» здесь лишняя.
 */
const hasInputBlocks = computed(() =>
  props.page.rows.some((row) =>
    row.items.some((b) => blockCategory(b.type) === "input"),
  ),
);

function displayValue(block: PageBlock): string {
  const v = props.resolved?.[block.id];
  if (v !== undefined && v !== null && v !== "") return String(v);
  return block.text ?? "";
}

/**
 * Варианты select: динамические из результата пройденного шага (развёрнуты
 * сервером в `resolved`), иначе — статический список блока.
 */
function selectOptions(block: PageBlock): string[] {
  const dynamic = props.resolved?.[block.id];
  if (Array.isArray(dynamic)) return dynamic.map((v) => String(v));
  return block.options ?? [];
}

/** Подпись ограничений под dropzone: форматы и лимит из настроек блока. */
function fileConstraints(block: PageBlock): string {
  const parts: string[] = [];
  if (block.accept?.length) parts.push(block.accept.join(", "));
  if (block.maxFileMb) parts.push(`макс. ${block.maxFileMb} МБ`);
  return parts.join(" · ");
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
}

function onFile(block: PageBlock, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // Повторный выбор того же файла должен снова сработать.
  input.value = "";
  if (!file) return;

  delete fileErrors[block.id];
  const error = validateFileAgainstBlock(block, file);
  if (error) {
    fileErrors[block.id] = error;
    return;
  }

  // Новый файл заменяет предыдущую загрузку блока.
  void uploads[block.id]?.cancel();
  uploads[block.id] = startUpload(file);
}

function submit() {
  if (!canSubmit.value) return;
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!isBlank(value)) payload[key] = value;
  }
  for (const [key, handle] of Object.entries(uploads)) {
    if (handle.state.result) payload[key] = handle.state.result;
  }
  emit("submit", payload);
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="submit">
    <h3
      v-if="page.title"
      class="font-sans font-bold text-[1.0625rem] tracking-tight text-zinc-900"
    >
      {{ page.title }}
    </h3>

    <div v-for="row in page.rows" :key="row.id" class="grid grid-cols-6 gap-3">
      <div
        v-for="block in row.items"
        :key="block.id"
        :style="{ gridColumn: `span ${block.span}` }"
      >
        <!-- отображение: Markdown-формат рендерится в разметку (HTML уже
             прошёл allowlist-санитайзер внутри renderMarkdown) -->
        <div
          v-if="block.type === 'paragraph' && block.format === 'markdown'"
          class="fuse-md font-sans text-[0.9375rem] text-zinc-700 leading-relaxed"
          v-html="renderMarkdown(displayValue(block))"
        />
        <p
          v-else-if="block.type === 'paragraph'"
          class="font-sans text-[0.9375rem] text-zinc-700 leading-relaxed whitespace-pre-wrap m-0"
        >
          {{ displayValue(block) }}
        </p>

        <!-- многострочный ввод -->
        <div v-else-if="block.type === 'richtext'" class="flex flex-col gap-1.5">
          <span v-if="block.label" class="font-sans text-[0.8125rem] font-semibold text-zinc-900">
            {{ block.label }}<span v-if="block.required" class="text-rose-600"> *</span>
          </span>
          <textarea
            :value="(values[block.id] as string) || ''"
            rows="4"
            :placeholder="block.placeholder || ''"
            class="w-full px-3.5 py-2.5 bg-white border border-zinc-200 rounded-xl outline-none transition resize-y font-sans text-[0.9375rem] text-zinc-900 placeholder:text-zinc-400 focus:border-rose-600 focus:ring-4 focus:ring-rose-600/20"
            @input="values[block.id] = ($event.target as HTMLTextAreaElement).value"
          />
        </div>

        <!-- загрузка файла -->
        <div v-else-if="block.type === 'dropzone'" class="flex flex-col gap-1.5">
          <span v-if="block.label" class="font-sans text-[0.8125rem] font-semibold text-zinc-900">
            {{ block.label }}<span v-if="block.required" class="text-rose-600"> *</span>
          </span>
          <label
            class="rounded-2xl border-2 border-dashed border-zinc-300 hover:border-rose-400 hover:bg-zinc-50 p-6 text-center cursor-pointer transition-colors block"
          >
            <span v-if="!uploads[block.id]" class="font-sans text-sm text-zinc-500">
              Перетащите файл сюда или нажмите для выбора
            </span>
            <span v-else class="font-sans text-sm font-semibold text-zinc-900">
              {{ uploads[block.id]?.state.fileName }}
              <span v-if="uploads[block.id]?.state.status === 'done'" class="text-emerald-600">✓</span>
            </span>
            <input type="file" class="hidden" @change="onFile(block, $event)" />
          </label>

          <span v-if="fileConstraints(block)" class="font-sans text-xs text-zinc-400">
            {{ fileConstraints(block) }}
          </span>
          <span v-if="fileErrors[block.id]" class="font-sans text-xs text-rose-600">
            {{ fileErrors[block.id] }}
          </span>

          <!-- ход загрузки: проценты и байты, пауза/возобновление/отмена -->
          <template v-if="uploads[block.id] && uploads[block.id]!.state.status !== 'done'">
            <div
              v-if="['uploading', 'paused', 'interrupted'].includes(uploads[block.id]!.state.status)"
              class="flex flex-col gap-1"
            >
              <div class="h-1.5 rounded-full bg-zinc-200 overflow-hidden">
                <div
                  class="h-full bg-rose-600 transition-[width]"
                  :style="{ width: `${uploads[block.id]!.state.percent}%` }"
                />
              </div>
              <span class="font-sans text-xs text-zinc-500">
                {{ uploads[block.id]!.state.percent }}% ·
                {{ formatBytes(uploads[block.id]!.state.uploadedBytes) }} из
                {{ formatBytes(uploads[block.id]!.state.totalBytes) }}
              </span>
            </div>

            <span
              v-if="uploads[block.id]!.state.message"
              class="font-sans text-xs text-amber-600"
            >
              {{ uploads[block.id]!.state.message }}
            </span>

            <div class="flex gap-2">
              <button
                v-if="uploads[block.id]!.state.chunked && uploads[block.id]!.state.status === 'uploading'"
                type="button"
                class="font-sans text-xs font-semibold text-zinc-600 hover:text-zinc-900"
                @click="uploads[block.id]!.pause()"
              >
                Пауза
              </button>
              <button
                v-if="['paused', 'interrupted'].includes(uploads[block.id]!.state.status)"
                type="button"
                class="font-sans text-xs font-semibold text-rose-600 hover:text-rose-700"
                @click="uploads[block.id]!.resume()"
              >
                {{ uploads[block.id]!.state.status === 'interrupted' ? 'Возобновить загрузку' : 'Продолжить' }}
              </button>
              <button
                v-if="uploads[block.id]!.state.status === 'error'"
                type="button"
                class="font-sans text-xs font-semibold text-rose-600 hover:text-rose-700"
                @click="uploads[block.id]!.retry()"
              >
                Повторить
              </button>
              <button
                v-if="['uploading', 'paused', 'interrupted', 'error'].includes(uploads[block.id]!.state.status)"
                type="button"
                class="font-sans text-xs font-semibold text-zinc-500 hover:text-zinc-700"
                @click="uploads[block.id]!.cancel()"
              >
                Отменить
              </button>
            </div>
          </template>
        </div>

        <!-- выпадающий список -->
        <div v-else-if="block.type === 'select'" class="flex flex-col gap-1.5">
          <span v-if="block.label" class="font-sans text-[0.8125rem] font-semibold text-zinc-900">
            {{ block.label }}<span v-if="block.required" class="text-rose-600"> *</span>
          </span>
          <select
            :value="(values[block.id] as string) || ''"
            class="w-full px-3.5 py-3 bg-white border border-zinc-200 rounded-xl outline-none transition font-sans text-[0.9375rem] text-zinc-900 focus:border-rose-600 focus:ring-4 focus:ring-rose-600/20"
            @change="values[block.id] = ($event.target as HTMLSelectElement).value"
          >
            <option value="" disabled>{{ block.placeholder || "Выберите вариант" }}</option>
            <option v-for="(opt, i) in selectOptions(block)" :key="i" :value="opt">{{ opt }}</option>
          </select>
        </div>

        <!-- однострочный ввод -->
        <Input
          v-else
          :model-value="(values[block.id] as string) || ''"
          :label="block.required ? `${block.label || ''} *` : block.label"
          :placeholder="block.placeholder || ''"
          @update:model-value="values[block.id] = $event"
        />
      </div>
    </div>

    <div v-if="hasInputBlocks">
      <Button variant="primary" :size="size" type="submit" :disabled="!canSubmit">
        {{ busy ? "Отправляем…" : submitText }}
      </Button>
    </div>
  </form>
</template>

<style>
/* Разметка Markdown-абзаца — тот же голос, что у .fuse-richtext-view
   (RichTextEditor), плюс теги, которых нет у tiptap: h1, code/pre, a, hr. */
.fuse-md h1 {
  font-weight: 700;
  font-size: 1.3125rem;
  letter-spacing: -0.01em;
  color: #18181b;
  margin: 0.7em 0 0.35em;
}
.fuse-md h2 {
  font-weight: 700;
  font-size: 1.1875rem;
  letter-spacing: -0.01em;
  color: #18181b;
  margin: 0.7em 0 0.35em;
}
.fuse-md h3,
.fuse-md h4,
.fuse-md h5,
.fuse-md h6 {
  font-weight: 700;
  font-size: 1.0625rem;
  color: #18181b;
  margin: 0.6em 0 0.3em;
}
.fuse-md p {
  margin: 0.5em 0;
  line-height: 1.6;
}
.fuse-md ul,
.fuse-md ol {
  padding-left: 1.25rem;
  margin: 0.5em 0;
}
.fuse-md ul {
  list-style: disc;
}
.fuse-md ol {
  list-style: decimal;
}
.fuse-md blockquote {
  border-left: 3px solid #e4e4e7;
  padding-left: 0.75rem;
  color: #52525b;
  margin: 0.5em 0;
}
.fuse-md strong {
  font-weight: 700;
}
.fuse-md code {
  font-family: ui-monospace, monospace;
  font-size: 0.875em;
  background: #f4f4f5;
  border-radius: 0.375rem;
  padding: 0.125rem 0.375rem;
}
.fuse-md pre {
  background: #f4f4f5;
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  margin: 0.5em 0;
}
.fuse-md pre code {
  background: none;
  padding: 0;
}
.fuse-md a {
  color: #7c3aed;
  font-weight: 600;
}
.fuse-md a:hover {
  color: #6d28d9;
}
.fuse-md hr {
  border: 0;
  border-top: 1px solid #e4e4e7;
  margin: 0.75em 0;
}
.fuse-md :first-child {
  margin-top: 0;
}
.fuse-md :last-child {
  margin-bottom: 0;
}
</style>
