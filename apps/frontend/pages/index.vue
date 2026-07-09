<template>
  <div class="marketplace">
    <div class="hero">
      <h1 class="hero-title">Маркетплейс API-сценариев</h1>
      <p class="hero-subtitle">
        {{ totalCount }} сценариев для автоматизации ваших задач
      </p>
      <div class="search-bar">
        <input
          v-model="search"
          type="text"
          class="search-input"
          placeholder="Поиск сценариев..."
          @input="onSearchInput"
        />
      </div>
    </div>

    <div class="catalog">
      <aside class="sidebar">
        <div
          v-for="cat in categories"
          :key="cat.category"
          class="cat-block"
        >
          <button
            :class="['cat-header', { active: selectedCategory === cat.category && !selectedSubcategory }]"
            @click="toggleCategory(cat.category)"
          >
            <span class="cat-name">{{ cat.category }}</span>
            <span class="cat-count">{{ cat.count }}</span>
          </button>
          <div v-if="expandedCategories.has(cat.category)" class="sub-list">
            <button
              :class="['sub-item', { active: selectedCategory === cat.category && selectedSubcategory === '' }]"
              @click="selectCategory(cat.category, '')"
            >
              Все
            </button>
            <button
              v-for="sub in cat.subcategories"
              :key="sub.name"
              :class="['sub-item', { active: selectedCategory === cat.category && selectedSubcategory === sub.name }]"
              @click="selectCategory(cat.category, sub.name)"
            >
              {{ sub.name }}
              <span class="sub-count">{{ sub.count }}</span>
            </button>
          </div>
        </div>
      </aside>

      <div class="content">
        <div class="toolbar">
          <div class="sort-group">
            <button
              :class="['sort-btn', { active: sort === 'popular' }]"
              @click="changeSort('popular')"
            >
              Популярные
            </button>
            <button
              :class="['sort-btn', { active: sort === 'new' }]"
              @click="changeSort('new')"
            >
              Новые
            </button>
          </div>
        </div>

        <div v-if="loading" class="state-text">Загрузка...</div>

        <div v-else-if="cards.length === 0" class="empty-state">
          По вашему запросу ничего не найдено
        </div>

        <div v-else class="card-grid">
          <NuxtLink
            v-for="card in cards"
            :key="card.id"
            :to="`/cards/${card.id}`"
            class="card"
          >
            <div class="card-cover">
              <img v-if="card.coverUrl" :src="card.coverUrl" :alt="card.title" class="cover-img" />
              <div v-else class="cover-placeholder">{{ card.title[0] }}</div>
            </div>
            <div class="card-body">
              <h3 class="card-title">{{ card.title }}</h3>
              <p v-if="card.tagline" class="card-tagline">{{ card.tagline }}</p>
              <div class="card-providers">
                <span v-for="(p, i) in card.providers.slice(0, 3)" :key="i" class="provider-chip">{{ p }}</span>
                <span v-if="card.providers.length > 3" class="provider-more">+{{ card.providers.length - 3 }}</span>
              </div>
              <div class="card-meta">
                <span class="meta-item">{{ card.endpointCount }} endpoints</span>
                <span class="meta-item">{{ card.stepCount }} шагов</span>
                <span class="meta-runs">{{ card.runCount }} запусков</span>
              </div>
            </div>
          </NuxtLink>
        </div>

        <div v-if="totalPages > 1" class="pagination">
          <button :disabled="page <= 1" class="page-btn" @click="changePage(page - 1)">Назад</button>
          <span class="page-info">{{ page }} / {{ totalPages }}</span>
          <button :disabled="page >= totalPages" class="page-btn" @click="changePage(page + 1)">Вперёд</button>
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
const totalCount = ref(0);
const loading = ref(true);

const search = ref("");
const selectedCategory = ref("");
const selectedSubcategory = ref("");
const sort = ref<SortOrder>("popular");
const page = ref(1);
const limit = 12;
const totalPages = ref(1);

const expandedCategories = ref<Set<string>>(new Set());

let searchTimer: ReturnType<typeof setTimeout> | null = null;

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    fetchCatalog();
    fetchCategories();
  }, 300);
}

function toggleCategory(cat: string) {
  if (expandedCategories.value.has(cat)) {
    expandedCategories.value.delete(cat);
  } else {
    expandedCategories.value.add(cat);
  }
}

function selectCategory(cat: string, sub: string) {
  selectedCategory.value = cat;
  selectedSubcategory.value = sub;
  page.value = 1;
  fetchCatalog();
}

function changeSort(s: SortOrder) {
  sort.value = s;
  page.value = 1;
  fetchCatalog();
}

function changePage(p: number) {
  if (p < 1 || p > totalPages.value) return;
  page.value = p;
  fetchCatalog();
}

