<script setup lang="ts">
import { Head, Link, router } from "@inertiajs/vue3"
import { computed, ref } from "vue"

import SongBody from "@/components/karaoke/SongBody.vue"
import SongChordCharts from "@/components/karaoke/SongChordCharts.vue"
import TransposeControl from "@/components/karaoke/TransposeControl.vue"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import AppLayout from "@/layouts/AppLayout.vue"
import { parseBody } from "@/lib/chordSheet"
import {
  mySetlistSongs,
  mySetlists,
  songShares,
  songs as songsRoutes,
  songsPhrasings,
  songsTimings,
} from "@/routes"
import type { BreadcrumbItem, ShareableGroup, Song } from "@/types"

interface MySetlistRef {
  id: number
  name: string
  slug: string
  has_song: boolean
}

const props = defineProps<{ song: Song; my_setlists?: MySetlistRef[] }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Songs", href: songsRoutes.index().url },
  { title: props.song.title, href: songsRoutes.show(props.song.slug).url },
]

const semitones = ref(0)
const preferFlat = ref(false)
const blocks = computed(() => parseBody(props.song.body ?? ""))
const hasLineTiming = computed(
  () => Object.keys(props.song.line_timing?.lines ?? {}).length > 0,
)

/* ---- add to one of your own setlists ---- */
const setlistChoice = ref("")
const inSetlists = computed(() =>
  (props.my_setlists ?? []).filter((s) => s.has_song),
)
function addToSetlist() {
  const choice = setlistChoice.value
  setlistChoice.value = ""
  if (!choice) return
  if (choice === "new") {
    router.visit(mySetlists.new({ query: { song_id: props.song.id } }).url)
    return
  }
  router.post(
    mySetlistSongs.create({ my_setlist_id: choice }).url,
    { song_id: props.song.id },
    { preserveScroll: true },
  )
}

/* ---- the owner can let group members edit the sync/line timing ---- */
function setMembersEditSync(value: boolean) {
  router.patch(
    songsRoutes.update(props.song.slug).url,
    { members_edit_sync: value },
    { preserveScroll: true },
  )
}

function toggleSetlist() {
  router.patch(
    songsRoutes.toggleSetlist(props.song.slug).url,
    {},
    { preserveScroll: true },
  )
}
function remove() {
  if (confirm(`Delete "${props.song.title}"? This cannot be undone.`)) {
    router.delete(songsRoutes.destroy(props.song.slug).url)
  }
}

function isShared(groupId: number) {
  return (props.song.shares ?? []).some((s) => s.group_id === groupId)
}
function toggleShare(group: ShareableGroup) {
  const existing = (props.song.shares ?? []).find(
    (s) => s.group_id === group.id,
  )
  if (existing) {
    router.delete(
      songShares.destroy({ song_id: props.song.slug, id: existing.id }).url,
      { preserveScroll: true },
    )
  } else {
    router.post(
      songShares.create({ song_id: props.song.slug }).url,
      { group_id: group.id },
      { preserveScroll: true },
    )
  }
}
</script>

