<script setup lang="ts">
import { Head, router } from "@inertiajs/vue3"
import { useFullscreen, useLocalStorage } from "@vueuse/core"
import {
  Guitar,
  ListMusic,
  LogOut,
  Maximize,
  MicVocal,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  Settings2,
  SkipBack,
  SkipForward,
} from "lucide-vue-next"
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"

import SongBody from "@/components/karaoke/SongBody.vue"
import LyricStage from "@/components/karaoke/tv/LyricStage.vue"
import TvButton from "@/components/karaoke/tv/TvButton.vue"
import TvPanel from "@/components/karaoke/tv/TvPanel.vue"
import TvShell from "@/components/karaoke/tv/TvShell.vue"
import TvStepper from "@/components/karaoke/tv/TvStepper.vue"
import { useKeyShift } from "@/composables/useKeyShift"
import { useMediaClock } from "@/composables/useMediaClock"
import {
  isButtonTarget,
  isTypingTarget,
  useMediaSession,
} from "@/composables/useTv"
import { parseBody } from "@/lib/chordSheet"
import { fromChordSheet, fromPhrasing } from "@/lib/lyricDisplay"
import { buildTimeline, findActive, rescaleElapsed } from "@/lib/tempoGuide"
import { transposeToken } from "@/lib/transpose"
import {
  LYRIC_SCALE,
  SHEET_SCALE,
  signed,
  stepValue,
  useTvPrefs,
} from "@/lib/tvPrefs"
import { songs as songsRoutes } from "@/routes"
import type { Song } from "@/types"

const props = defineProps<{
  songs: Song[]
  single: boolean
  exit_href?: string
}>()

/* ---- which song ---- */
const currentIndex = ref(0)
const currentSong = computed<Song | undefined>(
  () => props.songs[currentIndex.value],
)
const blocks = computed(() =>
  currentSong.value ? parseBody(currentSong.value.body ?? "") : [],
)
const hasPrev = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value < props.songs.length - 1)

/* ---- per-device preferences ---- */
const { view, lyricScale, sheetScale, showChords } = useTvPrefs()
const persist = { initOnMounted: true }
const beatsPerLine = useLocalStorage("chordstage:beatsperline", 4, persist)
const countIn = useLocalStorage("chordstage:countin", 4, persist)
const scrollSpeed = useLocalStorage("chordstage:scrollspeed", 40, persist)

const semitones = ref(0)
const preferFlat = ref(false)
const bpm = ref(100)
const settingsOpen = ref(false)

/* ---- timing source: the real audio track when the song has a finished
   karaoke sync, otherwise the BPM-paced tempo guide over the chord sheet */
const usesAudio = computed(
  () =>
    !!(
      currentSong.value?.phrasing_ready &&
      currentSong.value.has_audio &&
      currentSong.value.audio_url &&
      currentSong.value.phrasing
    ),
)

// Audio
const audioEl = ref<HTMLAudioElement | null>(null)
const { time: audioTime, playing: audioPlaying } = useMediaClock(audioEl)
const audioEnded = ref(false)
const audioSemitones = computed(() => (usesAudio.value ? semitones.value : 0))
const keyShift = useKeyShift(audioEl, audioSemitones)

// Tempo guide clock. It starts at minus the count-in, so the count-in is
// just the clock running up to the song's own zero.
const secPerBeat = computed(() => 60 / (bpm.value > 0 ? bpm.value : 100))
const origin = computed(() => -countIn.value * secPerBeat.value)
const timeline = computed(() =>
  buildTimeline(blocks.value, bpm.value, beatsPerLine.value),
)
const tempoEnd = computed(() => timeline.value.totalDuration + 4)
const tempoTime = ref(0)
const tempoPlaying = ref(false)
let tempoRaf: number | null = null
let tempoLast: number | null = null

