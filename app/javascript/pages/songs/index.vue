<script setup lang="ts">
import { Head, Link } from "@inertiajs/vue3"
import { LayoutGrid, List } from "lucide-vue-next"
import { computed, onMounted, ref } from "vue"

import SongCard from "@/components/karaoke/SongCard.vue"
import SongListItem from "@/components/karaoke/SongListItem.vue"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AppLayout from "@/layouts/AppLayout.vue"
import * as storage from "@/lib/storage"
import { setlistStage, songs as songsRoutes } from "@/routes"
import type { BreadcrumbItem, Song } from "@/types"

const props = defineProps<{ songs: Song[] }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Songs", href: songsRoutes.index().url },
]

const query = ref("")
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.songs
  return props.songs.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      (s.artist ?? "").toLowerCase().includes(q),
  )
})

const setlistSongs = computed(() => props.songs.filter((s) => s.in_setlist))

// Defaults to grid on both the server-rendered and first client render (so
// there's nothing to mismatch during hydration), then swaps to whatever was
// last chosen once mounted -- same pattern as the appearance toggle.
type ViewMode = "grid" | "list"
const VIEW_MODE_KEY = "songs-view"
const viewMode = ref<ViewMode>("grid")

onMounted(() => {
  const saved = storage.getItem(VIEW_MODE_KEY)
  if (saved === "grid" || saved === "list") {
    viewMode.value = saved
  }
})

function setViewMode(mode: ViewMode) {
  viewMode.value = mode
  storage.setItem(VIEW_MODE_KEY, mode)
}
</script>

<template>
  <Head title="Songs" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="flex flex-col gap-4 p-4">
      <div class="flex flex-wrap items-center gap-3">
        <Input
          v-model="query"
          type="search"
          placeholder="Search songs or artists&hellip;"
          class="max-w-xs"
        />
        <div
          class="bg-muted inline-flex items-center gap-0.5 rounded-md p-0.5"
          role="group"
          aria-label="Song list layout"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :class="
              viewMode === 'grid'
                ? 'bg-background shadow-xs'
                : 'text-muted-foreground'
            "
            :aria-pressed="viewMode === 'grid'"
            aria-label="Grid view"
            title="Grid view"
            @click="setViewMode('grid')"
          >
            <LayoutGrid class="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :class="
              viewMode === 'list'
                ? 'bg-background shadow-xs'
                : 'text-muted-foreground'
            "
            :aria-pressed="viewMode === 'list'"
            aria-label="List view"
            title="List view"
            @click="setViewMode('list')"
          >
            <List class="size-4" />
          </Button>
        </div>
        <Link :href="songsRoutes.new()">
          <Button>+ New song</Button>
        </Link>
      </div>

      <div class="bg-card rounded-xl border p-4">
        <h2
          class="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase"
        >
          ★ Starred songs
        </h2>
        <p v-if="!setlistSongs.length" class="text-muted-foreground text-sm">
          Star songs below to build your own quick run-through &mdash; separate
          from any named setlist a group you're in has put together. Either way,
          you run it in Stage Mode.
        </p>
        <template v-else>
          <ol class="list-inside list-decimal text-sm">
            <li v-for="s in setlistSongs" :key="s.id">{{ s.title }}</li>
          </ol>
          <Link :href="setlistStage()" class="mt-3 inline-block">
            <Button>Start Stage Mode ({{ setlistSongs.length }})</Button>
          </Link>
        </template>
      </div>

      <template v-if="filtered.length">
        <div
          v-if="viewMode === 'grid'"
          class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <SongCard v-for="song in filtered" :key="song.id" :song="song" />
        </div>
        <div v-else class="bg-card divide-y rounded-xl border">
          <SongListItem v-for="song in filtered" :key="song.id" :song="song" />
        </div>
      </template>
      <p v-else class="text-muted-foreground py-10 text-center">
        No songs match &quot;{{ query }}&quot;.
      </p>
    </div>
  </AppLayout>
</template>
