<template>
  <div class="max-w-[1180px] mx-auto px-6 py-12 space-y-12">
    <div>
      <p class="text-[0.6875rem] font-semibold tracking-[0.08em] uppercase text-zinc-400 mb-1">
        Fuse Design System
      </p>
      <h1 class="text-[2.125rem] font-extrabold tracking-[-0.03em] text-zinc-900">
        UI-kit · песочница
      </h1>
      <p class="text-zinc-500 mt-1">Core-примитивы во всех вариантах. Только для dev-проверки.</p>
    </div>

    <!-- Buttons -->
    <section class="space-y-4">
      <h2 class="text-[1.375rem] font-bold tracking-[-0.02em] text-zinc-900">Button</h2>
      <div class="flex flex-wrap items-center gap-3">
        <Button variant="primary">Создать сценарий</Button>
        <Button variant="dark">Опубликовать</Button>
        <Button variant="secondary">Отмена</Button>
        <Button variant="ghost">Подробнее</Button>
        <Button variant="tint">
          <template #left><Icon name="plus" :size="16" /></template>
          Добавить шаг
        </Button>
        <Button variant="danger">Удалить</Button>
        <Button variant="primary" disabled>Недоступно</Button>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <Button size="sm">sm</Button>
        <Button size="md">md</Button>
        <Button size="lg">lg</Button>
        <Button size="md">
          Получить результат
          <template #right><Icon name="arrow-right" :size="16" /></template>
        </Button>
      </div>
    </section>

    <!-- PublishButton -->
    <section class="space-y-4">
      <h2 class="text-[1.375rem] font-bold tracking-[-0.02em] text-zinc-900">PublishButton</h2>
      <div class="flex flex-wrap items-center gap-3">
        <PublishButton />
        <PublishButton :default-published="true" />
      </div>
    </section>

    <!-- Badges -->
    <section class="space-y-4">
      <h2 class="text-[1.375rem] font-bold tracking-[-0.02em] text-zinc-900">Badge</h2>
      <div class="flex flex-wrap items-center gap-3">
        <Badge tone="success" dot>Опубликован</Badge>
        <Badge tone="brand">КАТАЛОГ</Badge>
        <Badge tone="neutral">Черновик</Badge>
        <Badge tone="info" dot>Шаг</Badge>
        <Badge tone="success" size="sm">GET</Badge>
        <Badge tone="brand" size="sm">POST</Badge>
      </div>
    </section>

    <!-- Avatars + BrandMark -->
    <section class="space-y-4">
      <h2 class="text-[1.375rem] font-bold tracking-[-0.02em] text-zinc-900">Avatar · BrandMark</h2>
      <div class="flex flex-wrap items-center gap-4">
        <Avatar name="Анна Ковалёва" :size="32" />
        <Avatar name="Иван Петров" :size="40" />
        <Avatar name="Сергей" :size="56" />
        <div class="w-px h-10 bg-zinc-200" />
        <BrandMark :size="28" />
        <BrandMark :size="36" />
        <BrandMark :size="32" :show-wordmark="false" />
      </div>
    </section>

    <!-- IconButtons -->
    <section class="space-y-4">
      <h2 class="text-[1.375rem] font-bold tracking-[-0.02em] text-zinc-900">IconButton</h2>
      <div class="flex flex-wrap items-center gap-3">
        <div class="w-40 h-24 rounded-xl bg-[linear-gradient(135deg,#ede9fe_0%,#f4f4f5_100%)] flex items-center justify-center">
          <IconButton variant="floating" :size="44" label="Открыть">
            <Icon name="share-2" :size="20" />
          </IconButton>
        </div>
        <IconButton variant="ghost" label="Изменить"><Icon name="pencil" :size="18" /></IconButton>
        <IconButton variant="ghost" label="Удалить"><Icon name="x" :size="18" /></IconButton>
        <IconButton variant="subtle" label="Синхронизировать"><Icon name="refresh-cw" :size="18" /></IconButton>
        <IconButton variant="outline" label="Настройки"><Icon name="sliders-horizontal" :size="18" /></IconButton>
      </div>
    </section>

    <!-- Cards -->
    <section class="space-y-4">
      <h2 class="text-[1.375rem] font-bold tracking-[-0.02em] text-zinc-900">Card</h2>
      <div class="grid grid-cols-3 gap-6">
        <Card>
          <h3 class="font-bold text-zinc-900 mb-1">Обычная карточка</h3>
          <p class="text-[0.9375rem] text-zinc-500">Белая поверхность, hairline-бордер, мягкая тень, 16px радиус.</p>
        </Card>
        <Card interactive>
          <h3 class="font-bold text-zinc-900 mb-1">Интерактивная</h3>
          <p class="text-[0.9375rem] text-zinc-500">Наведи — приподнимется и усилит тень.</p>
        </Card>
        <Card padding="xl">
          <div class="flex items-center gap-2">
            <Icon name="check" :size="18" class="text-green-600" />
            <span class="font-semibold text-zinc-900">padding=xl</span>
          </div>
        </Card>
      </div>
    </section>

    <!-- Forms -->
    <section class="space-y-4">
      <h2 class="text-[1.375rem] font-bold tracking-[-0.02em] text-zinc-900">Forms</h2>
      <div class="grid grid-cols-3 gap-6 max-w-[900px]">
        <Input v-model="name" label="Название сценария" placeholder="Например, Синхронизация CRM" hint="Отображается в каталоге" />
        <Input v-model="token" label="API-ключ" mono placeholder="sk-..." />
        <Input label="Отключённое поле" placeholder="Недоступно" disabled />
        <Select v-model="provider" label="Провайдер" :options="providerOptions" placeholder="Выберите сервис" />
        <Select v-model="method" label="Метод (с поиском)" searchable :options="methodOptions" />
        <div class="flex flex-col gap-2 justify-end">
          <label class="text-[0.8125rem] font-sans font-semibold text-zinc-900">Поиск</label>
          <SearchInput v-model="search" :width="'100%'" />
        </div>
      </div>
    </section>

    <!-- Navigation -->
    <section class="space-y-4">
      <h2 class="text-[1.375rem] font-bold tracking-[-0.02em] text-zinc-900">Navigation</h2>

      <div class="rounded-2xl overflow-hidden border border-zinc-200">
        <TopNav :items="navItems" :user="{ name: 'Анна Ковалёва' }" />
      </div>

      <div class="grid grid-cols-2 gap-8 items-start pt-2">
        <div class="space-y-6">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">Tabs</p>
            <Tabs v-model="tab" :items="tabItems" />
          </div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">SegmentedControl</p>
            <SegmentedControl v-model="segment" :options="['Сетка', 'Список', 'Компактно']" />
          </div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">Pagination</p>
            <Pagination v-model:page="page" :page-count="5" />
          </div>
        </div>

        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">CategoryNav</p>
          <div class="w-64 rounded-2xl border border-zinc-200 bg-white p-2">
            <CategoryNav v-model="category" :items="categoryItems" default-value="Платежи" />
          </div>
        </div>
      </div>
    </section>

    <!-- Data display -->
    <section class="space-y-4">
      <h2 class="text-[1.375rem] font-bold tracking-[-0.02em] text-zinc-900">Data display</h2>

      <div class="flex flex-wrap items-center gap-4">
        <ProviderIcon name="DataHub" />
        <ProviderIcon name="Stripe" color="#635bff" />
        <ProviderIcon letter="G" color="#18181b" :size="36" />
        <div class="w-px h-8 bg-zinc-200" />
        <MethodBadge method="GET" />
        <MethodBadge method="POST" />
        <MethodBadge method="DELETE" />
      </div>

      <div class="grid grid-cols-4 gap-6">
        <StatCard :value="128" label="Всего запусков" />
        <StatCard value="98.4%" label="Успешных" />
        <StatCard value="1.2s" label="Средний ответ" />
        <StatCard value="12" label="Активных сценариев" />
      </div>

      <Card padding="sm">
        <EndpointRow method="GET" path="/v1/customers" description="Список клиентов" interactive />
        <EndpointRow method="POST" path="/v1/customers" description="Создать клиента" interactive />
        <EndpointRow method="DELETE" path="/v1/customers/:id" description="Удалить клиента" interactive />
      </Card>

      <div class="grid grid-cols-2 gap-6 items-start">
        <CodeBlock label="Ответ" meta="200 OK · 342ms" :code="sampleJson" />
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">KeyValueGrid</p>
          <KeyValueGrid :items="kvItems" />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-6 items-start">
        <Card>
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-4">StepProgress</p>
          <StepProgress
            :heading="{ label: 'Синхронизация CRM', status: 'active' }"
            :steps="progressSteps"
          />
        </Card>
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">ScenarioStep</p>
          <ScenarioStep
            :index="1"
            type-label="HTTP"
            auth
            provider="DataHub API"
            method="POST"
            path="/v1/sync"
            title="Синхронизация"
            :params="stepParams"
          />
        </div>
      </div>
    </section>

    <!-- Cards + feedback -->
    <section class="space-y-4">
      <h2 class="text-[1.375rem] font-bold tracking-[-0.02em] text-zinc-900">Cards · Modal</h2>

      <div class="grid grid-cols-3 gap-6">
        <ScenarioCard
          :cover="{ variant: 'striped' }"
          title="Синхронизация CRM ↔ таблицы"
          description="Забирает лиды из CRM и раскладывает по Google Sheets каждый час."
          :provider="{ name: 'DataHub' }"
          meta="12 запусков"
          @click="() => {}"
        >
          <template #status><Badge tone="success" dot>Опубликован</Badge></template>
        </ScenarioCard>
        <ScenarioCard
          :cover="{ variant: 'mint' }"
          title="Генерация счетов"
          description="Формирует PDF-счёт и отправляет клиенту на email."
          :provider="{ name: 'Stripe' }"
          meta="4 запуска"
        >
          <template #actions>
            <Button size="sm" variant="primary">Запустить</Button>
            <Button size="sm" variant="secondary">Подробнее</Button>
          </template>
        </ScenarioCard>
        <ScenarioCard
          :cover="{ variant: 'plain' }"
          title="Черновик без обложки"
          description="Пример карточки с plain-обложкой и без провайдера."
          meta="черновик"
        />
      </div>

      <div class="flex flex-col gap-3">
        <AppRow
          name="DataHub API"
          description="Внутренний сервис агрегации данных"
          meta="https://api.datahub.internal/v1"
          :stats="[{ value: 8, label: 'эндпоинтов' }, { value: '1.2k', label: 'запросов' }]"
          @click="() => {}"
        />
        <AppRow
          name="Stripe"
          description="Платёжный провайдер"
          meta="https://api.stripe.com"
          status="Черновик"
          :stats="[{ value: 24, label: 'эндпоинтов' }]"
        />
      </div>

      <div class="flex items-center gap-3">
        <Button variant="dark" @click="modalOpen = true">Открыть Modal</Button>
        <span class="text-sm text-zinc-400">оверлей + Teleport, закрытие по фону / ×</span>
      </div>

      <p class="text-xs font-semibold uppercase tracking-wide text-zinc-400 mt-2">Modal (inline)</p>
      <Modal
        inline
        title="Добавить шаг"
        subtitle="Выберите эндпоинт для нового шага сценария"
        :width="440"
      >
        <div class="py-2">
          <Select :options="['GET /v1/customers', 'POST /v1/customers', 'DELETE /v1/customers/:id']" placeholder="Выберите эндпоинт" />
        </div>
        <template #footer>
          <Button variant="secondary" size="sm">Отмена</Button>
          <Button variant="primary" size="sm">Добавить</Button>
        </template>
      </Modal>
    </section>

    <Modal v-model:open="modalOpen" title="Удалить сценарий?" subtitle="Действие необратимо.">
      <p class="text-[0.9375rem] text-zinc-600 py-2">
        Сценарий «Синхронизация CRM» и вся история его запусков будут удалены навсегда.
      </p>
      <template #footer>
        <Button variant="secondary" @click="modalOpen = false">Отмена</Button>
        <Button variant="danger" @click="modalOpen = false">Удалить</Button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

