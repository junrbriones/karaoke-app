<script setup lang="ts">
import { Head, Link, router } from "@inertiajs/vue3"
import { useDebounceFn, useLocalStorage } from "@vueuse/core"
import { Minus, Play, Plus, RotateCcw } from "lucide-vue-next"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

import LyricStage from "@/components/karaoke/tv/LyricStage.vue"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useMediaClock } from "@/composables/useMediaClock"
import { useTrackFx } from "@/composables/useTrackFx"
import AppLayout from "@/layouts/AppLayout.vue"
import { alignTracks } from "@/lib/alignTracks"
import { parseBody } from "@/lib/chordSheet"
import {
  type Cue,
  DEFAULT_PACE,
  type TempoCandidate,
  applyLineSync,
  cueLine,
  cuesOf,
  detectTempo,
  fitPhase,
  onsetsOf,
} from "@/lib/lineSync"
import { formatClockTime, parseClockTime } from "@/lib/lineTiming"
import { fromPhrasing } from "@/lib/lyricDisplay"
import {
  type PhrasingLine,
  type PhrasingScreen as PhrasingScreenData,
  type PhrasingSync,
  carrySameShape,
  flattenTokens,
  isComplete,
  lintScreens,
  lyricsOnlyText,
  parsePhrasingText,
  phrasingShape,
  rehydrateTimes,
  resolveToken,
} from "@/lib/phrasing"
import { lineTimingFromSync } from "@/lib/sharedTiming"
import { help, songs as songsRoutes, songsPhrasings } from "@/routes"
import type { BreadcrumbItem, Song } from "@/types"

const props = defineProps<{ song: Song }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Songs", href: songsRoutes.index().url },
  { title: props.song.title, href: songsRoutes.show(props.song.slug).url },
  {
    title: "Karaoke sync",
    href: songsPhrasings.show({ song_id: props.song.slug }).url,
  },
]

/* ---- lyrics text + parsed screens ---- */
const initialPhrasing = props.song.phrasing
const sourceText = ref(
  initialPhrasing?.sourceText ??
    lyricsOnlyText(parseBody(props.song.body ?? "")),
)
const screens = ref<PhrasingScreenData[]>(
  initialPhrasing && initialPhrasing.screens.length
    ? initialPhrasing.screens
    : parsePhrasingText(sourceText.value),
)

/* ---- how it's synced: a tap per line (words placed for you), or a tap
   per word. A sync made before line mode existed opens in word mode. ---- */
const hadWordTaps = (initialPhrasing?.screens ?? []).some((s) =>
  s.lines.some((l) => l.tokens.some((t) => t.time != null)),
)
const sync = ref<PhrasingSync>({
  mode: initialPhrasing?.sync?.mode ?? (hadWordTaps ? "word" : "line"),
  bpm: initialPhrasing?.sync?.bpm ?? null,
  phase: initialPhrasing?.sync?.phase ?? null,
  grid: initialPhrasing?.sync?.grid ?? 2,
  ...(initialPhrasing?.sync?.pace != null
    ? { pace: initialPhrasing.sync.pace }
    : {}),
  ...(initialPhrasing?.sync?.source
    ? { source: initialPhrasing.sync.source }
    : {}),
})
const lineMode = computed(() => sync.value.mode === "line")

const lineSynced = computed(() => applyLineSync(screens.value, sync.value))
// What plays: the word times derived from the line taps, or the word taps.
const effectiveScreens = computed(() =>
  lineMode.value ? lineSynced.value.screens : screens.value,
)
const complete = computed(() =>
  lineMode.value ? lineSynced.value.complete : isComplete(screens.value),
)

/* ---- word mode bookkeeping ---- */
const tokenRefs = computed(() => flattenTokens(screens.value))
const lint = computed(() => lintScreens(screens.value))
const tappedCount = computed(
  () =>
    tokenRefs.value.filter((r) => resolveToken(screens.value, r).time != null)
      .length,
)

function firstUntappedIndex(): number {
  const idx = tokenRefs.value.findIndex(
    (r) => resolveToken(screens.value, r).time == null,
  )
  return idx === -1 ? tokenRefs.value.length : idx
}

const tapPointer = ref(firstUntappedIndex())

/* ---- line mode bookkeeping ---- */
const cues = computed<Cue[]>(() => cuesOf(screens.value))
// After the last line there's one more tap: where it ends (unless a break
// comes last, which ends it already).
const needsEndCue = computed(
  () => cues.value[cues.value.length - 1]?.kind === "line",
)
const totalCues = computed(
  () => cues.value.length + (needsEndCue.value ? 1 : 0),
)
const lastLine = computed<PhrasingLine | null>(() => {
  const last = cues.value[cues.value.length - 1]
  return last ? cueLine(screens.value, last) : null
})
const tappedLines = computed(
  () => cues.value.filter((c) => c.kind === "line" && c.time != null).length,
)
const lineCount = computed(
  () => cues.value.filter((c) => c.kind === "line").length,
)

function firstUntappedCue(): number {
  const idx = cues.value.findIndex((c) => c.time == null)
  if (idx !== -1) return idx
  if (needsEndCue.value && lastLine.value?.end == null) return cues.value.length
  return totalCues.value
}
const cuePointer = ref(firstUntappedCue())
// The next cue still waiting for a tap, from `from` on -- so tapping the
// gaps (Tap the rest) skips over lines already tapped.
function nextUntappedCue(from: number): number {
  for (let k = from; k < cues.value.length; k++) {
    if (cues.value[k].time == null) return k
  }
  // The last line's end is only asked for straight after tapping it.
  const endCue = cues.value.length
  if (from === endCue && needsEndCue.value && lastLine.value?.end == null) {
    return endCue
  }
  return totalCues.value
}

function lineText(line: PhrasingLine | null): string {
  if (!line) return ""
  return line.tokens
    .map((t, i) => (i > 0 && t.wordStart ? " " : "") + t.text)
    .join("")
}
function cueText(cue: Cue): string {
  return cue.kind === "break"
    ? "Instrumental break"
    : lineText(cueLine(screens.value, cue))
}

function rebuildScreens() {
  const fresh = parsePhrasingText(sourceText.value)
  screens.value = rehydrateTimes(fresh, screens.value)
  tapPointer.value = firstUntappedIndex()
  cuePointer.value = firstUntappedCue()
  shapeChanged.value = false
}

// Editing words or timing marks applies as you type (the practice screen
// and the word placement update right away, every tap kept). Adding or
// removing lines or screens changes which tap belongs to which line, so
// that waits for "Build screens".
const shapeChanged = ref(false)
function applyTextEditsNow() {
  const fresh = parsePhrasingText(sourceText.value)
  if (phrasingShape(fresh) !== phrasingShape(screens.value)) {
    shapeChanged.value = true
    return
  }
  shapeChanged.value = false
  screens.value = carrySameShape(fresh, screens.value)
  if (!recording.value) tapPointer.value = firstUntappedIndex()
}
const applyTextEdits = useDebounceFn(applyTextEditsNow, 250)
watch(sourceText, () => void applyTextEdits())

const nextLabel = computed(() => {
  if (lineMode.value) {
    const i = cuePointer.value
    if (i < cues.value.length) {
      const cue = cues.value[i]
      return cue.kind === "break"
        ? "the instrumental break"
        : `“${cueText(cue)}”`
    }
    if (i === cues.value.length && needsEndCue.value) {
      return "the end of the last line"
    }
    return null
  }
  const ref_ = tokenRefs.value[tapPointer.value]
  return ref_ ? `“${resolveToken(screens.value, ref_).text}”` : null
})
// The line (or word) before the next tap: what to tap to line the
// stopwatch up with music playing elsewhere.
const anchorLabel = computed(() => {
  if (lineMode.value) {
    const cue = cues.value[cuePointer.value - 1]
    if (!cue) return ""
    return cue.kind === "break" ? "the instrumental break" : `“${cueText(cue)}”`
  }
  const ref_ = tokenRefs.value[tapPointer.value - 1]
  return ref_ ? `“${resolveToken(screens.value, ref_).text}”` : ""
})

/* ---- audio + playback time ---- */
const audioPlayer = ref<HTMLAudioElement | null>(null)
// Read every frame while playing, so the preview's sweep is as smooth as
// it'll be on the TV.
const { time: currentTime, playing: audioPlaying } = useMediaClock(audioPlayer)

/* ---- what plays while you sync: the original, the original with its
   lead vocal masked, or the song's minus-one track. Everything (taps, the
   preview) runs on the original's clock; the minus-one is shifted onto it
   by its offset. ---- */
type Listen = "original" | "masked" | "minus"
const listen = ref<Listen>("original")
const instrumentalOffset = ref<number>(
  Number(initialPhrasing?.instrumentalOffset) || 0,
)
const hasMinusOne = computed(() => !!props.song.instrumental_url)
watch(hasMinusOne, (has) => {
  if (!has && listen.value === "minus") listen.value = "original"
})
const playingMinusOne = computed(
  () => listen.value === "minus" && hasMinusOne.value,
)
const playOffset = computed(() =>
  playingMinusOne.value ? instrumentalOffset.value : 0,
)
const audioSrc = computed(
  () =>
    (playingMinusOne.value
      ? props.song.instrumental_url
      : props.song.audio_url) ?? undefined,
)
const vocalLevel = computed(() => (listen.value === "masked" ? 0 : 1))
const fx = useTrackFx(audioPlayer, ref(0), vocalLevel)
/* ---- where the music plays: this song's audio, or another app or
   device (Spotify, YouTube, a CD...) -- then a stopwatch keeps time, and
   the times are the music's own (from when it starts) ---- */
type Source = "audio" | "external"
const hasAudio = !!props.song.audio_url
const source = computed<Source>({
  get: () =>
    !hasAudio || sync.value.source === "external" ? "external" : "audio",
  set: (value) => {
    stopTapping()
    pauseMedia()
    sync.value = { ...sync.value, source: value }
  },
})
const external = computed(() => source.value === "external")

