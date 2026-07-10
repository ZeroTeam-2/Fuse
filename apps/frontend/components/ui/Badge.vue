<script setup lang="ts">
// Fuse Badge — small capsule label. Tones: success (published), brand (rose
// eyebrow), neutral (gray), info (violet). Optional leading status dot.
defineProps<{
  tone?: "success" | "brand" | "neutral" | "info";
  dot?: boolean;
  size?: "sm" | "md";
}>();

const TONES = {
  success: "bg-green-100 text-green-600",
  brand: "bg-rose-100 text-rose-600",
  neutral: "bg-zinc-100 text-zinc-500",
  info: "bg-violet-100 text-violet-600",
} as const;

const DOTS = {
  success: "bg-green-600",
  brand: "bg-rose-600",
  neutral: "bg-zinc-400",
  info: "bg-violet-600",
} as const;

const SIZES = {
  sm: "text-[0.6875rem] gap-1.5 px-2 py-0.5",
  md: "text-[0.8125rem] gap-1.5 px-2.5 py-1",
} as const;
</script>

<template>
  <span
    :class="[
      'inline-flex items-center font-sans font-semibold leading-none rounded-full whitespace-nowrap',
      SIZES[size ?? 'md'],
      TONES[tone ?? 'neutral'],
    ]"
  >
    <span v-if="dot" :class="['w-1.5 h-1.5 rounded-full shrink-0', DOTS[tone ?? 'neutral']]" />
    <slot />
  </span>
</template>
