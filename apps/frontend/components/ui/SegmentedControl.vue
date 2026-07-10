<script setup lang="ts">
// Fuse SegmentedControl — pill toggle in a sunken track; active segment is a
// raised ink chip. Two-way binding via v-model.
import { computed } from "vue";

export interface SegmentOption {
  value: string;
  label: string;
}

const props = withDefaults(
  defineProps<{ options?: (string | SegmentOption)[]; size?: "sm" | "md" }>(),
  { options: () => [], size: "md" },
);
const emit = defineEmits<{ change: [value: string] }>();
const model = defineModel<string>();

const keyOf = (o: string | SegmentOption) => (typeof o === "string" ? o : o.value);
const labelOf = (o: string | SegmentOption) => (typeof o === "string" ? o : o.label);

const active = computed(() => model.value ?? keyOf(props.options[0]));
const sizeCls = computed(() =>
  props.size === "sm" ? "px-3 py-1.5 text-[0.8125rem]" : "px-4 py-2 text-sm",
);

function select(k: string) {
  model.value = k;
  emit("change", k);
}
</script>

<template>
  <div class="inline-flex gap-0.5 p-0.5 bg-zinc-100 rounded-xl">
    <button
      v-for="o in options"
      :key="keyOf(o)"
      type="button"
      :class="[
        'border-0 cursor-pointer rounded-lg font-sans font-semibold transition-colors',
        sizeCls,
        keyOf(o) === active
          ? 'bg-zinc-900 text-white shadow-sm'
          : 'bg-transparent text-zinc-500 hover:text-zinc-700',
      ]"
      @click="select(keyOf(o))"
    >
      {{ labelOf(o) }}
    </button>
  </div>
</template>
