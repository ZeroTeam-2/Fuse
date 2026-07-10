<script setup lang="ts">
// Fuse CategoryNav — the marketplace catalog rail. Category rows with trailing
// counts; parents with `children` expand/collapse via a chevron, and the active
// leaf gets a soft rose fill. Two-way binding via v-model.
import { reactive } from "vue";

export interface CategoryItem {
  label: string;
  count?: number;
  defaultOpen?: boolean;
  children?: CategoryItem[];
}

const props = withDefaults(
  defineProps<{ items?: CategoryItem[]; defaultValue?: string }>(),
  { items: () => [] },
);
const emit = defineEmits<{ change: [value: string] }>();
const model = defineModel<string>();

if (model.value === undefined && props.defaultValue !== undefined) model.value = props.defaultValue;

const open = reactive<Record<string, boolean>>({});
for (const it of props.items) {
  const hasKids = Array.isArray(it.children) && it.children.length > 0;
  if (hasKids) {
    open[it.label] =
      it.defaultOpen ?? it.children!.some((c) => c.label === props.defaultValue) ?? false;
  }
}

function select(k: string) {
  model.value = k;
  emit("change", k);
}
function toggle(k: string) {
  open[k] = !open[k];
}
function onParentClick(it: CategoryItem) {
  if (it.children && it.children.length) open[it.label] = true;
  select(it.label);
}
</script>

<template>
  <nav class="flex flex-col gap-0.5">
    <div v-for="it in items" :key="it.label">
      <button
        type="button"
        :class="[
          'flex items-center justify-between gap-2.5 w-full text-left px-3 py-2.5 rounded-lg font-sans text-[0.9375rem] cursor-pointer transition-colors',
          it.label === model
            ? 'bg-rose-50 text-rose-600 font-semibold'
            : it.children && it.children.length && open[it.label]
              ? 'text-zinc-900 font-semibold hover:bg-zinc-100'
              : 'text-zinc-700 font-medium hover:bg-zinc-100',
        ]"
        @click="onParentClick(it)"
      >
        <span class="inline-flex items-center gap-2">
          <span
            v-if="it.children && it.children.length"
            role="button"
            :tabindex="-1"
            :class="[
              'inline-flex -ml-1 mr-0.5 p-0.5 rounded cursor-pointer hover:bg-black/5',
              it.label === model ? 'text-rose-400' : 'text-zinc-400',
            ]"
            @click.stop="toggle(it.label)"
          >
            <svg
              viewBox="0 0 12 12"
              width="10"
              height="10"
              class="shrink-0 transition-transform"
              :style="{ transform: open[it.label] ? 'rotate(90deg)' : 'none' }"
              aria-hidden="true"
            >
              <path
                d="M4 2.5 L8 6 L4 9.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <span v-else-if="it.label !== model" class="w-1 h-1 rounded-full bg-zinc-400" />
          {{ it.label }}
        </span>
        <span
          v-if="it.count != null"
          :class="['font-semibold text-sm', it.label === model ? 'text-rose-400' : 'text-zinc-400']"
          >{{ it.count }}</span
        >
      </button>

      <div v-if="it.children && it.children.length && open[it.label]" class="flex flex-col gap-0.5 mt-0.5 mb-1">
        <button
          v-for="c in it.children"
          :key="c.label"
          type="button"
          :class="[
            'flex items-center justify-between gap-2.5 w-full text-left pl-9 pr-3 py-2 rounded-lg font-sans text-[0.875rem] cursor-pointer transition-colors',
            c.label === model
              ? 'bg-rose-50 text-rose-600 font-semibold'
              : 'text-zinc-400 font-medium hover:bg-zinc-100 hover:text-zinc-600',
          ]"
          @click="select(c.label)"
        >
          <span>{{ c.label }}</span>
          <span
            v-if="c.count != null"
            :class="['font-semibold text-sm', c.label === model ? 'text-rose-400' : 'text-zinc-400']"
            >{{ c.count }}</span
          >
        </button>
      </div>
    </div>
  </nav>
</template>
