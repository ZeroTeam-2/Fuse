<script setup lang="ts">
// Fuse Select — labelled custom dropdown (popover, not a native <select>).
// Supports an optional search field and per-option media: a colored letter
// avatar, an image, or a simple status dot. Two-way binding via v-model.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  avatar?: string;
  image?: string;
  color?: string;
}

const props = withDefaults(
  defineProps<{
    label?: string;
    options?: (string | SelectOption)[];
    searchable?: boolean;
    searchPlaceholder?: string;
    placeholder?: string;
    disabled?: boolean;
    id?: string;
  }>(),
  {
    options: () => [],
    searchable: false,
    searchPlaceholder: "Найти…",
    placeholder: "Выберите…",
    disabled: false,
  },
);

const emit = defineEmits<{ change: [value: string, option: SelectOption] }>();
const model = defineModel<string>();

const norm = computed<SelectOption[]>(() =>
  props.options.map((o) => (typeof o === "string" ? { value: o, label: o } : o)),
);

const open = ref(false);
const query = ref("");
const rootRef = ref<HTMLElement | null>(null);
const popRef = ref<HTMLElement | null>(null);
const searchRef = ref<HTMLInputElement | null>(null);

// The popover is teleported to <body> and positioned against the trigger, so it
// is never clipped by (or forced to scroll inside) an overflow-hidden/auto
// ancestor such as a Modal body or a drawer.
const POPOVER_MAX = 360;
const pos = ref({ top: 0, left: 0, width: 0, up: false });

function reposition() {
  const el = rootRef.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const below = window.innerHeight - r.bottom;
  const up = below < POPOVER_MAX && r.top > below;
  pos.value = {
    top: up ? r.top - 8 : r.bottom + 8,
    left: r.left,
    width: r.width,
    up,
  };
}

const popStyle = computed(() => ({
  position: "fixed" as const,
  left: `${pos.value.left}px`,
  width: `${pos.value.width}px`,
  ...(pos.value.up
    ? { bottom: `${window.innerHeight - pos.value.top}px` }
    : { top: `${pos.value.top}px` }),
  maxHeight: `${POPOVER_MAX}px`,
}));

const selectId = computed(
  () =>
    props.id || (props.label ? `sel-${props.label.replace(/\s+/g, "-").toLowerCase()}` : undefined),
);
const selected = computed(() => norm.value.find((o) => o.value === model.value) || null);
const hasMedia = computed(() => norm.value.some((o) => o.avatar || o.image));

const filtered = computed(() => {
  if (!props.searchable || !query.value.trim()) return norm.value;
  const q = query.value.trim().toLowerCase();
  return norm.value.filter((o) =>
    [o.label, o.description, o.value]
      .filter(Boolean)
      .some((t) => String(t).toLowerCase().includes(q)),
  );
});

function commit(opt: SelectOption) {
  model.value = opt.value;
  emit("change", opt.value, opt);
  open.value = false;
}

function toggle() {
  if (!props.disabled) open.value = !open.value;
}

function onDocMouseDown(e: MouseEvent) {
  if (!open.value) return;
  const target = e.target as Node;
  if (rootRef.value?.contains(target) || popRef.value?.contains(target)) return;
  open.value = false;
}
function onKey(e: KeyboardEvent) {
  if (open.value && e.key === "Escape") open.value = false;
}

watch(open, (isOpen) => {
  if (isOpen) {
    reposition();
    // Any scrollable ancestor moves the trigger, so track scroll in capture phase.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    nextTick(() => {
      reposition();
      if (props.searchable) searchRef.value?.focus();
    });
  } else {
    window.removeEventListener("scroll", reposition, true);
    window.removeEventListener("resize", reposition);
    query.value = "";
  }
});

onMounted(() => {
  document.addEventListener("mousedown", onDocMouseDown);
  document.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocMouseDown);
  document.removeEventListener("keydown", onKey);
  window.removeEventListener("scroll", reposition, true);
  window.removeEventListener("resize", reposition);
});
</script>

