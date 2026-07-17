<script setup lang="ts">
// Fuse EndpointGroupList — endpoints grouped by their OpenAPI tag into
// collapsible blocks, with a cross-cutting search over method / path / summary /
// tag. Reused on the provider page, the import preview and the step picker so
// the search + grouping look and behave identically everywhere.
import { computed, reactive, ref, watch } from "vue";

// Accepts full Endpoints as well as the trimmed preview/diff shape (no `id`).
interface EndpointLike {
  id?: string;
  method: string;
  path: string;
  summary?: string;
  tag?: string;
}

const props = withDefaults(
  defineProps<{
    endpoints: EndpointLike[];
    selectable?: boolean;
    selectedId?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    /** Blocks start collapsed when true (search still auto-expands matches). */
    defaultCollapsed?: boolean;
    /** Blocks per page; 0 disables pagination (used in scroll contexts). */
    pageSize?: number;
  }>(),
  {
    selectable: false,
    searchPlaceholder: "Найти endpoint по пути, описанию или блоку…",
    emptyText: "Endpoints ещё не импортированы",
    defaultCollapsed: false,
    pageSize: 0,
  },
);

const emit = defineEmits<{ select: [ep: EndpointLike] }>();

const query = ref("");

// User's manual expand/collapse overrides, keyed by group name.
const overrides = reactive<Record<string, boolean | undefined>>({});

function keyOf(ep: EndpointLike, index: number): string {
  return ep.id ?? `${ep.method}:${ep.path}:${index}`;
}

// Grouping rule (tag → first path segment → «Прочее») lives in utils/endpointGroups.
const groups = computed(() => groupEndpoints(props.endpoints));

const filteredGroups = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return groups.value;
  return groups.value
    .map((g) => {
      // A tag name hit shows the whole block; otherwise filter its endpoints.
      const groupHit = g.name.toLowerCase().includes(q);
      return {
        name: g.name,
        endpoints: groupHit ? g.endpoints : g.endpoints.filter((e) => endpointMatchesQuery(e, q)),
      };
    })
    .filter((g) => g.endpoints.length > 0);
});

const searching = computed(() => query.value.trim().length > 0);
const hasResults = computed(() =>
  filteredGroups.value.some((g) => g.endpoints.length > 0),
);

// Pagination over endpoints — restores the per-page browsing the flat list had.
// Endpoints are paginated (not blocks); the current page's endpoints are then
// regrouped under their tag headers. Disabled (pageSize 0) inside scroll areas.
const page = ref(1);
const flatFiltered = computed(() =>
  filteredGroups.value.flatMap((g) =>
    g.endpoints.map((ep) => ({ group: g.name, ep })),
  ),
);
const pageCount = computed(() =>
  props.pageSize
    ? Math.max(1, Math.ceil(flatFiltered.value.length / props.pageSize))
    : 1,
);
const pagedGroups = computed(() => {
  if (!props.pageSize) return filteredGroups.value;
  const start = (page.value - 1) * props.pageSize;
  const slice = flatFiltered.value.slice(start, start + props.pageSize);
  const out: { name: string; endpoints: EndpointLike[] }[] = [];
  for (const { group, ep } of slice) {
    let last = out[out.length - 1];
    if (!last || last.name !== group) {
      last = { name: group, endpoints: [] };
      out.push(last);
    }
    last.endpoints.push(ep);
  }
  return out;
});
const rangeLabel = computed(() => {
  const total = flatFiltered.value.length;
  if (!props.pageSize || total === 0) return "";
  const start = (page.value - 1) * props.pageSize + 1;
  const end = Math.min(page.value * props.pageSize, total);
  return `${start}–${end} из ${total}`;
});

watch([query, () => props.endpoints], () => {
  page.value = 1;
});
watch(pageCount, (pc) => {
  if (page.value > pc) page.value = pc;
});

function isExpanded(name: string): boolean {
  if (searching.value) return true; // matching blocks open while searching
  if (overrides[name] !== undefined) return overrides[name]!;
  return !props.defaultCollapsed;
}

function toggle(name: string) {
  if (searching.value) return; // no manual collapse mid-search
  overrides[name] = !isExpanded(name);
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <SearchInput
      v-model="query"
      :placeholder="searchPlaceholder"
      :width="'100%'"
    />

    <div
      v-if="!endpoints.length"
      class="border border-zinc-200 rounded-xl px-4 py-10 text-center font-sans text-sm text-zinc-400"
    >
      {{ emptyText }}
    </div>

    <div
      v-else-if="!hasResults"
      class="border border-zinc-200 rounded-xl px-4 py-10 text-center font-sans text-sm text-zinc-400"
    >
      Ничего не найдено
    </div>

    <div v-else class="flex flex-col gap-2.5">
      <div
        v-for="group in pagedGroups"
        :key="group.name"
        class="border border-zinc-200 rounded-xl overflow-hidden"
      >
        <button
          type="button"
          class="flex items-center gap-2.5 w-full px-3.5 py-2.5 bg-zinc-50 hover:bg-zinc-100 transition-colors text-left"
          @click="toggle(group.name)"
        >
          <span
            :class="[
              'inline-flex text-zinc-400 transition-transform shrink-0',
              isExpanded(group.name) ? 'rotate-90' : '',
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
          <span class="font-sans text-[0.875rem] font-bold text-zinc-800 min-w-0 truncate">
            {{ group.name }}
          </span>
          <span
            class="ml-auto shrink-0 font-mono text-[0.75rem] text-zinc-400 bg-white border border-zinc-200 rounded-md px-1.5 py-0.5"
          >
            {{ group.endpoints.length }}
          </span>
        </button>

        <div v-if="isExpanded(group.name)" class="p-1.5">
          <template v-if="selectable">
            <div
              v-for="(ep, i) in group.endpoints"
              :key="keyOf(ep, i)"
              :class="[
                'rounded-lg border-[1.5px] cursor-pointer',
                selectedId && ep.id === selectedId
                  ? 'border-rose-600 bg-rose-50'
                  : 'border-transparent',
              ]"
              @click="emit('select', ep)"
            >
              <EndpointRow
                :method="ep.method"
                :path="ep.path"
                :description="ep.summary"
                :interactive="!selectedId || ep.id !== selectedId"
              />
            </div>
          </template>
          <template v-else>
            <EndpointRow
              v-for="(ep, i) in group.endpoints"
              :key="keyOf(ep, i)"
              :method="ep.method"
              :path="ep.path"
              :description="ep.summary"
            />
          </template>
        </div>
      </div>

      <div v-if="pageCount > 1" class="flex items-center justify-between pt-1">
        <span class="font-sans text-sm text-zinc-400">{{ rangeLabel }}</span>
        <Pagination v-model:page="page" :page-count="pageCount" />
      </div>
    </div>
  </div>
</template>
