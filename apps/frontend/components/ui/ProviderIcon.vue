<script setup lang="ts">
// Fuse ProviderIcon — squared letter mark for an API provider (DataHub → D).
// Dark ink square by default; size/color are runtime props (inline).
import { computed } from "vue";

const props = withDefaults(
  defineProps<{ name?: string; letter?: string; size?: number; color?: string }>(),
  { name: "", size: 44, color: "#18181b" },
);

const ch = computed(() => (props.letter || props.name.trim()[0] || "?").toUpperCase());
const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: `${props.size * 0.28}px`,
  fontSize: `${props.size * 0.44}px`,
  background: props.color,
}));
</script>

<template>
  <span
    aria-hidden="true"
    :style="style"
    class="inline-flex items-center justify-center shrink-0 text-white font-sans font-bold leading-none"
    >{{ ch }}</span
  >
</template>
