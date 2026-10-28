<script setup lang="ts">
import { Head, Link, router } from "@inertiajs/vue3"
import { computed, onBeforeUnmount, onMounted, ref } from "vue"

import PhrasingScreen from "@/components/karaoke/PhrasingScreen.vue"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import AppLayout from "@/layouts/AppLayout.vue"
import { parseBody } from "@/lib/chordSheet"
import {
  type PhrasingScreen as PhrasingScreenData,
  computeScreenWindows,
  findActiveScreenIndex,
  flattenTokens,
  isComplete,
  lintScreens,
  lyricsOnlyText,
  parsePhrasingText,
  rehydrateTimes,
  resolveToken,
} from "@/lib/phrasing"
import { songs as songsRoutes, songsPhrasings } from "@/routes"
import type { BreadcrumbItem, Song } from "@/types"

const props = defineProps<{ song: Song }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Songs", href: songsRoutes.index().url },
  { title: props.song.title, href: songsRoutes.show(props.song.slug).url },
  {
    title: "Phrasing",
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

const tokenRefs = computed(() => flattenTokens(screens.value))
const lint = computed(() => lintScreens(screens.value))
const complete = computed(() => isComplete(screens.value))
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

function rebuildScreens() {
  const fresh = parsePhrasingText(sourceText.value)
  screens.value = rehydrateTimes(fresh, screens.value)
  tapPointer.value = firstUntappedIndex()
}

const nextTokenText = computed(() => {
  const ref_ = tokenRefs.value[tapPointer.value]
  return ref_ ? resolveToken(screens.value, ref_).text : null
})

/* ---- audio + playback time ---- */
const audioPlayer = ref<HTMLAudioElement | null>(null)
const currentTime = ref(0)
function onTimeUpdate() {
  if (audioPlayer.value) currentTime.value = audioPlayer.value.currentTime
}

const windows = computed(() => computeScreenWindows(screens.value))
const activeScreenIndex = computed(() =>
  findActiveScreenIndex(windows.value, currentTime.value),
)
const activeScreen = computed(() =>
  activeScreenIndex.value >= 0 ? screens.value[activeScreenIndex.value] : null,
)
const activeWindow = computed(() =>
  activeScreenIndex.value >= 0 ? windows.value[activeScreenIndex.value] : null,
)

/* ---- recording (spacebar tap) ---- */
const recording = ref(false)

function startTapping() {
  if (!audioPlayer.value) return
  recording.value = true
  audioPlayer.value.play()
}
function stopTapping() {
  recording.value = false
  audioPlayer.value?.pause()
}
function tapNext() {
  if (!audioPlayer.value) return
  const ref_ = tokenRefs.value[tapPointer.value]
  if (!ref_) {
    stopTapping()
    return
  }
  resolveToken(screens.value, ref_).time = audioPlayer.value.currentTime
  tapPointer.value++
  if (tapPointer.value >= tokenRefs.value.length) stopTapping()
}
function undoLastTap() {
  if (tapPointer.value === 0) return
  tapPointer.value--
  const ref_ = tokenRefs.value[tapPointer.value]
  if (ref_) resolveToken(screens.value, ref_).time = null
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
    resolveToken(screens.value, tokenRefs.value[i]).time = null
  }
  tapPointer.value = index
  if (audioPlayer.value) {
    const prevRef = index > 0 ? tokenRefs.value[index - 1] : null
    const prevTime = prevRef ? resolveToken(screens.value, prevRef).time : null
    audioPlayer.value.currentTime =
      prevTime != null ? Math.max(0, prevTime - 0.5) : 0
  }
}

function onKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement | null)?.tagName ?? ""
  if (tag === "INPUT" || tag === "TEXTAREA") return
  if (!recording.value) return
  if (e.code === "Space") {
    e.preventDefault()
    tapNext()
  } else if (e.key === "Backspace" || e.key === "ArrowLeft") {
    e.preventDefault()
    undoLastTap()
  } else if (e.key === "ArrowRight") {
    e.preventDefault()
    skipToken()
  } else if (e.key === "Escape") {
    stopTapping()
  }
}

onMounted(() => window.addEventListener("keydown", onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown)
})

/* ---- audio upload ---- */
const pendingAudioFile = ref<File | null>(null)
const uploadingAudio = ref(false)
function onAudioFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  pendingAudioFile.value = input.files?.[0] ?? null
}
function uploadAudio() {
  if (!pendingAudioFile.value) return
  uploadingAudio.value = true
  router.patch(
    songsPhrasings.update({ song_id: props.song.slug }).url,
    { audio: pendingAudioFile.value },
    {
      forceFormData: true,
      preserveScroll: true,
      onFinish: () => {
        uploadingAudio.value = false
        pendingAudioFile.value = null
      },
    },
  )
}

