<script setup lang="ts">
import { Head, Link, router } from "@inertiajs/vue3"
import { computed, ref } from "vue"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AppLayout from "@/layouts/AppLayout.vue"
import { mySetlistSongs, mySetlists, songs as songsRoutes } from "@/routes"
import type { BreadcrumbItem, Setlist } from "@/types"

const props = defineProps<{ setlist: Setlist }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "My setlists", href: mySetlists.index().url },
  {
    title: props.setlist.name,
    href: mySetlists.show({ id: props.setlist.slug }).url,
  },
]

const entries = computed(() => props.setlist.entries ?? [])
const playable = computed(() => entries.value.filter((e) => !e.unavailable))

function entryParams(id: number) {
  return { my_setlist_id: props.setlist.slug, id }
}
function moveEntry(id: number, direction: "up" | "down") {
  router.patch(
    mySetlistSongs.move(entryParams(id)).url,
    { direction },
    { preserveScroll: true },
  )
}
function removeEntry(title: string, id: number) {
  if (confirm(`Remove "${title}" from this setlist?`)) {
    router.delete(mySetlistSongs.destroy(entryParams(id)).url, {
      preserveScroll: true,
    })
  }
}
function addSong(songId: number) {
  router.post(
    mySetlistSongs.create({ my_setlist_id: props.setlist.slug }).url,
    { song_id: songId },
    { preserveScroll: true },
  )
}
function destroySetlist() {
  if (confirm(`Delete "${props.setlist.name}"? This cannot be undone.`)) {
    router.delete(mySetlists.destroy({ id: props.setlist.slug }).url)
  }
}

/* ---- add a song: everything you can open, filtered as you type ---- */
const search = ref("")
const availableSongs = computed(() => {
  const all = props.setlist.available_songs ?? []
  const q = search.value.trim().toLowerCase()
  if (!q) return all
  return all.filter((s) =>
    [s.title, s.artist, s.owner_name]
      .filter(Boolean)
      .some((t) => t!.toLowerCase().includes(q)),
  )
})
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
            v-if="playable.length"
            :href="mySetlists.stage({ id: setlist.slug })"
          >
            <Button>Start Stage Mode</Button>
          </Link>
          <Link :href="mySetlists.edit({ id: setlist.slug })">
            <Button variant="outline">Rename</Button>
          </Link>
          <Button variant="destructive" @click="destroySetlist"
            >Delete setlist</Button
          >
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
            :class="entry.unavailable ? 'opacity-60' : ''"
          >
            <span class="flex min-w-0 flex-wrap items-center gap-x-2">
              <span class="text-muted-foreground w-5 text-right font-mono"
                >{{ index + 1 }}.</span
              >
              <Link
                v-if="!entry.unavailable"
                :href="songsRoutes.show(entry.song.slug)"
                class="font-medium hover:underline"
                >{{ entry.song.title }}</Link
              >
              <span v-else class="font-medium">{{ entry.song.title }}</span>
              <span v-if="entry.song.artist" class="text-muted-foreground">
                &mdash; {{ entry.song.artist }}
              </span>
              <span
                v-if="entry.unavailable"
                class="text-xs text-amber-600 dark:text-amber-500"
              >
                no longer shared with you &mdash; skipped in Stage Mode
              </span>
              <span
                v-else-if="!entry.song.owned && entry.song.owner_name"
                class="text-muted-foreground text-xs"
              >
                (shared by {{ entry.song.owner_name }})
              </span>
            </span>
            <span class="flex items-center gap-1">
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
          No songs in this setlist yet &mdash; add some below.
        </p>
      </div>

      <div class="bg-card rounded-xl border p-4">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2
            class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Add a song
          </h2>
          <Input
            v-model="search"
            type="search"
            class="h-8 w-56"
            placeholder="Find a song or artist…"
            aria-label="Find a song"
          />
        </div>
        <ul
          v-if="availableSongs.length"
          class="flex max-h-96 flex-col gap-2 overflow-y-auto"
        >
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
        <p v-else-if="search" class="text-muted-foreground text-sm">
          No other songs match &ldquo;{{ search }}&rdquo;.
        </p>
        <p v-else class="text-muted-foreground text-sm">
          Every song you can open is already in this setlist.
        </p>
      </div>
    </div>
  </AppLayout>
</template>
