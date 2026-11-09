<script setup lang="ts">
import { Head, Link } from "@inertiajs/vue3"

import SetlistForm from "@/components/karaoke/SetlistForm.vue"
import { Button } from "@/components/ui/button"
import AppLayout from "@/layouts/AppLayout.vue"
import { mySetlists, songs as songsRoutes } from "@/routes"
import type { BreadcrumbItem, Song } from "@/types"

// Optionally starting with a song (from "Add to setlist" on its page).
const props = defineProps<{ song?: Song | null }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "My setlists", href: mySetlists.index().url },
  { title: "New setlist", href: mySetlists.new().url },
]
</script>

<template>
  <Head title="New setlist" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="p-4">
      <h1 class="mb-1 text-2xl font-bold">New setlist</h1>
      <p v-if="song" class="text-muted-foreground mb-4 text-sm">
        Starting with &ldquo;{{ song.title }}&rdquo;.
      </p>
      <div v-else class="mb-4" />
      <SetlistForm :action="mySetlists.create()" submit-label="Create setlist">
        <template #extra-actions>
          <input v-if="song" type="hidden" name="song_id" :value="song.id" />
          <Link
            :href="
              props.song
                ? songsRoutes.show(props.song.slug)
                : mySetlists.index()
            "
          >
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
        </template>
      </SetlistForm>
    </div>
  </AppLayout>
</template>
