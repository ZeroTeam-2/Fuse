<script setup lang="ts">
// Fuse Toggle — small pill switch, used for the step-level auth on/off.
withDefaults(defineProps<{ modelValue: boolean; disabled?: boolean }>(), {
  disabled: false,
});

const emit = defineEmits<{ "update:modelValue": [boolean] }>();
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled"
    :class="[
      'relative inline-flex h-6 w-10 items-center rounded-full shrink-0 transition-colors',
      disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      modelValue ? 'bg-rose-600' : 'bg-zinc-200',
    ]"
    @click="!disabled && emit('update:modelValue', !modelValue)"
  >
    <span
      :class="[
        'inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform',
        modelValue ? 'translate-x-[19px]' : 'translate-x-[3px]',
      ]"
    />
  </button>
</template>