function tempoFrame(ts: number) {
  if (!tempoPlaying.value) return
  if (tempoLast != null) {
    tempoTime.value += (ts - tempoLast) / 1000
    if (tempoTime.value >= tempoEnd.value) {
      tempoTime.value = tempoEnd.value
      stopTempo()
      return
    }
  }
  tempoLast = ts
  tempoRaf = requestAnimationFrame(tempoFrame)
}
function startTempo() {
  if (tempoTime.value >= tempoEnd.value) tempoTime.value = origin.value
  stopScroll()
  tempoPlaying.value = true
  tempoLast = null
  tempoRaf = requestAnimationFrame(tempoFrame)
}
function stopTempo() {
  tempoPlaying.value = false
  if (tempoRaf) cancelAnimationFrame(tempoRaf)
  tempoRaf = null
}

/* ---- what the stage shows ---- */
const track = computed(() => {
  const song = currentSong.value
  if (usesAudio.value && song?.phrasing) return fromPhrasing(song.phrasing)
  return fromChordSheet(blocks.value, {
    bpm: bpm.value,
    beatsPerLine: beatsPerLine.value,
    countInBeats: countIn.value,
    semitones: semitones.value,
    preferFlat: preferFlat.value,
  })
})
const time = computed(() => {
  if (!usesAudio.value) return tempoTime.value
  return audioEnded.value ? Infinity : audioTime.value
})
const playing = computed(() =>
  usesAudio.value ? audioPlaying.value : tempoPlaying.value,
)
const atStart = computed(() =>
  usesAudio.value ? audioTime.value <= 0.05 : tempoTime.value <= origin.value,
)

const stageHint = computed(() => {
  if (playing.value) return null
  if (atStart.value) return "Press ▶ Play to start"
  const next = props.songs[currentIndex.value + 1]
  return next ? `Up next: ${next.title}` : null
})

// The chord sheet view's word highlight follows the tempo guide; with an
// audio sync the karaoke view is where the timing lives.
const sheetActive = computed(() => {
  if (usesAudio.value) return { blockIndex: -1, wordIndex: -1 }
  return findActive(
    timeline.value.lines,
    tempoTime.value,
    timeline.value.totalDuration,
  )
})

/* ---- transport ---- */
function play() {
  if (usesAudio.value) {
    stopScroll()
    audioEnded.value = false
    void audioEl.value?.play().catch(() => {})
  } else {
    startTempo()
  }
}
function pause() {
  if (usesAudio.value) audioEl.value?.pause()
  else stopTempo()
}
function togglePlay() {
  if (playing.value) pause()
  else play()
}
function restart() {
  if (usesAudio.value) {
    audioEnded.value = false
    if (audioEl.value) audioEl.value.currentTime = 0
  } else {
    tempoTime.value = origin.value
    tempoLast = null
  }
  if (sheetEl.value) sheetEl.value.scrollTop = 0
}

function goTo(index: number) {
  if (index < 0 || index >= props.songs.length) return
  audioEl.value?.pause()
  stopTempo()
  stopScroll()
  currentIndex.value = index
  resetForSong()
}
const next = () => goTo(currentIndex.value + 1)
const prev = () => goTo(currentIndex.value - 1)

function resetForSong() {
  bpm.value = Number(currentSong.value?.tempo) || 100
  tempoTime.value = origin.value
  audioEnded.value = false
  playbackRate.value = 1
  if (sheetEl.value) sheetEl.value.scrollTop = 0
}

/* ---- tempo: adjustable mid-song without losing your place ---- */
const BPM_RANGE = { min: 40, max: 240, step: 2 }
const RATE_RANGE = { min: 0.7, max: 1.3, step: 0.05 }
const playbackRate = ref(1)

// Changes the tempo guide's speed. The clock is rescaled so the highlight
// stays on the same word and just carries on faster or slower from there.
function setTempo(nextBpm: number, nextBeatsPerLine = beatsPerLine.value) {
  const b = Math.min(
    BPM_RANGE.max,
    Math.max(BPM_RANGE.min, Math.round(nextBpm)),
  )
  const l = Math.min(8, Math.max(1, Math.round(nextBeatsPerLine)))
  if (b === bpm.value && l === beatsPerLine.value) return
  tempoTime.value = rescaleElapsed(
    tempoTime.value,
    { bpm: bpm.value, beatsPerLine: beatsPerLine.value },
    { bpm: b, beatsPerLine: l },
  )
  bpm.value = b
  beatsPerLine.value = l
}

