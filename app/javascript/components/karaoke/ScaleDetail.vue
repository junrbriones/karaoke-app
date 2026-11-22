<script setup lang="ts">
import { computed, ref } from "vue"

import FretboardDiagram from "@/components/karaoke/FretboardDiagram.vue"
import {
  type ParsedScale,
  SCALE_TYPES,
  neckNotes,
  relativeScale,
  scaleFormula,
  scaleNotes,
  scaleOf,
  scalePositions,
} from "@/lib/guitarScales"

// One scale, for someone learning it: what's in it, the whole neck, and
// the five box positions to practise one at a time.
const props = defineProps<{ scale: ParsedScale }>()
const emit = defineEmits<{ look: [query: string] }>()

const label = ref<"note" | "degree">("note")
const notes = computed(() => scaleNotes(props.scale))
const relative = computed(() => relativeScale(props.scale))
const neck = computed(() => neckNotes(props.scale, 15))
const positions = computed(() => scalePositions(props.scale))
const others = computed(() =>
  SCALE_TYPES.filter((t) => t.id !== props.scale.type.id).map((t) =>
    scaleOf(props.scale.root, t.id),
  ),
)
const frets = (from: number, to: number) =>
  from === to ? `fret ${from}` : `frets ${from}–${to}`
</script>

<template>
  <section
    class="bg-card flex flex-col gap-5 rounded-xl border p-5 shadow-sm"
    aria-live="polite"
  >
    <div class="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div>
        <h1 class="capitalize-first text-3xl font-bold tracking-tight">
          {{ scale.name }}
        </h1>
        <p class="text-muted-foreground mt-1 max-w-xl text-sm">
          {{ scale.type.about }}
        </p>
      </div>
      <dl class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div>
          <dt class="text-muted-foreground text-xs uppercase">Notes</dt>
          <dd class="mt-1 flex gap-1">
            <span
              v-for="(n, i) in notes"
              :key="i"
              class="rounded px-1.5 py-0.5 font-mono font-semibold"
              :class="
                i === 0
                  ? 'root-chip'
                  : scale.type.degrees[i].blue
                    ? 'blue-chip'
                    : 'bg-muted'
              "
              >{{ n }}</span
            >
          </dd>
        </div>
        <div>
          <dt class="text-muted-foreground text-xs uppercase">Formula</dt>
          <dd class="mt-1 py-0.5 font-mono">{{ scaleFormula(scale) }}</dd>
        </div>
        <div v-if="relative">
          <dt class="text-muted-foreground text-xs uppercase">Same notes as</dt>
          <dd class="mt-1 py-0.5">
            <button
              type="button"
              class="underline-offset-2 hover:underline"
              @click="emit('look', relative.name)"
            >
              {{ relative.name }}
            </button>
          </dd>
        </div>
      </dl>
    </div>

    <div class="flex flex-wrap items-center gap-2 text-sm">
      <span class="text-muted-foreground text-xs">Show on the dots</span>
      <span
        class="bg-muted inline-flex items-center gap-0.5 rounded-md p-0.5"
        role="group"
        aria-label="Dot labels"
      >
        <button
          v-for="opt in [
            { value: 'note', label: 'Notes' },
            { value: 'degree', label: 'Scale degrees' },
          ] as const"
          :key="opt.value"
          type="button"
          class="rounded px-2 py-1 text-xs transition-colors"
          :class="
            label === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          "
          :aria-pressed="label === opt.value"
          @click="label = opt.value"
        >
          {{ opt.label }}
        </button>
      </span>
      <span class="text-muted-foreground ml-auto text-xs">
        Also on {{ scale.root }}:
        <template v-for="(o, i) in others" :key="o.name">
          <button
            type="button"
            class="text-foreground underline-offset-2 hover:underline"
            @click="emit('look', o.name)"
          >
            {{ o.type.name }}</button
          >{{ i < others.length - 1 ? ", " : "" }}
        </template>
      </span>
    </div>

    <div>
      <h2 class="mb-2 text-sm font-semibold">The whole neck</h2>
      <div class="overflow-x-auto">
        <FretboardDiagram
          :notes="neck"
          :from="0"
          :to="15"
          :label="label"
          :title="`${scale.name}, whole neck`"
          style="min-width: 600px"
        />
      </div>
    </div>

    <div>
      <h2 class="mb-1 text-sm font-semibold">The five positions</h2>
      <p class="text-muted-foreground mb-3 text-xs">
        Learn one box at a time &mdash; each has two notes on every string (plus
        the blue note in the blues scale). Position 1 starts on the root on the
        low E string; together they cover the whole neck, each one overlapping
        the next.
      </p>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <figure
          v-for="p in positions"
          :key="p.number"
          class="flex flex-col gap-1 rounded-lg border p-2"
        >
          <figcaption class="text-xs">
            <span class="font-semibold">Position {{ p.number }}</span>
            <span class="text-muted-foreground">
              &middot; {{ frets(p.from, p.to) }}</span
            >
          </figcaption>
          <FretboardDiagram
            :notes="p.notes"
            :from="p.from"
            :to="p.to"
            :label="label"
            :title="`${scale.name}, position ${p.number}`"
          />
        </figure>
      </div>
    </div>

    <p class="text-muted-foreground text-xs">
      High e string on top, low E at the bottom, frets left to right (as tab
      reads). The root is orange<template v-if="scale.type.id === 'blues'"
        >, the blue note blue</template
      >; a hollow dot left of the nut is an open string.
    </p>
  </section>
</template>

<style scoped>
.root-chip {
  background: var(--chord-root);
  color: white;
}
.blue-chip {
  background: #2563eb;
  color: white;
}
.capitalize-first::first-letter {
  text-transform: uppercase;
}
</style>
