<template>
  <div class="editor-overlay" @click.self="$emit('close')">
    <div class="editor-modal">
      <div class="editor-header">
        <h2 class="editor-title">Страница шага</h2>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="editor-body">
        <div class="form-side">
          <div class="type-tabs">
            <button
              v-for="t in pageTypes"
              :key="t.value"
              :class="['type-tab', { active: page.type === t.value }]"
              @click="switchType(t.value)"
            >
              {{ t.label }}
            </button>
          </div>

          <div class="form-fields">
            <div class="field-group">
              <label class="field-label">Заголовок</label>
              <input v-model="page.title" type="text" class="text-input" placeholder="Заголовок страницы" />
            </div>

            <template v-if="page.type === 'fields'">
              <div class="field-group">
                <label class="field-label">Подсказка</label>
                <input v-model="page.hint" type="text" class="text-input" placeholder="Дополнительная подсказка" />
              </div>

              <div class="field-group">
                <div class="field-header">
                  <label class="field-label">Поля формы</label>
                  <button class="add-field-btn" @click="addField">+ Добавить поле</button>
                </div>
                <div v-if="page.fields.length === 0" class="empty-fields">
                  Нет полей. Добавьте хотя бы одно.
                </div>
                <div v-for="(field, idx) in page.fields" :key="idx" class="field-row">
                  <input v-model="field.label" type="text" class="field-input" placeholder="Название поля" @input="syncFieldKey(idx)" />
                  <input v-model="field.placeholder" type="text" class="field-input-sm" placeholder="Плейсхолдер" />
                  <label class="required-check">
                    <input v-model="field.required" type="checkbox" />
                    <span>Обяз.</span>
                  </label>
                  <button class="remove-field-btn" @click="removeField(idx)">✕</button>
                </div>
              </div>

              <div class="field-group">
                <label class="field-label">Текст кнопки</label>
                <input v-model="page.buttonText" type="text" class="text-input" placeholder="Продолжить" />
              </div>
            </template>

            <template v-if="page.type === 'file'">
              <div class="field-group">
                <label class="field-label">Подсказка</label>
                <input v-model="page.hint" type="text" class="text-input" placeholder="Дополнительная подсказка" />
              </div>

              <div class="field-group">
                <label class="field-label">Допустимые форматы</label>
                <input v-model="page.accept" type="text" class="text-input" placeholder=".pdf,.jpg,.png" />
              </div>

              <div class="field-group">
                <label class="field-label">Максимальный размер (МБ)</label>
                <input v-model.number="page.maxMb" type="number" min="1" max="1024" class="text-input" />
              </div>

              <div class="field-group">
                <label class="field-label">Текст кнопки</label>
                <input v-model="page.buttonText" type="text" class="text-input" placeholder="Загрузить" />
              </div>
            </template>

            <template v-if="page.type === 'text'">
              <div class="field-group">
                <label class="field-label">Содержимое</label>
                <textarea v-model="page.body" class="body-textarea" placeholder="Текст, который увидит пользователь" rows="8"></textarea>
              </div>
            </template>
          </div>
        </div>

        <div class="preview-side">
          <div class="preview-header">Как увидит пользователь</div>
          <div class="preview-content">
            <div class="preview-card">
              <h3 class="preview-title">{{ page.title || 'Заголовок' }}</h3>

              <template v-if="page.type === 'fields'">
                <p v-if="page.hint" class="preview-hint">{{ page.hint }}</p>
                <div class="preview-fields">
                  <div v-for="(field, idx) in page.fields" :key="idx" class="preview-field">
                    <label class="preview-field-label">
                      {{ field.label || 'Поле' }}
                      <span v-if="field.required" class="req">*</span>
                    </label>
                    <div class="preview-input-placeholder">{{ field.placeholder || 'Введите значение' }}</div>
                  </div>
                </div>
                <button class="preview-btn">{{ page.buttonText || 'Продолжить' }}</button>
              </template>

              <template v-if="page.type === 'file'">
                <p v-if="page.hint" class="preview-hint">{{ page.hint }}</p>
                <div class="preview-dropzone">
                  <span class="dropzone-icon">📎</span>
                  <span class="dropzone-text">Перетащите файл сюда</span>
                  <span v-if="page.maxMb" class="dropzone-limit">до {{ page.maxMb }} МБ</span>
                </div>
                <button class="preview-btn">{{ page.buttonText || 'Загрузить' }}</button>
              </template>

              <template v-if="page.type === 'text'">
                <div class="preview-text-body">{{ page.body || 'Текст страницы...' }}</div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <div class="editor-footer">
        <button class="cancel-btn" @click="$emit('close')">Отмена</button>
        <button class="save-btn" :disabled="!canSave" @click="save">Сохранить</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Step, StepPage, PageField } from "@fuse/shared";

const props = defineProps<{
  step: Step;
  scenarioId: string;
}>();

const emit = defineEmits<{
  close: [];
  save: [page: StepPage];
}>();

const pageTypes = [
  { value: "fields" as const, label: "Ввод полей" },
  { value: "file" as const, label: "Загрузка файла" },
  { value: "text" as const, label: "Отображение текста" },
];

const page = reactive<StepPage>(
  props.step.page
    ? JSON.parse(JSON.stringify(props.step.page))
    : { type: "fields", title: props.step.title, hint: "", fields: [], buttonText: "Продолжить" },
) as StepPage;

