<script setup lang="ts">
import { Head, router, usePage } from "@inertiajs/vue3"
import type { Subscription } from "@rails/actioncable"
import { useDebounceFn, useFullscreen } from "@vueuse/core"
import {
  CircleStop,
  Guitar,
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
import { isButtonTarget, isTypingTarget } from "@/composables/useTv"
import { getConsumer } from "@/lib/cable"
import { parseBody } from "@/lib/chordSheet"
import { fromChordSheet } from "@/lib/lyricDisplay"
import { buildTimeline, findActive } from "@/lib/tempoGuide"
import { transposeToken } from "@/lib/transpose"
import {
  LYRIC_SCALE,
  SHEET_SCALE,
  signed,
  stepValue,
  useTvPrefs,
} from "@/lib/tvPrefs"
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

/* ---- personal, per-device only: key, text size, view ---- */
const { view, lyricScale, sheetScale, showChords } = useTvPrefs()
const semitones = ref(0)
const preferFlat = ref(false)
const settingsOpen = ref(false)

/* ---- shared clock: always derived from the leader's absolute timestamp,
   so a dropped frame never lets a device drift out of sync. Negative
   while the count-in runs. ---- */
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

const track = computed(() =>
  fromChordSheet(blocks.value, {
    bpm: state.value.bpm,
    beatsPerLine: state.value.beats_per_line,
    countInBeats: state.value.count_in_beats,
    semitones: semitones.value,
    preferFlat: preferFlat.value,
  }),
)
const timeline = computed(() =>
  buildTimeline(blocks.value, state.value.bpm, state.value.beats_per_line),
)
const sheetActive = computed(() =>
  findActive(timeline.value.lines, elapsed.value, timeline.value.totalDuration),
)

const stageHint = computed(() => {
  if (state.value.playing) return null
  return isLeader.value
    ? "Press ▶ Play to start for everyone"
    : `Waiting for ${state.value.leader_name}…`
})
const statusText = computed(() => {
  const who = isLeader.value
    ? "You're leading"
    : `Following ${state.value.leader_name}`
  const parts = [`Live · ${who}`]
  if (props.songs.length > 1) {
    parts.push(`${state.value.current_index + 1}/${props.songs.length}`)
  }
  parts.push(`${state.value.bpm} BPM`)
  return parts.join(" · ")
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
  if (isLeader.value) sendCommand(state.value.playing ? "pause" : "play")
}
function restart() {
  if (isLeader.value) sendCommand("restart")
}
function seekTo(index: number) {
  if (!isLeader.value || index < 0 || index >= props.songs.length) return
  sendCommand("seek_index", { index })
}
function setTempo(bpm: number, beatsPerLine: number) {
  sendCommand("set_tempo", { bpm, beats_per_line: beatsPerLine })
}

// The leader's Tempo control, usable mid-song: the server rescales the
// shared clock so everyone stays on the same word, just moving faster or
// slower from there. A few quick presses on a remote are shown right away
// and sent as one change once they stop.
const BPM_RANGE = { min: 40, max: 240, step: 2 }
const pendingBpm = ref<number | null>(null)
const shownBpm = computed(() => pendingBpm.value ?? state.value.bpm)
let pendingTimer: ReturnType<typeof setTimeout> | null = null
const sendBpm = useDebounceFn((bpm: number) => {
  setTempo(bpm, state.value.beats_per_line)
  // If the change never comes back (a failed request), stop showing it.
  if (pendingTimer) clearTimeout(pendingTimer)
  pendingTimer = setTimeout(() => (pendingBpm.value = null), 4000)
}, 350)
function nudgeTempo(dir: 1 | -1) {
  if (!isLeader.value) return
  const next = Math.min(
    BPM_RANGE.max,
    Math.max(BPM_RANGE.min, shownBpm.value + dir * BPM_RANGE.step),
  )
  if (next === shownBpm.value) return
  pendingBpm.value = next
  void sendBpm(next)
}
watch(
  () => state.value.bpm,
  (bpm) => {
    if (pendingBpm.value === bpm) pendingBpm.value = null
  },
)
function setCountIn(beats: number) {
  sendCommand("set_count_in", { beats })
}
function endSession() {
  if (confirm("End this live session for everyone in the group?")) {
    router.delete(liveSessionRoutes.destroy({ group_id: props.group.slug }).url)
  }
}
function exit() {
  router.visit(groupsRoutes.show(props.group.slug))
}

/* ---- key / size / view (personal) ---- */
const KEY_RANGE = 6
const keyLabel = computed(() => {
  const st = semitones.value
  const songKey = currentSong.value?.key
  if (songKey) {
    const k = transposeToken(songKey, st, preferFlat.value)
    return st ? `${k} (${signed(st)})` : k
  }
  return st ? signed(st) : "Orig"
})
function shiftKey(dir: 1 | -1) {
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
  view.value = view.value === "karaoke" ? "sheet" : "karaoke"
}

const fullscreen = useFullscreen()

function onKeydown(e: KeyboardEvent) {
  if (e.defaultPrevented || settingsOpen.value || isTypingTarget(e)) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  switch (e.key) {
    case " ":
      if (isButtonTarget(e)) return
      e.preventDefault()
      return togglePlay()
    case "p":
    case "P":
    case "MediaPlayPause":
      return togglePlay()
    case "r":
    case "R":
    case "Home":
      return restart()
    case "n":
    case "N":
    case "PageDown":
    case "MediaTrackNext":
      e.preventDefault()
      return seekTo(state.value.current_index + 1)
    case "PageUp":
    case "MediaTrackPrevious":
      e.preventDefault()
      return seekTo(state.value.current_index - 1)
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
      return nudgeTempo(-1)
    case ".":
    case ">":
      return nudgeTempo(1)
    case "k":
    case "K":
    case "v":
    case "V":
      return toggleView()
    case "c":
    case "C":
      showChords.value = !showChords.value
      return
    case "f":
    case "F":
      return void fullscreen.toggle()
  }
}

/* ---- ActionCable: pushes every control change to every open Live page in
   this group. A session-id mismatch means the leader started a fresh
   session (different songs), so we do a full prop reload instead of trying
   to patch state across that switch. ---- */
let subscription: Subscription | null = null

onMounted(() => {
  rafId = requestAnimationFrame(frame)
  window.addEventListener("keydown", onKeydown)

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
  if (pendingTimer) clearTimeout(pendingTimer)
  if (rafId) cancelAnimationFrame(rafId)
  window.removeEventListener("keydown", onKeydown)
  subscription?.unsubscribe()
})
</script>

<template>
  <Head :title="currentSong ? `Live — ${currentSong.title}` : 'Live session'" />

  <TvShell
    :title="currentSong?.title ?? group.name"
    :subtitle="currentSong?.artist"
    :status="statusText"
    :playing="state.playing"
    :panel-open="settingsOpen"
  >
    <div v-if="!currentSong" class="live-empty">
      <p>This live session has no playable songs left.</p>
    </div>

    <template v-else>
      <LyricStage
        v-if="view === 'karaoke'"
        :track="track"
        :time="elapsed"
        :scale="lyricScale"
        :show-chords="showChords"
        :title="currentSong.title"
        :artist="currentSong.artist"
        :hint="stageHint"
      />
      <div v-else class="live-sheet">
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
      <div v-if="isLeader && currentSong" class="tv-dock-group">
        <TvButton
          v-if="songs.length > 1"
          :icon="SkipBack"
          label="Prev"
          title="Previous song (Page Up)"
          :disabled="state.current_index === 0"
          @click="seekTo(state.current_index - 1)"
        />
        <TvButton :icon="RotateCcw" label="Restart" @click="restart" />
        <TvButton
          primary
          :icon="state.playing ? Pause : Play"
          :label="state.playing ? 'Pause' : 'Play'"
          @click="togglePlay"
        />
        <TvButton
          v-if="songs.length > 1"
          :icon="SkipForward"
          label="Next"
          title="Next song (N / Page Down)"
          :disabled="state.current_index === songs.length - 1"
          @click="seekTo(state.current_index + 1)"
        />
      </div>
      <div v-if="currentSong" class="tv-dock-group">
        <TvStepper
          label="Key"
          :value="keyLabel"
          dec-label="Key down"
          inc-label="Key up"
          title="Transposes the chords on this screen only"
          :can-dec="semitones > -KEY_RANGE"
          :can-inc="semitones < KEY_RANGE"
          @dec="shiftKey(-1)"
          @inc="shiftKey(1)"
        />
      </div>
      <div v-if="isLeader && currentSong" class="tv-dock-group">
        <TvStepper
          label="Tempo"
          :value="String(shownBpm)"
          unit="bpm"
          dec-label="Slower"
          inc-label="Faster"
          :can-dec="shownBpm > BPM_RANGE.min"
          :can-inc="shownBpm < BPM_RANGE.max"
          title="Tempo for everyone, adjustable mid-song without losing your place (, and .)"
          @dec="nudgeTempo(-1)"
          @inc="nudgeTempo(1)"
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
          v-if="view === 'karaoke'"
          :icon="Guitar"
          label="Chords"
          toggle
          :active="showChords"
          @click="showChords = !showChords"
        />
        <TvButton
          :icon="Settings2"
          label="Settings"
          @click="settingsOpen = true"
        />
      </div>
    </template>

    <template #panel>
      <TvPanel title="Live session settings" @close="settingsOpen = false">
        <template v-if="isLeader">
          <TvStepper
            label="Tempo"
            :value="`${shownBpm} BPM`"
            dec-label="Slower"
            inc-label="Faster"
            :can-dec="shownBpm > BPM_RANGE.min"
            :can-inc="shownBpm < BPM_RANGE.max"
            @dec="nudgeTempo(-1)"
            @inc="nudgeTempo(1)"
          />
          <TvStepper
            label="Beats / line"
            :value="String(state.beats_per_line)"
            dec-label="Fewer"
            inc-label="More"
            :can-dec="state.beats_per_line > 1"
            :can-inc="state.beats_per_line < 8"
            @dec="setTempo(state.bpm, Math.max(1, state.beats_per_line - 1))"
            @inc="setTempo(state.bpm, Math.min(8, state.beats_per_line + 1))"
          />
          <TvStepper
            label="Count-in"
            :value="
              state.count_in_beats ? `${state.count_in_beats} beats` : 'Off'
            "
            dec-label="Fewer"
            inc-label="More"
            :can-dec="state.count_in_beats > 0"
            :can-inc="state.count_in_beats < 16"
            @dec="setCountIn(Math.max(0, state.count_in_beats - 1))"
            @inc="setCountIn(Math.min(16, state.count_in_beats + 1))"
          />
          <TvButton
            :icon="CircleStop"
            label="End session"
            title="End the live session for everyone"
            @click="endSession"
          />
        </template>
        <p v-else class="settings-note">
          {{ state.leader_name }} sets the tempo and count-in for everyone. Key,
          text size, and view are just for this screen.
        </p>
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
.live-empty {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--tv-dim);
  font-size: max(20px, 3.6vh);
  font-weight: 900;
  text-align: center;
}
.live-sheet {
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
