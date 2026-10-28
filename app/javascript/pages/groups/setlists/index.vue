<script setup lang="ts">
import { Head, Link } from "@inertiajs/vue3"

import { Button } from "@/components/ui/button"
import AppLayout from "@/layouts/AppLayout.vue"
import { groups as groupsRoutes, setlists as setlistsRoutes } from "@/routes"
import type { BreadcrumbItem, Group, Setlist } from "@/types"

const props = defineProps<{ group: Group; setlists: Setlist[] }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Groups", href: groupsRoutes.index().url },
  { title: props.group.name, href: groupsRoutes.show(props.group.slug).url },
  {
    title: "Setlists",
    href: setlistsRoutes.index({ group_id: props.group.slug }).url,
  },
]
</script>

<template>
  <Head :title="`${group.name} setlists`" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="flex flex-col gap-4 p-4">
      <div class="flex items-center justify-between">
        <p class="text-muted-foreground max-w-lg text-sm">
          A setlist is an ordered run of songs from {{ group.name }}'s shared
          songbook &mdash; build one for a rehearsal or a show, then run it
          straight through in Stage Mode.
        </p>
        <Link
          v-if="group.is_owner"
          :href="setlistsRoutes.new({ group_id: group.slug })"
        >
          <Button>+ New setlist</Button>
        </Link>
      </div>

      <div
        v-if="setlists.length"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Link
          v-for="setlist in setlists"
          :key="setlist.id"
          :href="
            setlistsRoutes.show({ group_id: group.slug, id: setlist.slug })
          "
          class="bg-card hover:border-primary/50 flex flex-col gap-1 rounded-xl border p-4 shadow-sm transition-colors"
        >
          <h3 class="font-semibold">{{ setlist.name }}</h3>
          <p class="text-muted-foreground text-sm">
            {{ setlist.song_count }} song{{
              setlist.song_count === 1 ? "" : "s"
            }}
          </p>
        </Link>
      </div>
      <p v-else class="text-muted-foreground py-10 text-center">
        No setlists yet.
        <template v-if="group.is_owner"
          >Create one to plan your next rehearsal or show.</template
        >
      </p>
    </div>
  </AppLayout>
</template>
