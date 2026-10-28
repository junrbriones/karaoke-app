<script setup lang="ts">
import { Head, Link } from "@inertiajs/vue3"

import GroupForm from "@/components/karaoke/GroupForm.vue"
import { Button } from "@/components/ui/button"
import AppLayout from "@/layouts/AppLayout.vue"
import { groups as groupsRoutes } from "@/routes"
import type { BreadcrumbItem, Group } from "@/types"

const props = defineProps<{ group: Group }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Groups", href: groupsRoutes.index().url },
  { title: props.group.name, href: groupsRoutes.show(props.group.slug).url },
  { title: "Edit", href: groupsRoutes.edit(props.group.slug).url },
]
</script>

<template>
  <Head :title="`Edit ${group.name}`" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="p-4">
      <h1 class="mb-4 text-2xl font-bold">Edit group</h1>
      <GroupForm
        :group="group"
        :action="groupsRoutes.update(group.slug)"
        submit-label="Save changes"
      >
        <template #extra-actions>
          <Link :href="groupsRoutes.show(group.slug)"
            ><Button type="button" variant="outline">Cancel</Button></Link
          >
        </template>
      </GroupForm>
    </div>
  </AppLayout>
</template>
