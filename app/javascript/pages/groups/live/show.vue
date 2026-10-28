<script setup lang="ts">
import { Head, Link, router, usePage } from "@inertiajs/vue3"
import type { Subscription } from "@rails/actioncable"
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"

import SongBody from "@/components/karaoke/SongBody.vue"
import TransposeControl from "@/components/karaoke/TransposeControl.vue"
import { Button } from "@/components/ui/button"
import { getConsumer } from "@/lib/cable"
import { parseBody } from "@/lib/chordSheet"
import { buildTimeline, findActive } from "@/lib/tempoGuide"
import {
  groups as groupsRoutes,
  liveSession as liveSessionRoutes,
} from "@/routes"
import type { LiveSessionState, Song } from "@/types"

const props = defineProps<{
  group: { id: number; name: string; slug: string }
  session: LiveSessionState
  songs: Song[]
}>()

const { auth } = usePage().props

/* ---- shared state: seeded from props, kept live by ActionCable ---- */
const state = ref<LiveSessionState>({ ...props.session })
watch(
  () => props.session,
  (s) => {
    state.value = { ...s }
  },
)

const isLeader = computed(() => state.value.leader_id === auth.user.id)
const currentSong = computed<Song | undefined>(
  () => props.songs[state.value.current_index],
)
const blocks = computed(() =>
  currentSong.value ? parseBody(currentSong.value.body ?? "") : [],
)

/* ---- personal, per-device only: transpose + text size ---- */
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

/* ---- shared clock: always derived from the leader's absolute timestamp,
   so a dropped frame never lets a device drift out of sync ---- */
function computeElapsed(s: LiveSessionState): number {
  if (!s.playing || !s.clock_started_at) return s.clock_offset
  return (
    s.clock_offset +
    (Date.now() - new Date(s.clock_started_at).getTime()) / 1000
  )
}

const tick = ref(0)
let rafId: number | null = null
function frame() {
  tick.value = (tick.value + 1) % 1_000_000
  rafId = requestAnimationFrame(frame)
}

const elapsed = computed(() => {
  void tick.value
  return computeElapsed(state.value)
})
const timeline = computed(() =>
  buildTimeline(blocks.value, state.value.bpm, state.value.beats_per_line),
)
const active = computed(() =>
  findActive(timeline.value.lines, elapsed.value, timeline.value.totalDuration),
)
const activeBlockIndex = computed(() => active.value.blockIndex)
const activeWordIndex = computed(() => active.value.wordIndex)

/* ---- count-in cue: elapsed < 0 means the song hasn't started yet, so we
   show a beat-synced countdown spinner instead of the lyrics ---- */
const COUNT_IN_CIRCUMFERENCE = 2 * Math.PI * 70

const secPerBeat = computed(
  () => 60 / (state.value.bpm > 0 ? state.value.bpm : 100),
)
const countInSeconds = computed(
  () => state.value.count_in_beats * secPerBeat.value,
)
const isCountingIn = computed(
  () => countInSeconds.value > 0 && elapsed.value < 0,
)
const countInRemainingBeats = computed(() =>
  Math.max(1, Math.ceil(-elapsed.value / secPerBeat.value)),
)
const countInProgress = computed(() => {
  const total = countInSeconds.value
  if (total <= 0) return 1
  return Math.min(1, Math.max(0, (total + elapsed.value) / total))
})

/* ---- leader controls ---- */
function sendCommand(command: string, extra: Record<string, unknown> = {}) {
  router.patch(
    liveSessionRoutes.update({ group_id: props.group.slug }).url,
    { command, ...extra },
    { preserveScroll: true },
  )
}
function togglePlay() {
  sendCommand(state.value.playing ? "pause" : "play")
}
function restart() {
  sendCommand("restart")
}
function seekTo(index: number) {
  sendCommand("seek_index", { index })
}
function onBpmChange(event: Event) {
  const bpm = Number((event.target as HTMLInputElement).value)
  sendCommand("set_tempo", { bpm, beats_per_line: state.value.beats_per_line })
}
function onBeatsChange(event: Event) {
  const beatsPerLine = Number((event.target as HTMLInputElement).value)
  sendCommand("set_tempo", {
    bpm: state.value.bpm,
    beats_per_line: beatsPerLine,
  })
}
function onCountInChange(event: Event) {
  const beats = Number((event.target as HTMLInputElement).value)
  sendCommand("set_count_in", { beats })
}
function endSession() {
  if (confirm("End this live session for everyone in the group?")) {
    router.delete(liveSessionRoutes.destroy({ group_id: props.group.slug }).url)
  }
}

/* ---- ActionCable: pushes every control change to every open Live page in
   this group. A session-id mismatch means the leader started a fresh
   session (different songs), so we do a full prop reload instead of trying
   to patch state across that switch. ---- */
let subscription: Subscription | null = null

onMounted(() => {
  rafId = requestAnimationFrame(frame)

  subscription = getConsumer().subscriptions.create(
    { channel: "GroupLiveChannel", group_id: props.group.id },
    {
      received(data: LiveSessionState) {
        if (!data.active) {
          router.visit(groupsRoutes.show(props.group.slug))
          return
        }
        if (data.id !== state.value.id) {
          router.reload()
          return
        }
        state.value = data
      },
    },
  )
})
onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  subscription?.unsubscribe()
})
</script>