// The karaoke view's Tempo control: the tempo guide's BPM, or for a song
// synced to its audio, the track's playback speed. The browser keeps the
// pitch where it is, and the lyrics follow the audio clock, so they stay
// in sync at any speed.
function nudgeTempo(dir: 1 | -1) {
  if (usesAudio.value) {
    playbackRate.value = stepValue(playbackRate.value, dir, RATE_RANGE)
  } else {
    setTempo(bpm.value + dir * BPM_RANGE.step)
  }
}
const tempoLabel = computed(() =>
  usesAudio.value
    ? `${Math.round(playbackRate.value * 100)}%`
    : String(bpm.value),
)
const canSlowDown = computed(() =>
  usesAudio.value
    ? playbackRate.value > RATE_RANGE.min + 1e-6
    : bpm.value > BPM_RANGE.min,
)
const canSpeedUp = computed(() =>
  usesAudio.value
    ? playbackRate.value < RATE_RANGE.max - 1e-6
    : bpm.value < BPM_RANGE.max,
)

function applyPlaybackRate() {
  const el = audioEl.value
  if (!el) return
  el.preservesPitch = true
  el.defaultPlaybackRate = playbackRate.value
  el.playbackRate = playbackRate.value
}
watch(playbackRate, applyPlaybackRate)

/* ---- chord sheet auto-scroll speed (adjustable while it scrolls) ---- */
const SCROLL_RANGE = { min: 0, max: 300, step: 10 }
function nudgeScroll(dir: 1 | -1) {
  scrollSpeed.value = stepValue(scrollSpeed.value, dir, SCROLL_RANGE)
}
// Shown as a 0-30 level rather than raw pixels per second.
const scrollLabel = computed(() => String(Math.round(scrollSpeed.value / 10)))

/* ---- key / size / view ---- */
const KEY_RANGE = 6
const keyLabel = computed(() => {
  const st = semitones.value
  const songKey = currentSong.value?.key
  if (songKey && !usesAudio.value) {
    const k = transposeToken(songKey, st, preferFlat.value)
    return st ? `${k} (${signed(st)})` : k
  }
  return st ? signed(st) : "Orig"
})
const keyDisabled = computed(
  () => usesAudio.value && (!keyShift.supported.value || keyShift.failed.value),
)
const keyTitle = computed(() =>
  keyDisabled.value
    ? "Changing an audio track's key needs the app opened over https (or on localhost)"
    : usesAudio.value
      ? "Shifts the backing track's pitch without changing its tempo"
      : "Transposes the chords",
)
function shiftKey(dir: 1 | -1) {
  if (keyDisabled.value) return
  semitones.value = Math.max(
    -KEY_RANGE,
    Math.min(KEY_RANGE, semitones.value + dir),
  )
}

const sizeValue = computed(() =>
  view.value === "karaoke" ? lyricScale.value : sheetScale.value,
)
const sizeRange = computed(() =>
  view.value === "karaoke" ? LYRIC_SCALE : SHEET_SCALE,
)
function resize(dir: 1 | -1) {
  if (view.value === "karaoke") {
    lyricScale.value = stepValue(lyricScale.value, dir, LYRIC_SCALE)
  } else {
    sheetScale.value = stepValue(sheetScale.value, dir, SHEET_SCALE)
  }
}
function toggleView() {
  stopScroll()
  view.value = view.value === "karaoke" ? "sheet" : "karaoke"
}

/* ---- chord sheet auto-scroll ---- */
const sheetEl = ref<HTMLElement | null>(null)
const scrolling = ref(false)
let scrollRaf: number | null = null
let scrollLast: number | null = null
// The position is kept as a fraction: browsers round scrollTop to whole
// pixels, so adding <1px a frame would make slow speeds all scroll at the
// same rounded-up rate and every speed step uneven.
let scrollPos = 0
function scrollFrame(ts: number) {
  if (!scrolling.value) return
  const el = sheetEl.value
  if (scrollLast != null && el) {
    // Someone scrolled by hand: carry on from there.
    if (Math.abs(el.scrollTop - scrollPos) > 2) scrollPos = el.scrollTop
    scrollPos += (scrollSpeed.value * (ts - scrollLast)) / 1000
    el.scrollTop = scrollPos
  } else if (el) {
    scrollPos = el.scrollTop
  }
  scrollLast = ts
  scrollRaf = requestAnimationFrame(scrollFrame)
}
function toggleScroll() {
  if (scrolling.value) return stopScroll()
  // The tempo guide already scrolls to follow its highlight.
  if (!usesAudio.value) stopTempo()
  scrolling.value = true
  scrollLast = null
  scrollRaf = requestAnimationFrame(scrollFrame)
}
function stopScroll() {
  scrolling.value = false
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
  scrollRaf = null
}

