<script setup lang="ts">
import "@fontsource/montserrat/700.css"
import "@fontsource/montserrat/900.css"
import "./tv.css"

import { computed } from "vue"

import {
  type DisplayTrack,
  type Part,
  displayStateAt,
} from "@/lib/lyricDisplay"

import CueCountdown from "./CueCountdown.vue"
import LyricLine from "./LyricLine.vue"

// The videoke screen itself: at most two lyric lines, centered, with a
// dimmed one-line "Next" preview in its own zone underneath, a duet/section
// badge above, and a countdown whenever vocals are about to come back in.
//
// Every zone has a fixed height (in container units, so this works full
// screen on a TV and in a small preview box alike), so nothing on screen
// ever shifts as lines, cues, and cards come and go.
const props = withDefaults(
  defineProps<{
    track: DisplayTrack
    time: number
    // Lyric size multiplier; 1 = 10% of the stage height (~190pt on a 70"
    // TV when the stage fills the screen).
    scale?: number
    showChords?: boolean
    title?: string
    artist?: string | null
    hint?: string | null
  }>(),
  { scale: 1, title: "", artist: null, hint: null },
)

const state = computed(() => displayStateAt(props.track, props.time))
const screen = computed(() => state.value.screen)
const lyricScreen = computed(() =>
  screen.value && !screen.value.instrumental ? screen.value : null,
)
// Always two slots, so a one-line screen sits exactly where the first line
// of a two-line screen does.
const lines = computed(() => {
  const l = lyricScreen.value?.lines ?? []
  return [l[0] ?? null, l[1] ?? null]
})

const PART_KEYS: Record<NonNullable<Part>, string> = {
  Male: "male",
  Female: "female",
  All: "all",
}
function partVars(part: Part): Record<string, string> {
  if (!part) return {}
  const key = PART_KEYS[part]
  return {
    "--line-sung": `var(--tv-${key})`,
    "--line-glow": `var(--tv-${key}-glow)`,
  }
}
const currentVars = computed(() => partVars(screen.value?.part ?? null))
const upcomingVars = computed(() => partVars(state.value.previewPart))

const restTitle = computed(() => {
  const s = screen.value
  if (!s?.instrumental) return ""
  if (!state.value.preview && !Number.isFinite(s.end)) return "Outro"
  return s.label && !s.part ? s.label : "Instrumental"
})

// An instrumental's chord run as a band reads it: one box per bar (with
// dash-joined chords sharing a bar), the current bar outlined, the chord
// being played lit, and a few bars of what's coming next.
const band = computed(() => state.value.band)
const BAR_WINDOW = 6
const barWindow = computed(() => {
  const s = screen.value
  if (!s?.instrumental || !s.chords.length) return []
  const b = band.value
  const current = b && b.countIn == null ? b.bar : -1
  const bars: {
    bar: number
    chords: { text: string; active: boolean }[]
    current: boolean
    done: boolean
  }[] = []
  s.chords.forEach((c, i) => {
    let last = bars[bars.length - 1]
    if (!last || last.bar !== c.bar) {
      last = {
        bar: c.bar,
        chords: [],
        current: c.bar === current,
        done: c.bar < current,
      }
      bars.push(last)
    }
    last.chords.push({ text: c.text, active: i === b?.chord })
  })
  const first = Math.max(
    0,
    Math.min(bars.length - BAR_WINDOW, Math.max(0, current) - 1),
  )
  return bars.slice(first, first + BAR_WINDOW)
})
// The lit beat: the beat of the bar, or during the count-in, the count
// running up to the downbeat (4 left -> beat 1 of the count bar, ...).
const litBeat = computed(() => {
  const b = band.value
  if (!b) return -1
  if (b.countIn != null)
    return b.countIn <= b.beatsPerBar ? b.beatsPerBar - b.countIn : -1
  return b.beat
})
</script>

