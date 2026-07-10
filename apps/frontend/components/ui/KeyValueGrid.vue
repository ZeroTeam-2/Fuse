<script setup lang="ts">
// Fuse KeyValueGrid — the scenario result table. Each entry is a row with a
// muted label on the left and a bold value on the right, separated by hairlines.
import { computed } from "vue";

export interface KeyValueItem {
  label: string;
  value: string | number;
}

const props = withDefaults(
  defineProps<{ items?: KeyValueItem[]; columns?: number }>(),
  { items: () => [], columns: 2 },
);

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${props.columns}, minmax(0, 1fr))`,
}));
</script>

<template>
  <div :style="gridStyle" class="grid gap-x-10">
    <div
      v-for="(it, i) in items"
      :key="i"
      class="flex items-baseline justify-between gap-4 py-3.5 border-b border-zinc-200"
    >
      <span class="font-sans text-sm text-zinc-500 shrink-0">{{ it.label }}</span>
      <span class="font-sans font-bold text-[0.9375rem] text-zinc-900 text-right">{{ it.value }}</span>
    </div>
  </div>
</template>