/* ---- exit, fullscreen, media keys ---- */
const exitHref = computed(() => {
  if (props.exit_href) return props.exit_href
  return props.single && currentSong.value
    ? songsRoutes.show(currentSong.value.slug).url
    : songsRoutes.index().url
})
function exit() {
  router.visit(exitHref.value)
}

const fullscreen = useFullscreen()

useMediaSession(
  computed(() =>
    currentSong.value
      ? { title: currentSong.value.title, artist: currentSong.value.artist }
      : null,
  ),
  playing,
  { play, pause, next, prev, restart },
)

const statusText = computed(() => {
  const parts: string[] = []
  if (props.songs.length > 1) {
    parts.push(`Song ${currentIndex.value + 1} of ${props.songs.length}`)
  }
  if (!usesAudio.value) parts.push(`Tempo guide · ${bpm.value} BPM`)
  else if (playbackRate.value !== 1) {
    parts.push(`Audio sync · ${Math.round(playbackRate.value * 100)}% speed`)
  } else parts.push("Audio sync")
  return parts.join(" · ")
})

/* ---- keyboard: TvShell handles arrows/Enter for remote navigation ---- */
const hasMediaSession =
  typeof navigator !== "undefined" && "mediaSession" in navigator

function onKeydown(e: KeyboardEvent) {
  if (e.defaultPrevented || settingsOpen.value || isTypingTarget(e)) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const handled = () => e.preventDefault()

  switch (e.key) {
    case " ":
      if (isButtonTarget(e)) return
      handled()
      return togglePlay()
    case "p":
    case "P":
      return togglePlay()
    case "MediaPlayPause":
      if (!hasMediaSession) togglePlay()
      return
    case "MediaPlay":
      return play()
    case "MediaPause":
    case "MediaStop":
      return pause()
    case "r":
    case "R":
    case "Home":
      handled()
      return restart()
    case "n":
    case "N":
    case "PageDown":
      handled()
      return next()
    case "PageUp":
      handled()
      return prev()
    case "MediaTrackNext":
      if (!hasMediaSession) next()
      return
    case "MediaTrackPrevious":
      if (!hasMediaSession) prev()
      return
    case "+":
    case "=":
      return resize(1)
    case "-":
    case "_":
      return resize(-1)
    case "]":
      return shiftKey(1)
    case "[":
      return shiftKey(-1)
    case ",":
    case "<":
      return view.value === "karaoke" ? nudgeTempo(-1) : nudgeScroll(-1)
    case ".":
    case ">":
      return view.value === "karaoke" ? nudgeTempo(1) : nudgeScroll(1)
    case "k":
    case "K":
    case "v":
    case "V":
      return toggleView()
    case "c":
    case "C":
      if (!usesAudio.value) showChords.value = !showChords.value
      return
    case "s":
    case "S":
      if (view.value === "sheet") toggleScroll()
      return
    case "f":
    case "F":
      return void fullscreen.toggle()
  }
}

// Changing BPM or the count-in while stopped at the top keeps you at the
// (new) top, count-in included.
watch(origin, (o, old) => {
  if (!tempoPlaying.value && tempoTime.value <= old) tempoTime.value = o
})

watch(usesAudio, (audio, wasAudio) => {
  if (wasAudio && !audio) audioEl.value?.pause()
})

onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const t = Number(params.get("t") || 0)
  if (t) semitones.value = Math.max(-11, Math.min(11, t))
  if (params.get("flat") === "1") preferFlat.value = true
  resetForSong()
  window.addEventListener("keydown", onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown)
  stopTempo()
  stopScroll()
})
</script>

