<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue"

import {
  type SongBlock,
  chordGroups,
  sectionLabel,
  tokenizeLyrics,
} from "@/lib/chordSheet"
import { transposeChordLine } from "@/lib/transpose"

interface Props {
  blocks: SongBlock[]
  semitones?: number
  preferFlat?: boolean
  fontScale?: number
  activeBlockIndex?: number
  activeWordIndex?: number
  // High-contrast TV/kiosk styling (pure black stage, neon chords and
  // highlight) for Stage Mode and Live Sync's full chord-sheet view.
  tv?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  semitones: 0,
  preferFlat: false,
  fontScale: 1,
  activeBlockIndex: -1,
  activeWordIndex: -1,
  tv: false,
})

const cls = computed(() =>
  props.tv
    ? {
        root: "font-bold",
        section:
          "mt-[0.9em] mb-[0.15em] font-sans text-[0.55em] font-black tracking-[0.14em] text-[#00e5ff] uppercase first:mt-0",
        chords: "text-[#ffe600]",
        lyrics: "text-white",
        active: "bg-[#00e5ff] text-black px-[0.1em]",
        note: "font-sans text-[0.45em] text-white/60 italic",
        ball: "bg-[#00e5ff] shadow-[0_0_0_4px_rgba(0,229,255,0.3)]",
      }
    : {
        root: "",
        section:
          "mt-4 mb-1 font-sans text-xs font-semibold tracking-wide text-amber-600 uppercase first:mt-0 dark:text-amber-500",
        chords: "text-amber-600 dark:text-amber-500",
        lyrics: "text-foreground",
        active: "bg-primary text-primary-foreground px-0.5",
        note: "text-muted-foreground font-sans text-xs italic",
        ball: "bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.25)]",
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
    ? `instrumental \u2014 ${length}, play ${times}\u00D7`
    : `instrumental \u2014 ${length}`
}

const containerRef = ref<HTMLElement | null>(null)
const blockEls: Record<number, HTMLElement> = {}
const wordEls: Record<string, HTMLElement> = {}

function setBlockRef(i: number, el: Element | null) {
  if (el) blockEls[i] = el as HTMLElement
  else delete blockEls[i]
}
function setWordRef(blockIndex: number, wordIndex: number, el: Element | null) {
  const key = `${blockIndex}-${wordIndex}`
  if (el) wordEls[key] = el as HTMLElement
  else delete wordEls[key]
}

const ballPos = reactive({ top: 0, left: 0, visible: false })
const activeKey = computed(
  () => `${props.activeBlockIndex}-${props.activeWordIndex}`,
)

async function updateBall() {
  await nextTick()
  const bIdx = props.activeBlockIndex
  const wIdx = props.activeWordIndex
  if (bIdx < 0 || !containerRef.value) {
    ballPos.visible = false
    return
  }
  const targetEl = wIdx >= 0 ? wordEls[`${bIdx}-${wIdx}`] : blockEls[bIdx]
  if (!targetEl) {
    ballPos.visible = false
    return
  }
  const containerRect = containerRef.value.getBoundingClientRect()
  const targetRect = targetEl.getBoundingClientRect()
  ballPos.left = targetRect.left - containerRect.left + targetRect.width / 2
  ballPos.top = targetRect.top - containerRect.top
  ballPos.visible = wIdx >= 0
  targetEl.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest",
  })
}

watch(() => [props.activeBlockIndex, props.activeWordIndex], updateBall)
watch(() => props.fontScale, updateBall)
</script>

<template>
  <div
    ref="containerRef"
    class="relative overflow-x-auto font-mono leading-relaxed whitespace-pre"
    :class="cls.root"
    :style="{ fontSize: fontScale + 'em' }"
  >
    <template v-for="(block, i) in rendered" :key="i">
      <div v-if="block.type === 'blank'" class="h-[0.85em]"></div>
      <div v-else-if="block.type === 'section'" :class="cls.section">
        {{ sectionLabel(block) }}
      </div>
      <div v-else :ref="(el) => setBlockRef(i, el as Element | null)">
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
                  class="rounded transition-colors duration-100"
                  :class="
                    i === activeBlockIndex && chord.index === activeWordIndex
                      ? cls.active
                      : ''
                  "
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
          <div :class="cls.lyrics">
            <template v-if="block.lyricTokens && block.lyricTokens.length">
              <template v-for="(tok, ti) in block.lyricTokens" :key="ti">
                <span
                  v-if="tok.isWord"
                  class="rounded transition-colors duration-100"
                  :class="
                    i === activeBlockIndex && tok.wordIndex === activeWordIndex
                      ? cls.active
                      : ''
                  "
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

    <div
      v-if="ballPos.visible"
      class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full"
      :style="{ left: ballPos.left + 'px', top: ballPos.top + 'px' }"
    >
      <span
        :key="activeKey"
        class="chordstage-ball-dot mb-1 block h-[0.55em] w-[0.55em] rounded-full"
        :class="cls.ball"
      />
    </div>
  </div>
</template>

<style scoped>
.chordstage-ball-dot {
  animation: chordstage-hop 0.32s ease-out;
}
@keyframes chordstage-hop {
  0% {
    transform: translateY(0);
  }
  45% {
    transform: translateY(-0.85em);
  }
  100% {
    transform: translateY(0);
  }
}
</style>
