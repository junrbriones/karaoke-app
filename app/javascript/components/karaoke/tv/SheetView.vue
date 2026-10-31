<script setup lang="ts">
import { useResizeObserver } from "@vueuse/core"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

import SongBody from "@/components/karaoke/SongBody.vue"
import type { SongBlock } from "@/lib/chordSheet"
import type { GuidePosition } from "@/lib/tempoGuide"

// The full chord sheet on the TV, as a teleprompter: a fixed reading line
// a third of the way down the screen, and the song moves past it.
//
// - Auto-scroll: whichever line is crossing the reading line is marked as
//   the current one (highlighted band and a pointer, lines already passed
//   dimmed), so the singer always knows where to be, at any speed. The
//   speed can change while it's moving.
// - Tempo guide: the sheet glides continuously at the song's own pace --
//   each line reaches the reading line exactly as it starts, taking as
//   long to move on as that line lasts (its line timing) -- and the ball
//   hops across its words (unless `ball` is off: a clean teleprompter).
//
// There's blank space above the first line and below the last so either
// end can reach the reading line too.
const props = withDefaults(
  defineProps<{
    blocks: SongBlock[]
    semitones?: number
    preferFlat?: boolean
    fontScale?: number
    guide?: GuidePosition | null
    autoScroll?: boolean
    speed?: number // pixels per second
    ball?: boolean // the bouncing ball and word fill, with the tempo guide
  }>(),
  {
    semitones: 0,
    preferFlat: false,
    fontScale: 1,
    guide: null,
    autoScroll: false,
    speed: 40,
    ball: true,
  },
)

const READING_LINE = 0.34 // fraction of the visible height
// Smoothing on top of the glide, so a jump (restart, a tempo change, a
// song change) eases instead of snapping. Short enough that the glide
// itself stays on time.
const FOLLOW_TIME = 0.12

const scroller = ref<HTMLElement | null>(null)
const content = ref<HTMLElement | null>(null)

/* ---- where each line sits, measured once (and on any resize) ---- */
interface LineBox {
  index: number
  top: number
  bottom: number
}
let lines: LineBox[] = []

function measure() {
  const s = scroller.value
  const c = content.value
  if (!s || !c) return
  const box = s.getBoundingClientRect()
  lines = [...c.querySelectorAll<HTMLElement>("[data-block]")].map((el) => {
    const r = el.getBoundingClientRect()
    const top = r.top - box.top + s.scrollTop
    return { index: Number(el.dataset.block), top, bottom: top + r.height }
  })
}

function readingOffset(): number {
  return (scroller.value?.clientHeight ?? 0) * READING_LINE
}

// The line crossing the reading line (or the last one above it, while
// passing through a gap between sections).
function lineAt(y: number): number {
  let found = -1
  for (const l of lines) {
    if (l.top <= y) found = l.index
    else break
  }
  return found
}

const scrollMarked = ref(-1)
const currentLine = computed(() => {
  if (props.autoScroll) return scrollMarked.value
  return props.guide ? props.guide.blockIndex : -1
})

/* ---- one animation loop for both auto-scroll and follow ---- */
let raf: number | null = null
let last: number | null = null
let pos = 0 // fractional scroll position (scrollTop rounds to whole pixels)
let followTarget: number | null = null

function frame(ts: number) {
  raf = null
  const s = scroller.value
  if (!s) return
  const dt = last == null ? 0 : Math.min(0.1, (ts - last) / 1000)
  last = ts
  let keepGoing = false

  if (props.autoScroll) {
    // Someone scrolled by hand: carry on from there.
    if (Math.abs(s.scrollTop - pos) > 2) pos = s.scrollTop
    pos += props.speed * dt
    const max = s.scrollHeight - s.clientHeight
    pos = Math.min(pos, max)
    s.scrollTop = pos
    scrollMarked.value = lineAt(pos + readingOffset() + 1)
    keepGoing = true
  } else if (followTarget != null) {
    const target = followTarget
    const now = s.scrollTop
    const next = now + (target - now) * (1 - Math.exp(-dt / FOLLOW_TIME))
    if (Math.abs(target - next) < 0.5) {
      s.scrollTop = target
      followTarget = null
    } else {
      s.scrollTop = next
      keepGoing = true
    }
    pos = s.scrollTop
  }

  if (keepGoing) raf = requestAnimationFrame(frame)
  else last = null
}

