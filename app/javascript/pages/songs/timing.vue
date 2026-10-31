<script setup lang="ts">
import { Head, Link, router } from "@inertiajs/vue3"
import { useLocalStorage } from "@vueuse/core"
import { Minus, Pause, Play, Plus, RotateCcw, Undo2 } from "lucide-vue-next"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

import SheetView from "@/components/karaoke/tv/SheetView.vue"
import "@/components/karaoke/tv/tv.css"
import { Button } from "@/components/ui/button"
import AppLayout from "@/layouts/AppLayout.vue"
import { parseBody } from "@/lib/chordSheet"
import {
  BEAT_STEP,
  MAX_BEATS,
  MIN_BEATS,
  type TimedLine,
  roundBeats,
  savedBeats,
  timedLines,
} from "@/lib/lineTiming"
import { buildTimeline, guideAt, remapElapsed } from "@/lib/tempoGuide"
import { songs as songsRoutes, songsTimings } from "@/routes"
import type { BreadcrumbItem, Song } from "@/types"

// Line timing: how long each line of the chord sheet really lasts, so
// Stage Mode's highlight and its sheet glide move at the song's own pace.
// Tap along while the song plays (Space as each next line begins), or
// set any line's length in beats by hand, and preview it on the same
// sheet the TV shows.

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
const COUNT_IN = 4 // beats of lead-in before playing (or tapping) from a line
const HAND_STEP = 0.5 // beats per −/+ click

function clampBpm(value: number): number {
  if (!Number.isFinite(value)) return 100
  return Math.min(BPM_RANGE.max, Math.max(BPM_RANGE.min, Math.round(value)))
}

/* ---- the song, its lines, and their lengths ---- */
const blocks = computed(() => parseBody(props.song.body ?? ""))
// Shared with Stage Mode: the length of a line nobody has timed.
const beatsPerLine = useLocalStorage("chordstage:beatsperline", 4, {
  initOnMounted: true,
})
const bpm = ref(
  clampBpm(Number(props.song.tempo) || props.song.line_timing?.bpm || 100),
)
const lines = computed(() => timedLines(blocks.value, beatsPerLine.value))

function initialCustom(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const line of timedLines(blocks.value, 4)) {
    const beats = savedBeats(line, props.song.line_timing)
    if (beats != null) out[line.id] = beats
  }
  return out
}
// Only lines with their own length are in here; the rest use the default.
const custom = ref<Record<string, number>>(initialCustom())

function beatsOf(line: TimedLine): number {
  return custom.value[line.id] ?? line.defaultBeats
}
function isCustom(line: TimedLine): boolean {
  return custom.value[line.id] != null
}
function setBeats(line: TimedLine, beats: number | null) {
  const next = { ...custom.value }
  if (beats == null || !Number.isFinite(beats)) delete next[line.id]
  else next[line.id] = roundBeats(beats)
  custom.value = next
}

const lineBeats = computed(() => {
  const out: (number | null)[] = blocks.value.map(() => null)
  for (const line of lines.value)
    out[line.blockIndex] = custom.value[line.id] ?? null
  return out
})
const timeline = computed(() =>
  buildTimeline(blocks.value, bpm.value, beatsPerLine.value, lineBeats.value),
)
const secPerBeat = computed(() => 60 / bpm.value)

function startOf(line: TimedLine): number {
  return timeline.value.lines[line.blockIndex]?.lineStart ?? 0
}
function endOf(line: TimedLine): number {
  return timeline.value.lines[line.blockIndex]?.lineEnd ?? 0
}

// Keep your place when the tempo, the default length, or a line's length
// changes while it's playing. (A tap moves the clock itself.)
let skipRemap = false
function skipNextRemap() {
  skipRemap = true
  // Cleared after this tick's watchers either way (the edit may not have
  // changed the timeline at all).
  void nextTick(() => (skipRemap = false))
}
watch(
  () => [timeline.value, bpm.value] as const,
  ([next, nextBpm], [prev, prevBpm]) => {
    if (skipRemap) {
      skipRemap = false
      return
    }
    time.value = remapElapsed(time.value, prev, next, prevBpm, nextBpm)
  },
)

