<script setup lang="ts">
import { Link, router } from "@inertiajs/vue3"
import { Star } from "lucide-vue-next"

import { songs } from "@/routes"
import type { Song } from "@/types"

const props = defineProps<{ song: Song }>()

function toggleSetlist(e: Event) {
  e.preventDefault()
  e.stopPropagation()
  router.patch(
    songs.toggleSetlist(props.song.slug).url,
    {},
    { preserveScroll: true, preserveState: true },
  )
}
</script>

<template>
  <Link
    :href="songs.show(song.slug)"
    class="bg-card hover:border-primary/50 flex items-start justify-between gap-2 rounded-xl border p-4 shadow-sm transition-colors"
  >
    <div class="min-w-0">
      <h3 class="truncate font-semibold">{{ song.title }}</h3>
      <p v-if="song.artist" class="text-muted-foreground truncate text-sm">
        {{ song.artist }}
      </p>
      <p class="text-muted-foreground mt-1 text-xs">
        <span v-if="song.key" class="mr-3">Key {{ song.key }}</span>
        <span v-if="song.capo && song.capo !== '0'" class="mr-3"
          >Capo {{ song.capo }}</span
        >
        <span v-if="!song.owned && song.owner_name"
          >by {{ song.owner_name }}</span
        >
      </p>
    </div>
    <button
      v-if="song.owned"
      type="button"
      class="shrink-0 p-1"
      :class="
        song.in_setlist
          ? 'text-amber-500'
          : 'text-muted-foreground/40 hover:text-muted-foreground'
      "
      :aria-label="song.in_setlist ? 'Remove from setlist' : 'Add to setlist'"
      :title="song.in_setlist ? 'Remove from setlist' : 'Add to setlist'"
      @click="toggleSetlist"
    >
      <Star class="size-5" :fill="song.in_setlist ? 'currentColor' : 'none'" />
    </button>
  </Link>
</template>
