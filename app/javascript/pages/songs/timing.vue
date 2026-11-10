<script setup lang="ts">
import { Head, Link, router } from "@inertiajs/vue3"
import { useLocalStorage } from "@vueuse/core"
import { Minus, Pause, Play, Plus, RotateCcw } from "lucide-vue-next"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

import SheetView from "@/components/karaoke/tv/SheetView.vue"
import "@/components/karaoke/tv/tv.css"
import { Button } from "@/components/ui/button"
import { useMediaClock } from "@/composables/useMediaClock"
import AppLayout from "@/layouts/AppLayout.vue"
import { parseBody } from "@/lib/chordSheet"
import {
  NUDGE,
  type TimedLine,
  formatClockTime,
  isTimeBased,
  lineLengths,
  parseClockTime,
  savedBeats,
  savedStart,
  timedLines,
} from "@/lib/lineTiming"
import { buildTimeline, guideAt } from "@/lib/tempoGuide"
import { help, songs as songsRoutes, songsTimings } from "@/routes"
import type { BreadcrumbItem, Song } from "@/types"

// Line timing: when each line of the chord sheet starts, tapped out like
// the karaoke sync's line taps -- against the song's uploaded audio, or
// against the music playing in another app (Spotify, YouTube, a CD...),
// timed here with a stopwatch. Stage Mode's highlight and the sheet's
// scrolling then move on to the next line exactly when the song does.

const props = defineProps<{ song: Song }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Songs", href: songsRoutes.index().url },
  { title: props.song.title, href: songsRoutes.show(props.song.slug).url },
  {
    title: "Line timing",
    href: songsTimings.show({ song_id: props.song.slug }).url,
  },
]

const BPM_RANGE = { min: 40, max: 240 }
function clampBpm(value: number): number {
  if (!Number.isFinite(value)) return 100
  return Math.min(BPM_RANGE.max, Math.max(BPM_RANGE.min, Math.round(value)))
}
const round3 = (x: number) => Math.round(x * 1000) / 1000

/* ---- the song and its lines ---- */
const blocks = computed(() => parseBody(props.song.body ?? ""))
// Shared with Stage Mode: how long a line nobody has timed lasts.
const beatsPerLine = useLocalStorage("chordstage:beatsperline", 4, {
  initOnMounted: true,
})
const initialTiming = props.song.line_timing ?? null
const bpm = ref(
  clampBpm(Number(props.song.tempo) || Number(initialTiming?.bpm) || 100),
)
const lines = computed(() => timedLines(blocks.value, beatsPerLine.value))

// What's saved, as start times. A timing from before times were used
// (lengths in beats) is laid out at its tempo, so it opens as times.
const converted = ref(false)
function initialStarts(): {
  starts: Record<string, number>
  end: number | null
} {
  const all = timedLines(blocks.value, 4)
  const timing = initialTiming
  if (!timing?.lines) return { starts: {}, end: null }
  if (isTimeBased(timing)) {
    const starts: Record<string, number> = {}
    for (const line of all) {
      const s = savedStart(line, timing)
      if (s != null) starts[line.id] = s
    }
    const end = Number(timing.end)
    return { starts, end: Number.isFinite(end) && end > 0 ? end : null }
  }
  const lineBeats: (number | null)[] = blocks.value.map(() => null)
  let any = false
  for (const line of all) {
    const beats = savedBeats(line, timing)
    if (beats != null) {
      lineBeats[line.blockIndex] = beats
      any = true
    }
  }
  if (!any) return { starts: {}, end: null }
  const refBpm = Number(timing.bpm) || bpm.value
  const tl = buildTimeline(blocks.value, refBpm, 4, lineBeats)
  const starts: Record<string, number> = {}
  for (const line of all) {
    starts[line.id] = round3(tl.lines[line.blockIndex]?.lineStart ?? 0)
  }
  converted.value = true
  return { starts, end: round3(tl.totalDuration) }
}
const init = initialStarts()
const starts = ref<Record<string, number>>(init.starts)
const endTime = ref<number | null>(init.end)

/* ---- taps ("cues"): one per line, then the end of the last line ---- */
const totalCues = computed(() => lines.value.length + 1)
const endCue = computed(() => lines.value.length)
function cueTime(i: number): number | null {
  if (i < 0) return null
  if (i >= lines.value.length) return endTime.value
  return starts.value[lines.value[i].id] ?? null
}
function setCue(i: number, t: number | null) {
  if (i >= lines.value.length) {
    endTime.value = t == null ? null : round3(Math.max(0, t))
    return
  }
  const next = { ...starts.value }
  const id = lines.value[i].id
  if (t == null) delete next[id]
  else next[id] = round3(Math.max(0, t))
  starts.value = next
}
function clearFrom(i: number) {
  const next = { ...starts.value }
  for (let k = Math.max(0, i); k < lines.value.length; k++)
    delete next[lines.value[k].id]
  starts.value = next
  endTime.value = null
}
function firstUntapped(): number {
  const i = lines.value.findIndex((l) => starts.value[l.id] == null)
  if (i !== -1) return i
  return endTime.value == null ? endCue.value : totalCues.value
}
// The next tap still missing, from `from` on (so tapping the gaps skips
// lines already tapped). The end of the last line is only asked for
// straight after the last line.
function nextUntapped(from: number): number {
  for (let k = from; k < lines.value.length; k++) {
    if (cueTime(k) == null) return k
  }
  if (from === endCue.value && endTime.value == null) return endCue.value
  return totalCues.value
}

