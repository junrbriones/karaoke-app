<script setup lang="ts">
import { Head } from "@inertiajs/vue3"
import { Search, X } from "lucide-vue-next"
import { computed, ref, watch } from "vue"

import ChordDiagram from "@/components/karaoke/ChordDiagram.vue"
import { Input } from "@/components/ui/input"
import AppLayout from "@/layouts/AppLayout.vue"
import {
  CHORD_TYPES,
  type ChordType,
  ROOTS_FLAT,
  ROOTS_SHARP,
  type Voicing,
  chordFormula,
  chordFullName,
  chordNotes,
  chordOf,
  enharmonicName,
  parseChord,
  typesMatching,
  voicingsFor,
} from "@/lib/guitarChords"
import { chords as chordsRoutes } from "@/routes"
import type { BreadcrumbItem } from "@/types"

const props = defineProps<{ query: string }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Chords", href: chordsRoutes.index().url },
]

const EXAMPLES = ["C#m7", "Bbmaj7", "G/B", "Dsus4", "F#7b9", "Am7b5"]
// The spelling guitar charts usually use for each key.
const COMMON_ROOTS = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
]
const rootLabel = (pc: number) =>
  ROOTS_SHARP[pc] === ROOTS_FLAT[pc]
    ? ROOTS_SHARP[pc]
    : `${ROOTS_SHARP[pc]}/${ROOTS_FLAT[pc]}`

const query = ref(props.query)
const browseRoot = ref("C")
const browseType = ref<ChordType>(CHORD_TYPES[0])

const chord = computed(() => parseChord(query.value))
// "minor seventh", "dim": the search names a kind of chord, not a chord.
const matchingTypes = computed(() =>
  chord.value ? [] : typesMatching(query.value),
)
const notFound = computed(
  () =>
    query.value.trim() !== "" && !chord.value && !matchingTypes.value.length,
)

// Remember the last chord looked up, so the browse grid and root picker
// follow it.
watch(
  chord,
  (c) => {
    if (!c) return
    browseRoot.value = c.root
    browseType.value = c.type
  },
  { immediate: true },
)

// Keep the address in step, so a chord can be bookmarked or shared.
let urlTimer: ReturnType<typeof setTimeout> | undefined
watch(query, (q) => {
  clearTimeout(urlTimer)
  urlTimer = setTimeout(() => {
    const text = q.trim()
    const url = chordsRoutes.index(text ? { query: { q: text } } : {}).url
    window.history.replaceState(window.history.state, "", url)
  }, 400)
})

const notes = computed(() => (chord.value ? chordNotes(chord.value) : []))
const voicings = computed(() =>
  chord.value ? voicingsFor(chord.value, 6) : [],
)
const rootNote = computed(() => chord.value?.root ?? "")

function position(v: Voicing): string {
  if (v.baseFret === 1)
    return v.frets.some((f) => f === 0) ? "Open position" : "First position"
  return `Fret ${v.baseFret}`
}

function look(name: string) {
  query.value = name
  window.scrollTo({ top: 0, behavior: "smooth" })
}

function pickRoot(root: string) {
  if (!chord.value) {
    // Browsing a kind of chord ("minor seventh"): just move the grid.
    browseRoot.value = root
    return
  }
  const bass = chord.value?.bass ? `/${chord.value.bass}` : ""
  look(root + browseType.value.symbol + (chord.value ? bass : ""))
}

const grid = computed(() =>
  (matchingTypes.value.length ? matchingTypes.value : CHORD_TYPES).map(
    (type) => {
      const c = chordOf(browseRoot.value, type)
      return { chord: c, voicing: voicingsFor(c, 1)[0] ?? null }
    },
  ),
)
const browseRootPc = computed(() => parseChord(browseRoot.value)?.rootPc ?? 0)
</script>

