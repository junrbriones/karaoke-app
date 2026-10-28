<script setup lang="ts">
import { Head, Link } from "@inertiajs/vue3"
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"

import PhrasingScreen from "@/components/karaoke/PhrasingScreen.vue"
import SongBody from "@/components/karaoke/SongBody.vue"
import TransposeControl from "@/components/karaoke/TransposeControl.vue"
import { Button } from "@/components/ui/button"
import { parseBody } from "@/lib/chordSheet"
import {
  type Phrasing,
  computeScreenWindows,
  findActiveScreenIndex,
} from "@/lib/phrasing"
import { buildTimeline, findActive } from "@/lib/tempoGuide"
import { songs as songsRoutes } from "@/routes"
import type { Song } from "@/types"

const props = defineProps<{
  songs: Song[]
  single: boolean
  exit_href?: string
}>()

const currentIndex = ref(0)
const currentSong = computed<Song | undefined>(
  () => props.songs[currentIndex.value],
)
const blocks = computed(() =>
  currentSong.value ? parseBody(currentSong.value.body ?? "") : [],
)

const semitones = ref(0)
const preferFlat = ref(false)
const fontScale = ref(
  Number(localStorage.getItem("chordstage:fontscale")) || 1.6,
)
watch(fontScale, (v) => {
  try {
    localStorage.setItem("chordstage:fontscale", String(v))
  } catch {
    /* ignore */
  }
})

/* ---- manual auto-scroll ---- */
const scrolling = ref(false)
const speed = ref(Number(localStorage.getItem("chordstage:scrollspeed")) || 40)
watch(speed, (v) => {
  try {
    localStorage.setItem("chordstage:scrollspeed", String(v))
  } catch {
    /* ignore */
  }
})

const bodyRef = ref<HTMLElement | null>(null)
let rafId: number | null = null
let lastTs: number | null = null

function frame(ts: number) {
  if (!scrolling.value) return
  if (lastTs != null && bodyRef.value) {
    const dt = ts - lastTs
    bodyRef.value.scrollTop += (speed.value * dt) / 1000
  }
  lastTs = ts
  rafId = requestAnimationFrame(frame)
}
function toggleScroll() {
  if (!scrolling.value) stopTempoGuide()
  scrolling.value = !scrolling.value
  lastTs = null
  if (scrolling.value) rafId = requestAnimationFrame(frame)
  else if (rafId) cancelAnimationFrame(rafId)
}
function resetScroll() {
  scrolling.value = false
  if (rafId) cancelAnimationFrame(rafId)
  if (bodyRef.value) bodyRef.value.scrollTop = 0
}

/* ---- tempo guide (rolling highlight + bouncing ball) ---- */
const bpm = ref(100)
const beatsPerLine = ref(
  Number(localStorage.getItem("chordstage:beatsperline")) || 4,
)
watch(beatsPerLine, (v) => {
  try {
    localStorage.setItem("chordstage:beatsperline", String(v))
  } catch {
    /* ignore */
  }
})

const tempoPlaying = ref(false)
const elapsedTempo = ref(0)
let tempoRaf: number | null = null
let tempoLastTs: number | null = null

const timeline = computed(() =>
  buildTimeline(blocks.value, bpm.value, beatsPerLine.value),
)
const active = computed(() =>
  findActive(
    timeline.value.lines,
    elapsedTempo.value,
    timeline.value.totalDuration,
  ),
)
const activeBlockIndex = computed(() =>
  tempoPlaying.value || elapsedTempo.value > 0 ? active.value.blockIndex : -1,
)
const activeWordIndex = computed(() =>
  tempoPlaying.value || elapsedTempo.value > 0 ? active.value.wordIndex : -1,
)
const tempoFinished = computed(
  () =>
    timeline.value.totalDuration > 0 &&
    elapsedTempo.value >= timeline.value.totalDuration,
)

function tempoFrame(ts: number) {
  if (!tempoPlaying.value) return
  if (tempoLastTs != null) {
    elapsedTempo.value += (ts - tempoLastTs) / 1000
    if (elapsedTempo.value >= timeline.value.totalDuration) {
      elapsedTempo.value = timeline.value.totalDuration
      tempoPlaying.value = false
      return
    }
  }
  tempoLastTs = ts
  tempoRaf = requestAnimationFrame(tempoFrame)
}
function toggleTempoGuide() {
  if (!tempoPlaying.value) {
    scrolling.value = false
    if (rafId) cancelAnimationFrame(rafId)
    if (tempoFinished.value) elapsedTempo.value = 0
    tempoPlaying.value = true
    tempoLastTs = null
    tempoRaf = requestAnimationFrame(tempoFrame)
  } else {
    tempoPlaying.value = false
    if (tempoRaf) cancelAnimationFrame(tempoRaf)
  }
}
function stopTempoGuide() {
  tempoPlaying.value = false
  if (tempoRaf) cancelAnimationFrame(tempoRaf)
}
function restartTempoGuide() {
  elapsedTempo.value = 0
  tempoLastTs = null
}