const startsList = computed(() =>
  lines.value.map((l) => starts.value[l.id] ?? null),
)
// Each line's length in seconds (null: not both ends tapped).
const lengths = computed(() =>
  lineLengths(lines.value, startsList.value, endTime.value),
)
const defaultSeconds = (line: TimedLine) => (line.defaultBeats * 60) / bpm.value

const tappedCount = computed(
  () => startsList.value.filter((s) => s != null).length,
)
const timeline = computed(() => {
  const lineBeats: (number | null)[] = blocks.value.map(() => null)
  lines.value.forEach((line, i) => {
    const seconds = lengths.value[i]
    if (seconds != null) lineBeats[line.blockIndex] = (seconds * bpm.value) / 60
  })
  return buildTimeline(blocks.value, bpm.value, beatsPerLine.value, lineBeats)
})
const tlStart = (i: number) =>
  timeline.value.lines[lines.value[i]?.blockIndex ?? -1]?.lineStart ?? 0
const tlEnd = (i: number) =>
  timeline.value.lines[lines.value[i]?.blockIndex ?? -1]?.lineEnd ?? 0

/* ---- what the music plays on: this song's audio, or another app ---- */
type Source = "audio" | "external"
const hasAudio = !!props.song.audio_url
const source = ref<Source>(
  hasAudio && initialTiming?.source !== "external" ? "audio" : "external",
)
const external = computed(() => source.value === "external" || !hasAudio)

const audioPlayer = ref<HTMLAudioElement | null>(null)
const { time: audioTime, playing: audioPlaying } = useMediaClock(audioPlayer)
const duration = ref(0)
function onDurationChange() {
  const d = audioPlayer.value?.duration
  duration.value = d && Number.isFinite(d) ? d : 0
}

// The stopwatch, for music playing somewhere else.
const watchTime = ref(0)
const watchRunning = ref(false)
let watchZero = 0
let raf: number | null = null
function tick() {
  raf = null
  if (!watchRunning.value) return
  watchTime.value = (performance.now() - watchZero) / 1000
  raf = requestAnimationFrame(tick)
}
function watchStart(at = watchTime.value) {
  watchZero = performance.now() - at * 1000
  watchTime.value = at
  watchRunning.value = true
  if (raf == null) raf = requestAnimationFrame(tick)
}
function watchStop() {
  if (watchRunning.value)
    watchTime.value = (performance.now() - watchZero) / 1000
  watchRunning.value = false
  if (raf != null) cancelAnimationFrame(raf)
  raf = null
}

