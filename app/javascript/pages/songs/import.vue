<script setup lang="ts">
import { Head, Link, router, usePage } from "@inertiajs/vue3"
import { ArrowLeftRight, FileUp, LoaderCircle, X } from "lucide-vue-next"
import { computed, ref } from "vue"

import SongBody from "@/components/karaoke/SongBody.vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import AppLayout from "@/layouts/AppLayout.vue"
import { analyzeBody, parseBody } from "@/lib/chordSheet"
import {
  type ImportedSong,
  TEXT_EXTENSIONS,
  parseSongText,
  songsFromFiles,
  splitPasted,
} from "@/lib/songImport"
import { songImports, songs as songsRoutes } from "@/routes"
import type { BreadcrumbItem } from "@/types"

const props = defineProps<{
  existing: { title: string; artist: string | null }[]
  max_songs: number
}>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Songs", href: songsRoutes.index().url },
  { title: "Import", href: songImports.new().url },
]

interface Row extends ImportedSong {
  uid: number
  include: boolean
  open: boolean
  editing: boolean
}

const rows = ref<Row[]>([])
const skipped = ref<string[]>([])
const reading = ref(false)
let nextUid = 1

/* ---- duplicates: already in your songs, or twice in this import ---- */
const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
const keyOf = (title: string, artist: string | null | undefined) =>
  `${norm(title)}|${norm(artist)}`
const existingKeys = computed(
  () => new Set(props.existing.map((s) => keyOf(s.title, s.artist))),
)
function duplicateOf(row: Row): string | null {
  const key = keyOf(row.title, row.artist)
  if (existingKeys.value.has(key)) return "Already in your songs"
  const first = rows.value.find((r) => keyOf(r.title, r.artist) === key)
  return first && first.uid !== row.uid ? "Twice in this import" : null
}

function add(songs: ImportedSong[]) {
  for (const song of songs) {
    const row: Row = {
      ...song,
      uid: nextUid++,
      include: true,
      open: false,
      editing: false,
    }
    rows.value.push(row)
    // Leave out duplicates unless asked for.
    if (duplicateOf(row)) row.include = false
  }
}

/* ---- files: picked or dropped (zips opened up) ---- */
const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const accept = [...TEXT_EXTENSIONS, "zip"].map((e) => `.${e}`).join(",")

async function readFiles(list: FileList | File[] | null | undefined) {
  const files = [...(list ?? [])]
  if (!files.length) return
  reading.value = true
  try {
    const { songs, skipped: problems } = await songsFromFiles(files)
    add(songs)
    skipped.value.push(...problems)
  } finally {
    reading.value = false
  }
}
function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  void readFiles(input.files).then(() => (input.value = ""))
}
function onDrop(e: DragEvent) {
  dragging.value = false
  void readFiles(e.dataTransfer?.files)
}

/* ---- pasted text: songs separated by a line of --- ---- */
const pasted = ref("")
let pastedCount = 0
function addPasted() {
  const chunks = splitPasted(pasted.value)
  add(chunks.map((text) => parseSongText(text, `Pasted song ${++pastedCount}`)))
  pasted.value = ""
}

/* ---- the preview ---- */
function issueCount(row: Row) {
  return analyzeBody(row.body).issues.length
}
function swap(row: Row) {
  ;[row.title, row.artist] = [row.artist || row.title, row.title]
}
function removeRow(uid: number) {
  rows.value = rows.value.filter((r) => r.uid !== uid)
}
function clearAll() {
  if (confirm("Clear the whole list?")) {
    rows.value = []
    skipped.value = []
  }
}
const selected = computed(() => rows.value.filter((r) => r.include))
const allIncluded = computed(
  () => rows.value.length > 0 && rows.value.every((r) => r.include),
)
function includeAll(value: boolean) {
  for (const r of rows.value) r.include = value
}