/* ---- the clock ---- */
const time = ref(-COUNT_IN * secPerBeat.value)
const running = ref(false)
let raf: number | null = null
let last: number | null = null

function frame(ts: number) {
  raf = null
  if (!running.value) return
  if (last != null) time.value += Math.min(0.1, (ts - last) / 1000)
  last = ts
  if (recording.value && tapTarget.value) {
    // Waited far longer than any line could last: give up.
    const held = time.value - startOf(tapTarget.value)
    if (held > MAX_BEATS * secPerBeat.value) stopRecording()
  } else if (time.value > timeline.value.totalDuration + 2) {
    stop()
    return
  }
  raf = requestAnimationFrame(frame)
}

function play(from?: number) {
  if (from != null) time.value = from
  else if (time.value >= timeline.value.totalDuration) {
    time.value = -COUNT_IN * secPerBeat.value
  }
  running.value = true
  last = null
  if (raf == null) raf = requestAnimationFrame(frame)
}
function stop() {
  running.value = false
  recording.value = false
  if (raf != null) cancelAnimationFrame(raf)
  raf = null
}
function restart() {
  stop()
  time.value = -COUNT_IN * secPerBeat.value
  sheet.value?.toTop()
}
function leadInTo(line: TimedLine): number {
  return startOf(line) - COUNT_IN * secPerBeat.value
}
function playFrom(line: TimedLine) {
  stop()
  play(leadInTo(line))
}

/* ---- tapping: Space as each next line begins ---- */
const recording = ref(false)
// Index (into `lines`) of the line whose end the next tap marks. Repeats
// share their original's timing, so they play through and aren't tapped.
const tapIndex = ref(0)
const tapTarget = computed<TimedLine | null>(
  () => lines.value[tapIndex.value] ?? null,
)
interface Tap {
  id: string
  prev: number | undefined
  index: number
}
const history = ref<Tap[]>([])

function firstTappable(from: number): number {
  let i = from
  while (i < lines.value.length && lines.value[i].repeat) i++
  return i
}

function startRecording(from = 0) {
  const index = firstTappable(from)
  const line = lines.value[index]
  if (!line) return
  tapIndex.value = index
  history.value = []
  stop()
  recording.value = true
  play(Math.max(-COUNT_IN * secPerBeat.value, leadInTo(line)))
}
function stopRecording() {
  recording.value = false
}

function tap() {
  const line = tapTarget.value
  if (!recording.value || !line) return
  const start = startOf(line)
  if (time.value < start) return // still in the lead-in or a repeat
  const beats = roundBeats((time.value - start) / secPerBeat.value)
  history.value.push({
    id: line.id,
    prev: custom.value[line.id],
    index: tapIndex.value,
  })
  skipNextRemap()
  setBeats(line, beats)
  // The next line starts at the tap (rounded to the beat grid).
  time.value = start + beats * secPerBeat.value
  tapIndex.value = firstTappable(tapIndex.value + 1)
  if (tapIndex.value >= lines.value.length) recording.value = false
}

function undoTap() {
  const lastTap = history.value.pop()
  if (!lastTap) return
  const next = { ...custom.value }
  if (lastTap.prev == null) delete next[lastTap.id]
  else next[lastTap.id] = lastTap.prev
  skipNextRemap()
  custom.value = next
  tapIndex.value = lastTap.index
  recording.value = true
  const line = lines.value[lastTap.index]
  if (line) {
    time.value = Math.max(-COUNT_IN * secPerBeat.value, leadInTo(line))
    if (!running.value) play()
  }
}

// While tapping, the highlight waits at the end of the line for your tap
// rather than running on to the next one.
const shownTime = computed(() => {
  const line = tapTarget.value
  if (!recording.value || !line) return time.value
  return Math.min(time.value, endOf(line) - 1e-3)
})
const guide = computed(() => guideAt(timeline.value.lines, shownTime.value))
// "Starts in 3…" while counting in to the top, or to the line you're
// about to tap from.
const countdown = computed(() => {
  if (!running.value) return null
  const line = recording.value ? tapTarget.value : lines.value[0]
  if (!line) return null
  const before = startOf(line) - time.value
  return before > 0 ? Math.ceil(before / secPerBeat.value) : null
})