const clockTime = computed(() =>
  external.value ? watchTime.value : audioTime.value,
)
const clockRunning = computed(() =>
  external.value ? watchRunning.value : audioPlaying.value,
)
function clockNow(): number {
  if (!external.value) return audioPlayer.value?.currentTime ?? 0
  return watchRunning.value
    ? (performance.now() - watchZero) / 1000
    : watchTime.value
}
function seekClock(t: number) {
  const at = Math.max(0, t)
  if (external.value) {
    if (watchRunning.value) watchStart(at)
    else watchTime.value = at
  } else if (audioPlayer.value) {
    audioPlayer.value.currentTime = at
  }
}
function playClock() {
  if (external.value) watchStart()
  else void audioPlayer.value?.play()
}
function pauseClock() {
  watchStop()
  audioPlayer.value?.pause()
}
function onScrub(e: Event) {
  seekClock(Number((e.target as HTMLInputElement).value))
}
function clock(t: number): string {
  const s = Math.max(0, Math.floor(t))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/* ---- tapping ---- */
const recording = ref(false)
// Music in another app: the first Space lines the stopwatch up with it.
const waiting = ref(false)
const cuePointer = ref(firstUntapped())

function startTapping() {
  if (!lines.value.length) return
  if (cuePointer.value >= totalCues.value) cuePointer.value = firstUntapped()
  recording.value = true
  if (external.value) {
    watchStop()
    waiting.value = true
    return
  }
  // Back up to just before the line to tap, if the audio is elsewhere.
  const prev = cueTime(cuePointer.value - 1)
  const now = clockNow()
  if (prev != null && (now < prev - 3 || now > prev + 20)) seekClock(prev - 2)
  playClock()
}
function stopTapping() {
  recording.value = false
  waiting.value = false
  pauseClock()
}
function toggleTapping() {
  if (recording.value) stopTapping()
  else startTapping()
}

function tap() {
  if (!recording.value) return
  const i = cuePointer.value
  if (i >= totalCues.value) return
  if (external.value && waiting.value) {
    waiting.value = false
    const anchor = cueTime(i - 1)
    if (anchor != null) {
      // This Space was the line before: the stopwatch now matches the
      // music, and the next Space taps the line.
      watchStart(anchor)
      return
    }
    watchStart(0)
  }
  const t = clockNow()
  if (i === endCue.value) {
    const lastStart = cueTime(i - 1)
    if (lastStart != null && t <= lastStart) return
  }
  setCue(i, t)
  cuePointer.value = external.value ? i + 1 : nextUntapped(i + 1)
  if (cuePointer.value >= totalCues.value) {
    recording.value = false
    pauseClock()
  }
}

// Clears the taps from line `i` on and backs up to just before it, to tap
// that stretch again. With music in another app, play it from a little
// before the line before, and tap that line to line the stopwatch up.
function retapFrom(i: number) {
  if (i < 0 || i >= totalCues.value) return
  const back = cueTime(i) ?? cueTime(i - 1) ?? 0
  if (i === endCue.value) endTime.value = null
  else clearFrom(i)
  cuePointer.value = i
  selectedCue.value = null
  recording.value = true
  if (external.value) {
    watchStop()
    watchTime.value = Math.max(0, cueTime(i - 1) ?? 0)
    waiting.value = true
  } else {
    seekClock(back - 2.5)
    playClock()
  }
}
function undoTap() {
  if (cuePointer.value === 0) return
  const i = cuePointer.value - 1
  if (external.value) {
    retapFrom(i)
    return
  }
  const was = cueTime(i)
  setCue(i, null)
  cuePointer.value = i
  if (was != null) seekClock(was - 2.5)
}
/* ---- times typed in, e.g. read off the music player's clock ---- */
// With it on, changing a line's time moves every later tap by as much --
// handy to line taps made with the stopwatch up with the player's clock.
const shiftLater = useLocalStorage("chordstage:timing-shift-later", false, {
  initOnMounted: true,
})
const timeErrors = ref<Record<number, string>>({})
function timeText(i: number): string {
  const t = cueTime(i)
  return t == null ? "" : formatClockTime(t)
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
  if (t != null && old != null && shiftLater.value && t !== old) {
    const delta = t - old
    const next = { ...starts.value }
    for (let k = i + 1; k < lines.value.length; k++) {
      const id = lines.value[k].id
      if (next[id] != null) next[id] = round3(Math.max(0, next[id] + delta))
    }
    starts.value = next
    if (i < endCue.value && endTime.value != null)
      endTime.value = round3(Math.max(0, endTime.value + delta))
  }
  setCue(i, t)
  input.value = timeText(i)
  if (!recording.value) cuePointer.value = firstUntapped()
}
// A start that isn't after the line before it (by the times typed or
// tapped) -- the line gets the default length until it's fixed.
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
  const t = cueTime(i)
  if (t == null) return
  setCue(i, t + delta)
}

/* ---- the line list beside the preview ---- */
const selectedCue = ref<number | null>(null)
const cueList = ref<HTMLElement | null>(null)
function selectCue(i: number) {
  selectedCue.value = Math.max(0, Math.min(totalCues.value - 1, i))
}
function moveSelection(delta: number) {
  const from = selectedCue.value ?? Math.max(0, cuePointer.value - 1)
  selectCue(selectedCue.value == null ? from : from + delta)
}
watch(recording, (on) => {
  if (on) selectedCue.value = null
})

// R: tap again from the line just tapped (again to go one further back),
// or from the line picked in the list.
function retapKey() {
  const i =
    recording.value || selectedCue.value == null
      ? cuePointer.value - 1
      : selectedCue.value
  if (i < 0) return
  retapFrom(i)
}
// Listen (or, with music elsewhere, watch) from a line.
function playFrom(i: number) {
  if (recording.value) stopTapping()
  const t = cueTime(i)
  seekClock(t != null ? t - 2 : clockTime.value)
  playClock()
}
function togglePreview() {
  if (recording.value) stopTapping()
  else if (clockRunning.value) pauseClock()
  else playClock()
}
function playSelected() {
  if (clockRunning.value) {
    pauseClock()
    return
  }
  playFrom(selectedCue.value ?? Math.max(0, cuePointer.value - 1))
}

watch(source, () => {
  stopTapping()
  pauseClock()
})

/* ---- the preview: the sheet as Stage Mode shows it ---- */
// Where the preview is: the tapped line that's playing, and how far into
// it; while tapping, the highlight waits at the end of the line being
// sung for the next tap.
const guideTime = computed(() => {
  const t = clockTime.value
  let best = -1
  let bestStart = -Infinity
  startsList.value.forEach((s, i) => {
    if (s != null && s <= t && s >= bestStart) {
      best = i
      bestStart = s
    }
  })
  let g: number
  if (best >= 0) {
    g = tlStart(best) + (t - bestStart)
  } else {
    const first = startsList.value.findIndex((s) => s != null)
    g = first >= 0 ? tlStart(first) - (startsList.value[first]! - t) : t
  }
  if (recording.value && !waiting.value) {
    const current = cuePointer.value - 1
    if (current >= 0 && current < lines.value.length)
      g = Math.min(g, tlEnd(current) - 1e-3)
  }
  return g
})
const guide = computed(() => guideAt(timeline.value.lines, guideTime.value))
const playingLine = computed(() => {
  const block = guide.value?.blockIndex ?? -1
  return lines.value.findIndex((l) => l.blockIndex === block)
})
const showBall = ref(true)

