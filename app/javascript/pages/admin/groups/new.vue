<script setup lang="ts">
import { Head, Link } from "@inertiajs/vue3"

import GroupForm from "@/components/karaoke/GroupForm.vue"
import { Button } from "@/components/ui/button"
import AppLayout from "@/layouts/AppLayout.vue"
import { adminGroups, groups as groupsRoutes } from "@/routes"
import type { BreadcrumbItem } from "@/types"

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Groups", href: groupsRoutes.index().url },
  { title: "New group", href: adminGroups.new().url },
]
</script>

<template>
  <Head title="New group" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="p-4">
      <h1 class="mb-4 text-2xl font-bold">New group</h1>
      <p class="text-muted-foreground mb-4 max-w-sm text-sm">
        You'll be added as its owner, and can invite other members by email from
        the group page once it's created.
      </p>
      <GroupForm :action="adminGroups.create()" submit-label="Create group">
        <template #extra-actions>
          <Link :href="groupsRoutes.index()"
            ><Button type="button" variant="outline">Cancel</Button></Link
          >
        </template>
      </GroupForm>
    </div>
  </AppLayout>
</template>
