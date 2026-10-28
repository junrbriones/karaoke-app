<script setup lang="ts">
import { Head, Link } from "@inertiajs/vue3"

import SetlistForm from "@/components/karaoke/SetlistForm.vue"
import { Button } from "@/components/ui/button"
import AppLayout from "@/layouts/AppLayout.vue"
import { groups as groupsRoutes, setlists as setlistsRoutes } from "@/routes"
import type { BreadcrumbItem, Group } from "@/types"

const props = defineProps<{ group: Group }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Groups", href: groupsRoutes.index().url },
  { title: props.group.name, href: groupsRoutes.show(props.group.slug).url },
  {
    title: "Setlists",
    href: setlistsRoutes.index({ group_id: props.group.slug }).url,
  },
  {
    title: "New setlist",
    href: setlistsRoutes.new({ group_id: props.group.slug }).url,
  },
]
</script>

<template>
  <Head title="New setlist" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="p-4">
      <h1 class="mb-4 text-2xl font-bold">New setlist</h1>
      <SetlistForm
        :action="setlistsRoutes.create({ group_id: group.slug })"
        submit-label="Create setlist"
      >
        <template #extra-actions>
          <Link :href="setlistsRoutes.index({ group_id: group.slug })">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
        </template>
      </SetlistForm>
    </div>
  </AppLayout>
</template>
