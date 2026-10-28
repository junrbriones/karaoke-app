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
    class="hover:bg-accent/50 flex items-center justify-between gap-3 px-3 py-2.5 transition-colors"
  >
    <div class="flex min-w-0 items-baseline gap-2">
      <span class="truncate font-medium">{{ song.title }}</span>
      <span v-if="song.artist" class="text-muted-foreground truncate text-sm">
        {{ song.artist }}
      </span>
    </div>
    <div class="flex shrink-0 items-center gap-4">
      <span
        class="text-muted-foreground hidden text-xs sm:inline-flex sm:gap-3"
      >
        <span v-if="song.key">Key {{ song.key }}</span>
        <span v-if="song.capo && song.capo !== '0'">Capo {{ song.capo }}</span>
        <span v-if="!song.owned && song.owner_name"
          >by {{ song.owner_name }}</span
        >
      </span>
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
        <Star
          class="size-4"
          :fill="song.in_setlist ? 'currentColor' : 'none'"
        />
      </button>
    </div>
  </Link>
</template>