const currentBlock = computed(() => guide.value?.blockIndex ?? -1)

/* ---- the line list ---- */
interface Group {
  key: string
  label: string
  repeat: boolean
  lines: { line: TimedLine; index: number }[]
}
const groups = computed<Group[]>(() => {
  const out: Group[] = []
  lines.value.forEach((line, index) => {
    const lastGroup = out[out.length - 1]
    const key = line.id.slice(0, line.id.lastIndexOf("#"))
    const startsGroup =
      !lastGroup ||
      lastGroup.key !== key ||
      lastGroup.repeat !== line.repeat ||
      line.id.endsWith("#0")
    if (startsGroup) {
      out.push({
        key,
        label: line.section || "Song",
        repeat: line.repeat,
        lines: [],
      })
    }
    out[out.length - 1].lines.push({ line, index })
  })
  return out
})

const rowEls = new Map<number, HTMLElement>()
function rowRef(index: number, el: unknown) {
  if (el instanceof HTMLElement) rowEls.set(index, el)
  else rowEls.delete(index)
}
watch(currentBlock, (block) => {
  if (!running.value) return
  const index = lines.value.findIndex((l) => l.blockIndex === block)
  rowEls.get(index)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
})

function formatSeconds(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toFixed(1).padStart(4, "0")}`
}
function formatBeats(beats: number): string {
  return Number.isInteger(beats)
    ? String(beats)
    : beats.toFixed(2).replace(/0$/, "")
}
function onBeatsInput(line: TimedLine, e: Event) {
  const value = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(value) && value > 0) setBeats(line, value)
}

const timedCount = computed(
  () => new Set(lines.value.filter(isCustom).map((l) => l.id)).size,
)
const uniqueCount = computed(() => new Set(lines.value.map((l) => l.id)).size)
const totalLabel = computed(() => formatSeconds(timeline.value.totalDuration))

/* ---- preview options ---- */
const showBall = ref(true)

/* ---- save ---- */
function payload() {
  const entries: Record<string, { text: string; beats: number }> = {}
  for (const line of lines.value) {
    if (line.repeat || entries[line.id]) continue
    const beats = custom.value[line.id]
    if (beats == null || beats === line.defaultBeats) continue
    entries[line.id] = { text: line.text, beats }
  }
  return Object.keys(entries).length ? { bpm: bpm.value, lines: entries } : null
}
const snapshot = () => JSON.stringify([payload(), bpm.value])
const saved = ref(snapshot())
// The default length can come in from this device's settings after
// mount; that isn't an edit.
onMounted(() => void nextTick(() => (saved.value = snapshot())))
const dirty = computed(() => snapshot() !== saved.value)

const saving = ref(false)
function save() {
  const data = payload()
  saving.value = true
  router.patch(
    songsTimings.update({ song_id: props.song.slug }).url,
    { line_timing: data ? JSON.stringify(data) : "", tempo: bpm.value },
    {
      preserveScroll: true,
      preserveState: true,
      onSuccess: () => (saved.value = snapshot()),
      onFinish: () => (saving.value = false),
    },
  )
}
function resetAll() {
  if (!Object.keys(custom.value).length) return
  if (confirm("Set every line back to the default length?")) {
    custom.value = {}
    history.value = []
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

/* ---- keyboard ---- */
function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  const tag = target?.tagName ?? ""
  if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (e.code === "Space") {
    if (tag === "BUTTON") return
    e.preventDefault()
    if (recording.value) tap()
    else if (running.value) stop()
    else play()
  } else if (e.key === "Backspace" && recording.value) {
    e.preventDefault()
    undoTap()
  } else if (e.key === "Escape") {
    stop()
  }
}

const sheet = ref<InstanceType<typeof SheetView> | null>(null)

onMounted(() => {
  window.addEventListener("keydown", onKeydown)
  window.addEventListener("beforeunload", onBeforeUnload)
})
onBeforeUnmount(() => {
  stop()
  removeBefore()
  window.removeEventListener("keydown", onKeydown)
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
            How long each line really lasts, so Stage Mode&rsquo;s highlight and
            the sheet&rsquo;s scrolling move on to the next line exactly when
            the singer does. Lengths are in beats, so the Tempo control still
            speeds the whole song up or slows it down evenly.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
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
        <!-- Tempo + transport -->
        <div
          class="bg-card flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border p-4"
        >
          <div class="flex items-center gap-2">
            <span
              class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
              >Tempo</span
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
              aria-label="Tempo in BPM"
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
              >Untimed lines</span
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
          <span class="text-muted-foreground text-sm">
            {{ timedCount }}/{{ uniqueCount }} lines timed · whole song
            {{ totalLabel }}
          </span>
        </div>

        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <!-- Preview + tapping -->
          <div
            class="bg-card flex flex-col gap-3 rounded-xl border p-4 lg:sticky lg:top-4 lg:self-start"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2
                class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
              >
                Preview &mdash; as the sheet plays on the TV
              </h2>
              <label class="flex items-center gap-2 text-xs">
                <input v-model="showBall" type="checkbox" />
                Bouncing ball
              </label>
            </div>
            <div class="tv-theme relative h-[22rem] overflow-hidden rounded-lg">
              <SheetView
                ref="sheet"
                :blocks="blocks"
                :font-scale="0.6"
                :guide="guide"
                :ball="showBall"
              />
              <div v-if="countdown" class="timing-count" aria-live="polite">
                Starts in {{ countdown }}
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <Button v-if="!recording" @click="startRecording(0)">
                Tap along from the top
              </Button>
              <Button v-else variant="secondary" @click="stopRecording">
                Stop tapping
              </Button>
              <Button
                variant="outline"
                :disabled="recording"
                @click="running ? stop() : play()"
              >
                <component :is="running ? Pause : Play" class="size-4" />
                {{ running ? "Pause" : "Preview" }}
              </Button>
              <Button variant="outline" @click="restart">
                <RotateCcw class="size-4" /> Restart
              </Button>
              <Button
                v-if="recording"
                variant="outline"
                :disabled="!history.length"
                @click="undoTap"
              >
                <Undo2 class="size-4" /> Undo tap
              </Button>
            </div>

            <div
              v-if="recording"
              class="border-primary/40 bg-primary/5 rounded-lg border p-3"
            >
              <p class="text-sm">
                Sing or play along, and press
                <kbd class="bg-muted rounded border px-1.5 text-xs">Space</kbd>
                (or the big button) the moment the
                <strong>next line</strong> begins. The highlight waits at the
                end of the line for your tap.
              </p>
              <p v-if="tapTarget" class="text-muted-foreground mt-1 text-xs">
                Now timing:
                <span class="text-foreground font-medium">{{
                  tapTarget.text
                }}</span>
              </p>
              <Button class="mt-3 h-16 w-full text-lg" @click="tap">
                Next line
              </Button>
              <p class="text-muted-foreground mt-2 text-xs">
                <kbd class="bg-muted rounded border px-1">Backspace</kbd> undoes
                the last tap and backs up to that line ·
                <kbd class="bg-muted rounded border px-1">Esc</kbd> stops.
                Repeated sections share their original&rsquo;s timing and play
                straight through.
              </p>
            </div>
            <p v-else class="text-muted-foreground text-xs">
              Space plays or pauses the preview. Click a line&rsquo;s
              <Play class="inline size-3" /> to hear the song from there, or
              &ldquo;Tap from here&rdquo; to re-time just that stretch.
            </p>
          </div>

          <!-- Lines -->
          <div class="bg-card rounded-xl border p-4">
            <div class="mb-2 flex items-center justify-between gap-2">
              <h2
                class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
              >
                Lines (length in beats)
              </h2>
              <Button
                size="sm"
                variant="ghost"
                :disabled="!timedCount"
                @click="resetAll"
              >
                Reset all
              </Button>
            </div>
            <div class="flex flex-col gap-4">
              <section v-for="(group, g) in groups" :key="g">
                <h3 class="mb-1 text-sm font-semibold">
                  {{ group.label }}
                  <span
                    v-if="group.repeat"
                    class="text-muted-foreground text-xs font-normal"
                    >&mdash; repeat, timed with the original</span
                  >
                </h3>
                <ul class="flex flex-col">
                  <li
                    v-for="{ line, index } in group.lines"
                    :key="index"
                    :ref="(el) => rowRef(index, el)"
                    class="timing-row"
                    :class="{
                      'is-current': line.blockIndex === currentBlock,
                      'is-target': recording && index === tapIndex,
                      'is-repeat': line.repeat,
                    }"
                  >
                    <button
                      type="button"
                      class="timing-row__play"
                      :aria-label="`Play from: ${line.text}`"
                      @click="playFrom(line)"
                    >
                      <Play class="size-3.5" />
                    </button>
                    <div class="min-w-0 flex-1">
                      <p
                        class="truncate text-sm"
                        :class="
                          line.instrumental
                            ? 'font-mono text-amber-600 dark:text-amber-400'
                            : ''
                        "
                        :title="line.text"
                      >
                        {{ line.text }}
                      </p>
                      <p class="text-muted-foreground text-xs">
                        {{ formatSeconds(endOf(line) - startOf(line)) }}s ·
                        {{ isCustom(line) ? "timed" : "default" }}
                        <template v-if="!line.repeat">
                          ·
                          <button
                            type="button"
                            class="underline-offset-2 hover:underline"
                            @click="startRecording(index)"
                          >
                            Tap from here
                          </button>
                        </template>
                      </p>
                    </div>
                    <div v-if="!line.repeat" class="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        class="size-8"
                        :aria-label="`Shorter: ${line.text}`"
                        :disabled="beatsOf(line) <= MIN_BEATS"
                        @click="setBeats(line, beatsOf(line) - HAND_STEP)"
                        ><Minus class="size-3.5"
                      /></Button>
                      <input
                        class="border-input bg-background h-8 w-16 rounded-md border px-1 text-center text-sm tabular-nums"
                        :class="{
                          'border-primary font-semibold': isCustom(line),
                        }"
                        type="number"
                        :step="BEAT_STEP"
                        :min="MIN_BEATS"
                        :max="MAX_BEATS"
                        :value="formatBeats(beatsOf(line))"
                        :aria-label="`Beats: ${line.text}`"
                        @change="onBeatsInput(line, $event)"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        class="size-8"
                        :aria-label="`Longer: ${line.text}`"
                        :disabled="beatsOf(line) >= MAX_BEATS"
                        @click="setBeats(line, beatsOf(line) + HAND_STEP)"
                        ><Plus class="size-3.5"
                      /></Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        class="size-8"
                        :aria-label="`Back to default: ${line.text}`"
                        title="Back to the default length"
                        :disabled="!isCustom(line)"
                        @click="setBeats(line, null)"
                        ><RotateCcw class="size-3.5"
                      /></Button>
                    </div>
                    <span
                      v-else
                      class="text-muted-foreground w-[10.5rem] text-right text-sm tabular-nums"
                      >{{ formatBeats(beatsOf(line)) }}</span
                    >
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Save bar -->
    <div
      v-if="lines.length"
      class="bg-background/95 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur md:left-[var(--sidebar-width,0px)]"
    >
      <div class="flex flex-wrap items-center justify-end gap-3 px-4 py-3">
        <span class="text-muted-foreground text-sm">
          {{ dirty ? "Unsaved changes" : "All changes saved" }}
        </span>
        <Button :disabled="!dirty || saving" @click="save">
          {{ saving ? "Saving…" : "Save timing" }}
        </Button>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.timing-count {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  background: rgb(255 230 0 / 0.15);
  color: var(--tv-chord);
  font-weight: 900;
  font-size: 1rem;
  pointer-events: none;
}
.timing-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid transparent;
}
.timing-row.is-current {
  background: color-mix(in oklab, var(--primary) 10%, transparent);
}
.timing-row.is-target {
  border-color: var(--primary);
}
.timing-row.is-repeat {
  opacity: 0.6;
}
.timing-row__play {
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  flex: none;
  border-radius: 999px;
  color: var(--muted-foreground);
}
.timing-row__play:hover {
  background: var(--accent);
  color: var(--accent-foreground);
}
</style>