/* ---- KaraFun audio-synced karaoke mode ---- */
const audioPlayer = ref<HTMLAudioElement | null>(null)
const karaokeTime = ref(0)

const canKaraoke = computed(
  () => !!(currentSong.value?.phrasing_ready && currentSong.value?.has_audio),
)
// Auto-selected whenever the current song has a ready phrasing sync, but the
// singer can flip back to the plain chords/tempo-guide view (and vice versa)
// with the toggle button or the "K" shortcut.
const karaokeMode = ref(false)

const phrasing = computed<Phrasing | null>(
  () => currentSong.value?.phrasing ?? null,
)
const karaokeWindows = computed(() =>
  phrasing.value ? computeScreenWindows(phrasing.value.screens) : [],
)
const karaokeScreenIndex = computed(() =>
  phrasing.value
    ? findActiveScreenIndex(karaokeWindows.value, karaokeTime.value)
    : -1,
)
const karaokeScreen = computed(() =>
  phrasing.value && karaokeScreenIndex.value >= 0
    ? phrasing.value.screens[karaokeScreenIndex.value]
    : null,
)
const karaokeWindow = computed(() =>
  karaokeScreenIndex.value >= 0
    ? karaokeWindows.value[karaokeScreenIndex.value]
    : null,
)

function onKaraokeTimeUpdate() {
  if (audioPlayer.value) karaokeTime.value = audioPlayer.value.currentTime
}
function toggleKaraokeMode() {
  if (!canKaraoke.value) return
  karaokeMode.value = !karaokeMode.value
  if (!karaokeMode.value && audioPlayer.value) audioPlayer.value.pause()
}
function toggleKaraokePlayback() {
  if (!audioPlayer.value) return
  if (audioPlayer.value.paused) audioPlayer.value.play()
  else audioPlayer.value.pause()
}

function resetForNewSong() {
  resetScroll()
  stopTempoGuide()
  elapsedTempo.value = 0
  bpm.value = (currentSong.value && Number(currentSong.value.tempo)) || 100
  if (audioPlayer.value) audioPlayer.value.pause()
  karaokeTime.value = 0
  karaokeMode.value = canKaraoke.value
}

function next() {
  if (currentIndex.value < props.songs.length - 1) {
    currentIndex.value++
    resetForNewSong()
  }
}
function prev() {
  if (currentIndex.value > 0) {
    currentIndex.value--
    resetForNewSong()
  }
}

const exitHref = computed(() => {
  if (props.exit_href) return props.exit_href
  return props.single && currentSong.value
    ? songsRoutes.show(currentSong.value.slug)
    : songsRoutes.index()
})

function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement | null)?.tagName ?? ""
  if (tag === "INPUT" || tag === "TEXTAREA") return
  if (e.code === "Space") {
    e.preventDefault()
    if (karaokeMode.value) toggleKaraokePlayback()
    else toggleScroll()
  } else if (e.key === "k" || e.key === "K") {
    if (canKaraoke.value) toggleKaraokeMode()
  } else if (e.key === "ArrowRight") next()
  else if (e.key === "ArrowLeft") prev()
  else if (e.key === "ArrowUp") {
    e.preventDefault()
    speed.value = Math.min(300, speed.value + 10)
  } else if (e.key === "ArrowDown") {
    e.preventDefault()
    speed.value = Math.max(0, speed.value - 10)
  } else if (e.key === "+" || e.key === "=") {
    fontScale.value = Math.min(3, Math.round((fontScale.value + 0.1) * 10) / 10)
  } else if (e.key === "-" || e.key === "_") {
    fontScale.value = Math.max(
      0.8,
      Math.round((fontScale.value - 0.1) * 10) / 10,
    )
  } else if (e.key === "p" || e.key === "P") toggleTempoGuide()
}

onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const t = Number(params.get("t") || 0)
  if (t) semitones.value = t
  if (params.get("flat") === "1") preferFlat.value = true
  bpm.value = (currentSong.value && Number(currentSong.value.tempo)) || 100
  karaokeMode.value = canKaraoke.value
  window.addEventListener("keydown", onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown)
  if (rafId) cancelAnimationFrame(rafId)
  if (tempoRaf) cancelAnimationFrame(tempoRaf)
})
</script>