<template>
  <Head :title="currentSong ? `Stage — ${currentSong.title}` : 'Stage Mode'" />

  <TvShell
    :title="currentSong?.title ?? 'Stage Mode'"
    :subtitle="currentSong?.artist"
    :status="currentSong ? statusText : null"
    :playing="playing"
    :panel-open="settingsOpen"
  >
    <div v-if="!currentSong" class="stage-empty">
      <p>No song selected for Stage Mode.</p>
      <p class="stage-empty__sub">Star a few songs in the library first.</p>
    </div>

    <template v-else>
      <!-- Kept mounted across views and songs: the key-change audio graph
           can only ever attach to one element. -->
      <audio
        ref="audioEl"
        class="hidden"
        preload="auto"
        :src="usesAudio ? (currentSong.audio_url ?? undefined) : undefined"
        @ended="audioEnded = true"
        @seeking="audioEnded = false"
        @loadedmetadata="applyPlaybackRate"
      ></audio>

      <LyricStage
        v-if="view === 'karaoke'"
        :track="track"
        :time="time"
        :scale="lyricScale"
        :show-chords="showChords && !usesAudio"
        :title="currentSong.title"
        :artist="currentSong.artist"
        :hint="stageHint"
      />
      <div v-else ref="sheetEl" class="stage-sheet">
        <SongBody
          tv
          :blocks="blocks"
          :semitones="semitones"
          :prefer-flat="preferFlat"
          :font-scale="sheetScale"
          :active-block-index="sheetActive.blockIndex"
          :active-word-index="sheetActive.wordIndex"
        />
      </div>
    </template>

    <template #dock>
      <div class="tv-dock-group">
        <TvButton :icon="LogOut" label="Exit" @click="exit" />
      </div>
      <div v-if="currentSong" class="tv-dock-group">
        <TvButton
          v-if="!single"
          :icon="SkipBack"
          label="Prev"
          title="Previous song (Page Up)"
          :disabled="!hasPrev"
          @click="prev"
        />
        <TvButton :icon="RotateCcw" label="Restart" @click="restart" />
        <TvButton
          primary
          :icon="playing ? Pause : Play"
          :label="playing ? 'Pause' : 'Play'"
          @click="togglePlay"
        />
        <TvButton
          v-if="!single"
          :icon="SkipForward"
          label="Next"
          title="Next song (N / Page Down)"
          :disabled="!hasNext"
          @click="next"
        />
      </div>
      <div v-if="currentSong" class="tv-dock-group">
        <TvStepper
          label="Key"
          :value="keyLabel"
          dec-label="Key down"
          inc-label="Key up"
          :can-dec="semitones > -KEY_RANGE"
          :can-inc="semitones < KEY_RANGE"
          :disabled="keyDisabled"
          :title="keyTitle"
          @dec="shiftKey(-1)"
          @inc="shiftKey(1)"
        />
      </div>
      <div v-if="currentSong" class="tv-dock-group">
        <TvStepper
          v-if="view === 'karaoke'"
          label="Tempo"
          :value="tempoLabel"
          :unit="usesAudio ? undefined : 'bpm'"
          dec-label="Slower"
          inc-label="Faster"
          :can-dec="canSlowDown"
          :can-inc="canSpeedUp"
          :title="
            usesAudio
              ? 'Playback speed of the track; the pitch stays put (, and .)'
              : 'Tempo guide speed, adjustable mid-song without losing your place (, and .)'
          "
          @dec="nudgeTempo(-1)"
          @inc="nudgeTempo(1)"
        />
        <TvStepper
          v-else
          label="Speed"
          :value="scrollLabel"
          dec-label="Scroll slower"
          inc-label="Scroll faster"
          :can-dec="scrollSpeed > SCROLL_RANGE.min"
          :can-inc="scrollSpeed < SCROLL_RANGE.max"
          title="Auto-scroll speed, adjustable while it scrolls (, and .)"
          @dec="nudgeScroll(-1)"
          @inc="nudgeScroll(1)"
        />
      </div>
      <div v-if="currentSong" class="tv-dock-group">
        <TvStepper
          label="Text"
          :value="`${Math.round(sizeValue * 100)}%`"
          dec-label="Smaller text"
          inc-label="Bigger text"
          :can-dec="sizeValue > sizeRange.min"
          :can-inc="sizeValue < sizeRange.max"
          @dec="resize(-1)"
          @inc="resize(1)"
        />
      </div>
      <div v-if="currentSong" class="tv-dock-group">
        <TvButton
          :icon="view === 'karaoke' ? ScrollText : MicVocal"
          :label="view === 'karaoke' ? 'Sheet' : 'Karaoke'"
          :title="
            view === 'karaoke'
              ? 'Show the full chord sheet'
              : 'Back to karaoke lyrics'
          "
          @click="toggleView"
        />
        <TvButton
          v-if="view === 'karaoke' && !usesAudio"
          :icon="Guitar"
          label="Chords"
          toggle
          :active="showChords"
          @click="showChords = !showChords"
        />
        <TvButton
          v-if="view === 'sheet'"
          :icon="ListMusic"
          label="Scroll"
          title="Auto-scroll the chord sheet (S)"
          toggle
          :active="scrolling"
          @click="toggleScroll"
        />
        <TvButton
          :icon="Settings2"
          label="Settings"
          @click="settingsOpen = true"
        />
      </div>
    </template>

    <template #panel>
      <TvPanel title="Stage settings" @close="settingsOpen = false">
        <template v-if="!usesAudio">
          <TvStepper
            label="Tempo"
            :value="`${bpm} BPM`"
            dec-label="Slower"
            inc-label="Faster"
            :can-dec="bpm > BPM_RANGE.min"
            :can-inc="bpm < BPM_RANGE.max"
            @dec="setTempo(bpm - BPM_RANGE.step)"
            @inc="setTempo(bpm + BPM_RANGE.step)"
          />
          <TvStepper
            label="Beats / line"
            :value="String(beatsPerLine)"
            dec-label="Fewer"
            inc-label="More"
            :can-dec="beatsPerLine > 1"
            :can-inc="beatsPerLine < 8"
            @dec="setTempo(bpm, beatsPerLine - 1)"
            @inc="setTempo(bpm, beatsPerLine + 1)"
          />
          <TvStepper
            label="Count-in"
            :value="countIn ? `${countIn} beats` : 'Off'"
            dec-label="Fewer"
            inc-label="More"
            :can-dec="countIn > 0"
            :can-inc="countIn < 8"
            @dec="countIn = Math.max(0, countIn - 1)"
            @inc="countIn = Math.min(8, countIn + 1)"
          />
        </template>
        <p v-else class="settings-note">
          This song follows its uploaded audio track, so the tempo guide
          settings don&rsquo;t apply &mdash; use Tempo in the controls to speed
          the track up or slow it down.
        </p>
        <TvStepper
          label="Scroll speed"
          :value="scrollLabel"
          dec-label="Slower"
          inc-label="Faster"
          :can-dec="scrollSpeed > SCROLL_RANGE.min"
          :can-inc="scrollSpeed < SCROLL_RANGE.max"
          @dec="nudgeScroll(-1)"
          @inc="nudgeScroll(1)"
        />
        <TvButton
          v-if="fullscreen.isSupported.value"
          :icon="fullscreen.isFullscreen.value ? Minimize : Maximize"
          :label="
            fullscreen.isFullscreen.value ? 'Exit full screen' : 'Full screen'
          "
          title="Full screen (F)"
          @click="fullscreen.toggle()"
        />
        <TvButton
          label="Use flats (B♭)"
          toggle
          :active="preferFlat"
          @click="preferFlat = !preferFlat"
        />
      </TvPanel>
    </template>
  </TvShell>
</template>

<style scoped>
.stage-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 1vh;
  font-size: max(20px, 4vh);
  font-weight: 900;
  text-align: center;
}
.stage-empty__sub {
  color: var(--tv-dim);
  font-size: 0.6em;
}
.stage-sheet {
  height: 100%;
  overflow-y: auto;
  padding: 2vh 4vw 6vh;
  font-size: max(16px, 3.4vh);
}
.settings-note {
  max-width: 60vh;
  color: var(--tv-dim);
  font-size: max(16px, 2.4vh);
  font-weight: 700;
}
</style>
