<script setup lang="ts">
// Fuse Button — primary action control.
// Variants: primary (crimson), dark (ink), secondary (outline), ghost, tint (rose wash), danger.
// Slots: #left / #right for leading/trailing icons; default slot for the label.
const props = withDefaults(
  defineProps<{
    variant?: "primary" | "dark" | "secondary" | "ghost" | "tint" | "danger";
    size?: "sm" | "md" | "lg";
    fullWidth?: boolean;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
  }>(),
  { variant: "primary", size: "md", fullWidth: false, disabled: false, type: "button" },
);

const VARIANTS = {
  primary: "bg-rose-600 text-white hover:bg-rose-700 shadow-[0_6px_16px_rgba(225,29,72,0.28)]",
  dark: "bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm",
  secondary: "bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-100 shadow-sm",
  ghost: "bg-transparent text-zinc-700 hover:bg-zinc-100",
  tint: "bg-rose-50 text-rose-600 hover:bg-rose-100",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-[0_6px_16px_rgba(220,38,38,0.26)]",
} as const;

const SIZES = {
  sm: "px-3.5 py-2 text-[0.8125rem] gap-1.5 rounded-lg",
  md: "px-5 py-3 text-[0.9375rem] gap-2 rounded-xl",
  lg: "px-6 py-3.5 text-base gap-2.5 rounded-xl",
} as const;
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="[
      fullWidth ? 'flex w-full' : 'inline-flex',
      'items-center justify-center font-sans font-bold tracking-tight leading-none whitespace-nowrap',
      'cursor-pointer transition active:scale-[.985] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
      SIZES[size],
      VARIANTS[variant],
    ]"
  >
    <slot name="left" />
    <span v-if="$slots.default"><slot /></span>
    <slot name="right" />
  </button>
</template>