<template>
  <div ref="rootRef" class="relative flex flex-col gap-2">
    <label
      v-if="label"
      :for="selectId"
      class="text-[0.8125rem] font-sans font-semibold text-zinc-900"
      >{{ label }}</label
    >

    <!-- Trigger -->
    <button
      :id="selectId"
      type="button"
      :disabled="disabled"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :class="[
        'relative flex items-center gap-2.5 w-full pl-3.5 pr-10 py-3 text-left bg-white border rounded-xl transition cursor-pointer',
        'outline-none disabled:cursor-not-allowed disabled:bg-zinc-100',
        open ? 'border-rose-600 ring-4 ring-rose-600/20' : 'border-zinc-200 hover:border-zinc-300',
      ]"
      @click="toggle"
    >
      <span class="inline-flex text-zinc-400 shrink-0"><slot name="icon" /></span>
      <span
        :class="[
          'flex-1 min-w-0 truncate font-sans text-[0.9375rem]',
          selected ? 'font-semibold text-zinc-900' : 'font-medium text-zinc-400',
        ]"
        >{{ selected ? selected.label : placeholder }}</span
      >
      <span
        :class="[
          'absolute right-3.5 pointer-events-none inline-flex text-zinc-400 transition-transform',
          open ? 'rotate-180' : '',
        ]"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
    </button>

    <!-- Popover -->
    <Teleport to="body">
      <div
        v-if="open"
        ref="popRef"
        role="listbox"
        :style="popStyle"
        class="z-[1100] flex flex-col bg-white border border-zinc-200 rounded-xl shadow-[0_24px_64px_rgba(24,24,27,0.18)] overflow-hidden"
      >
        <div
          v-if="searchable"
          class="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-zinc-150"
        >
          <span class="inline-flex text-zinc-400 shrink-0">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            ref="searchRef"
            v-model="query"
            type="text"
            :placeholder="searchPlaceholder"
            class="flex-1 min-w-0 border-0 outline-none bg-transparent font-sans text-[0.9375rem] text-zinc-900 placeholder:text-zinc-400"
          />
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto p-1.5">
          <div
            v-if="filtered.length === 0"
            class="px-3 py-6 text-center font-sans text-[0.875rem] text-zinc-400"
          >
            Ничего не найдено
          </div>
          <button
            v-for="opt in filtered"
            :key="opt.value"
            type="button"
            :class="[
              'flex items-center gap-3 w-full text-left rounded-lg transition cursor-pointer',
              hasMedia ? 'px-2.5 py-2' : 'px-3 py-2.5',
              opt.value === model
                ? 'bg-rose-50 border border-rose-200'
                : 'border border-transparent hover:bg-zinc-100',
            ]"
            @click="commit(opt)"
          >
            <!-- OptionMedia -->
            <img
              v-if="opt.image"
              :src="opt.image"
              alt=""
              class="w-9 h-9 rounded-lg object-cover shrink-0 border border-zinc-200"
            />
            <span
              v-else-if="opt.avatar"
              class="w-9 h-9 rounded-lg shrink-0 inline-flex items-center justify-center font-sans font-bold text-[0.9375rem] text-white"
              :style="{ background: opt.color || '#6366f1' }"
              >{{ opt.avatar }}</span
            >
            <span
              v-else
              :class="[
                'w-2 h-2 rounded-full shrink-0 transition',
                opt.value === model ? 'bg-rose-600' : 'bg-zinc-300',
              ]"
            />

            <span class="flex-1 min-w-0">
              <span
                :class="[
                  'block truncate font-sans text-[0.9375rem]',
                  opt.value === model ? 'font-semibold text-zinc-900' : 'font-medium text-zinc-800',
                ]"
                >{{ opt.label }}</span
              >
              <span
                v-if="opt.description"
                class="block truncate font-mono text-[0.75rem] text-zinc-400 mt-0.5"
                >{{ opt.description }}</span
              >
            </span>
            <span v-if="opt.value === model" class="inline-flex text-rose-600 shrink-0">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