function switchType(type: StepPage["type"]) {
  if (page.type === type) return;

  const preservedTitle = page.title;

  let newPage: StepPage;
  if (type === "fields") {
    newPage = { type: "fields", title: preservedTitle, hint: "", fields: [], buttonText: "Продолжить" };
  } else if (type === "file") {
    newPage = { type: "file", title: preservedTitle, hint: "", accept: "", maxMb: 10, buttonText: "Загрузить" };
  } else {
    newPage = { type: "text", title: preservedTitle, body: "" };
  }

  Object.assign(page, newPage);
}

function addField() {
  if (page.type === "fields") {
    const field: PageField = {
      key: `field_${page.fields.length + 1}`,
      label: "",
      placeholder: "",
      required: false,
    };
    page.fields.push(field);
  }
}

function removeField(idx: number) {
  if (page.type === "fields") {
    page.fields.splice(idx, 1);
  }
}

function syncFieldKey(idx: number) {
  if (page.type === "fields") {
    const field = page.fields[idx];
    field.key = field.label
      ? field.label.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "_").replace(/^_|_$/g, "") || `field_${idx + 1}`
      : `field_${idx + 1}`;
  }
}

const canSave = computed(() => {
  if (!page.title) return false;
  if (page.type === "fields") return !!page.buttonText;
  if (page.type === "file") return !!page.maxMb && page.maxMb > 0;
  if (page.type === "text") return !!page.body && page.body.trim() !== "";
  return true;
});

function save() {
  emit("save", JSON.parse(JSON.stringify(page)) as StepPage);
}
</script>

<style scoped>
.editor-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 200; }
.editor-modal { background: #fff; border-radius: 14px; width: 960px; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column; }
.editor-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #f4f4f5; }
.editor-title { font-size: 18px; font-weight: 700; color: #18181b; margin: 0; }
.close-btn { width: 28px; height: 28px; border: none; background: #f4f4f5; border-radius: 8px; cursor: pointer; font-size: 14px; color: #52525b; }
.editor-body { flex: 1; overflow-y: auto; display: grid; grid-template-columns: 1fr 360px; }
.form-side { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
.type-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.type-tab { padding: 6px 14px; border-radius: 8px; border: 1px solid #e4e4e7; background: #fff; font-size: 13px; font-weight: 500; color: #52525b; cursor: pointer; }
.type-tab.active { background: #6366f1; color: #fff; border-color: #6366f1; }
.form-fields { display: flex; flex-direction: column; gap: 16px; }
.field-group { display: flex; flex-direction: column; gap: 6px; }
.field-header { display: flex; justify-content: space-between; align-items: center; }
.field-label { font-size: 13px; font-weight: 500; color: #52525b; }
.text-input { padding: 10px 12px; border: 1px solid #e4e4e7; border-radius: 8px; font-size: 14px; color: #18181b; }
.body-textarea { padding: 10px 12px; border: 1px solid #e4e4e7; border-radius: 8px; font-size: 14px; color: #18181b; resize: vertical; font-family: inherit; }
.add-field-btn { font-size: 12px; font-weight: 600; color: #6366f1; background: #eef2ff; border: none; padding: 4px 10px; border-radius: 6px; cursor: pointer; }
.empty-fields { font-size: 13px; color: #a1a1aa; padding: 12px; border: 2px dashed #e4e4e7; border-radius: 8px; text-align: center; }
.field-row { display: flex; align-items: center; gap: 8px; }
.field-input { flex: 1; padding: 8px 10px; border: 1px solid #e4e4e7; border-radius: 6px; font-size: 13px; color: #18181b; }
.field-input-sm { width: 120px; padding: 8px 10px; border: 1px solid #e4e4e7; border-radius: 6px; font-size: 13px; color: #18181b; }
.required-check { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #52525b; white-space: nowrap; }
.remove-field-btn { width: 28px; height: 28px; border: 1px solid #fecaca; border-radius: 6px; background: #fff; cursor: pointer; font-size: 12px; color: #e11d48; }
.preview-side { border-left: 1px solid #f4f4f5; display: flex; flex-direction: column; }
.preview-header { padding: 12px 20px; font-size: 13px; font-weight: 600; color: #71717a; border-bottom: 1px solid #f4f4f5; }
.preview-content { flex: 1; padding: 20px; overflow-y: auto; background: #fafafa; }
.preview-card { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.preview-title { font-size: 17px; font-weight: 700; color: #18181b; margin: 0; }
.preview-hint { font-size: 14px; color: #71717a; margin: 0; }
.preview-fields { display: flex; flex-direction: column; gap: 12px; }
.preview-field { display: flex; flex-direction: column; gap: 4px; }
.preview-field-label { font-size: 13px; font-weight: 500; color: #18181b; }
.req { color: #e11d48; }
.preview-input-placeholder { padding: 9px 12px; border: 1px solid #e4e4e7; border-radius: 8px; font-size: 14px; color: #a1a1aa; }
.preview-btn { padding: 10px 20px; border-radius: 8px; border: none; background: #6366f1; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; align-self: flex-start; }
.preview-dropzone { border: 2px dashed #d4d4d8; border-radius: 12px; padding: 32px 16px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.dropzone-icon { font-size: 28px; }
.dropzone-text { font-size: 14px; color: #52525b; }
.dropzone-limit { font-size: 12px; color: #a1a1aa; }
.preview-text-body { font-size: 14px; color: #3f3f46; line-height: 1.6; white-space: pre-wrap; }
.editor-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px; border-top: 1px solid #f4f4f5; }
.cancel-btn { padding: 8px 16px; border-radius: 8px; border: 1px solid #e4e4e7; background: #fff; font-size: 14px; color: #52525b; cursor: pointer; }
.save-btn { padding: 8px 16px; border-radius: 8px; border: none; background: #6366f1; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
.save-btn:disabled { opacity: 0.4; }
</style>