// Keeps the line to tap (or the one picked, or the one playing) in the
// middle of the list, without scrolling the page.
function keepInView() {
  void nextTick(() => {
    const list = cueList.value
    const i = recording.value
      ? cuePointer.value
      : (selectedCue.value ??
        (clockRunning.value ? playingLine.value : cuePointer.value))
    const row = list?.querySelector<HTMLElement>(`[data-cue="${i}"]`)
    if (!list || !row) return
    const top = row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2
    list.scrollTo({ top: Math.max(0, top), behavior: "smooth" })
  })
}
watch([cuePointer, selectedCue, recording, playingLine], keepInView)

function lineLabel(i: number): string {
  if (i === endCue.value) return "the end of the last line"
  const line = lines.value[i]
  return line ? `“${line.text}”` : ""
}
const nextLabel = computed(() =>
  cuePointer.value < totalCues.value ? lineLabel(cuePointer.value) : null,
)
// While waiting to line up with music elsewhere: which line to tap first.
const anchorLabel = computed(() => {
  const i = cuePointer.value
  return cueTime(i - 1) != null ? lineLabel(i - 1) : lineLabel(i)
})

/* ---- sections, for the list ---- */
interface Row {
  line: TimedLine
  index: number
  header: string | null
}
const rows = computed<Row[]>(() =>
  lines.value.map((line, index) => {
    const prev = lines.value[index - 1]
    const key = line.id.slice(0, line.id.lastIndexOf("#"))
    const prevKey = prev ? prev.id.slice(0, prev.id.lastIndexOf("#")) : null
    return {
      line,
      index,
      header:
        key !== prevKey
          ? `${line.section || "Song"}${line.repeat ? " (repeat)" : ""}`
          : null,
    }
  }),
)
function lengthLabel(i: number): string {
  const own = lengths.value[i]
  const line = lines.value[i]
  if (own != null) {
    const borrowed =
      line.repeat && (cueTime(i) == null || cueTime(i + 1) == null)
    return `${own.toFixed(1)} s${borrowed ? " (as the original)" : ""}`
  }
  return `${defaultSeconds(line).toFixed(1)} s default`
}

/* ---- save ---- */
function payload() {
  const entries: Record<string, { text: string; start: number }> = {}
  for (const line of lines.value) {
    const s = starts.value[line.id]
    if (s != null) entries[line.id] = { text: line.text, start: s }
  }
  if (!Object.keys(entries).length) return null
  return {
    version: 2,
    bpm: bpm.value,
    source: external.value ? "external" : "audio",
    end: endTime.value,
    lines: entries,
  }
}
const snapshot = () => JSON.stringify([starts.value, endTime.value, bpm.value])
const saved = ref(snapshot())
const dirty = computed(() => snapshot() !== saved.value)
const saving = ref(false)
const saveError = ref<string | null>(null)
function save() {
  const data = payload()
  saving.value = true
  saveError.value = null
  router.patch(
    songsTimings.update({ song_id: props.song.slug }).url,
    { line_timing: data ? JSON.stringify(data) : "", tempo: bpm.value },
    {
      preserveScroll: true,
      preserveState: true,
      onSuccess: () => {
        saved.value = snapshot()
        converted.value = false
      },
      onError: () => {
        saveError.value = "Couldn't save. Your taps are still here; try again."
      },
      onFinish: () => (saving.value = false),
    },
  )
}
function resetAll() {
  if (!tappedCount.value && endTime.value == null) return
  if (confirm("Clear every tap? Lines go back to the default length.")) {
    stopTapping()
    clearFrom(0)
    cuePointer.value = 0
  }
}

const leaveWarning = "You have unsaved line timing. Leave without saving?"
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!dirty.value) return
  e.preventDefault()
  e.returnValue = ""
}
const removeBefore = router.on("before", (event) => {
  if (saving.value || !dirty.value) return
  if (event.detail.visit.method !== "get") return
  if (!confirm(leaveWarning)) event.preventDefault()
})

/* ---- keyboard: the same keys as the karaoke sync ---- */
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
    if (dirty.value && !saving.value) save()
    return
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (isTypingTarget(e.target)) return
  const tag = (e.target as HTMLElement | null)?.tagName ?? ""

  if (e.key === "Enter") {
    if (tag === "A") return
    e.preventDefault()
    if (!e.repeat) toggleTapping()
    return
  }
  if (e.key === "Escape") {
    if (recording.value) stopTapping()
    else pauseClock()
    return
  }
  if (e.key.toLowerCase() === "r") {
    e.preventDefault()
    if (!e.repeat) retapKey()
    return
  }
  if (e.key.toLowerCase() === "p") {
    e.preventDefault()
    if (!recording.value) playSelected()
    return
  }

  if (recording.value) {
    if (e.code === "Space") {
      e.preventDefault()
      if (!e.repeat) tap()
    } else if (e.key === "Backspace") {
      e.preventDefault()
      undoTap()
    }
    return
  }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault()
    moveSelection(e.key === "ArrowDown" ? 1 : -1)
  } else if (
    (e.code === "BracketLeft" || e.code === "BracketRight") &&
    selectedCue.value != null
  ) {
    e.preventDefault()
    const step = e.shiftKey ? 0.01 : NUDGE
    nudgeCue(selectedCue.value, e.code === "BracketLeft" ? -step : step)
  }
}
function onKeyup(e: KeyboardEvent) {
  if (e.code === "Space" && recording.value && !isTypingTarget(e.target))
    e.preventDefault()
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown)
  window.addEventListener("keyup", onKeyup)
  window.addEventListener("beforeunload", onBeforeUnload)
  // The default length can come in from this device's settings after
  // mount; that isn't an edit.
  void nextTick(() => (saved.value = snapshot()))
})
onBeforeUnmount(() => {
  watchStop()
  removeBefore()
  window.removeEventListener("keydown", onKeydown)
  window.removeEventListener("keyup", onKeyup)
  window.removeEventListener("beforeunload", onBeforeUnload)
})
</script>