const watchTime = ref(0)
const watchRunning = ref(false)
let watchZero = 0
let watchRaf: number | null = null
function watchTick() {
  watchRaf = null
  if (!watchRunning.value) return
  watchTime.value = (performance.now() - watchZero) / 1000
  watchRaf = requestAnimationFrame(watchTick)
}
function watchStart(at = watchTime.value) {
  watchZero = performance.now() - at * 1000
  watchTime.value = at
  watchRunning.value = true
  if (watchRaf == null) watchRaf = requestAnimationFrame(watchTick)
}
function watchStop() {
  if (watchRunning.value)
    watchTime.value = (performance.now() - watchZero) / 1000
  watchRunning.value = false
  if (watchRaf != null) cancelAnimationFrame(watchRaf)
  watchRaf = null
}
onBeforeUnmount(watchStop)

// Where the song is, on the original recording's clock (or the
// stopwatch's, for music playing elsewhere).
const songTime = computed(() =>
  external.value ? watchTime.value : currentTime.value - playOffset.value,
)
function nowSong(): number {
  if (external.value) {
    return watchRunning.value
      ? (performance.now() - watchZero) / 1000
      : watchTime.value
  }
  return (audioPlayer.value?.currentTime ?? 0) - playOffset.value
}
const canPlay = computed(() => external.value || hasAudio)
const mediaRunning = computed(() =>
  external.value ? watchRunning.value : audioPlaying.value,
)
function playMedia() {
  if (external.value) watchStart()
  else void audioPlayer.value?.play()
}
function pauseMedia() {
  watchStop()
  audioPlayer.value?.pause()
}
// Music elsewhere: the first Space after starting lines the stopwatch up
// -- with the music starting, or with the last thing already tapped.
const waiting = ref(false)
// The time of the tap just before the next one, if there is one.
function anchorTime(): number | null {
  if (lineMode.value) return cueTime(cuePointer.value - 1)
  const prev = tokenRefs.value[tapPointer.value - 1]
  return prev ? resolveToken(screens.value, prev).time : null
}
// True when that Space only lined the stopwatch up (nothing to record).
function lineUpStopwatch(): boolean {
  if (!external.value || !waiting.value) return false
  waiting.value = false
  watchStart(anchorTime() ?? 0)
  return true
}
function waitForLineUp() {
  watchStop()
  watchTime.value = Math.max(0, anchorTime() ?? 0)
  waiting.value = true
}
// Switching files mid-song carries on from the same spot. (Changing the
// offset doesn't move the audio -- the lyrics move, so you can line them
// up by ear.)
const pendingSeek = ref<{ time: number; play: boolean } | null>(null)
watch(audioSrc, (src, oldSrc) => {
  const el = audioPlayer.value
  if (!el || !src || !oldSrc || src === oldSrc) return
  const wasMinusOne = oldSrc === props.song.instrumental_url
  const t = el.currentTime - (wasMinusOne ? instrumentalOffset.value : 0)
  pendingSeek.value = {
    time: Math.max(0, t + playOffset.value),
    play: !el.paused && !el.ended,
  }
})
function onLoadedMetadata() {
  const el = audioPlayer.value
  const seekTo = pendingSeek.value
  if (!el || !seekTo) return
  pendingSeek.value = null
  el.currentTime = seekTo.time
  if (seekTo.play) void el.play().catch(() => {})
}

// The practice screen is the real Stage Mode renderer in a 16:9 box --
// what you see here is exactly what the singer will see on the TV.
const previewTrack = computed(() =>
  fromPhrasing({
    sourceText: sourceText.value,
    complete: complete.value,
    screens: effectiveScreens.value,
  }),
)

function round3(x: number): number {
  return Math.round(x * 1000) / 1000
}
// Seeks to a moment of the song (on the original's clock).
function seek(t: number) {
  if (external.value) {
    if (watchRunning.value) watchStart(Math.max(0, t))
    else watchTime.value = Math.max(0, t)
  } else if (audioPlayer.value) {
    audioPlayer.value.currentTime = Math.max(0, t + playOffset.value)
  }
}

/* ---- recording ---- */
const recording = ref(false)

function startTapping() {
  if (!canPlay.value) return
  if (lineMode.value && cuePointer.value >= totalCues.value) {
    cuePointer.value = firstUntappedCue()
  }
  recording.value = true
  if (external.value) waitForLineUp()
  else playMedia()
}
function stopTapping() {
  recording.value = false
  held = null
  pressing.value = false
  waiting.value = false
  pauseMedia()
}

/* -- line mode: press as each line starts; hold while it's sung and let
      go when it ends, if you like (a quick tap is fine too) -- */
const HOLD_MIN = 0.35 // seconds: shorter is a plain tap
let held: { line: PhrasingLine; at: number } | null = null
const pressing = ref(false)

function pressLine() {
  if (!recording.value || pressing.value || !canPlay.value) return
  if (lineUpStopwatch()) return
  const t = round3(nowSong())
  const i = cuePointer.value
  pressing.value = true
  held = null
  if (i < cues.value.length) {
    const cue = cues.value[i]
    const screen = screens.value[cue.screenIndex]
    if (cue.kind === "break") {
      screen.start = t
    } else {
      const line = screen.lines[cue.lineIndex]
      line.start = t
      line.end = null
      held = { line, at: t }
    }
  } else if (i === cues.value.length && needsEndCue.value && lastLine.value) {
    // An end before the line even started is a stray tap.
    if (lastLine.value.start != null && t <= lastLine.value.start) return
    lastLine.value.end = t
  } else {
    return
  }
  cuePointer.value = nextUntappedCue(i + 1)
  if (cuePointer.value >= totalCues.value) {
    recording.value = false
    pauseMedia()
  }
}
function releaseLine() {
  pressing.value = false
  if (!held) return
  const t = nowSong()
  if (t - held.at >= HOLD_MIN) held.line.end = round3(t)
  held = null
}

function clearCue(i: number) {
  if (i >= cues.value.length) {
    if (lastLine.value) lastLine.value.end = null
    return
  }
  const cue = cues.value[i]
  const screen = screens.value[cue.screenIndex]
  if (cue.kind === "break") {
    screen.start = null
  } else {
    screen.lines[cue.lineIndex].start = null
    screen.lines[cue.lineIndex].end = null
  }
}
function cueTime(i: number): number | null {
  if (i >= cues.value.length) return lastLine.value?.end ?? null
  return cues.value[i]?.time ?? null
}

function undoLineTap() {
  if (cuePointer.value === 0) return
  const i = cuePointer.value - 1
  // Music elsewhere can't be rewound from here: tap it again from there.
  if (external.value) {
    retapFrom(i)
    return
  }
  const was = cueTime(i)
  clearCue(i)
  cuePointer.value = i
  // Back up a little, to tap it again.
  if (was != null) seek(was - 2.5)
}
// Clears the taps from this line on and backs up to just before it.
// With music elsewhere, play it from a little before the line before and
// tap that line first: that lines the stopwatch up again.
function retapFrom(i: number) {
  const back = cueTime(i) ?? cueTime(i - 1) ?? 0
  for (let k = i; k < totalCues.value; k++) clearCue(k)
  cuePointer.value = i
  if (external.value) {
    if (!recording.value) {
      recording.value = true
      selectedCue.value = null
    }
    waitForLineUp()
    return
  }
  seek(back - 2.5)
  if (!recording.value) startTapping()
}
/* -- times typed in, e.g. read off the music player's clock -- */
// With it on, changing a line's time moves every later tap by as much --
// handy to line taps made with the stopwatch up with the player's clock.
const shiftLater = useLocalStorage("chordstage:sync-shift-later", false, {
  initOnMounted: true,
})
const timeErrors = ref<Record<number, string>>({})
function timeText(i: number): string {
  const t = cueTime(i)
  return t == null ? "" : formatClockTime(t)
}
function setCueTime(i: number, t: number) {
  if (i >= cues.value.length) {
    if (lastLine.value) lastLine.value.end = round3(t)
    return
  }
  const cue = cues.value[i]
  const screen = screens.value[cue.screenIndex]
  if (cue.kind === "break") {
    screen.start = round3(t)
  } else {
    const line = screen.lines[cue.lineIndex]
    line.start = round3(t)
    if (line.end != null && line.end <= line.start) line.end = null
  }
}
function onTimeFocus(e: FocusEvent) {
  const input = e.target as HTMLInputElement
  input.dataset.was = input.value
  input.select()
}
function onTimeKeydown(e: KeyboardEvent) {
  const input = e.target as HTMLInputElement
  if (e.key === "Enter") {
    e.preventDefault()
    input.blur()
  } else if (e.key === "Escape") {
    e.preventDefault()
    input.value = input.dataset.was ?? input.value
    input.blur()
  }
}
function commitTime(i: number, e: Event) {
  const input = e.target as HTMLInputElement
  const t = parseClockTime(input.value)
  const errors = { ...timeErrors.value }
  delete errors[i]
  if (t != null && Number.isNaN(t)) {
    errors[i] = "Type a time like 1:23.45"
    timeErrors.value = errors
    input.value = timeText(i)
    return
  }
  timeErrors.value = errors
  const old = cueTime(i)
  if (t == null) {
    clearCue(i)
  } else {
    if (old != null && shiftLater.value && t !== old) {
      shiftFrom(i, t - old)
    } else {
      setCueTime(i, t)
    }
  }
  input.value = timeText(i)
  if (!recording.value) cuePointer.value = firstUntappedCue()
}
// Moves cue `i` and everything after it by `delta` seconds: line starts,
// break starts and held line ends (the last line's end is the end cue).
function shiftFrom(i: number, delta: number) {
  const move = (x: number) => round3(Math.max(0, x + delta))
  if (i >= cues.value.length) {
    if (lastLine.value?.end != null)
      lastLine.value.end = move(lastLine.value.end)
    return
  }
  for (let k = i; k < cues.value.length; k++) {
    const cue = cues.value[k]
    const screen = screens.value[cue.screenIndex]
    if (cue.kind === "break") {
      if (screen.start != null) screen.start = move(screen.start)
    } else {
      const line = screen.lines[cue.lineIndex]
      if (line.start != null) line.start = move(line.start)
      if (line.end != null) line.end = move(line.end)
    }
  }
}
// A time that isn't after the one before it.
function outOfOrder(i: number): boolean {
  const t = cueTime(i)
  if (t == null) return false
  for (let k = i - 1; k >= 0; k--) {
    const prev = cueTime(k)
    if (prev != null) return t <= prev
  }
  return false
}

