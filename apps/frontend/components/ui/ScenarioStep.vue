<script setup lang="ts">
// Fuse ScenarioStep — a configured step in the scenario editor. Header row: drag
// handle, number, provider (dotted), method + path, title, edit/remove. Body:
// parameter mappings.
export interface StepParam {
  kind: string;
  name: string;
  source: string;
}

withDefaults(
  defineProps<{
    index?: number;
    showIndex?: boolean;
    typeLabel?: string;
    auth?: boolean;
    provider?: string;
    providerDot?: string;
    method?: string;
    path?: string;
    title?: string;
    params?: StepParam[];
    /** Шаг ссылается на удалённое приложение/API — сценарий из-за него заблокирован. */
    broken?: boolean;
  }>(),
  {
    index: 1,
    showIndex: true,
    auth: false,
    provider: "DataHub API",
    providerDot: "#8b5cf6",
    method: "POST",
    params: () => [],
    broken: false,
  },
);

const emit = defineEmits<{ edit: []; remove: [] }>();
</script>

<template>
  <div
    :class="[
      'bg-white rounded-2xl shadow-sm overflow-hidden',
      broken ? 'border-2 border-rose-300' : 'border border-zinc-200',
    ]"
  >
    <div class="flex items-center gap-3 px-4 py-3.5">
      <span class="inline-flex text-zinc-400 cursor-grab">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.6" />
          <circle cx="15" cy="6" r="1.6" />
          <circle cx="9" cy="12" r="1.6" />
          <circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="18" r="1.6" />
          <circle cx="15" cy="18" r="1.6" />
        </svg>
      </span>
      <span
        v-if="showIndex"
        class="w-[26px] h-[26px] rounded-full shrink-0 bg-zinc-100 text-zinc-900 inline-flex items-center justify-center font-bold text-[0.8125rem]"
        >{{ index }}</span
      >
      <span
        v-if="broken"
        class="shrink-0 inline-flex items-center font-sans font-semibold leading-none rounded-full whitespace-nowrap text-[0.6875rem] gap-1.5 px-2 py-1 bg-rose-100 text-rose-600"
      >
        <Icon name="alert-triangle" :size="12" />
        API удалён
      </span>
      <span
        v-else-if="typeLabel"
        class="shrink-0 inline-flex items-center font-sans font-semibold leading-none rounded-full whitespace-nowrap text-[0.6875rem] gap-1.5 px-2 py-1 bg-violet-100 text-violet-600"
        >{{ typeLabel }}</span
      >
      <span class="inline-flex items-center gap-1.5 font-sans text-sm font-semibold text-zinc-900">
        <span class="w-[7px] h-[7px] rounded-full" :style="{ background: providerDot }" />
        {{ provider }}
      </span>
      <MethodBadge v-if="method" :method="method" />
      <code class="font-mono text-sm text-zinc-900 bg-transparent p-0">{{ path }}</code>
      <span class="ml-auto inline-flex items-center gap-2.5">
        <span v-if="auth" title="Требуется аутентификация" class="inline-flex text-amber-500">
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
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          </svg>
        </span>
        <span v-if="title" class="font-sans text-sm text-zinc-500">{{ title }}</span>
        <button
          type="button"
          aria-label="Изменить"
          class="border-0 bg-transparent cursor-pointer text-zinc-400 hover:text-zinc-900 inline-flex p-0.5"
          @click.stop="emit('edit')"
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
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Удалить"
          class="border-0 bg-transparent cursor-pointer text-zinc-400 hover:text-zinc-900 inline-flex p-0.5"
          @click.stop="emit('remove')"
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
      </span>
    </div>
    <div v-if="params.length > 0" class="border-t border-zinc-200 px-4 py-3 flex flex-col gap-2">
      <div
        v-for="(p, i) in params"
        :key="i"
        class="flex items-center gap-2.5 font-sans text-[0.8125rem]"
      >
        <span
          class="font-mono text-[0.625rem] font-bold tracking-wide text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-md"
          >{{ p.kind }}</span
        >
        <span class="text-zinc-900 font-semibold">{{ p.name }}</span>
        <span class="text-zinc-400">←</span>
        <span class="text-zinc-500">{{ p.source }}</span>
      </div>
    </div>
  </div>
</template>
