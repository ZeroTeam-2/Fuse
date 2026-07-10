<script setup lang="ts">
// Fuse Card — the universal white surface: hairline border, soft shadow, 16px
// rounding. Set `interactive` for hover-lift (use on links). `padding` maps to
// Tailwind spacing utilities; a custom string is applied inline.
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    interactive?: boolean;
    padding?: "none" | "sm" | "md" | "lg" | "xl" | string;
    as?: string;
  }>(),
  { interactive: false, padding: "lg", as: "div" },
);

const PADS: Record<string, string> = {
  none: "p-0",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
  xl: "p-6",
};

const padClass = computed(() => PADS[props.padding] ?? "");
const padStyle = computed(() => (PADS[props.padding] ? undefined : { padding: props.padding }));
</script>

<template>
  <component
    :is="as"
    :style="padStyle"
    :class="[
      'bg-white border border-zinc-200 rounded-2xl shadow-sm transition-all duration-200',
      padClass,
      interactive ? 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5' : '',
    ]"
  >
    <slot />
  </component>
</template>