function nudgeCue(i: number, delta: number) {
  const cue = cues.value[i]
  if (!cue || cue.time == null) return
  const t = Math.max(0, round3(cue.time + delta))
  const screen = screens.value[cue.screenIndex]
  if (cue.kind === "break") screen.start = t
  else screen.lines[cue.lineIndex].start = t
}
// Plays (or, with music elsewhere, runs the preview silently) from just
// before a line.
function playFrom(i: number) {
  const t = cueTime(i)
  if (t == null || !canPlay.value) return
  if (recording.value) stopTapping()
  seek(t - 2)
  playMedia()
}

/* -- word mode: a tap as each word starts -- */
function tapNext() {
  if (!canPlay.value) return
  if (lineUpStopwatch()) return
  const ref_ = tokenRefs.value[tapPointer.value]
  if (!ref_) {
    stopTapping()
    return
  }
  const token = resolveToken(screens.value, ref_)
  token.time = nowSong()
  delete token.end
  const prevRef = tokenRefs.value[tapPointer.value - 1]
  if (prevRef) delete resolveToken(screens.value, prevRef).end
  tapPointer.value++
  if (tapPointer.value >= tokenRefs.value.length) stopTapping()
}
function undoLastTap() {
  if (tapPointer.value === 0) return
  if (external.value) {
    resetFrom(tapPointer.value - 1)
    return
  }
  tapPointer.value--
  const ref_ = tokenRefs.value[tapPointer.value]
  if (ref_) {
    const token = resolveToken(screens.value, ref_)
    token.time = null
    delete token.end
  }
}
function skipToken() {
  if (tapPointer.value >= tokenRefs.value.length) return
  tapPointer.value++
}
// Clears every tap from this token onward and rewinds the audio a touch
// before its last known-good neighbor, so you can re-tap a problem stretch
// without redoing the whole song.
function resetFrom(index: number) {
  for (let i = index; i < tokenRefs.value.length; i++) {
    const token = resolveToken(screens.value, tokenRefs.value[i])
    token.time = null
    delete token.end
  }
  tapPointer.value = index
  if (external.value) {
    if (recording.value) waitForLineUp()
    return
  }
  const prevRef = index > 0 ? tokenRefs.value[index - 1] : null
  const prevTime = prevRef ? resolveToken(screens.value, prevRef).time : null
  seek(prevTime != null ? prevTime - 0.5 : 0)
}

/* ---- what's left to tap ---- */
const remaining = computed(() =>
  lineMode.value
    ? lineCount.value - tappedLines.value
    : tokenRefs.value.length - tappedCount.value,
)
const remainingText = computed(() => {
  const n = remaining.value
  const unit = lineMode.value ? "line" : "word"
  return `${n} ${unit}${n === 1 ? "" : "s"} still to tap`
})
// Jumps to the first line (or word) not tapped yet, backs up a little and
// starts tapping from there.
function tapRest() {
  if (!canPlay.value) return
  if (lineMode.value) {
    const i = firstUntappedCue()
    if (i >= totalCues.value) return
    cuePointer.value = i
    if (!external.value) seek((cueTime(i - 1) ?? 2) - 2)
  } else {
    tapPointer.value = firstUntappedIndex()
    const prev = tokenRefs.value[tapPointer.value - 1]
    const t = prev ? resolveToken(screens.value, prev).time : null
    if (!external.value) seek((t ?? 1) - 1)
  }
  if (!recording.value) startTapping()
  else if (external.value) waitForLineUp()
}

/* ---- switching modes keeps what's been done ---- */
function setMode(mode: PhrasingSync["mode"]) {
  if (mode === sync.value.mode) return
  if (recording.value) stopTapping()
  if (mode === "word") {
    // Start from the words as the line taps placed them, to fine-tune.
    screens.value = JSON.parse(JSON.stringify(lineSynced.value.screens))
    tapPointer.value = firstUntappedIndex()
  } else {
    // A word-tapped line starts where its first word was tapped.
    for (const screen of screens.value) {
      for (const line of screen.lines) {
        const first = line.tokens[0]?.time
        if (line.start == null && first != null) line.start = first
      }
    }
    cuePointer.value = firstUntappedCue()
  }
  sync.value.mode = mode
}

/* ---- tempo, found from the line taps ---- */
const BPM_RANGE = { min: 40, max: 240 }
const songTempo = Number(props.song.tempo) || null
const onsetsKey = computed(() => onsetsOf(screens.value).join(","))
const onsets = computed(() =>
  onsetsKey.value ? onsetsKey.value.split(",").map(Number) : [],
)
const candidates = computed<TempoCandidate[]>(() =>
  lineMode.value ? detectTempo(onsets.value, songTempo) : [],
)
// Follows the best match until you pick or type a tempo yourself.
const bpmAuto = ref(sync.value.bpm == null)

function round1(x: number): number {
  return Math.round(x * 10) / 10
}
function useCandidate(c: TempoCandidate, auto = false) {
  sync.value.bpm = round1(c.bpm)
  sync.value.phase = round3(fitPhase(onsets.value, sync.value.bpm).phase)
  bpmAuto.value = auto
}
function setBpm(value: number) {
  if (!Number.isFinite(value) || value <= 0) return
  const bpm = round1(Math.min(BPM_RANGE.max, Math.max(BPM_RANGE.min, value)))
  sync.value.bpm = bpm
  sync.value.phase =
    onsets.value.length >= 2
      ? round3(fitPhase(onsets.value, bpm).phase)
      : (sync.value.phase ?? 0)
  bpmAuto.value = false
}
function autoTempo() {
  bpmAuto.value = true
  if (candidates.value[0]) useCandidate(candidates.value[0], true)
}
watch(
  candidates,
  (list) => {
    if (bpmAuto.value && list[0]) useCandidate(list[0], true)
    else if (sync.value.bpm && onsets.value.length >= 2) {
      // Keep the chosen tempo's beats lined up with the latest taps.
      sync.value.phase = round3(fitPhase(onsets.value, sync.value.bpm).phase)
    }
  },
  { immediate: true },
)
const tempoFit = computed(() =>
  sync.value.bpm && onsets.value.length >= 4
    ? fitPhase(onsets.value, sync.value.bpm)
    : null,
)
const looseFit = computed(() => !!tempoFit.value && tempoFit.value.fit < 0.6)

// How long a syllable is sung: the words then take as long as they take,
// and the rest of the line is a breath. "Fill" spreads them over the line.
const PACE_CHOICES = [
  { value: 0.25, label: "Fast (¼ beat)" },
  { value: 0.5, label: "Normal (½ beat)" },
  { value: 1, label: "Slow (1 beat)" },
  { value: 0, label: "Fill the line" },
]
const pace = computed({
  get: () => sync.value.pace ?? DEFAULT_PACE,
  set: (value: number) => (sync.value.pace = value),
})
const GRID_CHOICES = [
  { value: 0, label: "Off" },
  { value: 1, label: "Beat" },
  { value: 2, label: "½ beat" },
  { value: 4, label: "¼ beat" },
]
// Ask to keep the tempo found as the song's tempo (used by the tempo guide
// and Line timing) when the song doesn't have one yet.
const saveTempo = ref(!songTempo)

/* ---- the taps list beside the practice screen ---- */
// A line picked in the list (click it, or ↑/↓): R re-taps from it, P plays
// from it, [ / ] nudge its tap. While tapping, the list follows along.
const selectedCue = ref<number | null>(null)
const cueList = ref<HTMLElement | null>(null)
const lastCue = computed(() => totalCues.value - 1)
function selectCue(i: number) {
  if (lastCue.value < 0) return
  selectedCue.value = Math.max(0, Math.min(lastCue.value, i))
}
function moveSelection(delta: number) {
  const from = selectedCue.value ?? Math.max(0, cuePointer.value - 1)
  selectCue(selectedCue.value == null ? from : from + delta)
}
watch(recording, (on) => {
  if (on) selectedCue.value = null
})
// Keeps the line being tapped (or the one picked) in the middle of the
// list, without scrolling the page.
function keepInView() {
  void nextTick(() => {
    const list = cueList.value
    const i = recording.value
      ? cuePointer.value
      : (selectedCue.value ?? cuePointer.value)
    const row = list?.querySelector<HTMLElement>(`[data-cue="${i}"]`)
    if (!list || !row) return
    const top = row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2
    list.scrollTo({ top: Math.max(0, top), behavior: "smooth" })
  })
}
watch([cuePointer, selectedCue, recording], keepInView)

