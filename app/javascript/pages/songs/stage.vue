<script setup lang="ts">
import { Head, router } from "@inertiajs/vue3"
import { useFullscreen, useLocalStorage } from "@vueuse/core"
import {
  Guitar,
  ListMusic,
  LogOut,
  Maximize,
  Mic,
  MicOff,
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

import LyricStage from "@/components/karaoke/tv/LyricStage.vue"
import SheetView from "@/components/karaoke/tv/SheetView.vue"
import TvButton from "@/components/karaoke/tv/TvButton.vue"
import TvPanel from "@/components/karaoke/tv/TvPanel.vue"
import TvShell from "@/components/karaoke/tv/TvShell.vue"
import TvStepper from "@/components/karaoke/tv/TvStepper.vue"
import { useMediaClock } from "@/composables/useMediaClock"
import { useTrackFx } from "@/composables/useTrackFx"
import {
  isButtonTarget,
  isTypingTarget,
  useMediaSession,
} from "@/composables/useTv"
import { parseBody } from "@/lib/chordSheet"
import { lineBeatsFor } from "@/lib/lineTiming"
import { fromChordSheet, fromPhrasing } from "@/lib/lyricDisplay"
import { untapped, withCurrentTokens } from "@/lib/phrasing"
import { timelineFromSync } from "@/lib/syncedSheet"
import { buildTimeline, guideAt, remapElapsed } from "@/lib/tempoGuide"
import { transposeToken } from "@/lib/transpose"
import {
  LYRIC_SCALE,
  SHEET_SCALE,
  signed,
  stepValue,
  useTvPrefs,
} from "@/lib/tvPrefs"
import { songs as songsRoutes, songsPhrasings, songsTimings } from "@/routes"
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
// How the chord sheet's Scroll moves for a tempo-guide song: at the song's
// own pace (line by line, as long as each line lasts -- see Line timing),
// or at a free speed in pixels per second.
const scrollPace = useLocalStorage<"song" | "free">(
  "chordstage:scrollpace",
  "song",
  persist,
)

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
// The recording plays in the karaoke view only. In the chord sheet view an
// audio-synced song is silent: the sheet scrolls line by line at the
// timing tapped out in its karaoke sync (lib/syncedSheet.ts), for a band
// or singer reading along live, at the Tempo set here.
const audioActive = computed(() => usesAudio.value && view.value === "karaoke")
const syncedSheet = computed(() => usesAudio.value && view.value === "sheet")

// A song with its audio uploaded but no finished karaoke sync follows the
// tempo guide instead -- say why, since that's also why there's no Vocals
// control for it.
const syncNote = computed(() => {
  const song = currentSong.value
  if (!song || usesAudio.value || !song.has_audio) return null
  if (!song.phrasing) {
    return "This song has its recording uploaded but no karaoke sync yet, so it's following the tempo guide. Make one on its Karaoke sync page to play the recording here, with Vocals."
  }
  const left = untapped(song.phrasing)
  if (!left.count) return null
  const what = `${left.count} ${left.unit}${left.count === 1 ? "" : "s"}`
  return `This song's karaoke sync still has ${what} to tap, so it's following the tempo guide. Finish ${left.count === 1 ? "it" : "them"} on the Karaoke sync page to play the recording here, with Vocals.`
})
function finishSync() {
  const song = currentSong.value
  if (song) router.visit(songsPhrasings.show({ song_id: song.slug }).url)
}

// Audio
const audioEl = ref<HTMLAudioElement | null>(null)
const { time: audioTime, playing: audioPlaying } = useMediaClock(audioEl)
const audioEnded = ref(false)
const audioSemitones = computed(() => (usesAudio.value ? semitones.value : 0))

/* ---- vocals: the singer's own voice over the band ----
   On: the original recording. Guide: its lead vocal turned well down, so
   the melody's still faintly there to follow. Off: the song's uploaded
   minus-one track if it has one (cleanest), otherwise the lead vocal
   masked out of the original (lib/vocalMask.ts). */
type VocalMode = "on" | "guide" | "off"
const VOCAL_MODES: VocalMode[] = ["on", "guide", "off"]
const VOCAL_LABELS: Record<VocalMode, string> = {
  on: "On",
  guide: "Guide",
  off: "Off",
}
const GUIDE_LEVEL = 0.3
const vocalMode = useLocalStorage<VocalMode>("chordstage:vocals", "on", persist)
const instrumentalUrl = computed(
  () => currentSong.value?.instrumental_url ?? null,
)
const useInstrumental = computed(
  () => usesAudio.value && vocalMode.value === "off" && !!instrumentalUrl.value,
)
// Seconds the minus-one runs ahead of the original (from the sync editor).
const playOffset = computed(() =>
  useInstrumental.value
    ? Number(currentSong.value?.phrasing?.instrumentalOffset) || 0
    : 0,
)
const audioSrc = computed(() => {
  const song = currentSong.value
  if (!usesAudio.value || !song) return undefined
  return (
    (useInstrumental.value ? instrumentalUrl.value : song.audio_url) ??
    undefined
  )
})
const vocalLevel = computed(() => {
  if (!usesAudio.value || useInstrumental.value) return 1
  if (vocalMode.value === "off") return 0
  return vocalMode.value === "guide" ? GUIDE_LEVEL : 1
})
const fx = useTrackFx(audioEl, audioSemitones, vocalLevel)
const vocalHow = computed(() => {
  if (vocalMode.value === "on") return "The original recording."
  if (useInstrumental.value) return "Playing the song's minus-one track."
  if (!fx.vocalSupported.value) {
    return "This browser can't mask the vocal. Upload a minus-one track for this song instead."
  }
  if (fx.mono.value) {
    return "This recording is mono, so its vocal can't be masked. Upload a minus-one track for this song instead."
  }
  return vocalMode.value === "guide"
    ? "The lead vocal is turned well down, so the melody is still faintly there to follow."
    : "The lead vocal is masked out of the recording. Works best on studio mixes; a minus-one track is cleaner."
})
function cycleVocals() {
  const i = VOCAL_MODES.indexOf(vocalMode.value)
  vocalMode.value = VOCAL_MODES[(i + 1) % VOCAL_MODES.length]
}

// Switching between the original and the minus-one mid-song carries on
// from the same spot in the song (and keeps playing if it was).
const pendingSeek = ref<{ time: number; play: boolean } | null>(null)
const heldTime = ref<number | null>(null)
watch(
  () => [currentSong.value?.id, audioSrc.value, playOffset.value] as const,
  ([id, src, offset], [oldId, oldSrc, oldOffset]) => {
    const el = audioEl.value
    if (!el || id !== oldId || !src || !oldSrc) return
    const songTime = el.currentTime - (oldOffset ?? 0)
    if (src === oldSrc) {
      // Same file, the offset changed: just move.
      el.currentTime = Math.max(0, songTime + offset)
      return
    }
    pendingSeek.value = {
      time: Math.max(0, songTime + offset),
      play: !el.paused && !el.ended,
    }
    heldTime.value = songTime
  },
)
function onLoadedMetadata() {
  applyPlaybackRate()
  const el = audioEl.value
  const seek = pendingSeek.value
  if (!el || !seek) return
  pendingSeek.value = null
  el.currentTime = seek.time
  heldTime.value = null
  if (seek.play) void el.play().catch(() => {})
}

// Tempo guide clock. It starts at minus the count-in, so the count-in is
// just the clock running up to the song's own zero.
// The karaoke sync's own tempo (found from its line taps), for the synced
// sheet's BPM and count-in.
const syncBpm = computed(() => {
  const song = currentSong.value
  if (!usesAudio.value || !song) return null
  return Number(song.phrasing?.sync?.bpm) || Number(song.tempo) || null
})
const secPerBeat = computed(() =>
  syncedSheet.value
    ? 60 / (syncBpm.value || 100)
    : 60 / (bpm.value > 0 ? bpm.value : 100),
)
const origin = computed(() => -countIn.value * secPerBeat.value)
// The song's own line lengths (its Line timing), where it has them.
function lineBeatsAt(perLine: number) {
  return lineBeatsFor(blocks.value, currentSong.value?.line_timing, perLine)
}
const lineBeats = computed(() => lineBeatsAt(beatsPerLine.value))
const hasLineTiming = computed(() => lineBeats.value.some((b) => b != null))
const timeline = computed(() =>
  buildTimeline(blocks.value, bpm.value, beatsPerLine.value, lineBeats.value),
)
// The sheet timed by the karaoke sync (in the recording's seconds).
const syncTimeline = computed(() => {
  const song = currentSong.value
  if (!usesAudio.value || !song?.phrasing) return null
  return timelineFromSync(blocks.value, song.phrasing, 4 * secPerBeat.value)
})
const tempoEnd = computed(
  () =>
    (syncedSheet.value && syncTimeline.value
      ? syncTimeline.value.totalDuration
      : timeline.value.totalDuration) + 4,
)
// The synced sheet runs on the recording's clock, sped up or slowed down
// by the Tempo; the tempo guide's own timeline is already at its BPM.
const clockRate = computed(() => (syncedSheet.value ? playbackRate.value : 1))
const tempoTime = ref(0)
const tempoPlaying = ref(false)
let tempoRaf: number | null = null
let tempoLast: number | null = null

function tempoFrame(ts: number) {
  if (!tempoPlaying.value) return
  if (tempoLast != null) {
    tempoTime.value += ((ts - tempoLast) / 1000) * clockRate.value
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
  if (usesAudio.value && song?.phrasing) {
    return fromPhrasing(withCurrentTokens(song.phrasing))
  }
  return fromChordSheet(blocks.value, {
    bpm: bpm.value,
    beatsPerLine: beatsPerLine.value,
    lineBeats: lineBeats.value,
    countInBeats: countIn.value,
    semitones: semitones.value,
    preferFlat: preferFlat.value,
  })
})
const time = computed(() => {
  if (!usesAudio.value) return tempoTime.value
  if (heldTime.value != null) return heldTime.value
  return audioEnded.value ? Infinity : audioTime.value - playOffset.value
})
const playing = computed(() =>
  audioActive.value ? audioPlaying.value : tempoPlaying.value,
)
const atStart = computed(() =>
  audioActive.value ? audioTime.value <= 0.05 : tempoTime.value <= origin.value,
)

const stageHint = computed(() => {
  if (playing.value) return null
  if (atStart.value) return "Press ▶ Play to start"
  const next = props.songs[currentIndex.value + 1]
  return next ? `Up next: ${next.title}` : null
})

// The chord sheet view's ball, word fill and glide follow the tempo guide,
// or for an audio-synced song, its karaoke sync's timing.
const sheetGuide = computed(() => {
  if (usesAudio.value) {
    return syncTimeline.value
      ? guideAt(syncTimeline.value.lines, tempoTime.value)
      : null
  }
  return guideAt(timeline.value.lines, tempoTime.value)
})

/* ---- transport ---- */
function play() {
  if (audioActive.value) {
    audioEnded.value = false
    void audioEl.value?.play().catch(() => {})
  } else {
    startTempo()
  }
}
function pause() {
  if (audioActive.value) audioEl.value?.pause()
  else stopTempo()
}
function togglePlay() {
  if (playing.value) pause()
  else play()
}
function restart() {
  if (audioActive.value) {
    audioEnded.value = false
    if (audioEl.value) audioEl.value.currentTime = 0
  } else {
    tempoTime.value = origin.value
    tempoLast = null
  }
  sheetView.value?.toTop()
}

function goTo(index: number) {
  if (index < 0 || index >= props.songs.length) return
  audioEl.value?.pause()
  stopTempo()
  stopScroll()
  sheetBall.value = true
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
  sheetView.value?.toTop()
}

/* ---- tempo: adjustable mid-song without losing your place ---- */
const BPM_RANGE = { min: 40, max: 240, step: 2 }
const RATE_RANGE = { min: 0.7, max: 1.3, step: 0.05 }
// The silent synced sheet can go further either way (a band rehearsing
// slowly, say); steps of 2 BPM when the sync has a tempo.
const SHEET_RATE = { min: 0.5, max: 1.5, step: 0.05 }
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
  // Same line, same point in it, whatever length each line now has.
  tempoTime.value = remapElapsed(
    tempoTime.value,
    timeline.value,
    buildTimeline(blocks.value, b, l, lineBeatsAt(l)),
    bpm.value,
    b,
  )
  bpm.value = b
  beatsPerLine.value = l
}