<template>
  <Head title="Chords" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="flex flex-col gap-6 p-4">
      <!-- search -->
      <div class="flex flex-col gap-2">
        <div class="relative max-w-md">
          <Search
            class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            v-model="query"
            type="search"
            autofocus
            autocomplete="off"
            spellcheck="false"
            aria-label="Look up a chord"
            placeholder="Look up a chord: C#m7, Bbmaj7, G/B…"
            class="h-11 pl-9 text-base"
          />
          <button
            v-if="query"
            type="button"
            class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-1"
            aria-label="Clear"
            @click="query = ''"
          >
            <X class="size-4" />
          </button>
        </div>
        <p class="text-muted-foreground text-sm">
          Type any chord name &mdash; or a kind of chord, like
          <button
            type="button"
            class="hover:text-foreground underline underline-offset-2"
            @click="look('minor seventh')"
          >
            minor seventh</button
          >. Try:
          <template v-for="(ex, i) in EXAMPLES" :key="ex">
            <button
              type="button"
              class="text-foreground font-mono font-medium underline-offset-2 hover:underline"
              @click="look(ex)"
            >
              {{ ex }}</button
            >{{ i < EXAMPLES.length - 1 ? ", " : "." }}
          </template>
        </p>
      </div>

      <!-- the chord looked up -->
      <section
        v-if="chord"
        class="bg-card flex flex-col gap-5 rounded-xl border p-5 shadow-sm"
        aria-live="polite"
      >
        <div class="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <h1 class="font-mono text-4xl font-bold tracking-tight">
              {{ chord.name }}
            </h1>
            <p class="text-muted-foreground mt-1">
              {{ chordFullName(chord) }}
            </p>
          </div>
          <dl class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <dt class="text-muted-foreground text-xs uppercase">Notes</dt>
              <dd class="mt-1 flex gap-1">
                <span
                  v-if="chord.bass"
                  class="bg-muted rounded px-1.5 py-0.5 font-mono font-semibold underline"
                  title="Bass note (played lowest)"
                  >{{ chord.bass }}</span
                >
                <span
                  v-for="(n, i) in notes"
                  :key="i"
                  class="rounded px-1.5 py-0.5 font-mono font-semibold"
                  :class="n === rootNote ? 'chord-root-chip' : 'bg-muted'"
                  >{{ n }}</span
                >
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground text-xs uppercase">Formula</dt>
              <dd class="mt-1 py-0.5 font-mono">{{ chordFormula(chord) }}</dd>
            </div>
            <div v-if="enharmonicName(chord)">
              <dt class="text-muted-foreground text-xs uppercase">
                Also written
              </dt>
              <dd class="mt-1 py-0.5">
                <button
                  type="button"
                  class="font-mono underline-offset-2 hover:underline"
                  @click="look(enharmonicName(chord)!)"
                >
                  {{ enharmonicName(chord) }}
                </button>
              </dd>
            </div>
          </dl>
        </div>

        <div v-if="voicings.length" class="flex flex-wrap gap-x-4 gap-y-5">
          <figure
            v-for="(v, i) in voicings"
            :key="v.key"
            class="flex flex-col items-center gap-1"
          >
            <ChordDiagram :chord="chord" :voicing="v" :size="150" />
            <figcaption class="text-center text-xs">
              <span class="font-medium">{{
                i === 0 ? "Most common" : position(v)
              }}</span>
              <span v-if="i === 0" class="text-muted-foreground">
                &middot; {{ position(v) }}</span
              >
              <span class="text-muted-foreground block font-mono">{{
                v.key
              }}</span>
            </figcaption>
          </figure>
        </div>
        <p v-else class="text-muted-foreground text-sm">
          There's no comfortable way to play this chord in standard tuning.
        </p>

        <p class="text-muted-foreground text-xs">
          Low E string on the left. A number on a dot is the finger to use (1
          index, 2 middle, 3 ring, 4 little); a bar is one finger pressing
          several strings; &times; means don't play that string, &cir; means
          play it open. The root note &mdash; the one the chord is named after
          &mdash; is orange.
        </p>
      </section>

      <p v-else-if="notFound" class="text-muted-foreground" aria-live="polite">
        There's no chord called &ldquo;<span class="text-foreground">{{
          query
        }}</span
        >&rdquo;. Start with the note (A to G), then a sharp (#) or flat (b),
        then the kind of chord: <span class="font-mono">C#m7</span>,
        <span class="font-mono">Bbmaj7</span>,
        <span class="font-mono">Dsus4</span>.
      </p>

      <!-- browse -->
      <section class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-1">
          <button
            v-for="(root, pc) in COMMON_ROOTS"
            :key="root"
            type="button"
            class="min-w-11 rounded-md border px-2 py-1 font-mono text-sm transition-colors"
            :class="
              pc === browseRootPc
                ? 'bg-primary text-primary-foreground border-primary'
                : 'hover:bg-muted'
            "
            :aria-pressed="pc === browseRootPc"
            @click="pickRoot(root)"
          >
            {{ rootLabel(pc) }}
          </button>
        </div>
        <h2 class="text-lg font-semibold">
          <template v-if="matchingTypes.length">
            Matching chords on {{ browseRoot }}
          </template>
          <template v-else>All {{ browseRoot }} chords</template>
        </h2>
        <div
          class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8"
        >
          <button
            v-for="item in grid"
            :key="item.chord.name"
            type="button"
            class="bg-card hover:border-primary/60 flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors"
            :class="
              chord && chord.name === item.chord.name
                ? 'border-primary ring-primary/30 ring-2'
                : ''
            "
            @click="look(item.chord.name)"
          >
            <span class="font-mono font-semibold">{{ item.chord.name }}</span>
            <ChordDiagram
              v-if="item.voicing"
              :chord="item.chord"
              :voicing="item.voicing"
              :size="96"
              :show-notes="false"
            />
            <span class="text-muted-foreground text-xs">{{
              item.chord.type.name
            }}</span>
          </button>
        </div>
      </section>
    </div>
  </AppLayout>
</template>

<style scoped>
.chord-root-chip {
  background: var(--chord-root);
  color: white;
}
</style>
