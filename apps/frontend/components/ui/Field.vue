<script setup lang="ts">
// Поле ввода по ТИПУ значения: число вводится числом, логическое — переключателем.
// Обычный Input умеет только текст, поэтому число уезжало на бэк строкой.
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    label?: string;
    hint?: string;
    type?: "string" | "number" | "boolean" | "file" | "array" | "object";
    placeholder?: string;
    required?: boolean;
    invalid?: boolean;
    id?: string;
  }>(),
  { type: "string", required: false, invalid: false },
);

const model = defineModel<unknown>();

const fieldId = computed(
  () => props.id || (props.label ? `f-${props.label.replace(/\s+/g, "-").toLowerCase()}` : undefined),
);

const booleanValue = computed({
  get: () => model.value === true,
  set: (value: boolean) => {
    model.value = value;
  },
});

function onText(event: Event): void {
  const value = (event.target as HTMLInputElement).value;

  if (props.type === "number") {
    // Пустое поле — это отсутствие значения, а не ноль.
    model.value = value === "" ? undefined : Number(value);
    return;
  }

  model.value = value;
}

const textValue = computed(() =>
  model.value === undefined || model.value === null ? "" : String(model.value),
);

const inputClass = computed(() => [
  "w-full px-3.5 py-3 font-sans text-[0.9375rem] text-zinc-900 bg-white border rounded-xl outline-none transition",
  "placeholder:text-zinc-400 focus:ring-4 focus:ring-rose-600/20",
  props.invalid ? "border-rose-600" : "border-zinc-200 focus:border-rose-600",
]);
</script>

<template>
  <div class="flex flex-col gap-2">
    <label
      v-if="label"
      :for="fieldId"
      class="text-[0.8125rem] font-sans font-semibold text-zinc-900"
    >
      {{ label }}<span v-if="required" class="text-rose-600"> *</span>
    </label>

    <label
      v-if="type === 'boolean'"
      class="flex items-center gap-2.5 font-sans text-[0.9375rem] text-zinc-900 cursor-pointer"
    >
      <input
        :id="fieldId"
        v-model="booleanValue"
        type="checkbox"
        class="w-4 h-4 accent-rose-600"
      />
      {{ placeholder || "Да" }}
    </label>

    <input
      v-else
      :id="fieldId"
      :value="textValue"
      :type="type === 'number' ? 'number' : 'text'"
      :placeholder="placeholder"
      :class="inputClass"
      @input="onText"
    />

    <span v-if="hint" class="font-sans text-[0.8125rem] text-zinc-500">{{ hint }}</span>
  </div>
</template>
