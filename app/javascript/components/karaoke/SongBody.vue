<script setup lang="ts">
import { useResizeObserver } from "@vueuse/core"
import { computed, onMounted, ref, watch } from "vue"

import {
  type SongBlock,
  chordGroups,
  sectionLabel,
  tokenizeLyrics,
} from "@/lib/chordSheet"
import type { GuidePosition } from "@/lib/tempoGuide"
import { transposeChordLine } from "@/lib/transpose"

interface Props {
  blocks: SongBlock[]
  semitones?: number
  preferFlat?: boolean
  fontScale?: number
  // The tempo guide's position (Stage Mode / Live Sync): drives the
  // bouncing ball and the word-by-word color fill.
  guide?: GuidePosition | null
  // The line the singer is on: highlighted, with the rest dimmed (lines
  // already sung more so).
  currentBlockIndex?: number
  // High-contrast TV/kiosk styling (pure black stage, neon chords and
  // highlight) for Stage Mode and Live Sync's full chord-sheet view.
  tv?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  semitones: 0,
  preferFlat: false,
  fontScale: 1,
  guide: null,
  currentBlockIndex: -1,
  tv: false,
})

const cls = computed(() =>
  props.tv
    ? {
        root: "sb-tv font-bold",
        section:
          "mt-[0.9em] mb-[0.15em] font-sans text-[0.55em] font-black tracking-[0.14em] text-[#00e5ff] uppercase first:mt-0",
        chords: "text-[#ffe600]",
        lyrics: "text-white",
        note: "font-sans text-[0.45em] text-white/60 italic",
      }
    : {
        root: "sb-page",
        section:
          "mt-4 mb-1 font-sans text-xs font-semibold tracking-wide text-amber-600 uppercase first:mt-0 dark:text-amber-500",
        chords: "text-amber-600 dark:text-amber-500",
        lyrics: "text-foreground",
        note: "text-muted-foreground font-sans text-xs italic",
      },
)

const rendered = computed(() =>
  props.blocks.map((b) => {
    if (b.type === "pair") {
      const chords = b.chords
        ? transposeChordLine(b.chords, props.semitones, props.preferFlat)
        : ""
      const lyricTokens = tokenizeLyrics(b.lyrics)
      return {
        ...b,
        chords,
        lyricTokens,
        // Only meaningful (and only rendered) when there are no lyrics --
        // an instrumental line steps through its own chords instead, one
        // bar per chord or dash-joined group. `index` numbers the chords
        // the same way the tempo guide's timeline does.
        chordBars: lyricTokens.length ? [] : numberBars(chordGroups(chords)),
      }
    }
    return b
  }),
)

function numberBars(groups: string[][]) {
  let index = 0
  return groups.map((group) => group.map((text) => ({ text, index: index++ })))
}

function instrumentalNote(bars: number, times?: number): string {
  const length = `${bars} bar${bars === 1 ? "" : "s"}`
  return times && times > 1
    ? `instrumental — ${length}, play ${times}×`
    : `instrumental — ${length}`
}

/* ---- word / line state (these only change when the word does) ---- */
const activeBlock = computed(() => props.guide?.blockIndex ?? -1)
const activeWord = computed(() => props.guide?.wordIndex ?? -1)

function wordClass(blockIndex: number, wordIndex: number): string {
  if (blockIndex !== activeBlock.value) return ""
  if (wordIndex < activeWord.value) return "is-sung"
  return wordIndex === activeWord.value ? "is-active" : ""
}
function blockClass(blockIndex: number): string {
  const cur = props.currentBlockIndex
  if (cur < 0) return ""
  if (blockIndex === cur) return "is-current"
  return blockIndex < cur ? "is-past" : "is-upcoming"
}

/* ---- the bouncing ball ----
   Animated straight from the guide's progress every frame (no CSS
   transitions to fall behind or snap): it lands on each word as it starts
   and arcs over to the next one -- across to the next line, too -- landing
   exactly when that word is due. Only `transform` changes, so it stays
   smooth on a TV's modest GPU. The word under it fills with color left to
   right at the same pace. */