async function fetchCatalog() {
  loading.value = true;
  try {
    const query: Record<string, unknown> = {
      page: page.value,
      limit,
      sort: sort.value,
    };
    if (search.value) query.search = search.value;
    if (selectedCategory.value) query.category = selectedCategory.value;
    if (selectedSubcategory.value) query.subcategory = selectedSubcategory.value;

    const { data } = await $api.GET("/api/marketplace", { params: { query } });
    if (data.value) {
      cards.value = data.value.data ?? [];
      totalPages.value = data.value.totalPages ?? 1;
      totalCount.value = data.value.total ?? 0;
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
    if (data.value) {
      categories.value = data.value;
    }
  } catch {
    categories.value = [];
  }
}

onMounted(() => {
  fetchCatalog();
  fetchCategories();
});
</script>

<style scoped>
.marketplace { max-width: 1280px; margin: 0 auto; padding: 0 24px 48px; }
.hero { text-align: center; padding: 48px 0 32px; }
.hero-title { font-size: 32px; font-weight: 800; color: #18181b; letter-spacing: -0.03em; margin: 0 0 12px; }
.hero-subtitle { font-size: 16px; color: #71717a; margin: 0 0 24px; }
.search-bar { max-width: 560px; margin: 0 auto; }
.search-input { width: 100%; padding: 12px 16px; border: 1px solid #e4e4e7; border-radius: 10px; font-size: 15px; color: #18181b; outline: none; }
.search-input:focus { border-color: #6366f1; }
.catalog { display: grid; grid-template-columns: 220px 1fr; gap: 24px; }
.sidebar { display: flex; flex-direction: column; gap: 2px; }
.cat-block { display: flex; flex-direction: column; }
.cat-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border: none; background: none; cursor: pointer; font-size: 14px; font-weight: 500; color: #3f3f46; border-radius: 8px; text-align: left; }
.cat-header:hover { background: #f4f4f5; }
.cat-header.active { background: #eef2ff; color: #6366f1; }
.cat-count { font-size: 12px; color: #a1a1aa; font-weight: 400; }
.sub-list { display: flex; flex-direction: column; padding-left: 12px; }
.sub-item { display: flex; justify-content: space-between; align-items: center; padding: 7px 12px; border: none; background: none; cursor: pointer; font-size: 13px; color: #71717a; border-radius: 6px; text-align: left; }
.sub-item:hover { background: #f4f4f5; }
.sub-item.active { color: #6366f1; font-weight: 500; }
.sub-count { font-size: 11px; color: #a1a1aa; }
.content { display: flex; flex-direction: column; gap: 16px; }
.toolbar { display: flex; justify-content: flex-end; }
.sort-group { display: flex; gap: 4px; background: #f4f4f5; border-radius: 8px; padding: 3px; }
.sort-btn { padding: 6px 14px; border: none; background: none; border-radius: 6px; font-size: 13px; font-weight: 500; color: #71717a; cursor: pointer; }
.sort-btn.active { background: #fff; color: #18181b; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.state-text { text-align: center; padding: 64px 0; color: #71717a; font-size: 15px; }
.empty-state { text-align: center; padding: 64px 0; color: #a1a1aa; font-size: 15px; border: 2px dashed #e4e4e7; border-radius: 12px; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.card { display: flex; flex-direction: column; border: 1px solid #e4e4e7; border-radius: 12px; overflow: hidden; background: #fff; text-decoration: none; transition: border-color 0.15s, box-shadow 0.15s; }
.card:hover { border-color: #d4d4d8; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.card-cover { height: 120px; display: flex; align-items: center; justify-content: center; background: #f4f4f5; overflow: hidden; }
.cover-img { width: 100%; height: 100%; object-fit: cover; }
.cover-placeholder { font-size: 40px; font-weight: 800; color: #d4d4d8; text-transform: uppercase; }
.card-body { padding: 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
.card-title { font-size: 15px; font-weight: 700; color: #18181b; margin: 0; }
.card-tagline { font-size: 13px; color: #71717a; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; flex: 1; }
.card-providers { display: flex; flex-wrap: wrap; gap: 4px; }
.provider-chip { font-size: 11px; color: #52525b; background: #f4f4f5; padding: 2px 8px; border-radius: 100px; }
.provider-more { font-size: 11px; color: #6366f1; font-weight: 600; padding: 2px 4px; }
.card-meta { display: flex; gap: 8px; padding-top: 8px; border-top: 1px solid #f4f4f5; }
.meta-item { font-size: 12px; color: #a1a1aa; }
.meta-runs { font-size: 12px; color: #6366f1; margin-left: auto; font-weight: 500; }
.pagination { display: flex; justify-content: center; align-items: center; gap: 16px; padding-top: 8px; }
.page-btn { padding: 8px 16px; border-radius: 8px; border: 1px solid #e4e4e7; background: #fff; color: #18181b; font-size: 14px; font-weight: 500; cursor: pointer; }
.page-btn:hover:not(:disabled) { background: #f4f4f5; }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info { font-size: 14px; color: #71717a; }
</style>