// The karaoke view's Tempo control: the tempo guide's BPM, or for a song
// synced to its audio, the track's playback speed. The browser keeps the
// pitch where it is, and the lyrics follow the audio clock, so they stay
// in sync at any speed.
function nudgeTempo(dir: 1 | -1) {
  if (syncedSheet.value) {
    const base = syncBpm.value
    const next = base
      ? (Math.round(base * playbackRate.value) + dir * BPM_RANGE.step) / base
      : playbackRate.value + dir * SHEET_RATE.step
    playbackRate.value = Math.min(
      SHEET_RATE.max,
      Math.max(SHEET_RATE.min, next),
    )
  } else if (usesAudio.value) {
    playbackRate.value = stepValue(playbackRate.value, dir, RATE_RANGE)
  } else {
    setTempo(bpm.value + dir * BPM_RANGE.step)
  }
}
const tempoInBpm = computed(
  () => !usesAudio.value || (syncedSheet.value && !!syncBpm.value),
)
const tempoLabel = computed(() => {
  if (syncedSheet.value && syncBpm.value) {
    return String(Math.round(syncBpm.value * playbackRate.value))
  }
  return usesAudio.value
    ? `${Math.round(playbackRate.value * 100)}%`
    : String(bpm.value)
})
const rateRange = computed(() => (syncedSheet.value ? SHEET_RATE : RATE_RANGE))
const canSlowDown = computed(() =>
  usesAudio.value
    ? playbackRate.value > rateRange.value.min + 1e-6
    : bpm.value > BPM_RANGE.min,
)
const canSpeedUp = computed(() =>
  usesAudio.value
    ? playbackRate.value < rateRange.value.max - 1e-6
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
  if (songKey && !audioActive.value) {
    const k = transposeToken(songKey, st, preferFlat.value)
    return st ? `${k} (${signed(st)})` : k
  }
  return st ? signed(st) : "Orig"
})
const keyDisabled = computed(
  () => audioActive.value && (!fx.supported.value || fx.failed.value),
)
const keyTitle = computed(() =>
  keyDisabled.value
    ? "Changing an audio track's key needs the app opened over https (or on localhost)"
    : audioActive.value
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

/* ---- chord sheet auto-scroll (the scrolling itself, and marking the
   line on the reading line, live in SheetView) ---- */
const sheetView = ref<InstanceType<typeof SheetView> | null>(null)
const scrolling = ref(false)
// A tempo-guide song's sheet scrolls at the song's pace: the tempo clock
// runs and the sheet glides one line to the next over exactly as long as
// each line lasts, with the current line marked but no ball (a clean
// teleprompter). Its speed is the Tempo. Free scrolling (pixels per
// second) is for audio-synced songs, or when chosen in Settings.
const songPaced = computed(
  () => (!usesAudio.value || syncedSheet.value) && scrollPace.value === "song",
)
const sheetBall = ref(true)
const scrollActive = computed(() =>
  songPaced.value ? tempoPlaying.value && !sheetBall.value : scrolling.value,
)
function toggleScroll() {
  if (songPaced.value) {
    if (tempoPlaying.value && !sheetBall.value) {
      stopTempo()
      sheetBall.value = true
    } else {
      sheetBall.value = false
      if (!tempoPlaying.value) startTempo()
    }
    return
  }
  if (scrolling.value) return stopScroll()
  // The song-paced clock already scrolls to follow its highlight.
  if (!audioActive.value) stopTempo()
  scrolling.value = true
}
function stopScroll() {
  scrolling.value = false
}
// The sheet's Tempo/Speed stepper, and , / . on the keyboard.
const sheetTempo = computed(() => view.value === "karaoke" || songPaced.value)
function nudgePace(dir: 1 | -1) {
  if (sheetTempo.value) nudgeTempo(dir)
  else nudgeScroll(dir)
}
function toggleScrollPace() {
  stopScroll()
  if (!sheetBall.value) stopTempo()
  sheetBall.value = true
  scrollPace.value = scrollPace.value === "song" ? "free" : "song"
}
function editLineTiming() {
  const song = currentSong.value
  if (song) router.visit(songsTimings.show({ song_id: song.slug }).url)
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
  if (syncedSheet.value) {
    parts.push(
      syncBpm.value
        ? `Karaoke sync timing · ${tempoLabel.value} BPM`
        : `Karaoke sync timing · ${tempoLabel.value} speed`,
    )
  } else if (!usesAudio.value) {
    parts.push(`Tempo guide · ${bpm.value} BPM`)
    if (hasLineTiming.value) parts.push("line timing")
    if (syncNote.value) parts.push("karaoke sync unfinished")
  } else if (playbackRate.value !== 1) {
    parts.push(`Audio sync · ${Math.round(playbackRate.value * 100)}% speed`)
  } else parts.push("Audio sync")
  if (audioActive.value && vocalMode.value !== "on") {
    parts.push(vocalMode.value === "guide" ? "guide vocal" : "vocals off")
  }
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
      return nudgePace(-1)
    case ".":
    case ">":
      return nudgePace(1)
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
    case "m":
    case "M":
      if (audioActive.value) cycleVocals()
      return
  }
}

