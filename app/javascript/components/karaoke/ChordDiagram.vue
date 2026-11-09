<script setup lang="ts">
import { computed } from "vue"

import {
  type ParsedChord,
  STRING_NAMES,
  type Voicing,
  stringNotes,
} from "@/lib/guitarChords"

// One guitar chord chart: six strings (low E on the left), five frets,
// a dot per fretted note with the finger to use, a bar for a barre, and
// x / o over strings not played / played open. The root notes are filled
// in a stronger color.
const props = withDefaults(
  defineProps<{
    chord: ParsedChord
    voicing: Voicing
    size?: number // width in px
    showNotes?: boolean
  }>(),
  { size: 140, showNotes: true },
)

const FRETS = 5
const W = 120
const H = 150
const left = 18
const right = W - 12
const top = 34
const bottom = top + 95
const gap = (right - left) / 5
const fretGap = (bottom - top) / FRETS

const x = (s: number) => left + s * gap
const yFor = (fret: number) =>
  top + (fret - props.voicing.baseFret + 0.5) * fretGap

const notes = computed(() => stringNotes(props.chord, props.voicing))
const rootName = computed(() => props.chord.root)
const label = computed(
  () =>
    `${props.chord.name} chord: ${props.voicing.frets
      .map((f, s) =>
        f < 0
          ? `${STRING_NAMES[s]} string not played`
          : f === 0
            ? `${STRING_NAMES[s]} string open`
            : `${STRING_NAMES[s]} string fret ${f}, finger ${props.voicing.fingers[s]}`,
      )
      .join("; ")}`,
)
</script>

<template>
  <svg
    :viewBox="`0 0 ${W} ${H + (showNotes ? 12 : 0)}`"
    :width="size"
    :height="(size * (H + (showNotes ? 12 : 0))) / W"
    role="img"
    :aria-label="label"
    class="chord-diagram"
  >
    <title>{{ chord.name }} &mdash; {{ voicing.key }}</title>
    <!-- open / muted markers -->
    <g font-size="11" text-anchor="middle" class="marks">
      <text
        v-for="(f, s) in voicing.frets"
        :key="`m${s}`"
        :x="x(s)"
        :y="top - 8"
      >
        {{ f < 0 ? "×" : f === 0 ? "○" : "" }}
      </text>
    </g>
    <!-- nut, or the starting fret number -->
    <rect
      v-if="voicing.baseFret === 1"
      :x="left - 1"
      :y="top - 4"
      :width="right - left + 2"
      height="4"
      class="nut"
    />
    <text
      v-else
      :x="left - 7"
      :y="top + fretGap * 0.5 + 4"
      font-size="10"
      text-anchor="end"
      class="fretnum"
    >
      {{ voicing.baseFret }}
    </text>
    <!-- grid -->
    <line
      v-for="i in FRETS + 1"
      :key="`f${i}`"
      :x1="left"
      :x2="right"
      :y1="top + (i - 1) * fretGap"
      :y2="top + (i - 1) * fretGap"
      class="grid"
    />
    <line
      v-for="s in 6"
      :key="`s${s}`"
      :x1="x(s - 1)"
      :x2="x(s - 1)"
      :y1="top"
      :y2="bottom"
      class="grid"
    />
    <!-- barre -->
    <rect
      v-if="voicing.barre"
      :x="x(voicing.barre.from) - 6"
      :y="yFor(voicing.barre.fret) - 6"
      :width="x(voicing.barre.to) - x(voicing.barre.from) + 12"
      height="12"
      rx="6"
      class="dot"
    />
    <!-- fingers -->
    <g v-for="(f, s) in voicing.frets" :key="`d${s}`">
      <template v-if="f > 0">
        <circle
          :cx="x(s)"
          :cy="yFor(f)"
          r="7"
          :class="notes[s] === rootName ? 'dot root' : 'dot'"
        />
        <text
          :x="x(s)"
          :y="yFor(f) + 3.5"
          font-size="9.5"
          text-anchor="middle"
          class="finger"
        >
          {{ voicing.fingers[s] || "" }}
        </text>
      </template>
    </g>
    <!-- the note each string plays -->
    <g v-if="showNotes" font-size="8.5" text-anchor="middle" class="notes">
      <text
        v-for="(n, s) in notes"
        :key="`n${s}`"
        :x="x(s)"
        :y="bottom + 13"
        :class="n === rootName ? 'root-note' : ''"
      >
        {{ n ?? "" }}
      </text>
    </g>
  </svg>
</template>

<style scoped>
.chord-diagram {
  color: var(--foreground);
}
.grid {
  stroke: currentColor;
  stroke-opacity: 0.45;
  stroke-width: 1;
}
.nut {
  fill: currentColor;
}
.marks,
.fretnum,
.notes {
  fill: currentColor;
  fill-opacity: 0.75;
}
.dot {
  fill: currentColor;
}
.dot.root {
  fill: var(--chord-root);
}
.finger {
  fill: var(--background);
  font-weight: 700;
}
.root-note {
  fill: var(--chord-root);
  fill-opacity: 1;
  font-weight: 700;
}
</style>
