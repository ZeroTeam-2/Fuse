<script setup lang="ts">
// Fuse EndpointRow — a single API endpoint line: method chip + mono path on the
// left, muted description/right content. Set `interactive` for the hover wash;
// set `expandable` to show a trailing chevron that rotates when `expanded`.
withDefaults(
  defineProps<{
    method?: string;
    path?: string;
    description?: string;
    interactive?: boolean;
    expandable?: boolean;
    expanded?: boolean;
  }>(),
  { method: "GET", interactive: false, expandable: false, expanded: false },
);
</script>

<template>
  <div
    :class="[
      'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors min-w-0',
      interactive ? 'cursor-pointer hover:bg-zinc-100' : '',
    ]"
  >
    <MethodBadge :method="method" />
    <code
      class="font-mono text-sm text-zinc-900 bg-transparent p-0 min-w-0 shrink truncate"
      :title="path"
      >{{ path }}</code
    >
    <span
      class="ml-auto min-w-0 shrink pl-3 font-sans text-sm text-zinc-500 text-right truncate"
      :title="typeof description === 'string' ? description : undefined"
    >
      <slot name="right">{{ description }}</slot>
    </span>
    <span
      v-if="expandable"
      :class="[
        'shrink-0 inline-flex text-zinc-400 transition-transform',
        expanded ? 'rotate-90' : '',
      ]"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </span>
  </div>
</template>