const containerRef = ref<HTMLElement | null>(null)
const ballRef = ref<HTMLElement | null>(null)
const ballVisible = ref(false)
const wordEls: Record<string, HTMLElement> = {}
let em = 16

function setWordRef(blockIndex: number, wordIndex: number, el: Element | null) {
  const key = `${blockIndex}-${wordIndex}`
  if (el) wordEls[key] = el as HTMLElement
  else delete wordEls[key]
}

function measureEm() {
  if (containerRef.value) {
    em = parseFloat(getComputedStyle(containerRef.value).fontSize) || 16
  }
}

let lastActiveEl: HTMLElement | null = null

function updateBall() {
  const g = props.guide
  const c = containerRef.value
  const ball = ballRef.value
  const el = g ? wordEls[`${g.blockIndex}-${g.wordIndex}`] : undefined
  if (!g || !c || !ball || !el) {
    ballVisible.value = false
    return
  }
  ballVisible.value = true

  if (lastActiveEl && lastActiveEl !== el)
    lastActiveEl.style.removeProperty("--p")
  el.style.setProperty("--p", `${(g.progress * 100).toFixed(2)}%`)
  lastActiveEl = el

  // The ball lands just on top of the letters -- in the gap between the
  // chord row and the lyric, so it never covers a chord name.
  const box = c.getBoundingClientRect()
  const spot = (e: HTMLElement) => {
    const r = e.getBoundingClientRect()
    return {
      x: r.left - box.left + c.scrollLeft + r.width / 2,
      y: r.top - box.top + c.scrollTop + 0.3 * em,
    }
  }
  const from = spot(el)
  const nextEl = g.next
    ? wordEls[`${g.next.blockIndex}-${g.next.wordIndex}`]
    : undefined
  const to = nextEl ? spot(nextEl) : from

  const p = Math.min(1, Math.max(0, g.progress))
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  // A low hop between neighbors (staying under the chords), a higher arc
  // for a long jump like back to the start of the next line.
  const lift = !nextEl
    ? 0
    : distance < 6 * em
      ? Math.min(0.48 * em, Math.max(0.3 * em, distance * 0.2))
      : Math.min(1.8 * em, distance * 0.25)
  const x = from.x + (to.x - from.x) * p
  const y = from.y + (to.y - from.y) * p - lift * Math.sin(Math.PI * p)
  // A little squash as it lands on each word.
  const squash = p < 0.12 ? 0.78 + (p / 0.12) * 0.22 : 1
  ball.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${(2 - squash).toFixed(3)}, ${squash.toFixed(3)})`
}

watch(() => props.guide, updateBall, { flush: "post" })
watch(
  () => [props.fontScale, props.blocks, props.semitones],
  () => {
    measureEm()
    updateBall()
  },
  { flush: "post" },
)
useResizeObserver(containerRef, () => {
  measureEm()
  updateBall()
})
onMounted(() => {
  measureEm()
  updateBall()
})
</script>

<template>
  <div
    ref="containerRef"
    class="sb relative overflow-x-auto font-mono leading-relaxed whitespace-pre"
    :class="[cls.root, { 'has-current': currentBlockIndex >= 0 }]"
    :style="{ fontSize: fontScale + 'em' }"
  >
    <template v-for="(block, i) in rendered" :key="i">
      <div
        v-if="block.type === 'blank'"
        class="sb-block h-[0.85em]"
        :class="blockClass(i)"
      ></div>
      <div
        v-else-if="block.type === 'section'"
        class="sb-block"
        :class="[cls.section, blockClass(i)]"
      >
        {{ sectionLabel(block) }}
      </div>
      <div
        v-else
        class="sb-block sb-line"
        :class="blockClass(i)"
        :data-block="i"
      >
        <template v-if="block.chordBars && block.chordBars.length">
          <!-- Instrumental: an intro, ad lib, etc. with no lyrics to pace
               against, so the chords themselves get the spacing and
               highlight treatment lyric words normally get. -->
          <div
            aria-hidden="true"
            class="flex flex-wrap gap-x-6 font-bold"
            :class="cls.chords"
          >
            <span v-for="(bar, bi) in block.chordBars" :key="bi"
              ><template v-for="(chord, ci) in bar" :key="ci"
                ><template v-if="ci > 0">-</template
                ><span
                  class="sb-word sb-chord"
                  :class="wordClass(i, chord.index)"
                  :ref="
                    (el) => setWordRef(i, chord.index, el as Element | null)
                  "
                  >{{ chord.text }}</span
                ></template
              ></span
            >
          </div>
          <div :class="cls.note">
            {{ instrumentalNote(block.chordBars.length, block.times) }}
          </div>
        </template>
        <template v-else>
          <div
            v-if="block.chords"
            aria-hidden="true"
            class="font-bold"
            :class="cls.chords"
          >
            {{ block.chords }}
          </div>
          <div class="sb-lyrics" :class="cls.lyrics">
            <template v-if="block.lyricTokens && block.lyricTokens.length">
              <template v-for="(tok, ti) in block.lyricTokens" :key="ti">
                <span
                  v-if="tok.isWord"
                  class="sb-word"
                  :class="wordClass(i, tok.wordIndex)"
                  :ref="
                    (el) => setWordRef(i, tok.wordIndex, el as Element | null)
                  "
                  >{{ tok.text }}</span
                ><span v-else>{{ tok.text }}</span>
              </template>
            </template>
            <template v-else>&nbsp;</template>
          </div>
        </template>
      </div>
    </template>

    <span
      ref="ballRef"
      class="sb-ball"
      :class="{ 'is-visible': ballVisible }"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.sb {
  --sb-ink: var(--foreground);
  --sb-sung: #d97706;
  --sb-chord: #d97706;
  --sb-accent: #f59e0b;
  --sb-band: rgb(245 158 11 / 0.12);
}
.sb-tv {
  --sb-ink: #fff;
  --sb-sung: #00e5ff;
  --sb-chord: #ffe600;
  --sb-accent: #00e5ff;
  --sb-band: rgb(0 229 255 / 0.12);
  /* A gutter for the current-line pointer, and room on both sides for
     the current-line band to reach a little past the text. */
  padding-right: 0.4em;
  padding-left: 1.3em;
}

/* ---- current line ---- */
.sb-block {
  position: relative;
  transition:
    opacity 0.35s ease,
    background-color 0.35s ease;
}
.sb-tv .sb-line {
  margin: 0 -0.35em;
  padding: 0.04em 0.35em;
  border-radius: 0.25em;
}
.sb-line.is-current {
  background-color: var(--sb-band);
  box-shadow: inset 0.2em 0 0 var(--sb-accent);
}
.sb-line.is-current .sb-lyrics::before {
  content: "\25B6";
  position: absolute;
  left: -1.15em;
  color: var(--sb-accent);
  font-size: 0.8em;
  line-height: 2;
}
.has-current .sb-block.is-upcoming {
  opacity: 0.7;
}
.has-current .sb-block.is-past {
  opacity: 0.35;
}

/* ---- words: sung ones in the highlight color, the current one filling
   with it left to right in step with the music ---- */
.sb-word.is-sung {
  color: var(--sb-sung);
}
.sb-word.is-active {
  background-image: linear-gradient(
    90deg,
    var(--sb-sung) var(--p, 0%),
    var(--sb-ink) var(--p, 0%)
  );
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.sb-chord.is-active {
  background-image: linear-gradient(
    90deg,
    var(--sb-sung) var(--p, 0%),
    var(--sb-chord) var(--p, 0%)
  );
}

/* ---- the ball ---- */
.sb-ball {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  width: 0.42em;
  height: 0.42em;
  border-radius: 50%;
  background: var(--sb-accent);
  box-shadow: 0 0 0.35em var(--sb-accent);
  opacity: 0;
  pointer-events: none;
  transform-origin: 50% 100%;
  will-change: transform;
  transition: opacity 0.2s ease;
}
.sb-ball.is-visible {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .sb-block {
    transition: none;
  }
}
</style>