/* ---- the audio, from the practice panel ---- */
const duration = ref(0)
function onDurationChange() {
  const d = audioPlayer.value?.duration
  duration.value = d && Number.isFinite(d) ? d : 0
}
function onScrub(e: Event) {
  const el = audioPlayer.value
  if (!el || external.value) return
  el.currentTime = Number((e.target as HTMLInputElement).value)
}
function clock(t: number): string {
  const s = Math.max(0, Math.floor(t))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/* ---- shortcuts ---- */
function toggleTapping() {
  if (recording.value) stopTapping()
  else startTapping()
}
// R: tap again from the line just tapped (press it again to go back one
// more), or from the line picked in the list.
function retapKey() {
  if (!canPlay.value) return
  if (lineMode.value) {
    const i =
      recording.value || selectedCue.value == null
        ? cuePointer.value - 1
        : selectedCue.value
    if (i < 0) return
    retapFrom(i)
  } else {
    if (tapPointer.value === 0 && recording.value) return
    const from = Math.max(0, tapPointer.value - 1)
    if (!recording.value) {
      tapPointer.value = from
      startTapping()
    }
    resetFrom(from)
  }
}
// P: listen from the picked line (or the last one tapped); again to pause.
function playSelected() {
  if (!canPlay.value) return
  if (mediaRunning.value) {
    pauseMedia()
    return
  }
  const i = selectedCue.value ?? Math.max(0, cuePointer.value - 1)
  if (cueTime(i) != null) playFrom(i)
  else playMedia()
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true
  if (el.tagName !== "INPUT") return false
  const type = (el as HTMLInputElement).type
  return !["range", "checkbox", "radio", "button", "submit"].includes(type)
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault()
    save()
    return
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (isTypingTarget(e.target)) return
  const tag = (e.target as HTMLElement | null)?.tagName ?? ""

  // Start / stop, re-tap and stop work whether or not you're tapping.
  if (e.key === "Enter") {
    if (tag === "A") return
    e.preventDefault()
    if (!e.repeat) toggleTapping()
    return
  }
  if (e.key === "Escape") {
    if (recording.value) stopTapping()
    else pauseMedia()
    return
  }
  if (e.key.toLowerCase() === "r") {
    e.preventDefault()
    if (!e.repeat) retapKey()
    return
  }

  if (!recording.value) {
    if (!lineMode.value) return
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      moveSelection(e.key === "ArrowDown" ? 1 : -1)
    } else if (e.key.toLowerCase() === "p") {
      e.preventDefault()
      playSelected()
    } else if (
      (e.code === "BracketLeft" || e.code === "BracketRight") &&
      selectedCue.value != null
    ) {
      e.preventDefault()
      const step = e.shiftKey ? 0.01 : 0.05
      nudgeCue(selectedCue.value, e.code === "BracketLeft" ? -step : step)
    }
    return
  }

  if (e.code === "Space") {
    e.preventDefault()
    if (e.repeat) return
    if (lineMode.value) pressLine()
    else tapNext()
  } else if (e.key === "Backspace" || e.key === "ArrowLeft") {
    e.preventDefault()
    if (lineMode.value) undoLineTap()
    else undoLastTap()
  } else if (e.key === "ArrowRight" && !lineMode.value) {
    e.preventDefault()
    skipToken()
  }
}
function onKeyup(e: KeyboardEvent) {
  if (e.code !== "Space") return
  if (isTypingTarget(e.target)) return
  if (recording.value || pressing.value) e.preventDefault()
  if (lineMode.value) releaseLine()
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown)
  window.addEventListener("keyup", onKeyup)
})
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown)
  window.removeEventListener("keyup", onKeyup)
})

/* ---- audio: uploaded once, saved with the song ---- */
type TrackField = "audio" | "instrumental"
const fileInput = ref<HTMLInputElement | null>(null)
const minusOneInput = ref<HTMLInputElement | null>(null)
const uploading = ref<TrackField | null>(null)
const uploadingAudio = computed(() => uploading.value === "audio")
const uploadProgress = ref<number | null>(null)
const uploadError = ref<{ field: TrackField; message: string } | null>(null)
const audioError = computed(() =>
  uploadError.value?.field === "audio" ? uploadError.value.message : null,
)
const minusOneError = computed(() =>
  uploadError.value?.field === "instrumental"
    ? uploadError.value.message
    : null,
)

function chooseAudio() {
  fileInput.value?.click()
}
function chooseMinusOne() {
  minusOneInput.value?.click()
}

// Uploads as soon as a file is picked. Your unsaved sync stays as it is.
function uploadTrack(field: TrackField, file: File, onDone?: () => void) {
  if (recording.value) stopTapping()
  uploading.value = field
  uploadProgress.value = 0
  uploadError.value = null
  router.patch(
    songsPhrasings.update({ song_id: props.song.slug }).url,
    { [field]: file },
    {
      forceFormData: true,
      preserveScroll: true,
      preserveState: true,
      onProgress: (event) => {
        if (event?.percentage != null) uploadProgress.value = event.percentage
      },
      onSuccess: () => onDone?.(),
      onError: (errors) => {
        const message: unknown = (errors as Record<string, unknown>)[field]
        const text = (Array.isArray(message) ? message[0] : message)?.toString()
        const what = field === "audio" ? "Audio" : "The minus-one track"
        uploadError.value = {
          field,
          message: text
            ? /^[a-z]/.test(text)
              ? `${what} ${text}`
              : text
            : "The upload didn't go through. Try again.",
        }
      },
      onFinish: () => {
        uploading.value = null
        uploadProgress.value = null
      },
    },
  )
}
function pickedFile(e: Event): File | null {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  input.value = ""
  return file
}
function onAudioFileChange(e: Event) {
  const file = pickedFile(e)
  if (!file) return
  const saved = props.song.audio_file
  if (
    saved &&
    !confirm(
      `Replace “${saved.filename}” with “${file.name}”? Your taps are kept.`,
    )
  ) {
    return
  }
  uploadTrack("audio", file)
}
function onMinusOneFileChange(e: Event) {
  const file = pickedFile(e)
  if (!file) return
  const saved = props.song.instrumental_file
  if (
    saved &&
    !confirm(`Replace the minus-one “${saved.filename}” with “${file.name}”?`)
  ) {
    return
  }
  // Line it up with the original as soon as it's in.
  uploadTrack("instrumental", file, () => void nextTick(autoAlign))
}
function removeMinusOne() {
  const saved = props.song.instrumental_file
  if (!saved || !confirm(`Remove the minus-one “${saved.filename}”?`)) return
  if (listen.value === "minus") listen.value = "original"
  router.patch(
    songsPhrasings.update({ song_id: props.song.slug }).url,
    { remove_instrumental: "1" },
    { preserveScroll: true, preserveState: true },
  )
}

/* ---- lining the minus-one up with the original ---- */
const aligning = ref(false)
const alignNote = ref<string | null>(null)
async function autoAlign() {
  const original = props.song.audio_url
  const minusOne = props.song.instrumental_url
  if (!original || !minusOne || aligning.value) return
  aligning.value = true
  alignNote.value = null
  try {
    const result = await alignTracks(original, minusOne)
    instrumentalOffset.value = result.offset
    alignNote.value =
      result.confidence < 0.1
        ? "Lined up as well as it could tell, but it isn't sure — listen with Minus-one and nudge it if the lyrics are early or late."
        : "Lined up automatically. Listen with Minus-one to check, and nudge it if needed."
  } catch {
    alignNote.value =
      "Couldn't compare the two tracks here — set it by ear: listen with Minus-one and nudge until the lyrics fit."
  } finally {
    aligning.value = false
  }
}
function nudgeOffset(delta: number) {
  instrumentalOffset.value = round3(instrumentalOffset.value + delta)
}
function setOffset(value: number) {
  if (Number.isFinite(value)) {
    instrumentalOffset.value = round3(Math.max(-60, Math.min(60, value)))
  }
}
const offsetWords = computed(() => {
  const o = instrumentalOffset.value
  if (Math.abs(o) < 0.0005) return "starts at the same moment as the original"
  return `starts ${Math.abs(o).toFixed(2)} s ${o > 0 ? "later" : "earlier"} than the original`
})
const minusOneUploadedOn = computed(() => {
  const at = props.song.instrumental_file?.uploaded_at
  return at
    ? new Date(at).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null
})

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
const uploadedOn = computed(() => {
  const at = props.song.audio_file?.uploaded_at
  return at
    ? new Date(at).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null
})

/* ---- unsaved changes ---- */
// Unsaved = what's here differs from what was last saved (taps, marks,
// words, tempo, snapping) -- compared by content, so re-applying the same
// text, or an edit undone by hand, doesn't count.
function snapshot(): string {
  return JSON.stringify(
    [sourceText.value, screens.value, sync.value, instrumentalOffset.value],
    (_key, value) => (value === null ? undefined : value),
  )
}
const savedSnapshot = ref<string | null>(null)
const dirty = computed(
  () => savedSnapshot.value != null && snapshot() !== savedSnapshot.value,
)
const savedAt = ref<Date | null>(null)

/* ---- save ---- */
const saving = ref(false)
const saveError = ref<string | null>(null)
// Saving also gives the chord sheet's Line timing these line starts.
const shareTiming = useLocalStorage("chordstage:share-timing", true, {
  initOnMounted: true,
})
const sharedNote = ref<string | null>(null)

function save() {
  if (saving.value) return
  // Words or marks typed in the last moment haven't been applied yet.
  applyTextEditsNow()
  saving.value = true
  saveError.value = null
  const sent = snapshot()
  const payload = {
    sourceText: sourceText.value,
    complete: complete.value,
    screens: effectiveScreens.value,
    // What the taps were timed against (Stage Mode plays a sync made
    // against another app silently, alongside the music).
    sync: { ...sync.value, source: source.value },
    instrumentalOffset: instrumentalOffset.value,
  }
  const tempo =
    lineMode.value && saveTempo.value && sync.value.bpm
      ? Math.round(sync.value.bpm)
      : undefined
  // One timing for both: the chord sheet's Line timing, from these taps.
  const shared = shareTiming.value
    ? lineTimingFromSync(parseBody(props.song.body ?? ""), payload.screens, {
        bpm:
          tempo ??
          (Number(props.song.tempo) || Math.round(sync.value.bpm ?? 0) || 100),
        source: source.value,
      })
    : null
  router.patch(
    songsPhrasings.update({ song_id: props.song.slug }).url,
    {
      phrasing: JSON.stringify(payload),
      tempo,
      line_timing: shared ? JSON.stringify(shared.value) : undefined,
    },
    {
      preserveScroll: true,
      preserveState: true,
      onSuccess: () => {
        savedSnapshot.value = sent
        savedAt.value = new Date()
        sharedNote.value = shared
          ? `Line timing updated too (${shared.matched} of ${shared.total} lyric lines matched the chord sheet).`
          : null
      },
      onError: (errors) => {
        // Say what the server objected to, not just that it did.
        const reasons = Object.entries(errors as Record<string, unknown>)
          .map(([field, message]) => {
            const text = (Array.isArray(message) ? message[0] : message)
              ?.toString()
              .trim()
            if (!text) return null
            const name = field === "instrumental" ? "Minus-one" : field
            return /^[a-z]/.test(text)
              ? `${name[0].toUpperCase()}${name.slice(1)} ${text}`
              : text
          })
          .filter(Boolean)
        saveError.value = reasons.length
          ? `Couldn't save: ${reasons.join("; ")}. Your work is still here.`
          : "Couldn't save. Your work is still here; try again."
      },
      onFinish: () => {
        saving.value = false
      },
    },
  )
}