/* ---- import: all or nothing; reasons come back per song ---- */
const page = usePage()
const sentUids = ref<number[]>([])
// Each error comes back as a message, or a list of them (take the first).
const errors = computed(() => {
  const raw = (page.props.errors ?? {}) as unknown as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value
    if (first != null) out[key] = String(first)
  }
  return out
})
function errorFor(row: Row): string | null {
  const i = sentUids.value.indexOf(row.uid)
  return i >= 0 ? (errors.value[`song_${i}`] ?? null) : null
}
const importing = ref(false)
const tooMany = computed(() => selected.value.length > props.max_songs)
function submit() {
  const list = selected.value
  if (!list.length || tooMany.value) return
  sentUids.value = list.map((r) => r.uid)
  importing.value = true
  router.post(
    songImports.create().url,
    {
      songs: JSON.stringify(
        list.map((r) => ({
          title: r.title,
          artist: r.artist,
          key: r.key,
          capo: r.capo,
          tempo: r.tempo,
          body: r.body,
        })),
      ),
    },
    {
      preserveState: true,
      preserveScroll: true,
      onFinish: () => (importing.value = false),
    },
  )
}
</script>

<template>
  <Head title="Import songs" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="flex flex-col gap-4 p-4 pb-28">
      <div>
        <h1 class="text-2xl font-bold">Import songs</h1>
        <p class="text-muted-foreground max-w-2xl text-sm">
          Bring in many chord sheets at once &mdash; from files, or pasted text.
          Check them over below, then import. Only import songs you have the
          right to use.
        </p>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <!-- Files -->
        <div
          class="bg-card flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors"
          :class="dragging ? 'border-primary bg-primary/5' : ''"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <FileUp class="text-muted-foreground size-8" />
          <p class="text-sm font-medium">Drop chord sheet files here</p>
          <p class="text-muted-foreground text-xs">
            Plain text (.txt) with chords above the lyrics, ChordPro (.cho,
            .chopro, .chordpro, .crd, .pro), or a .zip of them &mdash; up to 1
            MB a file.
          </p>
          <input
            ref="fileInput"
            type="file"
            multiple
            :accept="accept"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            @change="onPick"
          />
          <Button
            variant="outline"
            :disabled="reading"
            @click="fileInput?.click()"
          >
            <LoaderCircle v-if="reading" class="size-4 animate-spin" />
            {{ reading ? "Reading…" : "Choose files…" }}
          </Button>
        </div>

        <!-- Paste -->
        <div class="bg-card flex flex-col gap-2 rounded-xl border p-4">
          <label for="pasted" class="text-sm font-medium">Paste songs</label>
          <Textarea
            id="pasted"
            v-model="pasted"
            class="min-h-44 font-mono text-xs"
            spellcheck="false"
            :placeholder="'Title: First Song\nArtist: Someone\nKey: G\n\n[Verse 1]\nG        D\nYour lyrics under the chords\n\n---\n\nSecond Song - Someone Else\n\nC        G\nAnd so on'"
          />
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-muted-foreground text-xs">
              Put a line of <code class="bg-muted rounded px-1">---</code>
              between songs. ChordPro works here too.
            </p>
            <Button :disabled="!pasted.trim()" @click="addPasted">
              Add to the list
            </Button>
          </div>
        </div>
      </div>

      <ul
        v-if="skipped.length"
        class="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400"
      >
        <li v-for="(s, i) in skipped" :key="i">Skipped {{ s }}</li>
      </ul>

      <!-- Preview -->
      <div v-if="rows.length" class="bg-card rounded-xl border">
        <div
          class="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2"
        >
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              :checked="allIncluded"
              @change="includeAll(($event.target as HTMLInputElement).checked)"
            />
            {{ rows.length }} song{{ rows.length === 1 ? "" : "s" }} found
          </label>
          <Button size="sm" variant="ghost" @click="clearAll"
            >Clear list</Button
          >
        </div>
        <ul class="divide-y">
          <li
            v-for="row in rows"
            :key="row.uid"
            class="px-4 py-3"
            :class="[
              !row.include ? 'opacity-60' : '',
              errorFor(row) ? 'bg-destructive/5' : '',
            ]"
          >
            <div class="flex flex-wrap items-center gap-2">
              <input
                v-model="row.include"
                type="checkbox"
                :aria-label="`Import ${row.title}`"
              />
              <Input
                v-model="row.title"
                class="h-8 w-64"
                aria-label="Title"
                placeholder="Title"
              />
              <Button
                size="icon"
                variant="ghost"
                class="size-8"
                title="Swap title and artist"
                @click="swap(row)"
                ><ArrowLeftRight class="size-3.5"
              /></Button>
              <Input
                v-model="row.artist"
                class="h-8 w-48"
                aria-label="Artist"
                placeholder="Artist"
              />
              <span class="text-muted-foreground text-xs">
                <template v-if="row.key">Key {{ row.key }} · </template>
                <template v-if="row.capo">Capo {{ row.capo }} · </template>
                <template v-if="row.tempo">{{ row.tempo }} BPM · </template>
                {{ row.source }}
                <template v-if="row.format === 'chordpro'">
                  (ChordPro)</template
                >
              </span>
              <Badge
                v-if="duplicateOf(row)"
                variant="outline"
                class="border-amber-500/60 text-amber-700 dark:text-amber-400"
                >{{ duplicateOf(row) }}</Badge
              >
              <Badge v-if="issueCount(row)" variant="secondary"
                >{{ issueCount(row) }} line{{
                  issueCount(row) === 1 ? "" : "s"
                }}
                to check</Badge
              >
              <span class="ml-auto flex items-center gap-1">
                <Button size="sm" variant="ghost" @click="row.open = !row.open">
                  {{ row.open ? "Hide" : "Preview" }}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  class="size-8"
                  :aria-label="`Remove ${row.title}`"
                  @click="removeRow(row.uid)"
                  ><X class="size-4"
                /></Button>
              </span>
            </div>
            <p v-if="errorFor(row)" class="text-destructive mt-1 text-xs">
              {{ errorFor(row) }}
            </p>
            <div v-if="row.open" class="mt-3 grid gap-3 lg:grid-cols-2">
              <div class="rounded-lg border p-3">
                <SongBody :blocks="parseBody(row.body)" />
              </div>
              <div class="flex flex-col gap-1">
                <Textarea
                  v-model="row.body"
                  class="min-h-64 font-mono text-xs"
                  spellcheck="false"
                  aria-label="Chord sheet text"
                />
                <ul class="flex flex-col gap-0.5">
                  <li
                    v-for="(issue, i) in analyzeBody(row.body).issues"
                    :key="i"
                    class="text-xs text-amber-600 dark:text-amber-500"
                  >
                    Line {{ issue.line }}: {{ issue.message }}
                  </li>
                </ul>
              </div>
            </div>
          </li>
        </ul>
      </div>
      <p v-else class="text-muted-foreground py-8 text-center text-sm">
        Songs you add will be listed here to check before importing.
      </p>
    </div>

    <!-- Import bar -->
    <div
      v-if="rows.length"
      class="bg-background/95 fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-end gap-3 border-t px-4 py-3 backdrop-blur"
    >
      <span
        v-if="errors.import"
        class="text-destructive text-sm"
        role="alert"
        >{{ errors.import }}</span
      >
      <span v-else-if="tooMany" class="text-destructive text-sm"
        >Import up to {{ max_songs }} at a time &mdash; untick some.</span
      >
      <span class="text-muted-foreground text-sm"
        >{{ selected.length }} of {{ rows.length }} selected</span
      >
      <Link :href="songsRoutes.index()">
        <Button variant="outline">Cancel</Button>
      </Link>
      <Button
        :disabled="!selected.length || tooMany || importing"
        @click="submit"
      >
        <LoaderCircle v-if="importing" class="size-4 animate-spin" />
        Import {{ selected.length }} song{{ selected.length === 1 ? "" : "s" }}
      </Button>
    </div>
  </AppLayout>
</template>
