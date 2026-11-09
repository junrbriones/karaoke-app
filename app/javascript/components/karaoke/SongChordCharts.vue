<script setup lang="ts">
import { Link } from "@inertiajs/vue3"
import { ChevronDown } from "lucide-vue-next"
import { computed, ref, watch } from "vue"

import ChordDiagram from "@/components/karaoke/ChordDiagram.vue"
import { type SongBlock, chordGroups } from "@/lib/chordSheet"
import {
  type ParsedChord,
  type Voicing,
  parseChord,
  voicingsFor,
} from "@/lib/guitarChords"
import { transposeToken } from "@/lib/transpose"
import { chords as chordsRoutes } from "@/routes"

// A chart for every chord a song uses, in the order they first come up,
// in the key it's being shown in -- so a guitarist can check the shapes
// before playing it.
const props = defineProps<{
  blocks: SongBlock[]
  semitones: number
  preferFlat: boolean
}>()

const STORE = "chordstage:chord-charts"
const open = ref(readOpen())
function readOpen(): boolean {
  try {
    return localStorage.getItem(STORE) !== "closed"
  } catch {
    return true
  }
}
watch(open, (value) => {
  try {
    localStorage.setItem(STORE, value ? "open" : "closed")
  } catch {
    // private window: just don't remember it
  }
})

const used = computed(() => {
  const seen = new Set<string>()
  const charts: {
    chord: ParsedChord
    voicing: Voicing
  }[] = []
  const unknown: string[] = []
  for (const block of props.blocks) {
    if (block.type !== "pair") continue
    for (const name of chordGroups(block.chords).flat()) {
      if (/^N\.?C\.?$/i.test(name)) continue
      const shown = transposeToken(name, props.semitones, props.preferFlat)
      // "C/9"-style bass numbers: chart the chord itself.
      const chord = parseChord(shown) ?? parseChord(shown.replace(/\/.*$/, ""))
      const key = chord?.name ?? shown
      if (seen.has(key)) continue
      seen.add(key)
      const voicing = chord ? voicingsFor(chord, 1)[0] : undefined
      if (chord && voicing) charts.push({ chord, voicing })
      else unknown.push(shown)
    }
  }
  return { charts, unknown }
})
</script>

<template>
  <div
    v-if="used.charts.length || used.unknown.length"
    class="bg-card rounded-xl border"
  >
    <button
      type="button"
      class="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span
        class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
      >
        Chord charts &middot; {{ used.charts.length }} chord{{
          used.charts.length === 1 ? "" : "s"
        }}
      </span>
      <ChevronDown
        class="text-muted-foreground size-4 transition-transform"
        :class="open ? 'rotate-180' : ''"
      />
    </button>
    <div v-if="open" class="flex flex-col gap-2 px-4 pb-4">
      <div class="flex flex-wrap gap-x-2 gap-y-3">
        <Link
          v-for="item in used.charts"
          :key="item.chord.name"
          :href="chordsRoutes.index({ query: { q: item.chord.name } }).url"
          class="hover:bg-muted flex flex-col items-center rounded-lg px-1 pt-1 transition-colors"
          :title="`More ways to play ${item.chord.name}`"
        >
          <span class="font-mono text-sm font-semibold">{{
            item.chord.name
          }}</span>
          <ChordDiagram
            :chord="item.chord"
            :voicing="item.voicing"
            :size="84"
            :show-notes="false"
          />
        </Link>
      </div>
      <p v-if="used.unknown.length" class="text-muted-foreground text-xs">
        No chart for {{ used.unknown.join(", ") }}.
      </p>
      <p class="text-muted-foreground text-xs">
        Tap a chord for other ways to play it.
      </p>
    </div>
  </div>
</template>