const LEAVE_WARNING =
  "You have unsaved changes to this karaoke sync. Leave without saving?"
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!dirty.value) return
  e.preventDefault()
  e.returnValue = ""
}
const removeBeforeVisit = router.on("before", (event) => {
  if (!dirty.value || event.detail.visit.method !== "get") return
  if (!confirm(LEAVE_WARNING)) event.preventDefault()
})

onMounted(() => {
  // A sync saved a moment after typing a mark may not have applied it;
  // catch up before tracking edits.
  applyTextEditsNow()
  window.addEventListener("beforeunload", onBeforeUnload)
  void nextTick(() => (savedSnapshot.value = snapshot()))
})
onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", onBeforeUnload)
  removeBeforeVisit()
})

function formatTime(t: number | null | undefined): string {
  if (t == null) return "not tapped"
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(2).padStart(5, "0")
  return `${m}:${s}`
}
</script>

<template>
  <Head :title="`Karaoke sync — ${song.title}`" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="flex flex-col gap-4 p-4 pb-24">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">
            Karaoke sync &mdash; {{ song.title }}
          </h1>
          <p class="text-muted-foreground text-sm">
            KaraFun-style two-line screens, synced to the song&rsquo;s actual
            recording.
          </p>
        </div>
        <div class="flex gap-2">
          <Link :href="help.index({ anchor: 'karaoke-sync' })">
            <Button variant="ghost">How to sync</Button>
          </Link>
          <Link :href="songsRoutes.show(song.slug)">
            <Button variant="outline">Back to song</Button>
          </Link>
        </div>
      </div>

      <div class="bg-card rounded-xl border p-4">
        <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2
            class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Play the music from
          </h2>
          <div class="flex overflow-hidden rounded-md border" role="group">
            <button
              type="button"
              class="grid-choice"
              :class="{ 'is-on': !external }"
              :aria-pressed="!external"
              :disabled="!hasAudio"
              :title="
                hasAudio
                  ? undefined
                  : 'Upload the song\'s audio below to sync against it'
              "
              @click="source = 'audio'"
            >
              This song&rsquo;s audio
            </button>
            <button
              type="button"
              class="grid-choice"
              :class="{ 'is-on': external }"
              :aria-pressed="external"
              @click="source = 'external'"
            >
              Another app or device
            </button>
          </div>
        </div>
        <div v-if="external" class="mb-3 rounded-lg border p-3 text-sm">
          <p>
            Play the song in any music app &mdash; Spotify, YouTube, Apple
            Music, a CD &mdash; on this computer or another device. The page
            keeps time with a stopwatch, from when the music starts:
          </p>
          <ol class="mt-1 list-decimal pl-5">
            <li>
              Press <kbd class="kbd">Enter</kbd>, then press
              <kbd class="kbd">Space</kbd> the moment you start the music
              &mdash; that starts the stopwatch.
            </li>
            <li>
              Tap <kbd class="kbd">Space</kbd> as each
              {{ lineMode ? "line" : "word" }} starts, as usual.
            </li>
            <li>
              To redo a stretch (<kbd class="kbd">R</kbd>), play the music from
              a little before the {{ lineMode ? "line" : "word" }}
              <em>before</em> it and tap that one first &mdash; it lines the
              stopwatch up with the music again.
            </li>
          </ol>
          <p class="text-muted-foreground mt-1 text-xs">
            The times match the music player&rsquo;s clock, so you can also type
            them in from it in the Line taps list. In Stage Mode the song plays
            silently: press &#9654; there as you start the music.
          </p>
        </div>
        <audio
          v-if="song.audio_url"
          v-show="!external"
          ref="audioPlayer"
          :src="audioSrc"
          controls
          class="w-full"
          @loadedmetadata="onLoadedMetadata"
          @durationchange="onDurationChange"
        ></audio>
        <div
          v-if="song.audio_url && !external"
          class="mt-2 flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Listen to"
        >
          <span class="text-muted-foreground text-xs">Listen to</span>
          <div class="flex overflow-hidden rounded-md border">
            <button
              v-for="choice in [
                { value: 'original', label: 'Original' },
                { value: 'masked', label: 'Vocals masked' },
                { value: 'minus', label: 'Minus-one' },
              ] as const"
              :key="choice.value"
              type="button"
              class="grid-choice"
              :class="{ 'is-on': listen === choice.value }"
              :aria-pressed="listen === choice.value"
              :disabled="choice.value === 'minus' && !hasMinusOne"
              :title="
                choice.value === 'minus' && !hasMinusOne
                  ? 'Upload a minus-one track below first'
                  : undefined
              "
              @click="listen = choice.value"
            >
              {{ choice.label }}
            </button>
          </div>
          <span
            v-if="listen === 'masked' && fx.mono.value"
            class="text-xs text-amber-600 dark:text-amber-500"
          >
            This recording is mono, so its vocal can&rsquo;t be masked &mdash; a
            minus-one track is the way for this song.
          </span>
          <span
            v-else-if="listen === 'masked' && !fx.vocalSupported.value"
            class="text-xs text-amber-600 dark:text-amber-500"
          >
            This browser can&rsquo;t mask the vocal.
          </span>
          <span
            v-else-if="listen === 'masked'"
            class="text-muted-foreground text-xs"
          >
            What Stage Mode&rsquo;s Vocals Off sounds like without a minus-one
            track.
          </span>
        </div>
        <p
          v-if="song.audio_file"
          class="mt-2 text-sm text-emerald-700 dark:text-emerald-400"
        >
          &check; Saved with the song:
          <span class="font-medium">{{ song.audio_file.filename }}</span>
          <span class="text-muted-foreground">
            &middot; {{ formatBytes(song.audio_file.byte_size) }}
            <template v-if="uploadedOn"
              >&middot; uploaded {{ uploadedOn }}</template
            >
          </span>
          <span class="text-muted-foreground block text-xs">
            It loads by itself every time &mdash; no need to upload it again.
          </span>
        </p>
        <p v-else class="text-muted-foreground mb-2 text-sm">
          No audio uploaded &mdash; sync it against another app above, or upload
          the song&rsquo;s audio to sync against that (and play it in Stage Mode
          with Vocals). It&rsquo;s saved with the song, so you only upload it
          once.
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref="fileInput"
            type="file"
            accept="audio/*"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            @change="onAudioFileChange"
          />
          <Button
            size="sm"
            :variant="song.audio_url ? 'outline' : 'default'"
            :disabled="uploadingAudio"
            @click="chooseAudio"
          >
            {{ song.audio_url ? "Replace audio…" : "Upload audio…" }}
          </Button>
          <span v-if="uploadingAudio" class="text-muted-foreground text-sm">
            Uploading{{
              uploadProgress != null ? ` ${Math.round(uploadProgress)}%` : "…"
            }}
          </span>
          <span
            v-if="audioError"
            class="text-destructive text-sm"
            role="alert"
            >{{ audioError }}</span
          >
        </div>

        <!-- Minus-one -->
        <div v-if="song.audio_url" class="mt-4 rounded-lg border p-3">
          <h3 class="text-sm font-semibold">
            Minus-one track
            <span class="text-muted-foreground font-normal">(optional)</span>
          </h3>
          <p class="text-muted-foreground text-xs">
            The same song without the lead vocal. When the singer turns Stage
            Mode&rsquo;s <strong>Vocals</strong> Off, it plays this instead of
            masking the vocal out of the original &mdash; cleaner, with no trace
            of the voice. Without one, Vocals Off still works on most studio
            recordings.
          </p>
          <p
            v-if="song.instrumental_file?.same_as_audio"
            class="mt-2 text-sm text-amber-600 dark:text-amber-500"
            role="alert"
          >
            &#9888; &ldquo;{{ song.instrumental_file.filename }}&rdquo; is the
            very same file as the song&rsquo;s audio, with the vocal still in
            it, so it isn&rsquo;t used &mdash; Vocals Off masks the vocal out of
            the recording instead. Replace it with the minus-one version (or
            Remove it).
          </p>
          <p
            v-else-if="song.instrumental_file"
            class="mt-2 text-sm text-emerald-700 dark:text-emerald-400"
          >
            &check; Saved with the song:
            <span class="font-medium">{{
              song.instrumental_file.filename
            }}</span>
            <span class="text-muted-foreground">
              &middot; {{ formatBytes(song.instrumental_file.byte_size) }}
              <template v-if="minusOneUploadedOn"
                >&middot; uploaded {{ minusOneUploadedOn }}</template
              >
            </span>
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <input
              ref="minusOneInput"
              type="file"
              accept="audio/*"
              class="sr-only"
              tabindex="-1"
              aria-hidden="true"
              @change="onMinusOneFileChange"
            />
            <Button
              size="sm"
              variant="outline"
              :disabled="uploading != null"
              @click="chooseMinusOne"
            >
              {{
                song.instrumental_file
                  ? "Replace minus-one…"
                  : "Upload minus-one…"
              }}
            </Button>
            <Button
              v-if="song.instrumental_file"
              size="sm"
              variant="ghost"
              :disabled="uploading != null"
              @click="removeMinusOne"
            >
              Remove
            </Button>
            <span
              v-if="uploading === 'instrumental'"
              class="text-muted-foreground text-sm"
            >
              Uploading{{
                uploadProgress != null ? ` ${Math.round(uploadProgress)}%` : "…"
              }}
            </span>
            <span
              v-if="minusOneError"
              class="text-destructive text-sm"
              role="alert"
              >{{ minusOneError }}</span
            >
          </div>

          <div v-if="hasMinusOne" class="mt-3 flex flex-col gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm">Lined up:</span>
              <Button
                size="icon"
                variant="outline"
                class="size-8"
                aria-label="Minus-one 0.05 s earlier"
                @click="nudgeOffset(-0.05)"
                ><Minus class="size-3.5"
              /></Button>
              <input
                class="border-input bg-background h-8 w-20 rounded-md border px-2 text-center text-sm tabular-nums"
                type="number"
                step="0.01"
                :value="instrumentalOffset"
                aria-label="Minus-one offset in seconds"
                @change="
                  setOffset(Number(($event.target as HTMLInputElement).value))
                "
              />
              <Button
                size="icon"
                variant="outline"
                class="size-8"
                aria-label="Minus-one 0.05 s later"
                @click="nudgeOffset(0.05)"
                ><Plus class="size-3.5"
              /></Button>
              <span class="text-muted-foreground text-sm"
                >s &mdash; the minus-one {{ offsetWords }}</span
              >
              <Button
                size="sm"
                variant="outline"
                :disabled="aligning"
                @click="autoAlign"
              >
                {{ aligning ? "Lining up…" : "Auto-align" }}
              </Button>
            </div>
            <p class="text-muted-foreground text-xs">
              {{
                alignNote ??
                "Listen with Minus-one: if the lyrics come in late, press −; early, press +. Save sync to keep it."
              }}
            </p>
          </div>
        </div>
      </div>

      <!-- How to sync -->
      <div class="bg-card rounded-xl border p-4">
        <h2
          class="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase"
        >
          How to sync
        </h2>
        <div class="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            class="mode-choice"
            :class="{ 'is-on': lineMode }"
            :aria-pressed="lineMode"
            @click="setMode('line')"
          >
            <span class="font-semibold">Tap each line</span>
            <span class="text-muted-foreground text-xs">
              One tap as each line starts. The tempo is found from your taps and
              the words are placed on the beat for you.
            </span>
          </button>
          <button
            type="button"
            class="mode-choice"
            :class="{ 'is-on': !lineMode }"
            :aria-pressed="!lineMode"
            @click="setMode('word')"
          >
            <span class="font-semibold">Tap each word</span>
            <span class="text-muted-foreground text-xs">
              One tap per word (or syllable), for exact control. Switching here
              after a line sync starts from its word times.
            </span>
          </button>
        </div>
      </div>

      <!-- Syncing: the practice screen and the taps, side by side -->
      <div class="sync-split">
        <div class="sync-panel sync-practice">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2
              class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
            >
              Practice screen
            </h2>
            <span v-if="!lineMode" class="text-muted-foreground text-xs"
              >{{ tappedCount }}/{{ tokenRefs.length }} words tapped</span
            >
          </div>
          <div
            class="relative aspect-video w-full overflow-hidden rounded-lg bg-black shadow-inner"
          >
            <LyricStage
              :track="previewTrack"
              :time="songTime"
              :title="song.title"
              :artist="song.artist"
            />
            <div
              v-if="recording && waiting"
              class="wait-note"
              aria-live="polite"
            >
              <template v-if="anchorTime() == null">
                <p class="font-bold">Start the music</p>
                <p>
                  and press <kbd class="kbd">Space</kbd> the moment it starts
                </p>
              </template>
              <template v-else>
                <p class="font-bold">Line up with the music</p>
                <p>
                  play it from a little before {{ anchorLabel }} and press
                  <kbd class="kbd">Space</kbd> as it starts
                </p>
              </template>
            </div>
          </div>

          <!-- where the song is -->
          <div
            v-if="external"
            class="text-muted-foreground mt-2 flex items-center gap-2 text-xs tabular-nums"
          >
            <span class="w-9 text-right">{{ clock(songTime) }}</span>
            <span>{{
              watchRunning
                ? "stopwatch running"
                : recording
                  ? "stopwatch waiting for your first tap"
                  : "stopwatch"
            }}</span>
          </div>
          <div
            v-else-if="song.audio_url"
            class="mt-2 flex items-center gap-2 text-xs tabular-nums"
          >
            <span class="text-muted-foreground w-9 text-right">{{
              clock(currentTime)
            }}</span>
            <input
              type="range"
              class="accent-primary h-1 min-w-0 flex-1"
              min="0"
              :max="duration || 0"
              step="0.1"
              :value="currentTime"
              aria-label="Position in the song"
              @input="onScrub"
              @pointerup="($event.target as HTMLInputElement).blur()"
            />
            <span class="text-muted-foreground w-9">{{ clock(duration) }}</span>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              :disabled="!canPlay"
              :title="
                recording ? 'Stop (Enter or Esc)' : 'Start tapping (Enter)'
              "
              @click="toggleTapping"
            >
              {{ recording ? "Stop" : "Start tapping" }}
              <kbd class="kbd kbd-on-primary">Enter</kbd>
            </Button>
            <template v-if="lineMode">
              <Button
                size="sm"
                variant="outline"
                :disabled="cuePointer === 0 || !canPlay"
                title="Tap the last line again (R) -- press again to go back further"
                @click="retapKey"
              >
                <RotateCcw class="size-3.5" /> Re-tap
                <kbd class="kbd">R</kbd>
              </Button>
              <Button
                size="sm"
                variant="outline"
                :disabled="cuePointer === 0"
                title="Undo the last tap (Backspace)"
                @click="undoLineTap"
              >
                Undo <kbd class="kbd">&#9003;</kbd>
              </Button>
            </template>
            <template v-else>
              <Button
                size="sm"
                variant="outline"
                :disabled="tapPointer === 0 || !canPlay"
                title="Tap the last word again (R)"
                @click="retapKey"
              >
                <RotateCcw class="size-3.5" /> Re-tap
                <kbd class="kbd">R</kbd>
              </Button>
              <Button
                size="sm"
                variant="outline"
                :disabled="tapPointer === 0"
                @click="undoLastTap"
              >
                Undo <kbd class="kbd">&#9003;</kbd>
              </Button>
              <Button
                size="sm"
                variant="outline"
                :disabled="tapPointer >= tokenRefs.length"
                @click="skipToken"
              >
                Skip word <kbd class="kbd">&rarr;</kbd>
              </Button>
            </template>
          </div>

          <p v-if="recording && nextLabel && !waiting" class="mt-2 text-sm">
            Next: <span class="font-semibold">{{ nextLabel }}</span>
          </p>

          <button
            v-if="lineMode && recording"
            type="button"
            class="tap-pad mt-2"
            :class="{ 'is-down': pressing }"
            :disabled="!nextLabel"
            @pointerdown.prevent="pressLine"
            @pointerup="releaseLine"
            @pointerleave="releaseLine"
            @pointercancel="releaseLine"
          >
            <span class="text-lg font-bold">{{
              waiting
                ? anchorTime() == null
                  ? "Tap: the music starts"
                  : "Tap: line up with the music"
                : "Tap: line starts"
            }}</span>
            <span class="text-xs opacity-80">{{
              waiting ? anchorLabel : nextLabel
            }}</span>
          </button>

          <!-- shortcuts -->
          <details open class="mt-3">
            <summary
              class="text-muted-foreground cursor-pointer text-xs font-medium select-none"
            >
              Keyboard shortcuts
            </summary>
            <dl class="shortcuts mt-2">
              <dt><kbd class="kbd">Enter</kbd></dt>
              <dd>Start / stop</dd>
              <dt><kbd class="kbd">Space</kbd></dt>
              <dd v-if="lineMode">
                Tap as a line starts &mdash; hold it while the line is sung to
                mark where it ends
              </dd>
              <dd v-else>Tap as each word starts</dd>
              <dt><kbd class="kbd">R</kbd></dt>
              <dd>
                Re-tap: back up and tap the last
                {{ lineMode ? "line" : "word" }} again (press again to go
                further back){{
                  lineMode ? ", or from the line picked in the list" : ""
                }}
              </dd>
              <dt><kbd class="kbd">&#9003;</kbd></dt>
              <dd>Undo the last tap</dd>
              <template v-if="lineMode">
                <dt>
                  <kbd class="kbd">&uarr;</kbd>&thinsp;<kbd class="kbd"
                    >&darr;</kbd
                  >
                </dt>
                <dd>Pick a line (when stopped)</dd>
                <dt><kbd class="kbd">P</kbd></dt>
                <dd>Play from the picked line / pause</dd>
                <dt>
                  <kbd class="kbd">[</kbd>&thinsp;<kbd class="kbd">]</kbd>
                </dt>
                <dd>Nudge its tap 0.05 s (with Shift: 0.01 s)</dd>
              </template>
              <template v-else>
                <dt><kbd class="kbd">&rarr;</kbd></dt>
                <dd>Skip a word</dd>
              </template>
              <dt><kbd class="kbd">Esc</kbd></dt>
              <dd>Stop</dd>
              <dt><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">S</kbd></dt>
              <dd>Save</dd>
            </dl>
          </details>
          <p v-if="lineMode" class="text-muted-foreground mt-2 text-xs">
            Tap at the start of each instrumental break too, and once more where
            the last line ends (optional).
          </p>
        </div>

        <!-- Line taps -->
        <div v-if="lineMode" class="sync-panel">
          <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2
              class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
            >
              Line taps
            </h2>
            <span class="text-muted-foreground text-xs"
              >{{ tappedLines }}/{{ lineCount }} tapped</span
            >
          </div>
          <p class="text-muted-foreground mb-2 text-xs">
            Click a time to type it in &mdash; say, read off your music player
            as the line starts (<code>1:23.45</code> or <code>83.45</code>).
            Click a line to pick it, then <kbd class="kbd">R</kbd> re-taps from
            there, <kbd class="kbd">P</kbd> plays it,
            <kbd class="kbd">[</kbd>&thinsp;<kbd class="kbd">]</kbd> nudge its
            tap.
          </p>
          <label
            class="text-muted-foreground mb-2 flex items-start gap-2 text-xs"
          >
            <input
              v-model="shiftLater"
              type="checkbox"
              class="accent-primary mt-0.5"
            />
            <span>
              <span class="text-foreground font-medium"
                >Move the later lines too</span
              >
              when I change a time &mdash; e.g. to line up taps with the music
              player&rsquo;s clock by fixing the first line; turn it off to fix
              single lines.
            </span>
          </label>
          <ul ref="cueList" class="cue-list">
            <li
              v-for="(cue, i) in cues"
              :key="i"
              :data-cue="i"
              class="cue-row"
              :class="{
                'is-next': recording && i === cuePointer,
                'is-selected': !recording && i === selectedCue,
                'is-break': cue.kind === 'break',
              }"
              @click="selectCue(i)"
            >
              <span class="flex w-[5.25rem] shrink-0 flex-col">
                <input
                  type="text"
                  inputmode="decimal"
                  spellcheck="false"
                  class="time-input"
                  :class="{ 'is-bad': timeErrors[i] || outOfOrder(i) }"
                  :value="timeText(i)"
                  placeholder="not tapped"
                  :aria-label="`Start time: ${cueText(cue)}`"
                  :title="
                    timeErrors[i] ??
                    (outOfOrder(i)
                      ? 'Not after the line above -- check this time'
                      : 'When this line starts (m:ss.ss)')
                  "
                  @focus="onTimeFocus"
                  @keydown="onTimeKeydown"
                  @change="commitTime(i, $event)"
                />
                <span
                  v-if="timeErrors[i]"
                  class="text-destructive text-[0.65rem] leading-tight not-italic"
                  role="alert"
                  >{{ timeErrors[i] }}</span
                >
                <span
                  v-else-if="outOfOrder(i)"
                  class="text-[0.65rem] leading-tight text-amber-600 not-italic dark:text-amber-500"
                  >before the line above</span
                >
              </span>
              <span class="min-w-0 flex-1 truncate text-sm">
                {{ cueText(cue) }}
                <span
                  v-if="cueLine(screens, cue)?.end != null"
                  class="text-muted-foreground text-xs"
                  >&nbsp;· ends
                  {{ formatTime(cueLine(screens, cue)?.end) }}</span
                >
              </span>
              <Button
                size="icon"
                variant="ghost"
                class="size-7"
                :disabled="cue.time == null || !canPlay"
                :aria-label="`Play from: ${cueText(cue)}`"
                @click="playFrom(i)"
                ><Play class="size-3.5"
              /></Button>
              <Button
                size="icon"
                variant="ghost"
                class="size-7"
                :disabled="cue.time == null"
                aria-label="Earlier"
                @click="nudgeCue(i, -0.05)"
                ><Minus class="size-3.5"
              /></Button>
              <Button
                size="icon"
                variant="ghost"
                class="size-7"
                :disabled="cue.time == null"
                aria-label="Later"
                @click="nudgeCue(i, 0.05)"
                ><Plus class="size-3.5"
              /></Button>
              <Button
                size="sm"
                variant="ghost"
                class="h-7 px-2 text-xs"
                :disabled="!canPlay"
                @click="retapFrom(i)"
                ><RotateCcw class="size-3.5" /> Re-tap</Button
              >
            </li>
            <li
              v-if="needsEndCue"
              :data-cue="cues.length"
              class="cue-row is-break"
              :class="{
                'is-next': recording && cuePointer === cues.length,
                'is-selected': !recording && selectedCue === cues.length,
              }"
              @click="selectCue(cues.length)"
            >
              <span class="flex w-[5.25rem] shrink-0 flex-col">
                <input
                  type="text"
                  inputmode="decimal"
                  spellcheck="false"
                  class="time-input"
                  :class="{
                    'is-bad':
                      timeErrors[cues.length] || outOfOrder(cues.length),
                  }"
                  :value="timeText(cues.length)"
                  placeholder="optional"
                  aria-label="End of the last line"
                  @focus="onTimeFocus"
                  @keydown="onTimeKeydown"
                  @change="commitTime(cues.length, $event)"
                />
                <span
                  v-if="timeErrors[cues.length]"
                  class="text-destructive text-[0.65rem] leading-tight not-italic"
                  role="alert"
                  >{{ timeErrors[cues.length] }}</span
                >
              </span>
              <span class="min-w-0 flex-1 truncate text-sm">
                End of the last line
                <span
                  v-if="lastLine?.end == null"
                  class="text-muted-foreground text-xs not-italic"
                  >&nbsp;· not needed to save or use the sync &mdash; without it
                  the last line lasts about as long as its words take</span
                >
              </span>
              <Button
                size="sm"
                variant="ghost"
                class="h-7 px-2 text-xs"
                :disabled="!canPlay"
                @click="retapFrom(cues.length)"
                ><RotateCcw class="size-3.5" />
                {{ lastLine?.end != null ? "Re-tap" : "Tap it" }}</Button
              >
            </li>
          </ul>
        </div>

        <!-- Word taps -->
        <div v-else class="sync-panel">
          <h2
            class="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase"
          >
            Tapped times
          </h2>
          <p class="text-muted-foreground mb-2 text-xs">
            Click a word to clear the taps from there on and jump back to re-tap
            it (<kbd class="kbd">R</kbd> does it for the last word tapped).
          </p>
          <div
            class="flex min-h-0 flex-1 flex-wrap content-start gap-1.5 overflow-y-auto"
          >
            <button
              v-for="(ref_, i) in tokenRefs"
              :key="i"
              type="button"
              class="rounded border px-1.5 py-0.5 text-xs transition-colors"
              :class="[
                i === tapPointer
                  ? 'border-primary bg-primary/10'
                  : 'border-transparent',
                resolveToken(screens, ref_).time != null
                  ? 'text-foreground'
                  : 'text-muted-foreground/50',
              ]"
              :title="formatTime(resolveToken(screens, ref_).time)"
              @click="resetFrom(i)"
            >
              {{ resolveToken(screens, ref_).text }}
            </button>
          </div>
        </div>
      </div>

      <!-- Tempo + snapping (line mode) -->
      <div v-if="lineMode" class="bg-card rounded-xl border p-4">
        <h2
          class="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase"
        >
          Tempo &amp; word placement
        </h2>
        <p v-if="onsets.length < 4" class="text-muted-foreground mb-3 text-sm">
          Tap at least four lines and the song&rsquo;s tempo is found from your
          taps.
          <template v-if="songTempo">
            Until then the song&rsquo;s tempo ({{ songTempo }} BPM) is
            used.</template
          >
        </p>
        <div v-else class="mb-3 flex flex-wrap items-center gap-2">
          <span class="text-sm">Best matches:</span>
          <button
            v-for="(c, i) in candidates"
            :key="i"
            type="button"
            class="tempo-chip"
            :class="{
              'is-on': sync.bpm != null && Math.abs(sync.bpm - c.bpm) < 0.6,
            }"
            @click="useCandidate(c)"
          >
            {{ Math.round(c.bpm * 10) / 10 }} BPM
            <span class="opacity-70"
              >· fits {{ Math.round(c.fit * 100) }}%</span
            >
          </button>
          <span v-if="!candidates.length" class="text-muted-foreground text-sm">
            No steady beat found in the taps yet.
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div class="flex items-center gap-2">
            <span class="text-sm">Tempo</span>
            <Button
              size="sm"
              variant="outline"
              :disabled="!sync.bpm"
              title="Half the tempo"
              @click="setBpm((sync.bpm ?? 0) / 2)"
              >½×</Button
            >
            <input
              class="border-input bg-background h-8 w-20 rounded-md border px-2 text-center text-sm tabular-nums"
              type="number"
              step="0.1"
              :min="BPM_RANGE.min"
              :max="BPM_RANGE.max"
              :value="sync.bpm ?? ''"
              placeholder="BPM"
              aria-label="Tempo in BPM"
              @change="
                setBpm(Number(($event.target as HTMLInputElement).value))
              "
            />
            <Button
              size="sm"
              variant="outline"
              :disabled="!sync.bpm"
              title="Double the tempo"
              @click="setBpm((sync.bpm ?? 0) * 2)"
              >2×</Button
            >
            <Button
              v-if="!bpmAuto && candidates.length"
              size="sm"
              variant="ghost"
              @click="autoTempo"
              >Auto</Button
            >
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm">Syllable pace</span>
            <div class="flex overflow-hidden rounded-md border">
              <button
                v-for="choice in PACE_CHOICES"
                :key="choice.value"
                type="button"
                class="grid-choice"
                :class="{ 'is-on': pace === choice.value }"
                :disabled="!sync.bpm && choice.value > 0"
                :aria-pressed="pace === choice.value"
                @click="pace = choice.value"
              >
                {{ choice.label }}
              </button>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm">Snap words to</span>
            <div class="flex overflow-hidden rounded-md border">
              <button
                v-for="g in GRID_CHOICES"
                :key="g.value"
                type="button"
                class="grid-choice"
                :class="{ 'is-on': sync.grid === g.value }"
                @click="sync.grid = g.value"
              >
                {{ g.label }}
              </button>
            </div>
          </div>
        </div>
        <p class="text-muted-foreground mt-3 text-xs">
          <template v-if="!sync.bpm"
            >Until there&rsquo;s a tempo, each line&rsquo;s words share the
            whole line.</template
          >
          <template v-else-if="pace > 0"
            >Each syllable is sung for
            {{
              pace === 1
                ? "a beat"
                : pace === 0.5
                  ? "half a beat"
                  : "a quarter beat"
            }}, so a line ends when its words do and the rest is a breath before
            the next line &mdash;
            <code class="bg-muted rounded px-1">^</code> makes a word quicker,
            <code class="bg-muted rounded px-1">~</code> holds it. A line sung
            faster than this is squeezed to fit; a line you held the tap for is
            sung right up to where you let go.</template
          >
          <template v-else
            >Each line&rsquo;s words are spread over the whole line, up to the
            next tap (or where you let go of a held tap); marks only change how
            it&rsquo;s shared out.</template
          >
        </p>
        <p v-if="tempoFit" class="text-muted-foreground mt-3 text-xs">
          Your line taps land within about
          {{ Math.round(tempoFit.error * 1000) }} ms of the beat at this tempo.
          <span v-if="looseFit" class="text-amber-600 dark:text-amber-500">
            They don&rsquo;t follow a steady beat very closely (a live
            recording, or the tempo changes?) &mdash; try another match, or turn
            snapping off.
          </span>
        </p>
        <p
          v-else-if="sync.grid && !sync.bpm"
          class="text-muted-foreground mt-3 text-xs"
        >
          Words snap to the beat once there&rsquo;s a tempo.
        </p>
        <label v-if="sync.bpm" class="mt-3 flex items-center gap-2 text-sm">
          <input v-model="saveTempo" type="checkbox" />
          Also make {{ Math.round(sync.bpm) }} BPM the song&rsquo;s tempo
          <span v-if="songTempo" class="text-muted-foreground"
            >(now {{ songTempo }})</span
          >
        </label>
      </div>

      <div class="bg-card rounded-xl border p-4">
        <h2
          class="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase"
        >
          Lyrics
        </h2>
        <Textarea
          v-model="sourceText"
          class="min-h-56 font-mono text-sm"
          spellcheck="false"
        />
        <p class="text-muted-foreground mt-2 text-xs">
          A single line break makes the second line of the same screen; a blank
          line starts a new screen (max two lines each &mdash; longer paragraphs
          are auto-split). A line with just
          <code class="bg-muted rounded px-1">[Male]</code>,
          <code class="bg-muted rounded px-1">[Female]</code>, or
          <code class="bg-muted rounded px-1">[All]</code> labels the part from
          there on;
          <code class="bg-muted rounded px-1">[Instrumental]</code> marks a
          rest. A hyphenated word (<code class="bg-muted rounded px-1"
            >Gabi-gabi</code
          >) keeps its hyphen, and each part is timed as its own word. Split a
          long word with <code class="bg-muted rounded px-1">|</code>, like
          <code class="bg-muted rounded px-1">a|ma|zing</code>, to sweep its
          syllables separately (the <code>|</code> isn&rsquo;t shown).
        </p>
        <div class="bg-muted/50 mt-2 rounded-lg p-3 text-xs">
          <p class="mb-1 font-semibold">
            Timing marks (line sync; never shown on screen)
          </p>
          <p class="text-muted-foreground mb-1">
            Each word gets a share of its line by how many syllables it has.
            Fine-tune where the singing stretches or rests:
          </p>
          <ul class="text-muted-foreground flex flex-col gap-0.5">
            <li>
              <code class="bg-muted rounded px-1">~</code> hold &mdash; one
              syllable longer per <code>~</code>:
              <code class="bg-muted rounded px-1">ma-hal~~ kita</code>
            </li>
            <li>
              <code class="bg-muted rounded px-1">/</code> pause &mdash; a
              syllable&rsquo;s rest per <code>/</code>, the highlight waits:
              <code class="bg-muted rounded px-1">ikaw / at ako</code>; at the
              start of a line it delays the first word:
              <code class="bg-muted rounded px-1">// Oh</code>
            </li>
            <li>
              <code class="bg-muted rounded px-1">^</code> quick &mdash; half as
              long per <code>^</code>, so the highlight moves on to the next
              word sooner (even between beats):
              <code class="bg-muted rounded px-1">Si^ Annie</code>, quicker
              still <code class="bg-muted rounded px-1">Si^^ Annie</code>
            </li>
          </ul>
        </div>
        <div class="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            :variant="shapeChanged ? 'default' : 'outline'"
            @click="rebuildScreens"
            >Build screens</Button
          >
          <span class="text-muted-foreground text-xs"
            >{{ screens.length }} screen{{
              screens.length === 1 ? "" : "s"
            }}
            &middot; changes to words and timing marks apply as you type</span
          >
        </div>
        <p
          v-if="shapeChanged"
          class="mt-2 text-xs text-amber-600 dark:text-amber-500"
          role="status"
        >
          You&rsquo;ve added or removed lines or screens. Click
          <strong>Build screens</strong> to apply it &mdash; taps are matched up
          line by line from the top, so check the
          {{ lineMode ? "Line taps" : "Tapped times" }} list afterwards.
        </p>
        <ul v-if="lint.length" class="mt-2 flex flex-col gap-1">
          <li
            v-for="(warning, i) in lint"
            :key="i"
            class="text-xs text-amber-600 dark:text-amber-500"
          >
            Screen {{ warning.screenIndex + 1 }}, line
            {{ warning.lineIndex + 1 }}: {{ warning.message }}
          </li>
        </ul>
      </div>
    </div>

    <div
      class="bg-background/95 fixed inset-x-0 bottom-0 flex items-center justify-end gap-3 border-t px-4 py-3 backdrop-blur"
    >
      <span v-if="saveError" class="text-destructive text-xs" role="alert">{{
        saveError
      }}</span>
      <span
        v-else-if="dirty"
        class="text-xs font-medium text-amber-600 dark:text-amber-500"
      >
        Unsaved changes
      </span>
      <span v-else-if="savedAt" class="text-muted-foreground text-xs">
        Saved {{ savedAt.toLocaleTimeString([], { timeStyle: "short" }) }}
        <template v-if="sharedNote"> &middot; {{ sharedNote }}</template>
      </span>
      <label
        class="text-muted-foreground flex items-center gap-1.5 text-xs"
        title="The karaoke sync and Line timing are one timing: saving here gives the chord sheet's lines these times too"
      >
        <input v-model="shareTiming" type="checkbox" class="accent-primary" />
        Update Line timing too
      </label>
      <template v-if="!complete">
        <span class="text-xs font-medium text-amber-600 dark:text-amber-500">
          {{ remainingText }} &mdash; Stage Mode plays the recording (with
          Vocals) once every {{ lineMode ? "line" : "word" }} is tapped.
        </span>
        <Button
          v-if="canPlay && remaining > 0"
          size="sm"
          variant="outline"
          @click="tapRest"
          >Tap the rest</Button
        >
      </template>
      <span v-else class="text-xs text-emerald-600 dark:text-emerald-500">
        Fully synced &mdash; ready for Stage Mode.
      </span>
      <Button
        :disabled="saving"
        :variant="dirty ? 'default' : 'outline'"
        title="Save sync (Ctrl+S / ⌘S)"
        @click="save"
        >{{ saving ? "Saving…" : "Save sync" }}</Button
      >
    </div>
  </AppLayout>
