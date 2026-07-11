<template>
  <div class="max-w-[1180px] xl:max-w-[1320px] mx-auto px-5 lg:px-8 pt-8 lg:pt-12 pb-20">
    <!-- Hero -->
    <div class="max-w-[680px] mb-10 lg:mb-14">
      <Badge tone="brand" dot>{{ allCount }}+ готовых сценариев</Badge>
      <h1
        class="font-sans font-extrabold text-[2.5rem] md:text-[3.25rem] xl:text-[4rem] leading-[1.05] tracking-[-0.03em] text-zinc-900 mt-5 mb-[18px]"
      >
        API, упакованные<br />
        в готовые <span class="text-rose-600">сценарии</span>
      </h1>
      <p class="font-sans text-lg text-zinc-500 leading-normal max-w-[560px]">
        Не документация, а рабочие карточки. Загрузите файл, пройдите поток или расшифруйте
        звонок — прямо в браузере, без единой строчки кода.
      </p>
    </div>

    <!-- Catalog -->
    <div class="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8 lg:gap-12 items-start">
      <div class="lg:sticky lg:top-[88px]">
        <CategoryNav v-model="catValue" :items="navItems" @change="applyCat" />
      </div>

      <div>
        <div class="flex items-center gap-4 mb-[26px] flex-wrap">
          <SegmentedControl
            v-model="sort"
            :options="sortOptions"
            size="sm"
            @change="onSortChange"
          />
          <span class="font-sans text-sm text-zinc-400">
            {{ cards.length ? `${rangeStart}–${rangeEnd}` : 0 }} из {{ total }}
          </span>
          <SearchInput v-model="search" :width="320" class="ml-auto" />
        </div>

        <div v-if="loading" class="font-sans text-sm text-zinc-400 py-16 text-center">
          Загрузка…
        </div>

        <div
          v-else-if="cards.length === 0"
          class="font-sans text-sm text-zinc-400 py-16 text-center border-2 border-dashed border-zinc-200 rounded-2xl"
        >
          По вашему запросу ничего не найдено
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ScenarioCard
            v-for="(card, i) in cards"
            :key="card.id"
            :cover="coverFor(card, i)"
            :title="card.title"
            :description="card.tagline"
            :provider="providerFor(card)"
            :meta="`${card.runCount} запусков`"
            :to="`/cards/${card.id}`"
          />
        </div>

        <div v-if="totalPages > 1" class="flex items-center justify-between mt-9">
          <span class="font-sans text-sm text-zinc-400">Стр. {{ page }} из {{ totalPages }}</span>
          <Pagination v-model:page="page" :page-count="totalPages" @change="onPageChange" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MarketplaceCard, CategoryCount, SortOrder } from "@fuse/shared";

const { $api } = useNuxtApp() as any;

const cards = ref<MarketplaceCard[]>([]);
const categories = ref<CategoryCount[]>([]);
const total = ref(0);
const loading = ref(true);

const ALL = "Все сценарии";
const search = ref("");
const catValue = ref(ALL);
const selectedCategory = ref("");
const selectedSubcategory = ref("");
const sort = ref<SortOrder>("popular");
const page = ref(1);
const limit = 6;
const totalPages = ref(1);

const sortOptions = [
  { value: "popular", label: "Популярные" },
  { value: "new", label: "Новые" },
];

const rangeStart = computed(() => (page.value - 1) * limit + 1);
const rangeEnd = computed(() => (page.value - 1) * limit + cards.value.length);

const allCount = computed(() =>
  categories.value.reduce((sum, c) => sum + c.count, 0),
);

const navItems = computed(() => [
  { label: ALL, count: allCount.value },
  ...categories.value.map((c) => ({
    label: c.category,
    count: c.count,
    children: c.subcategories.map((s) => ({ label: s.name, count: s.count })),
  })),
]);

function coverFor(
  card: MarketplaceCard,
  i: number,
): { src?: string; variant?: "striped" | "mint" } {
  if (card.coverUrl) return { src: card.coverUrl };
  return { variant: i % 2 === 0 ? "striped" : "mint" };
}

function providerFor(card: MarketplaceCard) {
  return card.providers?.length ? { name: card.providers[0] } : undefined;
}

function applyCat(val: string) {
  if (val === ALL) {
    selectedCategory.value = "";
    selectedSubcategory.value = "";
  } else if (categories.value.some((c) => c.category === val)) {
    selectedCategory.value = val;
    selectedSubcategory.value = "";
  } else {
    const parent = categories.value.find((c) =>
      c.subcategories.some((s) => s.name === val),
    );
    selectedCategory.value = parent?.category ?? "";
    selectedSubcategory.value = val;
  }
  page.value = 1;
  fetchCatalog();
}

function onSortChange() {
  page.value = 1;
  fetchCatalog();
}

function onPageChange() {
  fetchCatalog();
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    fetchCatalog();
    fetchCategories();
  }, 300);
});

async function fetchCatalog() {
  loading.value = true;
  try {
    const query: Record<string, unknown> = { page: page.value, limit, sort: sort.value };
    if (search.value) query.search = search.value;
    if (selectedCategory.value) query.category = selectedCategory.value;
    if (selectedSubcategory.value) query.subcategory = selectedSubcategory.value;

    const { data } = await $api.GET("/api/marketplace", { params: { query } });
    if (data) {
      cards.value = data.data ?? [];
      totalPages.value = data.totalPages ?? 1;
      total.value = data.total ?? 0;
    }
  } catch {
    cards.value = [];
  } finally {
    loading.value = false;
  }
}

async function fetchCategories() {
  try {
    const params: Record<string, unknown> = {};
    if (search.value) params.search = search.value;
    const { data } = await $api.GET("/api/marketplace/categories", { params });
    if (data) categories.value = data;
  } catch {
    categories.value = [];
  }
}

onMounted(() => {
  fetchCatalog();
  fetchCategories();
});
</script>
