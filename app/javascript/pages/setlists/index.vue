<script setup lang="ts">
import { Head, Link } from "@inertiajs/vue3"

import { Button } from "@/components/ui/button"
import AppLayout from "@/layouts/AppLayout.vue"
import { mySetlists, setlistStage } from "@/routes"
import type { BreadcrumbItem, Setlist } from "@/types"

defineProps<{ setlists: Setlist[]; starred_count: number }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "My setlists", href: mySetlists.index().url },
]
</script>

<template>
  <Head title="My setlists" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="flex flex-col gap-4 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <p class="text-muted-foreground max-w-xl text-sm">
          Your own setlists, for performing solo: a named, ordered run of any
          songs you can open &mdash; yours, and the ones shared with your groups
          &mdash; played straight through in Stage Mode.
        </p>
        <Link :href="mySetlists.new()">
          <Button>+ New setlist</Button>
        </Link>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          v-for="setlist in setlists"
          :key="setlist.id"
          :href="mySetlists.show({ id: setlist.slug })"
          class="bg-card hover:border-primary/50 flex flex-col gap-1 rounded-xl border p-4 shadow-sm transition-colors"
        >
          <h3 class="font-semibold">{{ setlist.name }}</h3>
          <p class="text-muted-foreground text-sm">
            {{ setlist.song_count }} song{{
              setlist.song_count === 1 ? "" : "s"
            }}
          </p>
        </Link>
        <Link
          :href="setlistStage()"
          class="bg-card hover:border-primary/50 flex flex-col gap-1 rounded-xl border border-dashed p-4 transition-colors"
          :class="starred_count ? '' : 'pointer-events-none opacity-60'"
        >
          <h3 class="font-semibold">&#9733; Starred songs</h3>
          <p class="text-muted-foreground text-sm">
            {{ starred_count }} song{{ starred_count === 1 ? "" : "s" }}, A to Z
            &mdash; your quick list from the Songs page
          </p>
        </Link>
      </div>
      <p
        v-if="!setlists.length"
        class="text-muted-foreground py-6 text-center text-sm"
      >
        No setlists yet &mdash; create one for your next gig or practice, or add
        a song to a new setlist from its page.
      </p>
    </div>
  </AppLayout>
</template>
