<script setup lang="ts">
// Fuse SecretField — password-style field with a reveal toggle, for API keys
// and tokens. Same visual language as Input (mono, crimson focus ring).
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    label?: string;
    hint?: string;
    placeholder?: string;
    disabled?: boolean;
    id?: string;
  }>(),
  { disabled: false },
);

const model = defineModel<string>();
const reveal = ref(false);

const inputId = computed(
  () => props.id || (props.label ? `secret-${props.label.replace(/\s+/g, "-").toLowerCase()}` : undefined),
);
</script>

<template>
  <div class="flex flex-col gap-2">
    <label
      v-if="label"
      :for="inputId"
      class="text-[0.8125rem] font-sans font-semibold text-zinc-900"
      >{{ label }}</label
    >
    <div class="relative">
      <input
        :id="inputId"
        v-model="model"
        :type="reveal ? 'text' : 'password'"
        :placeholder="placeholder"
        :disabled="disabled"
        class="w-full pl-3.5 pr-11 py-3 text-zinc-900 bg-white border border-zinc-200 rounded-xl outline-none transition font-mono text-sm placeholder:text-zinc-400 placeholder:font-sans focus:border-rose-600 focus:ring-4 focus:ring-rose-600/20 disabled:bg-zinc-100"
      />
      <button
        type="button"
        :aria-label="reveal ? 'Скрыть' : 'Показать'"
        class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg inline-flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
        @click="reveal = !reveal"
      >
        <Icon :name="reveal ? 'eye-off' : 'eye'" :size="16" />
      </button>
    </div>
    <span v-if="hint" class="font-sans text-[0.8125rem] text-zinc-500">{{ hint }}</span>
  </div>
</template>
