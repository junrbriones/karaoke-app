<script setup lang="ts">
import { Head, Link } from "@inertiajs/vue3"

import UserForm from "@/components/admin/UserForm.vue"
import { Button } from "@/components/ui/button"
import AppLayout from "@/layouts/AppLayout.vue"
import { adminUsers } from "@/routes"
import type { BreadcrumbItem } from "@/types"

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Admin", href: adminUsers.index().url },
  { title: "Users", href: adminUsers.index().url },
  { title: "New user", href: adminUsers.new().url },
]
</script>

<template>
  <Head title="New user" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="p-4">
      <h1 class="mb-4 text-2xl font-bold">New user</h1>
      <UserForm :action="adminUsers.create()" submit-label="Add user">
        <template #extra-actions>
          <Link :href="adminUsers.index()"
            ><Button type="button" variant="outline">Cancel</Button></Link
          >
        </template>
      </UserForm>
    </div>
  </AppLayout>
</template>
