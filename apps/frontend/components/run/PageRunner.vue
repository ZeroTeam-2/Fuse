<script setup lang="ts">
// Обобщённый рантайм-рендер страницы шага: строки × блоки на сетке из 4 колонок.
// Блоки ввода собирают значения (по id блока), блоки отображения показывают
// подставленные данные пройденных шагов из `resolved`. Один компонент на панель
// запуска и playground — вместо трёх веток по типам страницы.
import type { PageBlock, StepPage } from "@fuse/shared";
import { blockCategory } from "@fuse/shared";

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
const files = reactive<Record<string, File>>({});

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

const canSubmit = computed(
  () => !props.busy && requiredBlocks().every((b) => !isBlank(values[b.id])),
);

function displayValue(block: PageBlock): string {
  const v = props.resolved?.[block.id];
  if (v !== undefined && v !== null && v !== "") return String(v);
  return block.text ?? "";
}

function onFile(block: PageBlock, event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  files[block.id] = file;
  values[block.id] = { fileName: file.name, fileSize: file.size, fileType: file.type };
}

function submit() {
  if (!canSubmit.value) return;
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!isBlank(value)) payload[key] = value;
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
        <!-- отображение -->
        <p
          v-if="block.type === 'paragraph'"
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
            <span v-if="!files[block.id]" class="font-sans text-sm text-zinc-500">
              Перетащите файл сюда или нажмите для выбора
            </span>
            <span v-else class="font-sans text-sm font-semibold text-zinc-900">
              {{ files[block.id]?.name }}
            </span>
            <input type="file" class="hidden" @change="onFile(block, $event)" />
          </label>
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
            <option v-for="(opt, i) in block.options || []" :key="i" :value="opt">{{ opt }}</option>
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

    <div>
      <Button variant="primary" :size="size" type="submit" :disabled="!canSubmit">
        {{ busy ? "Отправляем…" : submitText }}
      </Button>
    </div>
  </form>
</template>