<template>
  <Head :title="currentSong ? `Live — ${currentSong.title}` : 'Live session'" />

  <div class="bg-background fixed inset-0 z-50 flex flex-col">
    <div
      v-if="!currentSong"
      class="flex flex-1 flex-col items-center justify-center gap-3"
    >
      <p class="text-muted-foreground">
        This live session has no playable songs left.
      </p>
      <Link :href="groupsRoutes.show(group.slug)">
        <Button variant="outline">Back to {{ group.name }}</Button>
      </Link>
    </div>
    <template v-else>
      <div class="bg-card flex flex-wrap items-center gap-3 border-b px-4 py-2">
        <Link :href="groupsRoutes.show(group.slug)">
          <Button variant="outline">Exit</Button>
        </Link>
        <div class="min-w-[10rem] flex-1 font-semibold">
          {{ currentSong.title }}
          <span
            v-if="currentSong.artist"
            class="text-muted-foreground font-normal"
          >
            &mdash; {{ currentSong.artist }}
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <template v-if="songs.length > 1">
            <Button
              variant="outline"
              size="sm"
              :disabled="!isLeader || state.current_index === 0"
              @click="seekTo(state.current_index - 1)"
            >
              &#9664; Prev
            </Button>
            <span class="text-sm font-semibold">
              {{ state.current_index + 1 }}/{{ songs.length }}
            </span>
            <Button
              variant="outline"
              size="sm"
              :disabled="!isLeader || state.current_index === songs.length - 1"
              @click="seekTo(state.current_index + 1)"
            >
              Next &#9654;
            </Button>
          </template>
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
        </div>
      </div>

      <div
        v-if="isLeader"
        class="bg-muted/40 flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm"
      >
        <Button size="sm" @click="togglePlay">
          {{ state.playing ? "Pause" : "Play" }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          title="Back to the start"
          @click="restart"
        >
          Restart
        </Button>
        <label class="text-muted-foreground flex items-center gap-1.5">
          BPM
          <input
            type="number"
            min="20"
            max="300"
            :value="state.bpm"
            @change="onBpmChange"
            class="bg-background w-16 rounded border px-1.5 py-0.5"
          />
        </label>
        <label class="text-muted-foreground flex items-center gap-1.5">
          Beats/line
          <input
            type="number"
            min="1"
            max="8"
            :value="state.beats_per_line"
            @change="onBeatsChange"
            class="bg-background w-14 rounded border px-1.5 py-0.5"
          />
        </label>
        <label
          class="text-muted-foreground flex items-center gap-1.5"
          title="Count-in beats before each song starts"
        >
          Count-in
          <input
            type="number"
            min="0"
            max="16"
            :value="state.count_in_beats"
            @change="onCountInChange"
            class="bg-background w-14 rounded border px-1.5 py-0.5"
          />
        </label>
        <span class="text-muted-foreground text-xs">
          You're leading &mdash; everyone else's app follows this automatically.
        </span>
        <Button
          variant="destructive"
          size="sm"
          class="ml-auto"
          @click="endSession"
        >
          End session
        </Button>
      </div>
      <div
        v-else
        class="bg-muted/40 flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm"
      >
        <span class="text-muted-foreground">
          Following {{ state.leader_name }}'s live session &mdash;
          {{ state.playing ? "playing" : "paused" }}.
        </span>
      </div>

      <div class="relative flex-1 overflow-hidden">
        <div class="h-full overflow-y-auto px-8 pt-6 pb-16">
          <SongBody
            :blocks="blocks"
            :semitones="semitones"
            :prefer-flat="preferFlat"
            :font-scale="fontScale"
            :active-block-index="activeBlockIndex"
            :active-word-index="activeWordIndex"
          />
        </div>

        <!-- Transparent countdown modal: the song underneath is already
             rendered and correctly highlighted, so when this fades out the
             transition into the song is seamless rather than a hard swap. -->
        <Transition
          enter-active-class="transition-opacity duration-300 ease-in-out"
          enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-300 ease-in-out"
          leave-to-class="opacity-0"
        >
          <div
            v-if="isCountingIn"
            class="bg-background/60 absolute inset-0 flex flex-col items-center justify-center gap-4 backdrop-blur-sm"
          >
            <div class="relative flex h-40 w-40 items-center justify-center">
              <svg
                width="160"
                height="160"
                viewBox="0 0 160 160"
                class="-rotate-90"
              >
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="10"
                  class="text-muted-foreground/20"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="10"
                  stroke-linecap="round"
                  class="text-primary"
                  :stroke-dasharray="COUNT_IN_CIRCUMFERENCE"
                  :stroke-dashoffset="
                    COUNT_IN_CIRCUMFERENCE * (1 - countInProgress)
                  "
                />
              </svg>
              <div class="absolute text-5xl font-bold tabular-nums">
                {{ countInRemainingBeats }}
              </div>
            </div>
            <p class="text-muted-foreground text-sm">
              Get ready&hellip; {{ currentSong.title }} starts in
              {{ countInRemainingBeats }}
            </p>
          </div>
        </Transition>
      </div>
    </template>
  </div>
</template>
