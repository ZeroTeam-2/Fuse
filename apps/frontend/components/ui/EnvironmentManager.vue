<script setup lang="ts">
// Fuse EnvironmentManager — "Управление окружением" modal. Left column lists the
// app's environments (+ create); the right pane shows the selected environment's
// Base URL as a Module→Base URL table and a Variables section (empty for now —
// the variable set today holds only baseUrl, surfaced in the Base URL table).
import { computed, ref, watch } from "vue";
import type { App, Environment } from "@fuse/shared";

const props = defineProps<{
  appId: string;
  environments: Environment[];
  fallbackBaseUrl?: string;
}>();

const emit = defineEmits<{ updated: [app: App]; close: [] }>();

const { $api } = useNuxtApp() as any;

const eyebrow =
  "font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-zinc-400";

const selectedId = ref<string>("");
const creating = ref(false);
const saving = ref(false);
const error = ref("");

const draftName = ref("");
const draftBaseUrl = ref("");
const editBaseUrl = ref("");

function baseUrlOf(env: Environment): string {
  return env.variables.find((v) => v.key === "baseUrl")?.value ?? "";
}

function avatarOf(name: string): string {
  return name.slice(0, 2).toLowerCase();
}

const selected = computed<Environment | null>(
  () => props.environments.find((e) => e.id === selectedId.value) ?? null,
);

const baseUrlDirty = computed(
  () => !!selected.value && editBaseUrl.value.trim() !== baseUrlOf(selected.value),
);

// Keep the selection valid and the editable Base URL in sync with it.
watch(
  [() => props.environments, selectedId],
  () => {
    if (!props.environments.length) {
      selectedId.value = "";
      return;
    }
    if (!props.environments.some((e) => e.id === selectedId.value)) {
      selectedId.value =
        props.environments.find((e) => e.name === "Prod")?.id ??
        props.environments[0].id;
    }
    if (selected.value) editBaseUrl.value = baseUrlOf(selected.value);
  },
  { immediate: true },
);

function selectEnv(id: string) {
  creating.value = false;
  error.value = "";
  selectedId.value = id;
}

function startCreate() {
  creating.value = true;
  error.value = "";
  draftName.value = "";
  draftBaseUrl.value = "";
}

function cancelCreate() {
  creating.value = false;
  error.value = "";
}

async function createEnv() {
  saving.value = true;
  error.value = "";
  try {
    const { data, error: apiError } = await $api.POST(
      `/api/apps/${props.appId}/environments`,
      { body: { name: draftName.value.trim(), baseUrl: draftBaseUrl.value.trim() } },
    );
    if (apiError || !data) {
      error.value = apiError?.message ?? "Не удалось добавить окружение";
      return;
    }
    emit("updated", data);
    const created = (data.environments ?? []).find(
      (e: Environment) => e.name === draftName.value.trim(),
    );
    if (created) selectedId.value = created.id;
    creating.value = false;
  } finally {
    saving.value = false;
  }
}

async function saveBaseUrl() {
  if (!selected.value) return;
  saving.value = true;
  error.value = "";
  try {
    const { data, error: apiError } = await $api.PATCH(
      `/api/apps/${props.appId}/environments/${selected.value.id}`,
      { body: { baseUrl: editBaseUrl.value.trim() } },
    );
    if (apiError || !data) {
      error.value = apiError?.message ?? "Не удалось сохранить Base URL";
      return;
    }
    emit("updated", data);
  } finally {
    saving.value = false;
  }
}

