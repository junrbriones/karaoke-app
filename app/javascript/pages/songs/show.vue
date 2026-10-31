<script setup lang="ts">
import { Head, Link, router } from "@inertiajs/vue3"
import { computed, ref } from "vue"

import SongBody from "@/components/karaoke/SongBody.vue"
import TransposeControl from "@/components/karaoke/TransposeControl.vue"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import AppLayout from "@/layouts/AppLayout.vue"
import { parseBody } from "@/lib/chordSheet"
import {
  songShares,
  songs as songsRoutes,
  songsPhrasings,
  songsTimings,
} from "@/routes"
import type { BreadcrumbItem, ShareableGroup, Song } from "@/types"

const props = defineProps<{ song: Song }>()

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
            {{ song.in_setlist ? "★ In setlist" : "☆ Add to setlist" }}
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
          v-if="song.owned"
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
          v-if="song.owned"
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
        <TransposeControl
          v-model:semitones="semitones"
          v-model:preferFlat="preferFlat"
        />
      </div>

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
      </div>
    </div>
  </AppLayout>
</template>