// Стенд примитивов дизайн-системы. В проде import.meta.dev сворачивается в false,
// условие — в безусловный throw: страница отдаёт честный 404, а не прячется по URL.
if (!import.meta.dev) {
  throw createError({ statusCode: 404, statusMessage: "Not Found", fatal: true });
}

// forms
const name = ref("");
const token = ref("");
const search = ref("");
const provider = ref<string>();
const method = ref("GET");
const providerOptions = [
  { value: "stripe", label: "Stripe", description: "api.stripe.com", avatar: "S", color: "#635bff" },
  { value: "github", label: "GitHub", description: "api.github.com", avatar: "G", color: "#18181b" },
  { value: "slack", label: "Slack", description: "slack.com/api", avatar: "S", color: "#4a154b" },
];
const methodOptions = ["GET", "POST", "PUT", "PATCH", "DELETE"];

// navigation
const navItems = [
  { label: "Каталог", active: true },
  { label: "Мои сценарии" },
  { label: "Мои API" },
];
const tab = ref("overview");
const tabItems = [
  { value: "overview", label: "Обзор" },
  { value: "endpoints", label: "Эндпоинты" },
  { value: "runs", label: "Запуски" },
];
const segment = ref("Сетка");
const page = ref(1);
const category = ref("Платежи");
const categoryItems = [
  { label: "Все сценарии", count: 128 },
  {
    label: "Финансы",
    count: 42,
    defaultOpen: true,
    children: [
      { label: "Платежи", count: 18 },
      { label: "Выставление счетов", count: 12 },
    ],
  },
  { label: "Коммуникации", count: 31, children: [{ label: "Email", count: 9 }, { label: "Чаты", count: 7 }] },
  { label: "Данные", count: 24 },
];

// data display
const sampleJson = {
  id: "cus_9s7Hd2",
  object: "customer",
  email: "anna@example.com",
  created: 1720000000,
};
const kvItems = [
  { label: "Статус", value: "Активен" },
  { label: "Запросов", value: 1284 },
  { label: "Последний запуск", value: "2 мин назад" },
  { label: "Регион", value: "eu-central" },
];
const progressSteps = [
  { label: "Авторизация", status: "done" as const, meta: "120ms" },
  { label: "Получение данных", status: "active" as const },
  { label: "Трансформация", status: "pending" as const },
  { label: "Запись", status: "pending" as const },
];
const stepParams = [
  { kind: "BODY", name: "customer_id", source: "Шаг 1 · id" },
  { kind: "QUERY", name: "limit", source: "Константа · 50" },
];

// cards + modal
const modalOpen = ref(false);
</script>
