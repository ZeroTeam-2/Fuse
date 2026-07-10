<script setup lang="ts">
// Fuse Input — labelled text field with a crimson focus ring.
// Set `mono` for code-like values. Two-way binding via v-model.
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    label?: string;
    hint?: string;
    mono?: boolean;
    placeholder?: string;
    type?: string;
    disabled?: boolean;
    id?: string;
  }>(),
  { mono: false, type: "text", disabled: false },
);

const model = defineModel<string | number>();

const inputId = computed(
  () => props.id || (props.label ? `in-${props.label.replace(/\s+/g, "-").toLowerCase()}` : undefined),
);
</script>

<template>
  <div class="flex flex-col gap-2">
    <label
      v-if="label"
      :for="inputId"
      class="text-[0.8125rem] font-sans font-semibold text-zinc-900"
      >{{ label }}</label
    >
    <input
      :id="inputId"
      v-model="model"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :class="[
        'w-full px-3.5 py-3 text-zinc-900 bg-white border border-zinc-200 rounded-xl outline-none transition',
        'placeholder:text-zinc-400 focus:border-rose-600 focus:ring-4 focus:ring-rose-600/20 disabled:bg-zinc-100',
        mono ? 'font-mono text-sm' : 'font-sans text-[0.9375rem]',
      ]"
    />
    <span v-if="hint" class="font-sans text-[0.8125rem] text-zinc-500">{{ hint }}</span>
  </div>
</template>