function run() {
  if (raf == null) {
    last = null
    raf = requestAnimationFrame(frame)
  }
}

// Where the sheet should be: the current line on the reading line at its
// start, sliding up to bring the next line there exactly when it begins.
function glideTarget(g: GuidePosition): number | null {
  const s = scroller.value
  const cur = lines.find((l) => l.index === g.blockIndex)
  if (!s || !cur) return null
  const next =
    g.nextLine != null ? lines.find((l) => l.index === g.nextLine) : undefined
  const p = Math.min(1, Math.max(0, g.lineProgress))
  const y = cur.top + (next ? (next.top - cur.top) * p : 0)
  const max = s.scrollHeight - s.clientHeight
  return Math.max(0, Math.min(max, y - readingOffset()))
}

function follow(g: GuidePosition) {
  const target = glideTarget(g)
  if (target == null) return
  followTarget = target
  run()
}

watch(
  () => props.autoScroll,
  (on) => {
    if (on) {
      pos = scroller.value?.scrollTop ?? 0
      followTarget = null
      run()
    }
  },
)
watch(
  () => props.guide,
  (g) => {
    if (g && !props.autoScroll) follow(g)
  },
)

function remeasure() {
  measure()
  if (props.autoScroll) {
    scrollMarked.value = lineAt(
      (scroller.value?.scrollTop ?? 0) + readingOffset() + 1,
    )
  } else if (props.guide) {
    follow(props.guide)
  }
}
useResizeObserver(content, remeasure)
useResizeObserver(scroller, remeasure)
watch(
  () => [props.blocks, props.fontScale, props.semitones, props.preferFlat],
  () => void nextTick(remeasure),
)

onMounted(() => {
  measure()
  if (props.autoScroll) run()
})
onBeforeUnmount(() => {
  if (raf != null) cancelAnimationFrame(raf)
})

// Back to the first line (song change, restart).
function toTop() {
  followTarget = null
  pos = 0
  scrollMarked.value = -1
  if (scroller.value) scroller.value.scrollTop = 0
}
defineExpose({ toTop })
</script>

<template>
  <div class="sheet-view">
    <div ref="scroller" class="sheet-scroller">
      <div class="sheet-pad-top" aria-hidden="true" />
      <div ref="content">
        <SongBody
          tv
          :blocks="blocks"
          :semitones="semitones"
          :prefer-flat="preferFlat"
          :font-scale="fontScale"
          :guide="autoScroll || !ball ? null : guide"
          :current-block-index="currentLine"
        />
      </div>
      <div class="sheet-pad-bottom" aria-hidden="true" />
    </div>
    <div
      class="sheet-reading-line"
      :class="{ 'is-on': autoScroll || (!ball && !!guide) }"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.sheet-view {
  --reading-line: 34%;
  position: relative;
  height: 100%;
}
.sheet-scroller {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  padding: 0 4vw;
  font-size: max(16px, 3.4vh);
  scrollbar-width: none;
}
.sheet-scroller::-webkit-scrollbar {
  display: none;
}
.sheet-pad-top {
  height: var(--reading-line);
}
.sheet-pad-bottom {
  height: calc(100% - var(--reading-line));
}
/* Where the eye should be while the sheet scrolls past: a tick in the
   left margin, clear of the words. */
.sheet-reading-line {
  position: absolute;
  top: var(--reading-line);
  left: 0;
  width: 3vw;
  height: max(3px, 0.35vh);
  border-radius: 0 999px 999px 0;
  background: linear-gradient(90deg, rgb(0 229 255 / 0.2), #00e5ff);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}
.sheet-reading-line.is-on {
  opacity: 1;
}
</style>
