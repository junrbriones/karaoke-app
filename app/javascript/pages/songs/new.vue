<script setup lang="ts">
import { Head, Link } from "@inertiajs/vue3"

import SongForm from "@/components/karaoke/SongForm.vue"
import { Button } from "@/components/ui/button"
import AppLayout from "@/layouts/AppLayout.vue"
import { songs as songsRoutes } from "@/routes"
import type { BreadcrumbItem } from "@/types"

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Songs", href: songsRoutes.index().url },
  { title: "New song", href: songsRoutes.new().url },
]
</script>

<template>
  <Head title="New song" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="p-4">
      <h1 class="mb-4 text-2xl font-bold">New song</h1>
      <SongForm :action="songsRoutes.create()" submit-label="Save song">
        <template #extra-actions>
          <Link :href="songsRoutes.index()"
            ><Button type="button" variant="outline">Cancel</Button></Link
          >
        </template>
      </SongForm>
    </div>
  </AppLayout>
</template>
