<script setup lang="ts">
// Fuse MethodBadge — HTTP verb chip in mono uppercase. GET is green (read);
// write verbs are rose.
import { computed } from "vue";

const props = withDefaults(defineProps<{ method?: string }>(), { method: "GET" });

const m = computed(() => props.method.toUpperCase());
const isGet = computed(() => m.value === "GET");
</script>

<template>
  <span
    :class="[
      'inline-flex items-center justify-center min-w-[44px] px-2 py-0.5 font-mono font-bold text-[0.6875rem] tracking-wide rounded-md',
      isGet ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-600',
    ]"
    >{{ m }}</span
  >
</template>
