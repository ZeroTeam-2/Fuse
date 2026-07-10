<script setup lang="ts">
// Fuse Modal — centered dialog on a dimmed overlay. Header (title + subtitle +
// close ×), scrollable body, optional #footer actions. Set `inline` to render
// just the panel (no overlay). Two-way open state via v-model:open.
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    width?: number | string;
    inline?: boolean;
  }>(),
  { width: 560, inline: false },
);

const emit = defineEmits<{ close: [] }>();
const open = defineModel<boolean>("open", { default: true });

const panelStyle = computed(() => ({
  width: typeof props.width === "number" ? `${props.width}px` : props.width,
  maxWidth: "100%",
}));

function close() {
  open.value = false;
  emit("close");
}
</script>

<template>
  <!-- Inline: just the panel -->
  <div
    v-if="inline && open"
    role="dialog"
    :style="panelStyle"
    class="flex flex-col bg-white border border-zinc-200 rounded-3xl shadow-2xl overflow-hidden"
  >
    <div v-if="title" class="flex items-start gap-4 px-6 pt-[22px] pb-4">
      <div class="flex-1 min-w-0">
        <h2 v-if="title" class="font-sans font-bold text-[1.375rem] tracking-tight text-zinc-900">
          {{ title }}
        </h2>
        <p v-if="subtitle" class="font-sans text-sm text-zinc-500 mt-1">{{ subtitle }}</p>
      </div>
      <button
        type="button"
        aria-label="Закрыть"
        class="border border-zinc-200 bg-white w-[34px] h-[34px] rounded-lg cursor-pointer inline-flex items-center justify-center text-zinc-500 hover:bg-zinc-100 shrink-0"
        @click="close"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
    <div class="px-6 pt-1 pb-2 overflow-y-auto"><slot /></div>
    <div v-if="$slots.footer" class="flex justify-end gap-2.5 px-6 pt-4 pb-[22px]"><slot name="footer" /></div>
  </div>

  <!-- Overlay -->
  <Teleport v-else-if="open" to="body">
    <div
      class="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-zinc-900/45 backdrop-blur-[2px]"
      @click.self="close"
    >
      <div
        role="dialog"
        aria-modal="true"
        :style="panelStyle"
        class="flex flex-col bg-white border border-zinc-200 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] [animation:fuse-fade-up_280ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        <div v-if="title" class="flex items-start gap-4 px-6 pt-[22px] pb-4">
          <div class="flex-1 min-w-0">
            <h2 class="font-sans font-bold text-[1.375rem] tracking-tight text-zinc-900">{{ title }}</h2>
            <p v-if="subtitle" class="font-sans text-sm text-zinc-500 mt-1">{{ subtitle }}</p>
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            class="border border-zinc-200 bg-white w-[34px] h-[34px] rounded-lg cursor-pointer inline-flex items-center justify-center text-zinc-500 hover:bg-zinc-100 shrink-0"
            @click="close"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="px-6 pt-1 pb-2 overflow-y-auto"><slot /></div>
        <div v-if="$slots.footer" class="flex justify-end gap-2.5 px-6 pt-4 pb-[22px]">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
