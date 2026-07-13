<script setup lang="ts">
// Page editor: the screen a user sees before a step runs — a field form, a file
// dropzone, or a text block. Form on the left, live preview on the right.
import type { PageField, Step, StepPage, StepSchema } from "@fuse/shared";

const props = defineProps<{ step: Step; stepSchema?: StepSchema }>();

const emit = defineEmits<{ save: [page: StepPage]; close: [] }>();

/**
 * К чему поле страницы может быть привязано: ручные значения ЭТОГО шага —
 * сами параметры и операнды условий фильтрации. Раньше связь держалась на
 * совпадении ключа поля с ключом параметра, а ключ выводился из подписи, так
 * что связать «ИНН организации» с `inn` было нельзя вообще.
 */
const targetOptions = computed(() => {
  const inputs = props.stepSchema?.inputs ?? [];
  const options = [{ value: "", label: "Не привязано" }];

  for (const [key, source] of Object.entries(props.step.mappings ?? {})) {
    if (source !== "user") continue;
    const field = inputs.find((f) => f.key === key);
    options.push({ value: key, label: field?.label || key });
  }

  for (const [key, filter] of Object.entries(props.step.filters ?? {})) {
    if (filter.value?.mode !== "user") continue;
    options.push({
      value: `filter:${key}`,
      label: `Условие отбора: ${filter.field}`,
    });
  }

  return options;
});

const PAGE_TYPES = [
  { value: "fields", label: "Ввод полей" },
  { value: "file", label: "Загрузка файла" },
  { value: "text", label: "Отображение текста" },
];

const page = reactive<StepPage>(
  props.step.page
    ? (JSON.parse(JSON.stringify(props.step.page)) as StepPage)
    : { type: "fields", title: props.step.title, hint: "", fields: [], buttonText: "Продолжить" },
);

const pageType = computed({
  get: () => page.type as string,
  set: (type: string) => switchType(type as StepPage["type"]),
});

function switchType(type: StepPage["type"]) {
  if (page.type === type) return;
  const title = page.title;
  const next: StepPage =
    type === "fields"
      ? { type: "fields", title, hint: "", fields: [], buttonText: "Продолжить" }
      : type === "file"
        ? { type: "file", title, hint: "", accept: "", maxMb: 10, buttonText: "Загрузить" }
        : { type: "text", title, body: "" };
  Object.assign(page, next);
}

function addField() {
  if (page.type !== "fields") return;
  page.fields.push({
    key: `field_${page.fields.length + 1}`,
    label: "",
    placeholder: "",
    required: false,
    target: "",
  });
}

function removeField(idx: number) {
  if (page.type !== "fields") return;
  page.fields.splice(idx, 1);
}

function syncFieldKey(field: PageField, idx: number) {
  field.key = field.label
    ? field.label
        .toLowerCase()
        .replace(/[^a-zа-я0-9]+/gi, "_")
        .replace(/^_|_$/g, "") || `field_${idx + 1}`
    : `field_${idx + 1}`;
}

const canSave = computed(() => {
  if (!page.title?.trim()) return false;
  if (page.type === "fields") return !!page.buttonText?.trim();
  if (page.type === "file") return !!page.maxMb && page.maxMb > 0;
  if (page.type === "text") return !!page.body?.trim();
  return true;
});

function save() {
  if (!canSave.value) return;
  emit("save", JSON.parse(JSON.stringify(page)) as StepPage);
}
</script>

