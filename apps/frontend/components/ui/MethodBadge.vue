<script setup lang="ts">
// Fuse MethodBadge — HTTP verb chip in mono uppercase. Colour per verb; unknown
// verbs default to blue.
import { computed } from "vue";

const props = withDefaults(defineProps<{ method?: string }>(), { method: "GET" });

// Full literal class strings so Tailwind's JIT keeps them.
const COLORS: Record<string, string> = {
  GET: "bg-green-100 text-green-700",
  POST: "bg-orange-100 text-orange-700",
  PUT: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
  OPTIONS: "bg-sky-100 text-sky-700",
  HEAD: "bg-cyan-100 text-cyan-700",
  PATCH: "bg-fuchsia-100 text-fuchsia-700",
};

const m = computed(() => props.method.toUpperCase());
const cls = computed(() => COLORS[m.value] ?? "bg-blue-100 text-blue-700");
</script>

<template>
  <span
    :class="[
      'inline-flex items-center justify-center min-w-[44px] px-2 py-0.5 font-mono font-bold text-[0.6875rem] tracking-wide rounded-md',
      cls,
    ]"
    >{{ m }}</span
  >
</template>
