<script setup lang="ts">
// Форма ручных входов: одна на всё — экран запуска (простой режим и playground)
// и запрос недостающего значения посреди выполнения.
import { computed, reactive, watch } from "vue";
import type { ManualInputDescriptor } from "@fuse/shared";

const props = withDefaults(
  defineProps<{
    fields: ManualInputDescriptor[];
    submitText?: string;
    busy?: boolean;
  }>(),
  { submitText: "Получить результат", busy: false },
);

const emit = defineEmits<{ submit: [values: Record<string, unknown>] }>();

const values = reactive<Record<string, unknown>>({});
const touched = reactive<Record<string, boolean>>({});

watch(
  () => props.fields,
  (fields) => {
    for (const field of fields) {
      if (!(field.key in values)) {
        values[field.key] = field.type === "boolean" ? false : undefined;
      }
    }
  },
  { immediate: true },
);

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/** Шаги в порядке исполнения; поля внутри шага — в порядке перечисления. */
const groups = computed(() => {
  const byStep = new Map<string, { title: string; fields: ManualInputDescriptor[] }>();

  for (const field of props.fields) {
    const id = field.stepPath.join(".");
    const group = byStep.get(id) ?? { title: field.stepTitle, fields: [] };
    group.fields.push(field);
    byStep.set(id, group);
  }

  return [...byStep.values()];
});

const missing = computed(() =>
  props.fields.filter((field) => field.required && isBlank(values[field.key])),
);

const canSubmit = computed(() => missing.value.length === 0 && !props.busy);

function labelOf(field: ManualInputDescriptor): string {
  return field.kind === "filter" ? `Условие отбора: ${field.label}` : field.label;
}

function hintOf(field: ManualInputDescriptor): string | undefined {
  return field.kind === "filter"
    ? "Значение, по которому шаг отберёт нужную запись"
    : undefined;
}

function submit(): void {
  for (const field of props.fields) touched[field.key] = true;
  if (!canSubmit.value) return;

  // Незаполненные необязательные поля не отправляем: пусто — это не значение.
  const payload: Record<string, unknown> = {};
  for (const field of props.fields) {
    if (!isBlank(values[field.key])) payload[field.key] = values[field.key];
  }

  emit("submit", payload);
}
</script>

<template>
  <form class="flex flex-col gap-6" @submit.prevent="submit">
    <div v-for="group in groups" :key="group.title" class="flex flex-col gap-3">
      <span class="font-sans text-[0.8125rem] font-semibold text-zinc-500">
        Шаг «{{ group.title }}»
      </span>

      <Field
        v-for="field in group.fields"
        :key="field.key"
        v-model="values[field.key]"
        :label="labelOf(field)"
        :hint="hintOf(field)"
        :type="field.type"
        :required="field.required"
        :invalid="touched[field.key] && field.required && isBlank(values[field.key])"
      />
    </div>

    <Button type="submit" :disabled="!canSubmit">
      {{ busy ? "Запускаем…" : submitText }}
    </Button>
  </form>
</template>