<template>
  <Modal
    title="Страница шага"
    subtitle="Экран, который пользователь увидит перед этим шагом"
    :width="960"
    @close="emit('close')"
  >
    <div class="grid grid-cols-1 md:grid-cols-[1fr_340px] gap-6 pb-2">
      <!-- Форма -->
      <div class="flex flex-col gap-5">
        <SegmentedControl v-model="pageType" :options="PAGE_TYPES" />

        <Input v-model="page.title" label="Заголовок" placeholder="Заголовок страницы" />

        <template v-if="page.type === 'fields'">
          <Input v-model="page.hint" label="Подсказка" placeholder="Дополнительная подсказка" />

          <div class="flex flex-col gap-2.5">
            <div class="flex items-center justify-between">
              <span class="text-[0.8125rem] font-sans font-semibold text-zinc-900">Поля формы</span>
              <Button variant="tint" size="sm" @click="addField">
                <template #left><Icon name="plus" :size="15" /></template>
                Добавить поле
              </Button>
            </div>

            <div
              v-if="!page.fields.length"
              class="font-sans text-[0.8125rem] text-zinc-400 border border-dashed border-zinc-200 rounded-xl px-4 py-5 text-center"
            >
              Нет полей — добавьте хотя бы одно.
            </div>

            <div
              v-for="(field, idx) in page.fields"
              :key="idx"
              class="border border-zinc-200 rounded-xl p-3.5 flex flex-col gap-3"
            >
              <div class="flex items-center gap-2.5">
                <div class="flex-1 min-w-0">
                  <Input
                    v-model="field.label"
                    placeholder="Название поля"
                    @update:model-value="syncFieldKey(field, idx)"
                  />
                </div>
                <IconButton variant="outline" label="Удалить поле" :size="34" @click="removeField(idx)">
                  <Icon name="x" :size="15" />
                </IconButton>
              </div>
              <Input v-model="field.placeholder" placeholder="Плейсхолдер" />

              <Select
                v-model="field.target"
                label="Заполняет"
                :options="targetOptions"
                placeholder="Не привязано"
              />
              <p v-if="targetOptions.length === 1" class="font-sans text-[0.75rem] text-zinc-400">
                У шага нет значений с источником «Ручной ввод» — привязывать поле не к чему.
              </p>

              <div class="flex items-center justify-end">
                <label
                  class="inline-flex items-center gap-2 font-sans text-[0.8125rem] text-zinc-600 cursor-pointer"
                >
                  <input
                    v-model="field.required"
                    type="checkbox"
                    class="w-4 h-4 accent-rose-600 cursor-pointer"
                  />
                  Обязательное
                </label>
              </div>
            </div>
          </div>

          <Input v-model="page.buttonText" label="Текст кнопки" placeholder="Продолжить" />
        </template>

        <template v-else-if="page.type === 'file'">
          <Input v-model="page.hint" label="Подсказка" placeholder="Дополнительная подсказка" />
          <Input v-model="page.accept" label="Допустимые форматы" placeholder=".pdf,.jpg,.png" mono />
          <Input v-model.number="page.maxMb" label="Максимальный размер, МБ" type="number" />
          <Input v-model="page.buttonText" label="Текст кнопки" placeholder="Загрузить" />
        </template>

        <template v-else>
          <div class="flex flex-col gap-2">
            <label for="page-body" class="text-[0.8125rem] font-sans font-semibold text-zinc-900">
              Содержимое
            </label>
            <textarea
              id="page-body"
              v-model="page.body"
              rows="10"
              placeholder="Текст, который увидит пользователь"
              class="w-full px-3.5 py-3 font-sans text-[0.9375rem] text-zinc-900 bg-white border border-zinc-200 rounded-xl outline-none transition resize-y placeholder:text-zinc-400 focus:border-rose-600 focus:ring-4 focus:ring-rose-600/20"
            />
          </div>
        </template>
      </div>

      <!-- Превью -->
      <div class="flex flex-col gap-2.5">
        <div
          class="font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-zinc-400"
        >
          Как увидит пользователь
        </div>
        <div class="bg-zinc-50 border border-zinc-200 rounded-2xl p-4">
          <Card padding="lg" class="flex flex-col gap-4">
            <div>
              <div class="font-sans text-[1.0625rem] font-bold text-zinc-900">
                {{ page.title || "Заголовок" }}
              </div>
              <p
                v-if="page.type !== 'text' && page.hint"
                class="font-sans text-[0.8125rem] text-zinc-500 mt-1"
              >
                {{ page.hint }}
              </p>
            </div>

            <template v-if="page.type === 'fields'">
              <div v-if="page.fields.length" class="flex flex-col gap-3">
                <div v-for="(field, idx) in page.fields" :key="idx" class="flex flex-col gap-1.5">
                  <span class="font-sans text-[0.8125rem] font-semibold text-zinc-900">
                    {{ field.label || "Поле" }}
                    <span v-if="field.required" class="text-rose-600">*</span>
                  </span>
                  <div
                    class="px-3.5 py-2.5 border border-zinc-200 rounded-xl font-sans text-[0.875rem] text-zinc-400 truncate"
                  >
                    {{ field.placeholder || "Введите значение" }}
                  </div>
                </div>
              </div>
              <Button variant="primary" size="sm" disabled>
                {{ page.buttonText || "Продолжить" }}
              </Button>
            </template>

            <template v-else-if="page.type === 'file'">
              <div
                class="flex flex-col items-center gap-2 border-2 border-dashed border-zinc-300 rounded-xl px-4 py-8 bg-zinc-50"
              >
                <span class="inline-flex text-zinc-400"><Icon name="upload-cloud" :size="24" /></span>
                <span class="font-sans text-[0.8125rem] text-zinc-600">Перетащите файл сюда</span>
                <span v-if="page.accept" class="font-mono text-[0.6875rem] text-zinc-400">
                  {{ page.accept }}
                </span>
                <span v-if="page.maxMb" class="font-sans text-[0.75rem] text-zinc-400">
                  до {{ page.maxMb }} МБ
                </span>
              </div>
              <Button variant="primary" size="sm" disabled>
                {{ page.buttonText || "Загрузить" }}
              </Button>
            </template>

            <template v-else>
              <p class="font-sans text-[0.875rem] text-zinc-600 leading-relaxed whitespace-pre-wrap">
                {{ page.body || "Текст страницы…" }}
              </p>
            </template>
          </Card>
        </div>
      </div>
    </div>

    <template #footer>
      <Button variant="ghost" @click="emit('close')">Отмена</Button>
      <Button :variant="canSave ? 'dark' : 'primary'" :disabled="!canSave" @click="save">
        Сохранить
      </Button>
    </template>
  </Modal>
</template>