/* ---- save ---- */
const saving = ref(false)
function save() {
  saving.value = true
  const payload = {
    sourceText: sourceText.value,
    complete: complete.value,
    screens: screens.value,
  }
  router.patch(
    songsPhrasings.update({ song_id: props.song.slug }).url,
    { phrasing: JSON.stringify(payload) },
    {
      preserveScroll: true,
      onFinish: () => {
        saving.value = false
      },
    },
  )
}

function formatTime(t: number | null): string {
  if (t == null) return "not tapped"
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(2).padStart(5, "0")
  return `${m}:${s}`
}
</script>

<template>
  <Head :title="`Phrasing — ${song.title}`" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="flex flex-col gap-4 p-4 pb-24">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">Phrasing &mdash; {{ song.title }}</h1>
          <p class="text-muted-foreground text-sm">
            KaraFun-style two-line screens, tapped to the beat of the actual
            recording.
          </p>
        </div>
        <Link :href="songsRoutes.show(song.slug)">
          <Button variant="outline">Back to song</Button>
        </Link>
      </div>

      <div class="bg-card rounded-xl border p-4">
        <h2
          class="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase"
        >
          Audio track
        </h2>
        <audio
          v-if="song.audio_url"
          ref="audioPlayer"
          :src="song.audio_url"
          controls
          class="w-full"
          @timeupdate="onTimeUpdate"
        ></audio>
        <p v-else class="text-muted-foreground mb-2 text-sm">
          Upload the song's audio to start tapping out a sync.
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept="audio/*"
            class="text-muted-foreground text-sm"
            @change="onAudioFileChange"
          />
          <Button
            size="sm"
            variant="outline"
            :disabled="!pendingAudioFile || uploadingAudio"
            @click="uploadAudio"
          >
            {{ song.audio_url ? "Replace audio" : "Upload audio" }}
          </Button>
        </div>
      </div>

      <div class="bg-card rounded-xl border p-4">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2
            class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Practice screen
          </h2>
          <span class="text-muted-foreground text-xs"
            >{{ tappedCount }}/{{ tokenRefs.length }} words tapped</span
          >
        </div>
        <PhrasingScreen
          :screen="activeScreen"
          :window="activeWindow"
          :current-time="currentTime"
        />
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            :disabled="!song.audio_url"
            @click="recording ? stopTapping() : startTapping()"
          >
            {{ recording ? "Stop" : "Start tapping" }}
          </Button>
          <Button
            size="sm"
            variant="outline"
            :disabled="tapPointer === 0"
            @click="undoLastTap"
          >
            Undo last tap
          </Button>
          <Button
            size="sm"
            variant="outline"
            :disabled="tapPointer >= tokenRefs.length"
            @click="skipToken"
          >
            Skip word
          </Button>
          <span v-if="recording && nextTokenText" class="text-sm">
            Next: <span class="font-semibold">{{ nextTokenText }}</span>
            &mdash; press Space when it starts
          </span>
        </div>
      </div>

      <div class="bg-card rounded-xl border p-4">
        <h2
          class="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase"
        >
          Lyrics
        </h2>
        <Textarea
          v-model="sourceText"
          class="min-h-56 text-sm"
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
          rest. Hyphenate a word, like
          <code class="bg-muted rounded px-1">a-ma-zing</code>, to tap its
          syllables separately.
        </p>
        <div class="mt-3 flex items-center gap-2">
          <Button size="sm" variant="outline" @click="rebuildScreens"
            >Build screens</Button
          >
          <span class="text-muted-foreground text-xs"
            >{{ screens.length }} screen{{
              screens.length === 1 ? "" : "s"
            }}</span
          >
        </div>
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

      <div class="bg-card rounded-xl border p-4">
        <h2
          class="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase"
        >
          Tapped times
        </h2>
        <p class="text-muted-foreground mb-2 text-xs">
          Click a word to clear the taps from there on and jump back to re-tap
          it.
        </p>
        <div class="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
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

    <div
      class="bg-background/95 fixed inset-x-0 bottom-0 flex items-center justify-end gap-3 border-t px-4 py-3 backdrop-blur"
    >
      <span v-if="!complete" class="text-muted-foreground text-xs">
        Tap every word before this is used in Stage Mode.
      </span>
      <span v-else class="text-xs text-emerald-600 dark:text-emerald-500">
        Fully tapped &mdash; ready for Stage Mode.
      </span>
      <Button :disabled="saving" @click="save">{{
        saving ? "Saving…" : "Save phrasing"
      }}</Button>
    </div>
  </AppLayout>
</template>
