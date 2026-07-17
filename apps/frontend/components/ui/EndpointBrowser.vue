<script setup lang="ts">
// Fuse EndpointBrowser — master/detail view of an app's endpoints. A small left
// sidebar lists the endpoint categories (blocks); clicking one shows its
// endpoints in a scrollable main pane with pagination underneath (25 per page).
// A cross-cutting search filters across all categories.
import { computed, reactive, ref, watch } from "vue";
import type { SchemaField } from "@fuse/shared";

interface EndpointLike {
  id?: string;
  method: string;
  path: string;
  summary?: string;
  tag?: string;
  inputs?: SchemaField[];
  outputs?: SchemaField[];
  outputIsArray?: boolean;
}

const props = withDefaults(
  defineProps<{
    endpoints: EndpointLike[];
    pageSize?: number;
    searchPlaceholder?: string;
    emptyText?: string;
  }>(),
  {
    pageSize: 25,
    searchPlaceholder: "Найти endpoint по пути, описанию или блоку…",
    emptyText: "Endpoints ещё не импортированы",
  },
);

const query = ref("");
const selected = ref("");
const page = ref(1);

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.endpoints;
  return props.endpoints.filter((ep) => endpointMatchesQuery(ep, q));
});

const groups = computed(() => groupEndpoints(filtered.value));

const activeGroup = computed(
  () => groups.value.find((g) => g.name === selected.value) ?? groups.value[0] ?? null,
);

const pageCount = computed(() =>
  activeGroup.value
    ? Math.max(1, Math.ceil(activeGroup.value.endpoints.length / props.pageSize))
    : 1,
);
const pagedEndpoints = computed(() => {
  if (!activeGroup.value) return [];
  const start = (page.value - 1) * props.pageSize;
  return activeGroup.value.endpoints.slice(start, start + props.pageSize);
});
const rangeLabel = computed(() => {
  const total = activeGroup.value?.endpoints.length ?? 0;
  if (total === 0) return "";
  const start = (page.value - 1) * props.pageSize + 1;
  const end = Math.min(page.value * props.pageSize, total);
  return `${start}–${end} из ${total}`;
});

// Keep the selection valid as search narrows the categories; reset the page
// whenever the active list changes.
watch(
  groups,
  (gs) => {
    if (!gs.some((g) => g.name === selected.value)) {
      selected.value = gs[0]?.name ?? "";
    }
  },
  { immediate: true },
);
watch([selected, query], () => {
  page.value = 1;
});
watch(pageCount, (pc) => {
  if (page.value > pc) page.value = pc;
});

function selectGroup(name: string) {
  selected.value = name;
}

// Stable per-endpoint key (no page index) so an expanded row stays expanded
// across pagination.
function rowKey(ep: EndpointLike): string {
  return ep.id ?? `${ep.method}:${ep.path}`;
}

const expanded = reactive<Record<string, boolean>>({});
function toggle(ep: EndpointLike) {
  const k = rowKey(ep);
  expanded[k] = !expanded[k];
}
</script>

<template>
  <div
    v-if="!endpoints.length"
    class="border border-zinc-200 rounded-xl px-4 py-10 text-center font-sans text-sm text-zinc-400"
  >
    {{ emptyText }}
  </div>

  <div v-else class="flex flex-col gap-4">
    <SearchInput v-model="query" :placeholder="searchPlaceholder" :width="'100%'" />

    <div
      v-if="!groups.length"
      class="border border-zinc-200 rounded-xl px-4 py-10 text-center font-sans text-sm text-zinc-400"
    >
      Ничего не найдено
    </div>

    <!-- Both columns stretch to the same height: the main list follows the
         category sidebar's height, with a floor of min-h so it never shrinks
         below the current size. -->
    <div v-else class="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5 items-stretch">
      <!-- Sidebar: categories -->
      <aside class="flex flex-col gap-1 md:border-r md:border-zinc-100 md:pr-3">
        <button
          v-for="g in groups"
          :key="g.name"
          type="button"
          :class="[
            'flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors',
            selected === g.name ? 'bg-rose-50' : 'hover:bg-zinc-50',
          ]"
          @click="selectGroup(g.name)"
        >
          <span
            :class="[
              'font-sans text-[0.875rem] font-semibold min-w-0 truncate',
              selected === g.name ? 'text-rose-700' : 'text-zinc-700',
            ]"
            >{{ g.name }}</span
          >
          <span
            :class="[
              'ml-auto shrink-0 font-mono text-[0.75rem] rounded-md px-1.5 py-0.5 border',
              selected === g.name
                ? 'text-rose-500 border-rose-200 bg-white'
                : 'text-zinc-400 border-zinc-200 bg-zinc-50',
            ]"
            >{{ g.endpoints.length }}</span
          >
        </button>
      </aside>

      <!-- Main: endpoints of the active category -->
      <div class="min-w-0 flex flex-col gap-4">
        <div class="flex-1 min-h-[560px] flex flex-col border border-zinc-200 rounded-xl overflow-hidden">
          <div class="flex-1 min-h-0 overflow-y-auto p-1.5">
            <div
              v-for="(ep, i) in pagedEndpoints"
              :key="ep.id ?? `${ep.method}:${ep.path}:${i}`"
              class="rounded-lg overflow-hidden"
              :class="expanded[rowKey(ep)] ? 'bg-zinc-50' : ''"
            >
              <div @click="toggle(ep)">
                <EndpointRow
                  :method="ep.method"
                  :path="ep.path"
                  :description="ep.summary"
                  interactive
                  expandable
                  :expanded="expanded[rowKey(ep)]"
                />
              </div>
              <div v-if="expanded[rowKey(ep)]" class="px-2 pb-2">
                <div class="bg-white border border-zinc-200 rounded-xl">
                  <EndpointDetails
                    :inputs="ep.inputs"
                    :outputs="ep.outputs"
                    :output-is-array="ep.outputIsArray"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="pageCount > 1" class="flex items-center justify-between">
          <span class="font-sans text-sm text-zinc-400">{{ rangeLabel }}</span>
          <Pagination v-model:page="page" :page-count="pageCount" />
        </div>
      </div>
    </div>
  </div>
</template>
