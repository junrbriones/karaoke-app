<script setup lang="ts">
import { Head, Link } from "@inertiajs/vue3"

import SetlistForm from "@/components/karaoke/SetlistForm.vue"
import { Button } from "@/components/ui/button"
import AppLayout from "@/layouts/AppLayout.vue"
import { groups as groupsRoutes, setlists as setlistsRoutes } from "@/routes"
import type { BreadcrumbItem, Group, Setlist } from "@/types"

const props = defineProps<{ group: Group; setlist: Setlist }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Groups", href: groupsRoutes.index().url },
  { title: props.group.name, href: groupsRoutes.show(props.group.slug).url },
  {
    title: "Setlists",
    href: setlistsRoutes.index({ group_id: props.group.slug }).url,
  },
  {
    title: props.setlist.name,
    href: setlistsRoutes.show({
      group_id: props.group.slug,
      id: props.setlist.slug,
    }).url,
  },
  {
    title: "Edit",
    href: setlistsRoutes.edit({
      group_id: props.group.slug,
      id: props.setlist.slug,
    }).url,
  },
]
</script>

<template>
  <Head :title="`Edit ${setlist.name}`" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="p-4">
      <h1 class="mb-4 text-2xl font-bold">Edit setlist</h1>
      <SetlistForm
        :setlist="setlist"
        :action="
          setlistsRoutes.update({ group_id: group.slug, id: setlist.slug })
        "
        submit-label="Save changes"
      >
        <template #extra-actions>
          <Link
            :href="
              setlistsRoutes.show({ group_id: group.slug, id: setlist.slug })
            "
          >
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
        </template>
      </SetlistForm>
    </div>
  </AppLayout>
</template>
