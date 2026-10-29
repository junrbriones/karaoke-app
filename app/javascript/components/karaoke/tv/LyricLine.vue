<script setup lang="ts">
import { useResizeObserver } from "@vueuse/core"
import { computed, nextTick, ref, watch } from "vue"

import { type DisplayLine, tokenProgress } from "@/lib/lyricDisplay"

// One lyric line on the TV stage.
//
// - Never wraps: a line that's too wide for the screen is shrunk to fit
//   (down to half size) instead of breaking onto a third line or pushing
//   anything else around. Its slot keeps a fixed height either way, so the
//   screen never jumps when a long line follows a short one.
// - The sung color sweeps through each word/syllable left to right: a
//   second, colored copy of the text is revealed by a clip-path that grows
//   continuously with the music -- smooth across individual letters,
//   rather than whole words flipping color.
const props = withDefaults(
  defineProps<{
    line: DisplayLine | null
    time?: number
    showChords?: boolean
    preview?: boolean
  }>(),
  { time: 0 },
)

const MIN_FIT = 0.5

const root = ref<HTMLElement | null>(null)
const text = ref<HTMLElement | null>(null)
const fit = ref(1)

// Reserved whenever chords are on, even for a line without any, so every
// line slot on screen is the same height.
const hasChords = computed(() => props.showChords)

function measure() {
  const r = root.value
  const t = text.value
  if (!r || !t || !t.offsetWidth) return
  // Text width scales linearly with font size, so the full-size width is
  // the current width divided by the current fit.
  const natural = t.offsetWidth / fit.value
  const next = Math.max(MIN_FIT, Math.min(1, r.clientWidth / natural))
  const rounded = Math.floor(next * 1000) / 1000
  if (Math.abs(rounded - fit.value) > 0.002) fit.value = rounded
}

useResizeObserver(root, measure)
useResizeObserver(text, measure)
watch(
  () => [props.line, hasChords.value],
  () => {
    fit.value = 1
    void nextTick(measure)
  },
)

function progress(i: number): string {
  const tok = props.line?.tokens[i]
  if (!tok) return "0%"
  return `${(tokenProgress(tok, props.time) * 100).toFixed(2)}%`
}
</script>

<template>
  <div
    ref="root"
    class="lyric-line"
    :class="{ 'is-preview': preview, 'has-chords': hasChords }"
  >
    <span ref="text" class="lyric-line__text" :style="{ '--fit': fit }">
      <template v-if="line">
        <span
          v-for="(tok, i) in line.tokens"
          :key="i"
          class="tok"
          :class="{ 'tok--gap': tok.wordStart && i > 0 }"
          :style="preview ? undefined : { '--p': progress(i) }"
        >
          <!-- In the flow, not floating, so a long chord name ("Cm7-F7")
               over a short word ("ay") widens that word's slot instead of
               running into the next chord. -->
          <span v-if="hasChords" class="tok__chord">{{ tok.chord ?? "" }}</span>
          <span class="tok__word">
            <span class="tok__base">{{ tok.text }}</span>
            <span v-if="!preview" class="tok__sung" aria-hidden="true">{{
              tok.text
            }}</span>
          </span>
        </span>
      </template>
    </span>
  </div>
</template>

<style scoped>
.lyric-line {
  --slot-lh: 1.5;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: calc(var(--lyric-px) * var(--slot-lh));
  overflow: hidden;
  white-space: nowrap;
}
.lyric-line.has-chords {
  --slot-lh: 2;
}
.lyric-line__text {
  display: inline-block;
  font-size: calc(var(--lyric-px) * var(--fit, 1));
  font-weight: 900;
  line-height: 1.5;
  letter-spacing: 0.01em;
}
.tok {
  position: relative;
  display: inline-block;
  vertical-align: bottom;
}
.has-chords .tok {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
}
.tok__word {
  position: relative;
  display: inline-block;
}
.tok--gap {
  margin-left: 0.3em;
}
.tok__base {
  color: var(--tv-ink);
}
.tok__sung {
  position: absolute;
  inset: 0;
  color: var(--line-sung, var(--tv-sung));
  text-shadow: 0 0 0.14em var(--line-glow, var(--tv-sung-glow));
  clip-path: inset(-0.4em calc(100% - var(--p, 0%)) -0.4em 0);
  pointer-events: none;
  will-change: clip-path;
}
.tok__chord {
  min-height: 1.15em;
  padding-right: 0.6em;
  color: var(--tv-chord);
  font-size: 0.42em;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.is-preview .tok__base {
  color: var(--tv-dim);
}
.is-preview .tok__chord {
  opacity: 0.6;
}
</style>
