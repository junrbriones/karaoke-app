<script setup lang="ts">
import { computed } from "vue"

import type { FretNote } from "@/lib/guitarScales"

// A stretch of the guitar neck drawn sideways, the way scale charts and
// tab read: the high e string on top, the low E at the bottom, frets left
// to right. A dot for every note to play, labelled with its name or its
// scale degree; the root is orange and a blues scale's blue note blue.
const props = withDefaults(
  defineProps<{
    notes: FretNote[]
    from: number // lowest fret to show (0 = the nut, with open strings)
    to: number // highest
    label?: "note" | "degree"
    title?: string
  }>(),
  { label: "note", title: undefined },
)

const STRINGS = ["E", "A", "D", "G", "B", "e"]
const CELL = 44 // one fret's width
const GAP = 22 // between strings
const LEFT = 26 // string names
const OPEN = 26 // room left of the nut for open strings
const TOP = 14
const MARKERS = [3, 5, 7, 9, 15, 17, 19, 21]

const first = computed(() => Math.max(1, props.from))
const last = computed(() => Math.max(first.value + 3, props.to))
const withNut = computed(() => props.from === 0)
const gridLeft = computed(() => LEFT + (withNut.value ? OPEN : 6))
const columns = computed(() => last.value - first.value + 1)
const width = computed(() => gridLeft.value + columns.value * CELL + 10)
const bottom = TOP + 5 * GAP
const height = bottom + 26

const yOf = (string: number) => TOP + (5 - string) * GAP
const xOf = (fret: number) =>
  fret === 0
    ? gridLeft.value - OPEN / 2 - 2
    : gridLeft.value + (fret - first.value + 0.5) * CELL

const frets = computed(() =>
  Array.from({ length: columns.value }, (_, i) => first.value + i),
)
const shown = computed(() =>
  props.notes.filter(
    (n) =>
      (n.fret === 0 && withNut.value) ||
      (n.fret >= first.value && n.fret <= last.value),
  ),
)
const ariaLabel = computed(
  () =>
    `${props.title ?? "Scale"}: ` +
    STRINGS.map((name, s) => {
      const on = shown.value.filter((n) => n.string === s).map((n) => n.fret)
      return `${name} string ${on.length ? `frets ${on.join(", ")}` : "none"}`
    }).join("; "),
)
</script>

<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    class="fretboard"
    role="img"
    :aria-label="ariaLabel"
  >
    <title v-if="title">{{ title }}</title>
    <!-- inlay markers -->
    <g class="inlay">
      <template v-for="f in frets" :key="`i${f}`">
        <circle
          v-if="MARKERS.includes(f)"
          :cx="xOf(f)"
          :cy="TOP + 2.5 * GAP"
          r="4"
        />
        <template v-else-if="f % 12 === 0">
          <circle :cx="xOf(f)" :cy="TOP + 1.5 * GAP" r="4" />
          <circle :cx="xOf(f)" :cy="TOP + 3.5 * GAP" r="4" />
        </template>
      </template>
    </g>
    <!-- strings -->
    <g class="grid">
      <line
        v-for="s in 6"
        :key="`s${s}`"
        :x1="gridLeft"
        :x2="gridLeft + columns * CELL"
        :y1="yOf(s - 1)"
        :y2="yOf(s - 1)"
      />
      <line
        v-for="i in columns + 1"
        :key="`f${i}`"
        :x1="gridLeft + (i - 1) * CELL"
        :x2="gridLeft + (i - 1) * CELL"
        :y1="TOP"
        :y2="bottom"
      />
    </g>
    <rect
      v-if="withNut"
      :x="gridLeft - 3"
      :y="TOP - 1"
      width="4"
      :height="bottom - TOP + 2"
      class="nut"
    />
    <!-- string names -->
    <g class="labels" font-size="10" text-anchor="middle">
      <text
        v-for="(name, s) in STRINGS"
        :key="`n${s}`"
        :x="10"
        :y="yOf(s) + 3.5"
      >
        {{ name }}
      </text>
    </g>
    <!-- fret numbers -->
    <g class="labels" font-size="10" text-anchor="middle">
      <text v-for="f in frets" :key="`fn${f}`" :x="xOf(f)" :y="bottom + 18">
        {{ f }}
      </text>
    </g>
    <!-- notes -->
    <g v-for="n in shown" :key="`${n.string}-${n.fret}`">
      <circle
        :cx="xOf(n.fret)"
        :cy="yOf(n.string)"
        r="9.5"
        class="dot"
        :class="{ root: n.root, blue: n.blue, open: n.fret === 0 }"
      />
      <text
        :x="xOf(n.fret)"
        :y="yOf(n.string) + 3.5"
        font-size="9"
        text-anchor="middle"
        class="dot-label"
        :class="{ open: n.fret === 0 }"
      >
        {{ label === "degree" ? n.degree : n.note }}
      </text>
    </g>
  </svg>
</template>

<style scoped>
.fretboard {
  max-width: 100%;
  height: auto;
  color: var(--foreground);
}
.grid line {
  stroke: currentColor;
  stroke-opacity: 0.4;
}
.nut {
  fill: currentColor;
}
.inlay circle {
  fill: currentColor;
  fill-opacity: 0.12;
}
.labels {
  fill: currentColor;
  fill-opacity: 0.6;
}
.dot {
  fill: currentColor;
}
.dot.root {
  fill: var(--chord-root);
}
.dot.blue {
  fill: #2563eb;
}
.dot.open {
  fill: var(--background);
  stroke: currentColor;
  stroke-width: 1.5;
}
.dot.open.root {
  stroke: var(--chord-root);
}
.dot-label {
  fill: var(--background);
  font-weight: 700;
}
.dot-label.open {
  fill: currentColor;
}
</style>