</template>

<style scoped>
.mode-choice {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  text-align: left;
  transition:
    border-color 0.15s,
    background-color 0.15s;
}
.mode-choice:hover {
  background: var(--accent);
}
.mode-choice.is-on {
  border-color: var(--primary);
  background: color-mix(in oklab, var(--primary) 8%, transparent);
  box-shadow: inset 0 0 0 1px var(--primary);
}
.tap-pad {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  width: 100%;
  min-height: 6rem;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: var(--primary);
  color: var(--primary-foreground);
  touch-action: none;
  user-select: none;
  transition: transform 0.06s;
}
.tap-pad.is-down {
  transform: scale(0.98);
  filter: brightness(1.25);
}
.tap-pad:disabled {
  opacity: 0.5;
}
.tempo-chip {
  padding: 0.25rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}
.tempo-chip.is-on {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--primary-foreground);
}
.grid-choice {
  padding: 0.25rem 0.65rem;
  font-size: 0.8rem;
}
.grid-choice + .grid-choice {
  border-left: 1px solid var(--border);
}
.grid-choice:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.grid-choice.is-on {
  background: var(--primary);
  color: var(--primary-foreground);
}
.cue-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.2rem 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid transparent;
}
.cue-row {
  cursor: pointer;
}
.cue-row:hover {
  background: color-mix(in oklab, var(--muted) 60%, transparent);
}
.cue-row.is-selected {
  border-color: color-mix(in oklab, var(--foreground) 35%, transparent);
  background: var(--muted);
}
.cue-row.is-next {
  border-color: var(--primary);
  background: color-mix(in oklab, var(--primary) 8%, transparent);
}
.time-input {
  width: 100%;
  padding: 0.1rem 0.3rem;
  border: 1px solid transparent;
  border-radius: 0.3rem;
  background: transparent;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  font-style: normal;
  color: var(--foreground);
}
.time-input:hover {
  border-color: var(--border);
}
.time-input:focus {
  border-color: var(--ring);
  background: var(--background);
  outline: none;
}
.time-input::placeholder {
  color: var(--muted-foreground);
}
.time-input.is-bad {
  border-color: rgb(217 119 6 / 0.7);
}
.wait-note {
  position: absolute;
  inset: auto 0.75rem 0.75rem 0.75rem;
  padding: 0.6rem 0.9rem;
  border-radius: 0.6rem;
  background: rgb(0 0 0 / 0.85);
  color: #fff;
  text-align: center;
  font-size: 0.9rem;
}
.wait-note .kbd {
  color: var(--foreground);
}
.cue-row.is-break {
  font-style: italic;
  color: var(--muted-foreground);
}
.kbd {
  padding: 0 0.3rem;
  border: 1px solid var(--border);
  border-radius: 0.25rem;
  background: var(--muted);
  font-size: 0.7rem;
}
.kbd-on-primary {
  border-color: color-mix(in oklab, var(--primary-foreground) 40%, transparent);
  background: transparent;
  color: inherit;
}
/* The practice screen and the taps side by side on a wide screen (one
   above the other on a narrow one), each kept in view while you tap. */
.sync-split {
  display: grid;
  gap: 1rem;
  align-items: start;
}
.sync-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--card);
}
.sync-panel:not(.sync-practice) {
  max-height: 70vh;
}
.cue-list {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
@media (min-width: 1024px) {
  .sync-split {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .sync-panel {
    position: sticky;
    top: 0.75rem;
    max-height: calc(100dvh - 6.5rem);
  }
  .sync-panel:not(.sync-practice) {
    height: calc(100dvh - 6.5rem);
  }
  .sync-practice {
    overflow-y: auto;
  }
}
@media (min-width: 1536px) {
  .sync-split {
    grid-template-columns: minmax(0, 5fr) minmax(0, 4fr);
  }
}
.shortcuts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 0.6rem;
  align-items: baseline;
  font-size: 0.75rem;
  color: var(--muted-foreground);
}
.shortcuts dt {
  white-space: nowrap;
  text-align: right;
}
</style>
