<script setup lang="ts">
// Fuse EndpointDetails — the expanded panel under an endpoint row. Reuses the
// same visual language as the step-config «Входные / Выходные данные» panels:
// inputs grouped by location, outputs as a field list, each row showing the
// field type and (when present in the OpenAPI spec) its example on the right.
import { computed } from "vue";
import type { SchemaField } from "@fuse/shared";

const props = defineProps<{
  inputs?: SchemaField[];
  outputs?: SchemaField[];
  outputIsArray?: boolean;
}>();

const GROUPS = [
  { loc: "path", title: "Path-параметры", dot: "bg-indigo-500" },
  { loc: "query", title: "Query-параметры", dot: "bg-sky-500" },
  { loc: "header", title: "Заголовки · Header", dot: "bg-amber-500" },
  { loc: "body", title: "Тело запроса · Body", dot: "bg-emerald-500" },
] as const;

const inputs = computed(() => props.inputs ?? []);
const outputs = computed(() => props.outputs ?? []);

function groupFields(loc: string): SchemaField[] {
  return inputs.value.filter((f) => (f.loc ?? "body") === loc);
}

/** OpenAPI examples are usually scalars; render those, skip objects/arrays. */
function formatExample(ex: unknown): string | null {
  if (ex === undefined || ex === null) return null;
  const t = typeof ex;
  if (t === "string" || t === "number" || t === "boolean") return String(ex);
  return null;
}
</script>

<template>
  <div class="px-4 pb-5 pt-3 flex flex-col gap-7">
    <!-- Принимает -->
    <div>
      <div class="flex items-start gap-3 mb-4">
        <span
          class="w-8 h-8 rounded-xl shrink-0 inline-flex items-center justify-center bg-indigo-50 text-indigo-600"
        >
          <Icon name="download" :size="16" />
        </span>
        <div class="min-w-0">
          <div class="font-sans text-[0.875rem] font-bold text-zinc-900">Принимает</div>
          <div class="font-sans text-[0.75rem] text-zinc-500 mt-0.5">
            Параметры, которые endpoint ожидает на вход.
          </div>
        </div>
      </div>

      <div v-if="inputs.length" class="flex flex-col gap-5">
        <div v-for="g in GROUPS" :key="g.loc">
          <template v-if="groupFields(g.loc).length">
            <div class="flex items-center gap-2 mb-2.5">
              <span :class="['w-2 h-2 rounded-full', g.dot]" />
              <div
                class="font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-zinc-500"
              >
                {{ g.title }}
              </div>
            </div>
            <div class="border border-zinc-200 rounded-2xl overflow-hidden">
              <div
                v-for="(f, i) in groupFields(g.loc)"
                :key="f.key"
                :class="['px-4 py-3 flex flex-col gap-1', i ? 'border-t border-zinc-100' : '']"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <code class="font-mono text-sm font-semibold text-zinc-900">{{ f.key }}</code>
                  <span
                    class="shrink-0 inline-flex items-center font-mono text-[0.6875rem] font-semibold tracking-wide text-sky-600"
                    >{{ f.type }}</span
                  >
                  <span
                    v-if="f.required"
                    class="shrink-0 font-sans text-[0.6875rem] font-semibold text-rose-600"
                    >обязательный</span
                  >
                  <code
                    v-if="formatExample(f.ex)"
                    class="ml-auto font-mono text-[0.75rem] text-emerald-600 truncate max-w-[45%]"
                    :title="formatExample(f.ex) ?? undefined"
                    >{{ formatExample(f.ex) }}</code
                  >
                </div>
                <div
                  v-if="f.label && f.label !== f.key"
                  class="font-sans text-[0.8125rem] text-zinc-400"
                >
                  {{ f.label }}
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
      <div
        v-else
        class="font-sans text-[0.8125rem] text-zinc-400 border border-dashed border-zinc-200 rounded-xl px-4 py-4 text-center"
      >
        Без параметров.
      </div>
    </div>

    <!-- Отдаёт -->
    <div>
      <div class="flex items-start gap-3 mb-4">
        <span
          class="w-8 h-8 rounded-xl shrink-0 inline-flex items-center justify-center bg-violet-50 text-violet-600"
        >
          <Icon name="upload" :size="16" />
        </span>
        <div class="min-w-0">
          <div class="font-sans text-[0.875rem] font-bold text-zinc-900">
            Отдаёт<span v-if="outputIsArray" class="font-normal text-zinc-400"> · массив</span>
          </div>
          <div class="font-sans text-[0.75rem] text-zinc-500 mt-0.5">
            Поля ответа, доступные следующим шагам.
          </div>
        </div>
      </div>

      <div v-if="outputs.length" class="border border-zinc-200 rounded-2xl overflow-hidden">
        <div
          v-for="(o, i) in outputs"
          :key="o.key"
          :class="['px-4 py-3 flex flex-col gap-1', i ? 'border-t border-zinc-100' : '']"
        >
          <div class="flex items-center gap-2 min-w-0">
            <code class="font-mono text-sm font-semibold text-zinc-900">{{ o.key }}</code>
            <span
              class="shrink-0 inline-flex items-center font-mono text-[0.6875rem] font-semibold tracking-wide text-sky-600"
              >{{ o.type }}</span
            >
            <code
              v-if="formatExample(o.ex)"
              class="ml-auto font-mono text-[0.75rem] text-emerald-600 truncate max-w-[45%]"
              :title="formatExample(o.ex) ?? undefined"
              >{{ formatExample(o.ex) }}</code
            >
          </div>
          <div v-if="o.label && o.label !== o.key" class="font-sans text-[0.8125rem] text-zinc-400">
            {{ o.label }}
          </div>
          <div
            v-if="o.items?.length"
            class="pl-3 mt-1 ml-1 flex flex-col gap-1 border-l border-zinc-200"
          >
            <div v-for="sub in o.items" :key="sub.key" class="flex items-center gap-2 min-w-0">
              <code class="shrink-0 font-mono text-[0.75rem] text-zinc-500">{{ sub.key }}</code>
              <span class="shrink-0 font-mono text-[0.6875rem] text-sky-600">{{ sub.type }}</span>
              <code
                v-if="formatExample(sub.ex)"
                class="ml-auto font-mono text-[0.6875rem] text-emerald-600 truncate max-w-[45%]"
                :title="formatExample(sub.ex) ?? undefined"
                >{{ formatExample(sub.ex) }}</code
              >
            </div>
          </div>
        </div>
      </div>
      <div
        v-else
        class="font-sans text-[0.8125rem] text-zinc-400 border border-dashed border-zinc-200 rounded-xl px-4 py-4 text-center"
      >
        Схема ответа не указана.
      </div>
    </div>
  </div>
</template>
