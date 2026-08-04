<script setup lang="ts">
// Scenario editor «Авторизация» tab — one card per provider (appId) used by
// api/periodic steps. Header field defaults from the app's OpenAPI auth hint,
// falls back to Authorization/X-Api-Key/custom. Saved explicitly, per card.
import { computed, ref } from "vue";
import type { AppAuthHint, ScenarioAuthEntry } from "@fuse/shared";

const props = defineProps<{
  appId: string;
  providerName: string;
  hint?: AppAuthHint;
  entry?: ScenarioAuthEntry;
}>();

const emit = defineEmits<{ save: [entry: ScenarioAuthEntry] }>();

const FIELD_OPTIONS = [
  { value: "Authorization", label: "Authorization" },
  { value: "X-Api-Key", label: "X-Api-Key" },
  { value: "__custom", label: "Свой вариант" },
];

const FORMAT_OPTIONS = [
  { value: "bearer", label: "Bearer <значение>" },
  { value: "raw", label: "Как есть (без префикса)" },
];

function fieldFor(headerName: string): string {
  return FIELD_OPTIONS.some((o) => o.value === headerName) ? headerName : "__custom";
}

const initialHeaderName = props.entry?.headerName ?? props.hint?.headerName ?? "Authorization";

// Дефолт формата разумен (по hint'у схемы или по имени заголовка), но не
// единственный вариант: некоторые API шлют "Authorization: Token <key>" —
// заголовок Authorization, но без слова Bearer. Формат — отдельный контрол,
// не выводится из имени заголовка после первого выбора.
function defaultFormat(headerName: string): "bearer" | "raw" {
  if (props.hint && props.hint.headerName === headerName) return props.hint.valueFormat;
  return headerName === "Authorization" ? "bearer" : "raw";
}

const field = ref(fieldFor(initialHeaderName));
const custom = ref(field.value === "__custom" ? initialHeaderName : "");
const value = ref(props.entry?.value ?? "");

const headerName = computed(() => (field.value === "__custom" ? custom.value.trim() : field.value));

const format = ref<"bearer" | "raw">(props.entry?.valueFormat ?? defaultFormat(initialHeaderName));
const valueFormat = computed(() => format.value);

const dirty = computed(
  () =>
    !props.entry ||
    props.entry.headerName !== headerName.value ||
    props.entry.valueFormat !== format.value ||
    (props.entry.value ?? "") !== value.value,
);

const canSave = computed(
  () => dirty.value && !!value.value.trim() && (field.value !== "__custom" || !!custom.value.trim()),
);

function save() {
  if (!canSave.value) return;
  emit("save", {
    appId: props.appId,
    headerName: headerName.value,
    valueFormat: valueFormat.value,
    value: value.value,
  });
}
</script>

<template>
  <div class="border border-zinc-200 rounded-2xl p-5">
    <div class="flex items-center gap-3.5 mb-5">
      <span
        class="w-10 h-10 rounded-xl shrink-0 inline-flex items-center justify-center font-sans font-bold text-white text-base"
        style="background: #6366f1"
        >{{ providerName.charAt(0).toUpperCase() }}</span
      >
      <div class="min-w-0 flex-1">
        <div class="font-sans text-[0.9375rem] font-bold text-zinc-900 truncate">
          {{ providerName }}
        </div>
        <div class="font-sans text-[0.8125rem] text-zinc-500">
          {{ hint?.schemeLabel ?? "API Key" }}
        </div>
      </div>
      <span
        v-if="entry && !dirty"
        class="inline-flex items-center gap-1.5 font-sans text-[0.6875rem] font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-600"
      >
        <Icon name="check" :size="13" />
        Сохранено
      </span>
    </div>

    <div class="mb-4">
      <div class="font-sans text-[0.8125rem] font-semibold text-zinc-900 mb-2">Поле для ключа</div>
      <div class="flex gap-2.5 items-start">
        <div class="w-[220px] shrink-0">
          <Select v-model="field" :options="FIELD_OPTIONS" />
        </div>
        <div v-if="field === '__custom'" class="flex-1 min-w-0">
          <Input v-model="custom" mono placeholder="Название заголовка" />
        </div>
      </div>
    </div>

    <div class="mb-4">
      <div class="font-sans text-[0.8125rem] font-semibold text-zinc-900 mb-2">Формат значения</div>
      <div class="w-[220px]">
        <Select v-model="format" :options="FORMAT_OPTIONS" />
      </div>
    </div>

    <div>
      <div class="font-sans text-[0.8125rem] font-semibold text-zinc-900 mb-2">Значение ключа</div>
      <SecretField v-model="value" placeholder="Вставьте ключ / токен" />
      <div class="font-sans text-[0.75rem] text-zinc-400 mt-2">
        Передаётся как
        <code class="font-mono text-zinc-500"
          >{{ headerName || "…" }}: {{ format === "bearer" ? "Bearer " : "" }}•••</code
        >
        при каждом вызове {{ providerName }}.
      </div>
    </div>

    <div class="flex items-center justify-end mt-5">
      <Button :variant="canSave ? 'dark' : 'primary'" size="sm" :disabled="!canSave" @click="save">
        Сохранить
      </Button>
    </div>
  </div>
</template>
