<script setup lang="ts">
// Add-step dialog: pick the source (app + endpoint, scenario, delay…) and name
// the step. The step type is chosen upstream in AddStepMenu.
import type { App, Endpoint, Scenario, Step, StepType } from "@fuse/shared";

const props = defineProps<{
  scenarioId: string;
  stepType: StepType;
  typeTitle: string;
}>();

const emit = defineEmits<{ add: [step: Step]; close: [] }>();

const { $api } = useNuxtApp() as any;

const eyebrow =
  "font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-zinc-400 mb-2.5";

const apps = ref<App[]>([]);
const scenarios = ref<Scenario[]>([]);
const endpoints = ref<Endpoint[]>([]);

const appId = ref("");
const selectedEndpoint = ref<Endpoint | null>(null);
const title = ref("");
const refScenarioId = ref("");
const delaySec = ref(3);
const pollIntervalSec = ref(5);

const needsEndpoint = computed(
  () => props.stepType === "api" || props.stepType === "periodic",
);

const appOptions = computed(() =>
  apps.value.map((a) => ({
    value: a.id,
    label: a.name,
    description: `${a.endpoints?.length ?? 0} endpoints`,
    avatar: a.name.charAt(0),
    color: "#6366f1",
  })),
);

const scenarioOptions = computed(() =>
  scenarios.value.map((s) => ({ value: s.id, label: s.title, description: s.category })),
);

const appName = computed(() => apps.value.find((a) => a.id === appId.value)?.name ?? "");

const canAdd = computed(() => {
  if (!title.value.trim()) return false;
  if (needsEndpoint.value) return !!selectedEndpoint.value;
  if (props.stepType === "scenario") return !!refScenarioId.value;
  if (props.stepType === "delay") return delaySec.value > 0;
  return true;
});

async function loadApps() {
  // Any published app is fair game for a step, regardless of who owns it;
  // unpublished apps (including the user's own drafts) must stay hidden here.
  const { data } = await $api.GET("/api/apps", {
    params: { query: { limit: 100, published: true } },
  });
  if (data) apps.value = data.data ?? [];
}

async function loadScenarios() {
  const { data } = await $api.GET("/api/scenarios", { params: { query: { limit: 100 } } });
  if (data) scenarios.value = (data.data ?? []).filter((s: Scenario) => s.id !== props.scenarioId);
}

async function loadEndpoints() {
  selectedEndpoint.value = null;
  endpoints.value = [];
  if (!appId.value) return;
  const { data } = await $api.GET(`/api/apps/${appId.value}`, {});
  if (data) endpoints.value = data.endpoints ?? [];
}

function pickEndpoint(picked: { id?: string }) {
  const ep = endpoints.value.find((e) => e.id === picked.id);
  if (!ep) return;
  selectedEndpoint.value = ep;
  if (!title.value.trim()) title.value = ep.summary || ep.path;
}

function add() {
  if (!canAdd.value) return;
  const id = crypto.randomUUID();
  const name = title.value.trim();
  const ep = selectedEndpoint.value;
  let step: Step;

  if (props.stepType === "api" && ep) {
    step = {
      id,
      type: "api",
      title: name,
      appId: appId.value,
      endpointId: ep.id,
      method: ep.method,
      path: ep.path,
      mappings: {},
      consts: {},
    };
  } else if (props.stepType === "periodic" && ep) {
    step = {
      id,
      type: "periodic",
      title: name,
      appId: appId.value,
      endpointId: ep.id,
      pollMethod: ep.method,
      pollPath: ep.path,
      pollIntervalSec: pollIntervalSec.value,
      mappings: {},
    };
  } else if (props.stepType === "scenario") {
    step = { id, type: "scenario", title: name, refScenarioId: refScenarioId.value, mappings: {} };
  } else if (props.stepType === "delay") {
    step = { id, type: "delay", title: name, seconds: delaySec.value };
  } else if (props.stepType === "page") {
    // Раскладка добавляется после — в конструкторе из панели настройки шага.
    step = { id, type: "page", title: name, page: { title: name, rows: [] } };
  } else {
    // Тип «Файл» удалён из палитры; сюда попадать не из чего.
    return;
  }

  emit("add", step);
}

onMounted(() => {
  if (needsEndpoint.value) loadApps();
  if (props.stepType === "scenario") loadScenarios();
});
</script>

