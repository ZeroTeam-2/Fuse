<script setup lang="ts">
// Fuse IconButton — icon-only control. `floating` is the white rounded elevated
// action on media placeholders; `ghost` for inline row actions; `subtle`/
// `outline` for neutral controls. Pass the icon via the default slot.
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    variant?: "floating" | "ghost" | "subtle" | "outline";
    size?: number;
    label?: string;
    disabled?: boolean;
  }>(),
  { variant: "ghost", size: 36, disabled: false },
);

const VARIANTS = {
  floating: "bg-white text-violet-600 shadow-lg hover:text-zinc-900 hover:-translate-y-0.5 rounded-xl",
  ghost: "bg-transparent text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 rounded-lg",
  subtle: "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 rounded-lg",
  outline: "bg-white border border-zinc-200 text-zinc-700 shadow-sm hover:bg-zinc-100 hover:text-zinc-900 rounded-lg",
} as const;

const style = computed(() => ({ width: `${props.size}px`, height: `${props.size}px` }));
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
    :style="style"
    :class="[
      'inline-flex items-center justify-center shrink-0 cursor-pointer transition',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      VARIANTS[variant],
    ]"
  >
    <slot />
  </button>
</template>
