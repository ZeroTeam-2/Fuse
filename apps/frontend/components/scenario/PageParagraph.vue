<script setup lang="ts">
// Inline-редактируемый абзац страницы. Текст засевается в DOM один раз на
// монтировании и ре-синхронизируется из модели, только пока поле НЕ в фокусе, —
// иначе каретка прыгает и текст теряется при каждом вводе.
const props = defineProps<{ text?: string }>();
const emit = defineEmits<{ patch: [text: string]; editing: [value: boolean] }>();

const el = ref<HTMLParagraphElement | null>(null);

onMounted(() => {
  if (el.value) el.value.textContent = props.text ?? "";
});

watch(
  () => props.text,
  (text) => {
    if (
      el.value &&
      document.activeElement !== el.value &&
      el.value.textContent !== (text ?? "")
    ) {
      el.value.textContent = text ?? "";
    }
  },
);
</script>

<template>
  <p
    ref="el"
    contenteditable
    data-placeholder="Введите текст…"
    class="m-0 outline-none cursor-text font-sans text-[0.9375rem] text-zinc-600 leading-relaxed min-h-[1.4em] empty:before:content-[attr(data-placeholder)] empty:before:text-zinc-300"
    @mousedown.stop
    @focus="emit('editing', true)"
    @blur="emit('editing', false); emit('patch', ($event.target as HTMLElement).textContent || '')"
    @input="emit('patch', ($event.target as HTMLElement).textContent || '')"
  />
</template>