<template>
  <Modal
    title="Добавить шаг"
    :subtitle="typeTitle"
    :width="720"
    @close="emit('close')"
  >
    <div class="flex flex-col gap-[22px] pb-2">
      <template v-if="needsEndpoint">
        <div>
          <div :class="eyebrow">1 · Выберите приложение</div>
          <Select
            v-model="appId"
            searchable
            search-placeholder="Найти приложение по названию…"
            placeholder="Выберите приложение"
            :options="appOptions"
            @update:model-value="loadEndpoints"
          />
          <p v-if="!apps.length" class="font-sans text-[0.8125rem] text-zinc-400 mt-2.5">
            Нет доступных приложений — импортируйте API в разделе «Мои API».
          </p>
        </div>

        <div>
          <div :class="eyebrow">2 · Endpoint{{ appName ? ` из ${appName}` : "" }}</div>
          <template v-if="appId">
            <div class="max-h-[320px] overflow-y-auto">
              <EndpointGroupList
                selectable
                default-collapsed
                :endpoints="endpoints"
                :selected-id="selectedEndpoint?.id"
                empty-text="У приложения нет endpoints"
                @select="pickEndpoint"
              />
            </div>
          </template>

          <!-- Placeholder before an app is picked so the dialog does not jump. -->
          <div
            v-else
            class="border border-zinc-200 rounded-xl min-h-[240px] flex flex-col items-center justify-center gap-3 px-6 text-center bg-zinc-50/60"
          >
            <span
              class="w-11 h-11 rounded-2xl bg-white border border-zinc-200 inline-flex items-center justify-center text-zinc-400"
            >
              <Icon name="package-search" :size="20" />
            </span>
            <div class="font-sans text-[0.875rem] font-semibold text-zinc-600">
              Сначала выберите приложение
            </div>
            <div class="font-sans text-[0.8125rem] text-zinc-400 max-w-[280px]">
              Список endpoint’ов появится здесь.
            </div>
          </div>
        </div>

        <div v-if="stepType === 'periodic' && selectedEndpoint">
          <div :class="eyebrow">Интервал опроса</div>
          <Input v-model.number="pollIntervalSec" type="number" hint="От 1 до 600 секунд" />
        </div>
      </template>

      <template v-else-if="stepType === 'scenario'">
        <div>
          <div :class="eyebrow">1 · Выберите сценарий</div>
          <Select
            v-model="refScenarioId"
            searchable
            search-placeholder="Найти сценарий…"
            placeholder="Выберите сценарий"
            :options="scenarioOptions"
          />
        </div>
      </template>

      <template v-else-if="stepType === 'delay'">
        <div>
          <div :class="eyebrow">1 · Длительность паузы</div>
          <div class="flex gap-2 mb-3">
            <button
              v-for="s in [1, 3, 5, 10]"
              :key="s"
              type="button"
              :class="[
                'px-4 py-1.5 rounded-lg border font-sans text-[0.8125rem] font-semibold cursor-pointer transition-colors',
                delaySec === s
                  ? 'border-rose-600 bg-rose-50 text-rose-600'
                  : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100',
              ]"
              @click="delaySec = s"
            >
              {{ s }}с
            </button>
          </div>
          <Input v-model.number="delaySec" type="number" hint="От 1 до 600 секунд" />
        </div>
      </template>

      <template v-else-if="stepType === 'page'">
        <div>
          <div :class="eyebrow">1 · Страница</div>
          <p
            class="font-sans text-[0.8125rem] text-zinc-500 border border-dashed border-zinc-200 rounded-xl px-4 py-5 text-center"
          >
            Раскладку страницы вы соберёте в конструкторе после добавления шага. Блоки ввода
            станут выходами шага — их значения доступны следующим шагам, блоки отображения
            показывают данные пройденных шагов.
          </p>
        </div>
      </template>

      <template v-else>
        <div>
          <div :class="eyebrow">1 · Загрузка файла</div>
          <p
            class="font-sans text-[0.8125rem] text-zinc-500 border border-dashed border-zinc-200 rounded-xl px-4 py-5 text-center"
          >
            Режим определяется автоматически по размеру: до 10 МБ — одним запросом, больше —
            по частям.
          </p>
        </div>
      </template>

      <div>
        <div :class="eyebrow">{{ needsEndpoint ? 3 : 2 }} · Название шага</div>
        <Input v-model="title" placeholder="Например: Поиск компании" />
      </div>
    </div>

    <template #footer>
      <Button variant="ghost" @click="emit('close')">Отмена</Button>
      <Button :variant="canAdd ? 'dark' : 'primary'" :disabled="!canAdd" @click="add">
        Добавить шаг
      </Button>
    </template>
  </Modal>
</template>
