<script setup lang="ts">
// Fuse RichTextEditor — Tiptap-based rich text field for longer copy (e.g.
// scenario descriptions). Two-way binding via v-model with HTML content.
import { computed, onBeforeUnmount, watch } from "vue";
import Placeholder from "@tiptap/extension-placeholder";

const props = withDefaults(
  defineProps<{
    placeholder?: string;
    id?: string;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const model = defineModel<string>({ default: "" });

const editor = useEditor({
  content: model.value,
  editable: !props.disabled,
  editorProps: {
    attributes: props.id ? { id: props.id } : {},
  },
  extensions: [
    TiptapStarterKit.configure({
      heading: { levels: [2, 3] },
    }),
    Placeholder.configure({
      placeholder: props.placeholder ?? "",
    }),
  ],
  onUpdate: ({ editor: e }) => {
    model.value = e.isEmpty ? "" : e.getHTML();
  },
});

watch(model, (value) => {
  const current = editor.value;
  if (!current) return;
  const incoming = value ?? "";
  const currentHtml = current.isEmpty ? "" : current.getHTML();
  if (incoming === currentHtml) return;
  current.commands.setContent(incoming, { emitUpdate: false });
});

watch(
  () => props.disabled,
  (disabled) => editor.value?.setEditable(!disabled),
);

onBeforeUnmount(() => editor.value?.destroy());

interface ToolbarAction {
  label: string;
  icon: string;
  isActive: () => boolean;
  run: () => void;
}

const toolbar = computed<ToolbarAction[][]>(() => {
  const e = editor.value;
  if (!e) return [];
  return [
    [
      {
        label: "Заголовок",
        icon: "heading-2",
        isActive: () => e.isActive("heading", { level: 2 }),
        run: () => e.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        label: "Подзаголовок",
        icon: "heading-3",
        isActive: () => e.isActive("heading", { level: 3 }),
        run: () => e.chain().focus().toggleHeading({ level: 3 }).run(),
      },
    ],
    [
      {
        label: "Полужирный",
        icon: "bold",
        isActive: () => e.isActive("bold"),
        run: () => e.chain().focus().toggleBold().run(),
      },
      {
        label: "Курсив",
        icon: "italic",
        isActive: () => e.isActive("italic"),
        run: () => e.chain().focus().toggleItalic().run(),
      },
      {
        label: "Зачёркнутый",
        icon: "strikethrough",
        isActive: () => e.isActive("strike"),
        run: () => e.chain().focus().toggleStrike().run(),
      },
    ],
    [
      {
        label: "Маркированный список",
        icon: "list",
        isActive: () => e.isActive("bulletList"),
        run: () => e.chain().focus().toggleBulletList().run(),
      },
      {
        label: "Нумерованный список",
        icon: "list-ordered",
        isActive: () => e.isActive("orderedList"),
        run: () => e.chain().focus().toggleOrderedList().run(),
      },
      {
        label: "Цитата",
        icon: "quote",
        isActive: () => e.isActive("blockquote"),
        run: () => e.chain().focus().toggleBlockquote().run(),
      },
    ],
  ];
});
</script>

<template>
  <div
    class="w-full bg-white border border-zinc-200 rounded-xl transition focus-within:border-rose-600 focus-within:ring-4 focus-within:ring-rose-600/20"
  >
    <div
      v-if="editor && !disabled"
      class="flex items-center gap-1 flex-wrap px-2 py-1.5 border-b border-zinc-100"
    >
      <template v-for="(group, gi) in toolbar" :key="gi">
        <div v-if="gi > 0" class="w-px h-5 bg-zinc-200 mx-1" />
        <button
          v-for="action in group"
          :key="action.label"
          type="button"
          :title="action.label"
          :aria-label="action.label"
          :class="[
            'w-8 h-8 inline-flex items-center justify-center rounded-lg transition cursor-pointer',
            action.isActive()
              ? 'bg-rose-50 text-rose-600'
              : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900',
          ]"
          @click="action.run()"
        >
          <Icon :name="action.icon" :size="17" />
        </button>
      </template>
    </div>

    <TiptapEditorContent
      :editor="editor"
      class="fuse-richtext px-3.5 py-3 font-sans text-[0.9375rem] text-zinc-900"
    />
  </div>
</template>

<style>
/* Tiptap renders semantic HTML with no classes of its own — these rules give
   that markup (and the empty-state placeholder, which relies on the
   `data-placeholder` attribute injected by the Placeholder extension) the
   same voice as the rest of the design system. Shared with the read-only
   render on the marketplace card page. */
.fuse-richtext .ProseMirror,
.fuse-richtext-view {
  outline: none;
}
.fuse-richtext .ProseMirror {
  min-height: 8rem;
}
.fuse-richtext .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  color: #a1a1aa;
  pointer-events: none;
}
.fuse-richtext .ProseMirror h2,
.fuse-richtext-view h2 {
  font-weight: 700;
  font-size: 1.1875rem;
  letter-spacing: -0.01em;
  color: #18181b;
  margin: 0.7em 0 0.35em;
}
.fuse-richtext .ProseMirror h3,
.fuse-richtext-view h3 {
  font-weight: 700;
  font-size: 1.0625rem;
  color: #18181b;
  margin: 0.6em 0 0.3em;
}
.fuse-richtext .ProseMirror p,
.fuse-richtext-view p {
  margin: 0.5em 0;
  line-height: 1.6;
}
.fuse-richtext .ProseMirror ul,
.fuse-richtext .ProseMirror ol,
.fuse-richtext-view ul,
.fuse-richtext-view ol {
  padding-left: 1.25rem;
  margin: 0.5em 0;
}
.fuse-richtext .ProseMirror ul,
.fuse-richtext-view ul {
  list-style: disc;
}
.fuse-richtext .ProseMirror ol,
.fuse-richtext-view ol {
  list-style: decimal;
}
.fuse-richtext .ProseMirror blockquote,
.fuse-richtext-view blockquote {
  border-left: 3px solid #e4e4e7;
  padding-left: 0.75rem;
  color: #52525b;
  margin: 0.5em 0;
}
.fuse-richtext .ProseMirror strong,
.fuse-richtext-view strong {
  font-weight: 700;
}
.fuse-richtext .ProseMirror :first-child,
.fuse-richtext-view :first-child {
  margin-top: 0;
}
.fuse-richtext .ProseMirror :last-child,
.fuse-richtext-view :last-child {
  margin-bottom: 0;
}
</style>