<template>
  <div class="lyric-stage tv-theme">
    <div class="stage-frame" :style="{ '--lyric-scale': scale }">
      <div class="stage-top">
        <span
          v-if="lyricScreen?.label"
          class="stage-badge"
          :class="{ 'is-part': !!lyricScreen.part }"
          :style="currentVars"
          >{{ lyricScreen.label }}</span
        >
        <CueCountdown
          v-if="lyricScreen && state.cue"
          compact
          :cue="state.cue"
          :style="currentVars"
        />
      </div>

      <div class="stage-main" role="region" aria-label="Lyrics">
        <div v-if="state.ended" class="stage-card">
          <p class="card-kicker">&#9834; That&rsquo;s the song &#9834;</p>
          <p class="card-title">{{ title }}</p>
          <p v-if="hint" class="card-hint">{{ hint }}</p>
        </div>

        <div v-else-if="state.index === -1" class="stage-card">
          <p class="card-title">{{ title }}</p>
          <p v-if="artist" class="card-sub">{{ artist }}</p>
          <p v-if="hint" class="card-hint">{{ hint }}</p>
          <CueCountdown
            v-if="state.cue"
            :cue="state.cue"
            :style="upcomingVars"
          />
        </div>

        <div v-else-if="screen?.instrumental" class="stage-card">
          <div class="band-head">
            <p class="card-kicker">&#9834; {{ restTitle }} &#9834;</p>
            <span v-if="band" class="band-chip">{{
              band.countIn != null
                ? "Count-in"
                : `Bar ${band.bar + 1} of ${band.bars}`
            }}</span>
          </div>
          <p v-if="hint" class="card-hint">{{ hint }}</p>
          <div v-if="barWindow.length" class="bar-run" aria-label="Chords">
            <div
              v-for="cell in barWindow"
              :key="cell.bar"
              class="bar-cell"
              :class="{ 'is-current': cell.current, 'is-done': cell.done }"
            >
              <template v-for="(chord, ci) in cell.chords" :key="ci"
                ><span v-if="ci > 0" class="bar-dash">-</span
                ><span
                  class="bar-chord"
                  :class="{ 'is-active': chord.active }"
                  >{{ chord.text }}</span
                ></template
              >
            </div>
          </div>
          <div
            v-if="band"
            class="beats"
            role="img"
            :aria-label="`Beat ${litBeat + 1} of ${band.beatsPerBar}`"
          >
            <span
              v-for="n in band.beatsPerBar"
              :key="n"
              class="beat"
              :class="{ 'is-on': litBeat === n - 1, 'is-one': n === 1 }"
            />
          </div>
          <div v-if="band?.countIn" :key="band.countIn" class="band-count">
            {{ band.countIn }}
          </div>
          <CueCountdown
            v-else-if="state.cue"
            :cue="state.cue"
            :style="upcomingVars"
          />
          <p v-else-if="restTitle !== 'Outro' && !band" class="card-hint">
            Take a breath
          </p>
        </div>

        <div v-else class="stage-lines" :style="currentVars">
          <LyricLine
            v-for="(line, i) in lines"
            :key="`${state.index}-${i}`"
            :line="line"
            :time="time"
            :show-chords="showChords"
          />
        </div>
      </div>

      <div class="stage-preview" :style="upcomingVars">
        <span
          class="preview-tag"
          :class="{ 'is-hidden': !state.preview || state.ended }"
          >Next</span
        >
        <LyricLine
          preview
          :line="state.ended ? null : state.preview"
          :show-chords="showChords"
        />
        <span class="preview-tag is-spacer" aria-hidden="true">Next</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lyric-stage {
  container-type: size;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.stage-frame {
  /* 1 unit = 1% of the stage height. Browsers without container query
     units (some older smart-TV browsers) fall back to the viewport, scaled
     to roughly the stage's share of a full-screen TV view. */
  --u: min(0.75vh, 0.6vw);
  --lyric-px: calc(10 * var(--lyric-scale, 1) * var(--u));
  display: grid;
  grid-template-rows: calc(11 * var(--u)) minmax(0, 1fr) auto;
  width: 100%;
  height: 100%;
  padding: 0 3% calc(2 * var(--u));
}
@supports (height: 1cqh) {
  .stage-frame {
    /* Height-driven on a TV; width-driven if the stage is ever narrower
       than it is tall (a phone, a portrait monitor). */
    --u: min(1cqh, 0.6cqw);
  }
}

.stage-top {
  /* Badge dead center, cue to its right: neither moves the other. */
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: calc(4 * var(--u));
  min-width: 0;
}
.stage-badge {
  grid-column: 2;
}
.stage-top > .cue {
  grid-column: 3;
  justify-self: start;
}
.stage-badge {
  padding: 0.2em 0.9em;
  border: 0.14em solid var(--tv-faint);
  border-radius: 999px;
  color: var(--tv-dim);
  font-size: calc(3.4 * var(--u));
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
}
.stage-badge.is-part {
  border-color: var(--line-sung);
  color: var(--line-sung);
}

.stage-main {
  display: flex;
  min-height: 0;
  overflow: hidden;
}
.stage-lines {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}
.stage-card {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(2 * var(--u));
  min-width: 0;
  text-align: center;
}
.card-title {
  max-width: 100%;
  overflow: hidden;
  font-size: calc(8 * var(--u));
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-sub {
  color: var(--tv-dim);
  font-size: calc(4.5 * var(--u));
  font-weight: 700;
}
.card-kicker {
  font-size: calc(5.5 * var(--u));
  font-weight: 900;
  letter-spacing: 0.04em;
}
.card-hint {
  color: var(--tv-dim);
  font-size: calc(4 * var(--u));
  font-weight: 800;
}
.band-head {
  display: flex;
  align-items: center;
  gap: calc(3 * var(--u));
}
.band-chip {
  padding: 0.2em 0.8em;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.12);
  font-size: calc(3.2 * var(--u));
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.bar-run {
  display: flex;
  justify-content: center;
  gap: calc(2 * var(--u));
  max-width: 100%;
  overflow: hidden;
}
.bar-cell {
  display: flex;
  flex: none;
  align-items: center;
  padding: calc(1.2 * var(--u)) calc(2.6 * var(--u));
  border: calc(0.4 * var(--u)) solid var(--tv-faint);
  border-radius: calc(1.6 * var(--u));
  color: var(--tv-chord);
  font-size: calc(7 * var(--u));
  font-weight: 900;
  line-height: 1.2;
  white-space: nowrap;
  opacity: 0.6;
}
.bar-cell.is-current {
  border-color: var(--tv-chord);
  background: rgb(255 230 0 / 0.1);
  opacity: 1;
}
.bar-cell.is-done {
  opacity: 0.3;
}
.bar-chord {
  padding: 0 calc(0.6 * var(--u));
  border-radius: calc(0.8 * var(--u));
}
.bar-chord.is-active {
  background: var(--tv-chord);
  color: #000;
}
.bar-dash {
  margin: 0 0.1em;
  opacity: 0.6;
}
.beats {
  display: flex;
  align-items: center;
  gap: calc(2.4 * var(--u));
  height: calc(4 * var(--u));
}
.beat {
  width: calc(2.8 * var(--u));
  height: calc(2.8 * var(--u));
  border-radius: 50%;
  background: rgb(255 255 255 / 0.18);
}
.beat.is-one {
  width: calc(4 * var(--u));
  height: calc(4 * var(--u));
}
.beat.is-on {
  background: var(--tv-sung);
  box-shadow: 0 0 calc(1.2 * var(--u)) var(--tv-sung-glow);
}
.band-count {
  color: var(--tv-sung);
  font-size: calc(16 * var(--u));
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 0.12em var(--tv-sung-glow);
  animation: band-pop 0.3s ease-out;
}
@keyframes band-pop {
  from {
    opacity: 0.3;
    transform: scale(1.35);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .band-count {
    animation: none;
  }
}

.stage-preview {
  --lyric-px: calc(5.5 * var(--lyric-scale, 1) * var(--u));
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: calc(2 * var(--u));
  padding-top: calc(1.5 * var(--u));
  border-top: calc(0.3 * var(--u)) solid var(--tv-faint);
}
.preview-tag {
  padding: 0.25em 0.7em;
  border: 0.14em solid var(--tv-faint);
  border-radius: 999px;
  color: var(--tv-dim);
  font-size: calc(2.4 * var(--u));
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.preview-tag.is-hidden,
.preview-tag.is-spacer {
  visibility: hidden;
}
</style>
