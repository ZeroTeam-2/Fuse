<script setup lang="ts">
// Fuse Tabs — underline navigation. Active tab: ink label + crimson underline.
// Two-way binding via v-model; falls back to the first item.
import { computed } from "vue";

export interface TabItem {
  value: string;
  label: string;
}

const props = withDefaults(defineProps<{ items?: (string | TabItem)[] }>(), { items: () => [] });
const emit = defineEmits<{ change: [value: string] }>();
const model = defineModel<string>();

const keyOf = (i: string | TabItem) => (typeof i === "string" ? i : i.value);
const labelOf = (i: string | TabItem) => (typeof i === "string" ? i : i.label);

const active = computed(() => model.value ?? keyOf(props.items[0]));

function select(k: string) {
  model.value = k;
  emit("change", k);
}
</script>

<template>
  <div role="tablist" class="flex gap-7 border-b border-zinc-200">
    <button
      v-for="it in items"
      :key="keyOf(it)"
      role="tab"
      type="button"
      :aria-selected="keyOf(it) === active"
      :class="[
        'relative border-0 bg-transparent cursor-pointer pb-3.5 font-sans text-[0.9375rem] transition-colors',
        keyOf(it) === active ? 'font-bold text-zinc-900' : 'font-semibold text-zinc-500 hover:text-zinc-700',
      ]"
      @click="select(keyOf(it))"
    >
      {{ labelOf(it) }}
      <span
        :class="[
          'absolute left-0 right-0 -bottom-px h-0.5 rounded',
          keyOf(it) === active ? 'bg-rose-600' : 'bg-transparent',
        ]"
      />
    </button>
  </div>
</template>