<template>
  <Head :title="currentSong ? `Stage — ${currentSong.title}` : 'Stage Mode'" />

  <div class="bg-background fixed inset-0 z-50 flex flex-col">
    <div
      v-if="!currentSong"
      class="flex flex-1 flex-col items-center justify-center gap-3"
    >
      <p class="text-muted-foreground">
        No song selected for Stage Mode. Star a few songs in the library first.
      </p>
      <Link :href="songsRoutes.index()"
        ><Button variant="outline">Back to library</Button></Link
      >
    </div>
    <template v-else>
      <div class="bg-card flex flex-wrap items-center gap-3 border-b px-4 py-2">
        <Link :href="exitHref"><Button variant="outline">Exit</Button></Link>
        <div class="min-w-[10rem] flex-1 font-semibold">
          {{ currentSong.title }}
          <span
            v-if="currentSong.artist"
            class="text-muted-foreground font-normal"
            >&mdash; {{ currentSong.artist }}</span
          >
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <template v-if="!single">
            <Button
              variant="outline"
              size="sm"
              :disabled="currentIndex === 0"
              @click="prev"
              >&#9664; Prev</Button
            >
            <span class="text-sm font-semibold"
              >{{ currentIndex + 1 }}/{{ songs.length }}</span
            >
            <Button
              variant="outline"
              size="sm"
              :disabled="currentIndex === songs.length - 1"
              @click="next"
              >Next &#9654;</Button
            >
          </template>
          <Button
            v-if="canKaraoke"
            variant="outline"
            size="sm"
            @click="toggleKaraokeMode"
            title="Toggle audio-synced karaoke sync (K)"
            >{{ karaokeMode ? "Chords view" : "Karaoke sync" }}</Button
          >
          <TransposeControl
            v-model:semitones="semitones"
            v-model:preferFlat="preferFlat"
          />
          <label
            class="text-muted-foreground flex items-center gap-1.5 text-xs"
          >
            A
            <input
              type="range"
              min="0.8"
              max="3"
              step="0.1"
              v-model.number="fontScale"
            />
            A
          </label>
          <Button variant="outline" size="sm" @click="toggleScroll">{{
            scrolling ? "Pause" : "Auto-scroll"
          }}</Button>
          <input
            type="range"
            min="0"
            max="300"
            step="5"
            v-model.number="speed"
            title="Scroll speed"
          />
        </div>
      </div>

      <div
        v-if="!karaokeMode"
        class="bg-muted/40 flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm"
      >
        <Button size="sm" @click="toggleTempoGuide">
          {{
            tempoPlaying
              ? "Pause tempo guide"
              : tempoFinished
                ? "Restart tempo guide"
                : "Play tempo guide"
          }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          title="Back to the start"
          @click="restartTempoGuide"
          >Restart</Button
        >
        <label class="text-muted-foreground flex items-center gap-1.5">
          BPM
          <input
            type="number"
            min="20"
            max="300"
            v-model.number="bpm"
            class="bg-background w-16 rounded border px-1.5 py-0.5"
          />
        </label>
        <label class="text-muted-foreground flex items-center gap-1.5">
          Beats/line
          <input
            type="number"
            min="1"
            max="8"
            v-model.number="beatsPerLine"
            class="bg-background w-14 rounded border px-1.5 py-0.5"
          />
        </label>
        <span class="text-muted-foreground text-xs">
          Follows the song's tempo &mdash; a ball hops word to word, and the
          current word lights up. Press P to toggle.
        </span>
      </div>

      <div
        v-if="karaokeMode"
        class="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-8 py-10"
      >
        <audio
          ref="audioPlayer"
          :src="currentSong.audio_url ?? undefined"
          controls
          class="w-full max-w-xl"
          @timeupdate="onKaraokeTimeUpdate"
        ></audio>
        <PhrasingScreen
          :screen="karaokeScreen"
          :window="karaokeWindow"
          :current-time="karaokeTime"
          class="w-full max-w-3xl"
        />
        <p class="text-muted-foreground text-xs">
          Press Space to play/pause &middot; K for the chords view
        </p>
      </div>
      <div v-else ref="bodyRef" class="flex-1 overflow-y-auto px-8 pt-6 pb-16">
        <SongBody
          :blocks="blocks"
          :semitones="semitones"
          :prefer-flat="preferFlat"
          :font-scale="fontScale"
          :active-block-index="activeBlockIndex"
          :active-word-index="activeWordIndex"
        />
      </div>
    </template>
  </div>
</template>
