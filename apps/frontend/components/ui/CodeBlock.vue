<script setup lang="ts">
// Fuse CodeBlock — dark code/JSON surface. Optional header strip carries a
// `label` (+ #badge slot) on the left and mono `meta` on the right.
import { computed } from "vue";

const props = withDefaults(
  defineProps<{ code?: string | object; label?: string; meta?: string }>(),
  { code: "" },
);

const text = computed(() =>
  typeof props.code === "string" ? props.code : JSON.stringify(props.code, null, 2),
);
</script>

<template>
  <div>
    <div v-if="label || meta || $slots.badge" class="flex items-center gap-2.5 mb-2.5">
      <span
        v-if="label"
        class="inline-flex items-center gap-2.5 font-sans font-bold text-[0.9375rem] text-zinc-900"
        >{{ label }}</span
      >
      <slot name="badge" />
      <span v-if="meta" class="ml-auto font-mono text-xs text-zinc-400">{{ meta }}</span>
    </div>
    <pre
      class="m-0 bg-zinc-950 text-zinc-200 rounded-2xl px-5 py-5 font-mono text-sm leading-relaxed overflow-x-auto whitespace-pre"
    >{{ text }}</pre>
  </div>
</template>
