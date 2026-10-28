<script setup lang="ts">
import { Head, Link, router } from "@inertiajs/vue3"
import { computed } from "vue"

import { Button } from "@/components/ui/button"
import AppLayout from "@/layouts/AppLayout.vue"
import {
  groups as groupsRoutes,
  liveSession as liveSessionRoutes,
  setlistSongs as setlistSongsRoutes,
  setlists as setlistsRoutes,
} from "@/routes"
import type { BreadcrumbItem, Group, Setlist } from "@/types"

const props = defineProps<{ group: Group; setlist: Setlist }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Groups", href: groupsRoutes.index().url },
  { title: props.group.name, href: groupsRoutes.show(props.group.slug).url },
  {
    title: "Setlists",
    href: setlistsRoutes.index({ group_id: props.group.slug }).url,
  },
  {
    title: props.setlist.name,
    href: setlistsRoutes.show({
      group_id: props.group.slug,
      id: props.setlist.slug,
    }).url,
  },
]

const entries = computed(() => props.setlist.entries ?? [])
const availableSongs = computed(() => props.setlist.available_songs ?? [])

function entryParams(entryId: number) {
  return {
    group_id: props.group.slug,
    setlist_id: props.setlist.slug,
    id: entryId,
  }
}

function moveEntry(entryId: number, direction: "up" | "down") {
  router.patch(
    setlistSongsRoutes.move(entryParams(entryId)).url,
    { direction },
    { preserveScroll: true },
  )
}

function removeEntry(songTitle: string, entryId: number) {
  if (confirm(`Remove "${songTitle}" from this setlist?`)) {
    router.delete(setlistSongsRoutes.destroy(entryParams(entryId)).url, {
      preserveScroll: true,
    })
  }
}

function addSong(songId: number) {
  router.post(
    setlistSongsRoutes.create({
      group_id: props.group.slug,
      setlist_id: props.setlist.slug,
    }).url,
    { song_id: songId },
    { preserveScroll: true },
  )
}

function destroySetlist() {
  if (confirm(`Delete "${props.setlist.name}"? This cannot be undone.`)) {
    router.delete(
      setlistsRoutes.destroy({
        group_id: props.group.slug,
        id: props.setlist.slug,
      }).url,
    )
  }
}

function goLive() {
  router.post(
    liveSessionRoutes.create({ group_id: props.group.slug }).url,
    { setlist_id: props.setlist.id },
    { preserveScroll: true },
  )
}
</script>

<template>
  <Head :title="setlist.name" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="flex flex-col gap-4 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">{{ setlist.name }}</h1>
          <p class="text-muted-foreground text-sm">
            {{ entries.length }} song{{ entries.length === 1 ? "" : "s" }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Link
            v-if="entries.length"
            :href="
              setlistsRoutes.stage({ group_id: group.slug, id: setlist.slug })
            "
          >
            <Button>Start Stage Mode</Button>
          </Link>
          <Button v-if="entries.length" variant="outline" @click="goLive">
            Go Live with the group
          </Button>
          <template v-if="setlist.is_owner">
            <Link
              :href="
                setlistsRoutes.edit({ group_id: group.slug, id: setlist.slug })
              "
            >
              <Button variant="outline">Rename</Button>
            </Link>
            <Button variant="destructive" @click="destroySetlist"
              >Delete setlist</Button
            >
          </template>
        </div>
      </div>

      <div class="bg-card rounded-xl border p-4">
        <h2
          class="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase"
        >
          Running order
        </h2>
        <ol v-if="entries.length" class="flex flex-col gap-2">
          <li
            v-for="(entry, index) in entries"
            :key="entry.id"
            class="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <span class="flex items-center gap-2">
              <span class="text-muted-foreground w-5 text-right font-mono"
                >{{ index + 1 }}.</span
              >
              <span class="font-medium">{{ entry.song.title }}</span>
              <span v-if="entry.song.artist" class="text-muted-foreground">
                &mdash; {{ entry.song.artist }}
              </span>
              <span
                v-if="!entry.song.owned && entry.song.owner_name"
                class="text-muted-foreground text-xs"
              >
                (shared by {{ entry.song.owner_name }})
              </span>
            </span>
            <span v-if="setlist.is_owner" class="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                :disabled="index === 0"
                title="Move up"
                @click="moveEntry(entry.id, 'up')"
              >
                &#9650;
              </Button>
              <Button
                variant="ghost"
                size="sm"
                :disabled="index === entries.length - 1"
                title="Move down"
                @click="moveEntry(entry.id, 'down')"
              >
                &#9660;
              </Button>
              <Button
                variant="ghost"
                size="sm"
                @click="removeEntry(entry.song.title, entry.id)"
              >
                Remove
              </Button>
            </span>
          </li>
        </ol>
        <p v-else class="text-muted-foreground text-sm">
          No songs in this setlist yet.
          <template v-if="setlist.is_owner"
            >Add some from the group's shared songs below.</template
          >
        </p>
      </div>

      <div v-if="setlist.is_owner" class="bg-card rounded-xl border p-4">
        <h2
          class="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase"
        >
          Add a song
        </h2>
        <ul v-if="availableSongs.length" class="flex flex-col gap-2">
          <li
            v-for="song in availableSongs"
            :key="song.id"
            class="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span>
              <span class="font-medium">{{ song.title }}</span>
              <span v-if="song.artist" class="text-muted-foreground">
                &mdash; {{ song.artist }}</span
              >
              <span
                v-if="!song.owned && song.owner_name"
                class="text-muted-foreground text-xs"
              >
                (shared by {{ song.owner_name }})
              </span>
            </span>
            <Button variant="outline" size="sm" @click="addSong(song.id)"
              >+ Add</Button
            >
          </li>
        </ul>
        <p v-else class="text-muted-foreground text-sm">
          Every song shared with {{ group.name }} is already in this setlist.
          Share more songs from a song's page to add more here.
        </p>
      </div>
    </div>
  </AppLayout>
</template>