async function deleteEnv() {
  if (!selected.value || selected.value.name === "Prod") return;
  saving.value = true;
  error.value = "";
  try {
    const { data, error: apiError } = await $api.DELETE(
      `/api/apps/${props.appId}/environments/${selected.value.id}`,
      {},
    );
    if (apiError || !data) {
      error.value = apiError?.message ?? "Не удалось удалить окружение";
      return;
    }
    emit("updated", data);
    selectedId.value =
      (data.environments ?? []).find((e: Environment) => e.name === "Prod")?.id ?? "";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal title="Управление окружением" :width="1000" @close="emit('close')">
    <div class="grid grid-cols-1 md:grid-cols-[248px_1fr] gap-6 min-h-[460px]">
      <!-- Sidebar -->
      <aside class="flex flex-col gap-5 md:border-r md:border-zinc-100 md:pr-5">
        <div>
          <div :class="eyebrow">Окружения</div>
          <div class="flex flex-col gap-1 mt-2.5">
            <button
              v-for="env in environments"
              :key="env.id"
              type="button"
              :class="[
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors',
                !creating && selectedId === env.id ? 'bg-zinc-100' : 'hover:bg-zinc-50',
              ]"
              @click="selectEnv(env.id)"
            >
              <span
                class="w-7 h-7 rounded-lg inline-flex items-center justify-center font-mono text-[0.6875rem] font-bold text-white shrink-0"
                :style="{ background: '#6366f1' }"
                >{{ avatarOf(env.name) }}</span
              >
              <span class="font-sans text-[0.9375rem] font-semibold text-zinc-800 min-w-0 truncate">
                {{ env.name }}
              </span>
            </button>
          </div>
        </div>

        <button
          type="button"
          :class="[
            'flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors',
            creating ? 'bg-zinc-100 text-zinc-800' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700',
          ]"
          @click="startCreate"
        >
          <Icon name="plus" :size="16" />
          <span class="font-sans text-[0.875rem] font-semibold">Новое окружение</span>
        </button>
      </aside>

      <!-- Detail -->
      <section class="flex flex-col gap-6 min-w-0">
        <!-- Create -->
        <template v-if="creating">
          <div :class="eyebrow">Новое окружение</div>
          <div class="flex flex-col gap-4 max-w-[560px]">
            <Input v-model="draftName" label="Название" placeholder="Staging" />
            <Input
              v-model="draftBaseUrl"
              label="Base URL"
              type="url"
              mono
              placeholder="https://staging.api.example.com"
            />
            <p
              v-if="error"
              class="font-sans text-[0.8125rem] text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5"
            >
              {{ error }}
            </p>
            <div class="flex gap-2.5">
              <Button
                variant="primary"
                :disabled="saving || !draftName.trim() || !draftBaseUrl.trim()"
                @click="createEnv"
              >
                Создать
              </Button>
              <Button variant="ghost" :disabled="saving" @click="cancelCreate">Отмена</Button>
            </div>
          </div>
        </template>

        <!-- Selected environment -->
        <template v-else-if="selected">
          <div class="flex items-center gap-3">
            <span
              class="w-9 h-9 rounded-lg inline-flex items-center justify-center font-mono text-[0.8125rem] font-bold text-white shrink-0"
              :style="{ background: '#6366f1' }"
              >{{ avatarOf(selected.name) }}</span
            >
            <h3 class="font-sans font-bold text-[1.25rem] tracking-tight text-zinc-900 min-w-0 truncate">
              {{ baseUrlOf(selected) || selected.name }}
            </h3>
            <Button
              v-if="selected.name !== 'Prod'"
              variant="danger"
              class="ml-auto shrink-0"
              :disabled="saving"
              @click="deleteEnv"
            >
              <template #left><Icon name="trash-2" :size="16" /></template>
              Удалить
            </Button>
          </div>

          <!-- Base URL -->
          <div class="max-w-[560px]">
            <Input
              v-model="editBaseUrl"
              label="Base URL"
              type="url"
              mono
              placeholder="https://api.example.com"
              @keydown.enter="saveBaseUrl"
            />

            <p
              v-if="error"
              class="font-sans text-[0.8125rem] text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 mt-2.5"
            >
              {{ error }}
            </p>

            <div class="flex justify-end mt-3">
              <Button variant="dark" :disabled="saving || !baseUrlDirty" @click="saveBaseUrl">
                {{ saving ? "Сохранение…" : "Сохранить" }}
              </Button>
            </div>
          </div>

          <!-- Variables -->
          <div>
            <div :class="[eyebrow, 'mb-2.5']">Переменные</div>
            <div
              class="border border-dashed border-zinc-200 rounded-xl px-6 py-12 flex flex-col items-center gap-3 text-center"
            >
              <span
                class="w-11 h-11 rounded-2xl bg-zinc-100 text-zinc-400 inline-flex items-center justify-center"
              >
                <Icon name="braces" :size="20" />
              </span>
              <div class="font-sans text-[0.875rem] text-zinc-400">Нет переменных</div>
            </div>
          </div>
        </template>

        <div
          v-else
          class="flex-1 flex items-center justify-center font-sans text-sm text-zinc-400"
        >
          Выберите окружение слева
        </div>
      </section>
    </div>
  </Modal>
</template>