<template>
  <Head :title="`Line timing — ${song.title}`" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="flex flex-col gap-4 p-4 pb-28">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="max-w-2xl">
          <h1 class="text-2xl font-bold">
            Line timing &mdash; {{ song.title }}
          </h1>
          <p class="text-muted-foreground text-sm">
            Tap the moment each line starts while the song plays &mdash; from
            its uploaded audio, or in any other music app &mdash; so Stage
            Mode&rsquo;s highlight and the sheet&rsquo;s scrolling move on
            exactly when the singer does.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Link :href="help.index({ anchor: 'line-timing' })">
            <Button variant="ghost">How to time lines</Button>
          </Link>
          <Link :href="songsRoutes.show(song.slug)">
            <Button variant="outline">Back to song</Button>
          </Link>
          <Link :href="songsRoutes.stage(song.slug)">
            <Button variant="outline">Stage Mode</Button>
          </Link>
        </div>
      </div>

      <div v-if="!lines.length" class="bg-card rounded-xl border p-6 text-sm">
        This song has no lyric or chord lines to time yet. Add some in the
        <Link class="underline" :href="songsRoutes.edit(song.slug)"
          >song editor</Link
        >.
      </div>

      <template v-else>
        <p
          v-if="converted"
          class="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
          role="status"
        >
          This song&rsquo;s timing was made in beats. It&rsquo;s shown here as
          times (at {{ initialTiming?.bpm || bpm }} BPM) and plays the same
          &mdash; save to keep it this way, or tap it again with the music.
        </p>

        <!-- Where the music comes from -->
        <div class="bg-card flex flex-col gap-3 rounded-xl border p-4">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2
              class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
            >
              Play the music from
            </h2>
            <div class="flex overflow-hidden rounded-md border" role="group">
              <button
                type="button"
                class="source-choice"
                :class="{ 'is-on': !external }"
                :aria-pressed="!external"
                :disabled="!hasAudio"
                :title="
                  hasAudio
                    ? undefined
                    : 'No audio uploaded for this song (upload it on the Karaoke sync page)'
                "
                @click="source = 'audio'"
              >
                This song&rsquo;s audio
              </button>
              <button
                type="button"
                class="source-choice"
                :class="{ 'is-on': external }"
                :aria-pressed="external"
                @click="source = 'external'"
              >
                Another app or device
              </button>
            </div>
          </div>
          <audio
            v-if="hasAudio"
            v-show="!external"
            ref="audioPlayer"
            :src="song.audio_url ?? undefined"
            controls
            class="w-full"
            @durationchange="onDurationChange"
          ></audio>
          <div v-if="external" class="text-sm">
            <p>
              Play the song in any music app &mdash; Spotify, YouTube, Apple
              Music, a CD &mdash; on this computer or another device, loud
              enough to hear. The app keeps time with a stopwatch:
            </p>
            <ol class="mt-1 list-decimal pl-5">
              <li>
                Press <kbd class="kbd">Enter</kbd> here, then start the music.
              </li>
              <li>
                Press <kbd class="kbd">Space</kbd> the moment the first line
                starts, and again as each next line starts.
              </li>
              <li>
                To redo a stretch (<kbd class="kbd">R</kbd>), play the music
                from a little before the line before it and tap that line first
                &mdash; it lines the stopwatch up with the music again.
              </li>
            </ol>
            <p v-if="!hasAudio" class="text-muted-foreground mt-1 text-xs">
              This song has no audio uploaded. (If you upload it on the Karaoke
              sync page, you can time it against that instead.)
            </p>
          </div>
        </div>

        <!-- Preview and taps, side by side -->
        <div class="sync-split">
          <div class="sync-panel sync-practice">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2
                class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
              >
                Preview &mdash; the sheet as Stage Mode shows it
              </h2>
              <label class="flex items-center gap-2 text-xs">
                <input v-model="showBall" type="checkbox" />
                Bouncing ball
              </label>
            </div>
            <div class="tv-theme relative h-[20rem] overflow-hidden rounded-lg">
              <SheetView
                :blocks="blocks"
                :font-scale="0.6"
                :guide="guide"
                :ball="showBall"
              />
              <div
                v-if="recording && waiting"
                class="timing-wait"
                aria-live="polite"
              >
                <p class="font-bold">Start your music</p>
                <p>
                  then press <kbd class="kbd">Space</kbd> the moment
                  {{ anchorLabel }} starts
                </p>
              </div>
            </div>

            <!-- the clock -->
            <div class="mt-2 flex items-center gap-2 text-xs tabular-nums">
              <span class="text-muted-foreground w-9 text-right">{{
                clock(clockTime)
              }}</span>
              <input
                v-if="!external"
                type="range"
                class="accent-primary h-1 min-w-0 flex-1"
                min="0"
                :max="duration || 0"
                step="0.1"
                :value="clockTime"
                aria-label="Position in the song"
                @input="onScrub"
                @pointerup="($event.target as HTMLInputElement).blur()"
              />
              <span v-else class="text-muted-foreground flex-1">
                {{
                  watchRunning
                    ? "stopwatch running"
                    : recording
                      ? "stopwatch waiting for your first tap"
                      : "stopwatch"
                }}
              </span>
              <span v-if="!external" class="text-muted-foreground w-9">{{
                clock(duration)
              }}</span>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" @click="toggleTapping">
                {{ recording ? "Stop" : "Start tapping" }}
                <kbd class="kbd kbd-on-primary">Enter</kbd>
              </Button>
              <Button
                size="sm"
                variant="outline"
                :disabled="cuePointer === 0 && selectedCue == null"
                title="Tap the last line again (R) -- press again to go back further"
                @click="retapKey"
              >
                <RotateCcw class="size-3.5" /> Re-tap
                <kbd class="kbd">R</kbd>
              </Button>
              <Button
                size="sm"
                variant="outline"
                :disabled="cuePointer === 0 || !recording"
                @click="undoTap"
              >
                Undo <kbd class="kbd">&#9003;</kbd>
              </Button>
              <Button
                size="sm"
                variant="outline"
                :disabled="recording"
                @click="togglePreview"
              >
                <component :is="clockRunning ? Pause : Play" class="size-4" />
                {{ clockRunning ? "Pause" : "Preview" }}
              </Button>
            </div>

            <p v-if="recording && nextLabel && !waiting" class="mt-2 text-sm">
              Next: <span class="font-semibold">{{ nextLabel }}</span>
            </p>
            <p
              v-else-if="recording && !nextLabel"
              class="text-muted-foreground mt-2 text-sm"
            >
              Every line is tapped. Press <kbd class="kbd">R</kbd> to tap the
              last line again, or pick a line in the list and press
              <kbd class="kbd">R</kbd>.
            </p>

            <button
              v-if="recording"
              type="button"
              class="tap-pad mt-2"
              :disabled="!nextLabel"
              @pointerdown.prevent="tap"
            >
              <span class="text-lg font-bold">{{
                waiting ? "Tap: line up with the music" : "Tap: line starts"
              }}</span>
              <span class="text-xs opacity-80">{{
                waiting ? anchorLabel : nextLabel
              }}</span>
            </button>

            <details open class="mt-3">
              <summary
                class="text-muted-foreground cursor-pointer text-xs font-medium select-none"
              >
                Keyboard shortcuts
              </summary>
              <dl class="shortcuts mt-2">
                <dt><kbd class="kbd">Enter</kbd></dt>
                <dd>Start / stop tapping</dd>
                <dt><kbd class="kbd">Space</kbd></dt>
                <dd>Tap as each line starts</dd>
                <dt><kbd class="kbd">R</kbd></dt>
                <dd>
                  Re-tap: back up and tap the last line again (press again to go
                  further back), or from the line picked in the list
                </dd>
                <dt><kbd class="kbd">&#9003;</kbd></dt>
                <dd>Undo the last tap</dd>
                <dt>
                  <kbd class="kbd">&uarr;</kbd>&thinsp;<kbd class="kbd"
                    >&darr;</kbd
                  >
                </dt>
                <dd>Pick a line (when stopped)</dd>
                <dt><kbd class="kbd">P</kbd></dt>
                <dd>Preview from the picked line / pause</dd>
                <dt>
                  <kbd class="kbd">[</kbd>&thinsp;<kbd class="kbd">]</kbd>
                </dt>
                <dd>Nudge its tap 0.05 s (with Shift: 0.01 s)</dd>
                <dt><kbd class="kbd">Esc</kbd></dt>
                <dd>Stop</dd>
                <dt><kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">S</kbd></dt>
                <dd>Save</dd>
              </dl>
            </details>
          </div>

          <!-- Line taps -->
          <div class="sync-panel">
            <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h2
                class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
              >
                Line taps
              </h2>
              <span class="flex items-center gap-2">
                <span class="text-muted-foreground text-xs"
                  >{{ tappedCount }}/{{ lines.length }} tapped</span
                >
                <Button
                  size="sm"
                  variant="ghost"
                  class="h-7 px-2 text-xs"
                  :disabled="!tappedCount && endTime == null"
                  @click="resetAll"
                  >Clear all</Button
                >
              </span>
            </div>
            <p class="text-muted-foreground mb-2 text-xs">
              Each line lasts until the next one starts. Click a time to type it
              in &mdash; say, read off your music player as the line starts
              (<code>1:23.45</code> or <code>83.45</code>). Click a line to pick
              it, then <kbd class="kbd">R</kbd> re-taps from there,
              <kbd class="kbd">P</kbd> previews it,
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
                when I change a time &mdash; e.g. type the player&rsquo;s time
                for the first line to line up taps made with the stopwatch, then
                turn this off to fix single lines.
              </span>
            </label>
            <ul ref="cueList" class="cue-list">
              <template v-for="row in rows" :key="row.line.id">
                <li
                  v-if="row.header"
                  class="text-muted-foreground mt-2 px-2 text-xs font-semibold first:mt-0"
                >
                  {{ row.header }}
                </li>
                <li
                  :data-cue="row.index"
                  class="cue-row"
                  :class="{
                    'is-next': recording && row.index === cuePointer,
                    'is-playing':
                      !recording && clockRunning && row.index === playingLine,
                    'is-selected': !recording && row.index === selectedCue,
                  }"
                  @click="selectCue(row.index)"
                >
                  <span class="flex w-[5.25rem] shrink-0 flex-col">
                    <input
                      type="text"
                      inputmode="decimal"
                      spellcheck="false"
                      class="time-input"
                      :class="{
                        'is-bad':
                          timeErrors[row.index] || outOfOrder(row.index),
                      }"
                      :value="timeText(row.index)"
                      placeholder="not tapped"
                      :aria-label="`Start time: ${row.line.text}`"
                      :title="
                        timeErrors[row.index] ??
                        (outOfOrder(row.index)
                          ? 'Not after the line above -- check this time'
                          : 'When this line starts (m:ss.ss)')
                      "
                      @focus="onTimeFocus"
                      @keydown="onTimeKeydown"
                      @change="commitTime(row.index, $event)"
                    />
                    <span
                      v-if="timeErrors[row.index]"
                      class="text-destructive text-[0.65rem] leading-tight"
                      role="alert"
                      >{{ timeErrors[row.index] }}</span
                    >
                    <span
                      v-else-if="outOfOrder(row.index)"
                      class="text-[0.65rem] leading-tight text-amber-600 dark:text-amber-500"
                      >before the line above</span
                    >
                  </span>
                  <span class="min-w-0 flex-1">
                    <span
                      class="block truncate text-sm"
                      :class="
                        row.line.instrumental
                          ? 'font-mono text-amber-600 dark:text-amber-400'
                          : ''
                      "
                      :title="row.line.text"
                      >{{ row.line.text }}</span
                    >
                    <span class="text-muted-foreground block text-xs">{{
                      lengthLabel(row.index)
                    }}</span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    class="size-7"
                    :disabled="cueTime(row.index) == null"
                    :aria-label="`Preview from: ${row.line.text}`"
                    @click.stop="playFrom(row.index)"
                    ><Play class="size-3.5"
                  /></Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    class="size-7"
                    :disabled="cueTime(row.index) == null"
                    aria-label="Earlier"
                    @click.stop="nudgeCue(row.index, -NUDGE)"
                    ><Minus class="size-3.5"
                  /></Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    class="size-7"
                    :disabled="cueTime(row.index) == null"
                    aria-label="Later"
                    @click.stop="nudgeCue(row.index, NUDGE)"
                    ><Plus class="size-3.5"
                  /></Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    class="h-7 px-2 text-xs"
                    @click.stop="retapFrom(row.index)"
                    ><RotateCcw class="size-3.5" /> Re-tap</Button
                  >
                </li>
              </template>
              <li
                :data-cue="endCue"
                class="cue-row is-end"
                :class="{
                  'is-next': recording && cuePointer === endCue,
                  'is-selected': !recording && selectedCue === endCue,
                }"
                @click="selectCue(endCue)"
              >
                <span class="flex w-[5.25rem] shrink-0 flex-col">
                  <input
                    type="text"
                    inputmode="decimal"
                    spellcheck="false"
                    class="time-input"
                    :class="{
                      'is-bad': timeErrors[endCue] || outOfOrder(endCue),
                    }"
                    :value="timeText(endCue)"
                    placeholder="optional"
                    aria-label="End of the last line"
                    :title="timeErrors[endCue] ?? 'Where the last line ends'"
                    @focus="onTimeFocus"
                    @keydown="onTimeKeydown"
                    @change="commitTime(endCue, $event)"
                  />
                  <span
                    v-if="timeErrors[endCue]"
                    class="text-destructive text-[0.65rem] leading-tight not-italic"
                    role="alert"
                    >{{ timeErrors[endCue] }}</span
                  >
                </span>
                <span class="min-w-0 flex-1 truncate text-sm">
                  End of the last line
                  <span
                    v-if="endTime == null"
                    class="text-muted-foreground text-xs not-italic"
                    >&nbsp;· without it the last line gets the default
                    length</span
                  >
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  class="h-7 px-2 text-xs"
                  @click.stop="retapFrom(endCue)"
                  ><RotateCcw class="size-3.5" />
                  {{ endTime != null ? "Re-tap" : "Tap it" }}</Button
                >
              </li>
            </ul>
          </div>
        </div>

        <!-- Tempo and untimed lines -->
        <div
          class="bg-card flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border p-4"
        >
          <div class="flex items-center gap-2">
            <span
              class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
              >Song tempo</span
            >
            <Button
              size="icon"
              variant="outline"
              aria-label="Slower"
              :disabled="bpm <= BPM_RANGE.min"
              @click="bpm = clampBpm(bpm - 1)"
              ><Minus class="size-4"
            /></Button>
            <input
              class="border-input bg-background h-9 w-16 rounded-md border px-2 text-center text-sm tabular-nums"
              type="number"
              :min="BPM_RANGE.min"
              :max="BPM_RANGE.max"
              :value="bpm"
              aria-label="Song tempo in BPM"
              @change="
                bpm = clampBpm(
                  Number(($event.target as HTMLInputElement).value),
                )
              "
            />
            <Button
              size="icon"
              variant="outline"
              aria-label="Faster"
              :disabled="bpm >= BPM_RANGE.max"
              @click="bpm = clampBpm(bpm + 1)"
              ><Plus class="size-4"
            /></Button>
            <span class="text-muted-foreground text-sm">BPM</span>
          </div>
          <div class="flex items-center gap-2">
            <span
              class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
              >Lines not tapped</span
            >
            <Button
              size="icon"
              variant="outline"
              aria-label="Fewer beats"
              :disabled="beatsPerLine <= 1"
              @click="beatsPerLine = Math.max(1, beatsPerLine - 1)"
              ><Minus class="size-4"
            /></Button>
            <span class="w-16 text-center text-sm tabular-nums"
              >{{ beatsPerLine }} beats</span
            >
            <Button
              size="icon"
              variant="outline"
              aria-label="More beats"
              :disabled="beatsPerLine >= 8"
              @click="beatsPerLine = Math.min(8, beatsPerLine + 1)"
              ><Plus class="size-4"
            /></Button>
          </div>
          <p class="text-muted-foreground max-w-xl text-xs">
            Stage Mode plays your taps in real time at the song&rsquo;s tempo;
            its Tempo &minus;/+ then speeds the whole song up or slows it down
            evenly. Lines you haven&rsquo;t tapped last
            {{ beatsPerLine }} beats at this tempo.
          </p>
        </div>
      </template>
    </div>

    <!-- Save bar -->
    <div
      v-if="lines.length"
      class="bg-background/95 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur md:left-[var(--sidebar-width,0px)]"
    >
      <div class="flex flex-wrap items-center justify-end gap-3 px-4 py-3">
        <span v-if="saveError" class="text-destructive text-sm" role="alert">{{
          saveError
        }}</span>
        <span
          v-else
          class="text-sm"
          :class="
            dirty
              ? 'font-medium text-amber-600 dark:text-amber-500'
              : 'text-muted-foreground'
          "
        >
          {{ dirty ? "Unsaved changes" : "All changes saved" }}
        </span>
        <Button
          :disabled="!dirty || saving"
          title="Save timing (Ctrl+S / ⌘S)"
          @click="save"
        >
          {{ saving ? "Saving…" : "Save timing" }}
        </Button>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.source-choice {
  padding: 0.35rem 0.75rem;
  font-size: 0.875rem;
  transition: background-color 0.15s;
}
.source-choice + .source-choice {
  border-left: 1px solid var(--border);
}
.source-choice:hover:not(:disabled) {
  background: var(--muted);
}
.source-choice.is-on {
  background: var(--primary);
  color: var(--primary-foreground);
}
.source-choice:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.timing-wait {
  position: absolute;
  inset: auto 0.75rem 0.75rem 0.75rem;
  padding: 0.6rem 0.9rem;
  border-radius: 0.6rem;
  background: rgb(0 0 0 / 0.8);
  color: #fff;
  text-align: center;
  font-size: 0.9rem;
}
.tap-pad {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  width: 100%;
  min-height: 5rem;
  border-radius: 0.75rem;
  background: var(--primary);
  color: var(--primary-foreground);
  user-select: none;
  touch-action: manipulation;
}
.tap-pad:active {
  transform: scale(0.99);
  filter: brightness(1.2);
}
.tap-pad:disabled {
  opacity: 0.5;
}
.cue-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.2rem 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid transparent;
  cursor: pointer;
}
.cue-row:hover {
  background: color-mix(in oklab, var(--muted) 60%, transparent);
}
.cue-row.is-playing {
  background: color-mix(in oklab, var(--primary) 10%, transparent);
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
.cue-row.is-end {
  font-style: italic;
  color: var(--muted-foreground);
}
.kbd {
  padding: 0 0.3rem;
  border: 1px solid var(--border);
  border-radius: 0.25rem;
  background: var(--muted);
  font-size: 0.7rem;
  font-style: normal;
}
.timing-wait .kbd {
  color: var(--foreground);
}
.kbd-on-primary {
  border-color: color-mix(in oklab, var(--primary-foreground) 40%, transparent);
  background: transparent;
  color: inherit;
}
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
