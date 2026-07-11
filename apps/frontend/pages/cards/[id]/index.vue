<template>
  <div class="max-w-[1180px] xl:max-w-[1320px] mx-auto px-5 lg:px-8 pt-8 pb-20">
    <div v-if="loading" class="font-sans text-sm text-zinc-400 py-16 text-center">Загрузка…</div>

    <template v-else-if="card">
      <a
        href="/"
        class="font-sans text-sm text-zinc-500 inline-flex items-center gap-1.5 mb-6 hover:text-zinc-700"
        @click.prevent="goBack"
      >
        ‹ {{ backLabel }}
      </a>

      <div class="pl-1">
        <div class="font-sans text-[0.8125rem] text-zinc-400 mb-2">{{ card.runCount }} запусков</div>
        <h1
          class="font-sans font-extrabold text-[1.875rem] md:text-[2.5rem] tracking-tight text-zinc-900 mb-6"
        >
          {{ card.title }}
        </h1>

        <div class="mb-8">
          <Tabs v-model="activeTab" :items="tabs" />
        </div>

        <!-- Overview -->
        <div v-if="activeTab === 'Обзор'" class="max-w-[940px]">
          <div
            class="h-[200px] md:h-[300px] rounded-3xl mb-7"
            :class="!card.coverUrl && 'bg-[repeating-linear-gradient(135deg,#eef0f8_0px,#eef0f8_16px,#e8eaf4_16px,#e8eaf4_32px)]'"
            :style="
              card.coverUrl
                ? { backgroundImage: `url(${card.coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : undefined
            "
          />

          <p v-if="card.tagline" class="font-sans text-base text-zinc-700 mb-5">
            <strong class="text-zinc-900">{{ card.title }}</strong> — {{ card.tagline }}
          </p>

          <template v-if="descriptionParagraphs.length">
            <h3
              class="font-sans font-bold text-[1.0625rem] tracking-tight text-zinc-900 mb-3"
            >
              Описание
            </h3>
            <div class="flex flex-col gap-2 mb-8">
              <p
                v-for="(para, i) in descriptionParagraphs"
                :key="i"
                class="font-sans text-[0.9375rem] text-zinc-700 leading-relaxed"
              >
                {{ para }}
              </p>
            </div>
          </template>

          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard :value="card.runCount" label="запусков" />
            <StatCard :value="card.providers.length" label="поставщиков API" />
            <StatCard :value="card.endpointCount" label="endpoints" />
            <StatCard v-if="card.category" :value="card.category" label="категория" :value-size="22" />
            <StatCard v-else :value="card.stepCount" label="шагов" />
          </div>

          <div class="flex flex-wrap gap-3">
            <Button variant="primary" size="lg" @click="activeTab = 'Запуск'">
              Перейти к запуску
              <template #right><Icon name="arrow-right" :size="20" /></template>
            </Button>
          </div>
        </div>

        <!-- Run -->
        <div v-else-if="activeTab === 'Запуск'" class="max-w-[940px]">
          <div class="mb-5">
            <SegmentedControl v-model="runView" :options="runViews" />
          </div>
          <RunPanel
            v-if="runView === 'Результат'"
            :scenario-id="card.id"
            @playground="runView = 'Playground'"
          />
          <PlaygroundPanel v-else :scenario-id="card.id" />
        </div>

        <!-- Services -->
        <div v-else class="max-w-[940px]">
          <template v-if="card.providersDetail.length">
            <div :class="eyebrow">Поставщики API · {{ card.providersDetail.length }}</div>
            <div class="flex flex-col gap-3 mb-7">
              <Card
                v-for="p in card.providersDetail"
                :key="p.appId"
                padding="md"
                class="flex items-center gap-3.5"
              >
                <ProviderIcon :name="p.name" color="#16a34a" :size="36" />
                <span class="font-sans font-bold text-base text-zinc-900">{{ p.name }}</span>
              </Card>
            </div>

            <div :class="eyebrow">Задействованные endpoints · {{ allEndpoints.length }}</div>
            <Card padding="sm">
              <EndpointRow
                v-for="ep in allEndpoints"
                :key="ep.id"
                :method="ep.method"
                :path="ep.path"
              >
                <template #right>
                  <span class="inline-flex items-center gap-1.5">
                    <span class="w-[7px] h-[7px] rounded-full bg-green-500" />
                    {{ ep.provider }}
                  </span>
                </template>
              </EndpointRow>
            </Card>
          </template>
          <div v-else class="font-sans text-sm text-zinc-400 py-12 text-center">
            Нет подключённых сервисов
          </div>
        </div>
      </div>
    </template>

    <div v-else class="font-sans text-sm text-zinc-400 py-16 text-center">Сценарий не найден</div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const { $api } = useNuxtApp() as any;

interface ProviderDetail {
  appId: string;
  name: string;
  endpoints: { id: string; method: string; path: string; summary?: string }[];
}

interface CardDetail {
  id: string;
  title: string;
  tagline: string;
  coverUrl?: string;
  category?: string;
  subcategory?: string;
  runCount: number;
  providers: string[];
  endpointCount: number;
  stepCount: number;
  description?: string;
  providersDetail: ProviderDetail[];
}

const card = ref<CardDetail | null>(null);
const loading = ref(true);
const activeTab = ref("Обзор");

const runView = ref("Результат");

const tabs = ["Обзор", "Запуск", "Сервисы и endpoints"];
const runViews = ["Результат", "Playground"];
const eyebrow =
  "font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-zinc-400 mb-3";

const descriptionParagraphs = computed(() =>
  card.value?.description ? card.value.description.split("\n").filter((p) => p.trim()) : [],
);

const allEndpoints = computed(() =>
  (card.value?.providersDetail ?? []).flatMap((p) =>
    p.endpoints.map((e) => ({ ...e, provider: p.name })),
  ),
);

const router = useRouter();

// Куда реально ведёт "назад" по истории браузера — подписи как в навигации проекта.
const BACK_LABELS: { test: RegExp; label: string }[] = [
  { test: /^\/$/, label: "Маркетплейс" },
  { test: /^\/my\/scenarios(\/[^/]+\/edit)?\/?$/, label: "Мои сценарии" },
  { test: /^\/my\/apps(\/[^/]+)?\/?$/, label: "Мои API" },
  { test: /^\/profile\/?$/, label: "Профиль" },
];

function resolveBackLabel(path?: string | null): string {
  if (!path) return "Маркетплейс";
  const clean = path.split("?")[0].split("#")[0];
  return BACK_LABELS.find((r) => r.test.test(clean))?.label ?? "Маркетплейс";
}

const backLabel = ref("Маркетплейс");

function goBack() {
  if (typeof window !== "undefined" && window.history.state?.back) {
    router.back();
  } else {
    navigateTo("/");
  }
}

async function fetchCard() {
  loading.value = true;
  try {
    const { data } = await $api.GET(`/api/marketplace/${route.params.id}`, {});
    if (data) card.value = data;
  } catch {
    card.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchCard();
  backLabel.value = resolveBackLabel(window.history.state?.back);
});
</script>