// Changing BPM or the count-in while stopped at the top keeps you at the
// (new) top, count-in included.
watch(origin, (o, old) => {
  if (!tempoPlaying.value && tempoTime.value <= old) tempoTime.value = o
})

// Switching views mid-song carries on from the same spot: the karaoke
// view's recording hands over to the sheet's silent sync clock and back.
watch(view, (v, old) => {
  if (!usesAudio.value || v === old) return
  const el = audioEl.value
  if (v === "sheet") {
    const wasPlaying = audioPlaying.value
    const t = el ? el.currentTime - playOffset.value : 0
    el?.pause()
    sheetBall.value = true
    tempoTime.value = el && t > 0.05 ? t : origin.value
    if (wasPlaying) startTempo()
  } else {
    const wasPlaying = tempoPlaying.value
    const t = tempoTime.value
    stopTempo()
    playbackRate.value = Math.min(
      RATE_RANGE.max,
      Math.max(RATE_RANGE.min, playbackRate.value),
    )
    if (el) {
      audioEnded.value = false
      el.currentTime = Math.max(0, t) + playOffset.value
      if (wasPlaying) void el.play().catch(() => {})
    }
  }
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
        :src="audioSrc"
        @ended="audioEnded = true"
        @seeking="audioEnded = false"
        @loadedmetadata="onLoadedMetadata"
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
      <SheetView
        v-else
        ref="sheetView"
        :blocks="blocks"
        :semitones="semitones"
        :prefer-flat="preferFlat"
        :font-scale="sheetScale"
        :guide="sheetGuide"
        :ball="sheetBall"
        :auto-scroll="scrolling"
        :speed="scrollSpeed"
      />
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
          v-if="sheetTempo"
          label="Tempo"
          :value="tempoLabel"
          :unit="tempoInBpm ? 'bpm' : undefined"
          dec-label="Slower"
          inc-label="Faster"
          :can-dec="canSlowDown"
          :can-inc="canSpeedUp"
          :title="
            syncedSheet
              ? 'The karaoke sync\'s pace, sped up or slowed down: the sheet moves on as each line ends (, and .)'
              : usesAudio
                ? 'Playback speed of the track; the pitch stays put (, and .)'
                : view === 'sheet'
                  ? 'The song\'s pace: the sheet moves on as each line ends (, and .)'
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
          v-if="view === 'karaoke' && usesAudio"
          :icon="vocalMode === 'on' ? Mic : MicOff"
          :label="`Vocals: ${VOCAL_LABELS[vocalMode]}`"
          title="Lead vocal: On, Guide (quiet) or Off, to sing it yourself (M)"
          toggle
          :active="vocalMode !== 'on'"
          @click="cycleVocals"
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
          :title="
            songPaced
              ? 'Scroll the chord sheet at the song\'s pace, marking the current line (S)'
              : 'Auto-scroll the chord sheet (S)'
          "
          toggle
          :active="scrollActive"
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
        <template v-if="syncNote">
          <p class="settings-note settings-note--warn">{{ syncNote }}</p>
          <TvButton
            v-if="currentSong?.owned"
            label="Finish karaoke sync"
            @click="finishSync"
          />
        </template>
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
        <template v-else-if="syncedSheet">
          <p class="settings-note">
            In the sheet view the recording doesn&rsquo;t play: the sheet
            scrolls line by line at the timing tapped out in this song&rsquo;s
            karaoke sync{{ syncBpm ? ` (${Math.round(syncBpm)} BPM)` : "" }}.
            Tempo speeds it up or slows it down; Play shows the ball, Scroll a
            clean teleprompter. The Karaoke view plays the recording.
          </p>
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
        <template v-else>
          <p class="settings-note">
            This song plays its recording, synced to its karaoke sync, so the
            tempo guide settings don&rsquo;t apply &mdash; use Tempo in the
            controls to speed the track up or slow it down.
          </p>
          <div class="settings-row" role="group" aria-label="Lead vocal">
            <span class="settings-label">Vocals</span>
            <TvButton
              v-for="mode in VOCAL_MODES"
              :key="mode"
              :label="VOCAL_LABELS[mode]"
              toggle
              :active="vocalMode === mode"
              @click="vocalMode = mode"
            />
          </div>
          <p class="settings-note">{{ vocalHow }}</p>
        </template>
        <template v-if="!usesAudio || syncedSheet">
          <TvButton
            label="Scroll at song pace"
            title="The sheet's Scroll follows the song's tempo and line timing; turn off to scroll at a free speed"
            toggle
            :active="scrollPace === 'song'"
            @click="toggleScrollPace"
          />
          <p v-if="!usesAudio" class="settings-note">
            {{
              hasLineTiming
                ? "This song has its own line timing, so each line lasts as long as it really does."
                : "Every line lasts " +
                  beatsPerLine +
                  " beats. Give lines their real lengths with Line timing to match the song's pace."
            }}
          </p>
          <TvButton
            v-if="currentSong?.owned && !usesAudio"
            label="Edit line timing"
            @click="editLineTiming"
          />
        </template>
        <TvStepper
          v-if="!songPaced"
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
.settings-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1vh;
}
.settings-label {
  min-width: 8vh;
  color: var(--tv-dim);
  font-size: max(16px, 2.4vh);
  font-weight: 800;
}
.settings-note.settings-note--warn {
  color: #ffe600;
}
.settings-note {
  max-width: 60vh;
  color: var(--tv-dim);
  font-size: max(16px, 2.4vh);
  font-weight: 700;
}
</style>