<template>
  <Head :title="song.title" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="flex flex-col gap-4 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">{{ song.title }}</h1>
          <p v-if="song.artist" class="text-muted-foreground">
            {{ song.artist }}
          </p>
          <p class="text-muted-foreground text-sm">
            <span v-if="song.key" class="mr-3">Key {{ song.key }}</span>
            <span v-if="song.capo && song.capo !== '0'" class="mr-3"
              >Capo {{ song.capo }}</span
            >
            <span v-if="song.tempo" class="mr-3">{{ song.tempo }} BPM</span>
            <span
              v-if="!song.owned && song.owner_name"
              class="text-muted-foreground"
            >
              Shared by {{ song.owner_name }}
            </span>
          </p>
        </div>
        <div v-if="song.owned" class="flex flex-wrap gap-2">
          <Button
            :variant="song.in_setlist ? 'default' : 'outline'"
            @click="toggleSetlist"
          >
            {{ song.in_setlist ? "★ Starred" : "☆ Star" }}
          </Button>
          <Link :href="songsRoutes.edit(song.slug)"
            ><Button variant="outline">Edit</Button></Link
          >
          <Button variant="destructive" @click="remove">Delete</Button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <Link
          :href="
            songsRoutes.stage(song.slug, {
              query: {
                t: semitones || undefined,
                flat: preferFlat ? '1' : undefined,
              },
            })
          "
        >
          <Button>Stage Mode</Button>
        </Link>
        <Link
          v-if="song.can_edit_sync"
          :href="songsPhrasings.show({ song_id: song.slug }).url"
        >
          <Button variant="outline">
            {{
              song.phrasing_ready
                ? "Karaoke sync ✓"
                : song.has_audio
                  ? "Finish karaoke sync"
                  : "Add karaoke sync"
            }}
          </Button>
        </Link>
        <Link
          v-if="song.can_edit_sync"
          :href="songsTimings.show({ song_id: song.slug }).url"
          title="How long each line lasts, so Stage Mode's tempo guide and sheet scrolling keep the song's real pace"
        >
          <Button variant="outline">
            {{ hasLineTiming ? "Line timing ✓" : "Line timing" }}
          </Button>
        </Link>
        <span
          v-else-if="song.phrasing_ready"
          class="text-muted-foreground text-xs"
        >
          Karaoke sync ready
        </span>
        <select
          v-model="setlistChoice"
          class="border-input bg-background h-9 rounded-md border px-2 text-sm"
          aria-label="Add to one of your setlists"
          :title="
            inSetlists.length
              ? `In ${inSetlists.map((s) => s.name).join(', ')}`
              : undefined
          "
          @change="addToSetlist"
        >
          <option value="">Add to setlist…</option>
          <option
            v-for="s in my_setlists ?? []"
            :key="s.id"
            :value="s.slug"
            :disabled="s.has_song"
          >
            {{ s.has_song ? `✓ ${s.name}` : s.name }}
          </option>
          <option value="new">+ New setlist…</option>
        </select>
        <TransposeControl
          v-model:semitones="semitones"
          v-model:preferFlat="preferFlat"
        />
      </div>

      <SongChordCharts
        :blocks="blocks"
        :semitones="semitones"
        :prefer-flat="preferFlat"
      />

      <div class="bg-card rounded-xl border p-5">
        <SongBody
          :blocks="blocks"
          :semitones="semitones"
          :prefer-flat="preferFlat"
        />
      </div>

      <div
        v-if="song.owned && song.shareable_groups"
        class="bg-card rounded-xl border p-4"
      >
        <h2
          class="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase"
        >
          Share with your groups
        </h2>
        <p
          v-if="!song.shareable_groups.length"
          class="text-muted-foreground text-sm"
        >
          You're not in any groups yet. Create or join one from the Groups page
          to share this song with your bandmates.
        </p>
        <ul v-else class="flex flex-col gap-2">
          <li
            v-for="group in song.shareable_groups"
            :key="group.id"
            class="flex items-center gap-2"
          >
            <Checkbox
              :model-value="isShared(group.id)"
              @update:model-value="() => toggleShare(group)"
            />
            <span class="text-sm">{{ group.name }}</span>
          </li>
        </ul>
        <label
          v-if="song.shareable_groups.length"
          class="mt-4 flex cursor-pointer items-start gap-2 border-t pt-3 text-sm"
        >
          <Checkbox
            :model-value="!!song.members_edit_sync"
            class="mt-0.5"
            @update:model-value="(v) => setMembersEditSync(v === true)"
          />
          <span>
            Let group members edit its karaoke sync and line timing
            <span class="text-muted-foreground block text-xs">
              Anyone in a group it's shared with can then tap out or fix its
              karaoke sync (and upload its audio or minus-one) and its line
              timing &mdash; one shared version, the latest save wins. The
              lyrics and chords stay yours to edit.
            </span>
          </span>
        </label>
      </div>
    </div>
  </AppLayout>
</template>
