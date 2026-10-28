<script setup lang="ts">
import { Head, Link } from "@inertiajs/vue3"

import SongForm from "@/components/karaoke/SongForm.vue"
import { Button } from "@/components/ui/button"
import AppLayout from "@/layouts/AppLayout.vue"
import { songs as songsRoutes } from "@/routes"
import type { BreadcrumbItem, Song } from "@/types"

const props = defineProps<{ song: Song }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Songs", href: songsRoutes.index().url },
  { title: props.song.title, href: songsRoutes.show(props.song.slug).url },
  { title: "Edit", href: songsRoutes.edit(props.song.slug).url },
]
</script>

<template>
  <Head :title="`Edit ${song.title}`" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="p-4">
      <h1 class="mb-4 text-2xl font-bold">Edit song</h1>
      <SongForm
        :song="song"
        :action="songsRoutes.update(song.slug)"
        submit-label="Save changes"
      >
        <template #extra-actions>
          <Link :href="songsRoutes.show(song.slug)"
            ><Button type="button" variant="outline">Cancel</Button></Link
          >
        </template>
      </SongForm>
    </div>
  </AppLayout>
</template>
