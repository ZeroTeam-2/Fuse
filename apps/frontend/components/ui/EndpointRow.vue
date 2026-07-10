<script setup lang="ts">
// Fuse EndpointRow — a single API endpoint line: method chip + mono path on the
// left, muted description/right content. Set `interactive` for the hover wash.
withDefaults(
  defineProps<{
    method?: string;
    path?: string;
    description?: string;
    interactive?: boolean;
  }>(),
  { method: "GET", interactive: false },
);
</script>

<template>
  <div
    :class="[
      'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
      interactive ? 'cursor-pointer hover:bg-zinc-100' : '',
    ]"
  >
    <MethodBadge :method="method" />
    <code class="font-mono text-sm text-zinc-900 bg-transparent p-0">{{ path }}</code>
    <span class="ml-auto font-sans text-sm text-zinc-500 text-right">
      <slot name="right">{{ description }}</slot>
    </span>
  </div>
</template>
