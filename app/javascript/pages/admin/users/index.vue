<script setup lang="ts">
import { Head, Link } from "@inertiajs/vue3"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import AppLayout from "@/layouts/AppLayout.vue"
import { adminUsers } from "@/routes"
import type { BreadcrumbItem } from "@/types"

interface AdminUser {
  id: number
  name: string
  email: string
  admin: boolean
  verified: boolean
  created_at: string
}

defineProps<{ users: AdminUser[] }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Admin", href: adminUsers.index().url },
  { title: "Users", href: adminUsers.index().url },
]
</script>

<template>
  <Head title="Users" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="flex flex-col gap-4 p-4">
      <div class="flex items-center justify-between">
        <p class="text-muted-foreground max-w-lg text-sm">
          Only an admin can add a user &mdash; there's no public sign-up.
          Promoting someone to admin isn't done here; it's a
          <code class="bg-muted rounded px-1">rails console</code> change.
        </p>
        <Link :href="adminUsers.new()">
          <Button>+ New user</Button>
        </Link>
      </div>

      <div class="bg-card rounded-xl border p-4">
        <ul class="flex flex-col gap-2">
          <li
            v-for="user in users"
            :key="user.id"
            class="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span class="flex items-center gap-2">
              <span class="font-medium">{{ user.name }}</span>
              <span class="text-muted-foreground">{{ user.email }}</span>
              <Badge v-if="user.admin" variant="default">admin</Badge>
              <Badge v-if="!user.verified" variant="secondary"
                >unverified</Badge
              >
            </span>
          </li>
        </ul>
      </div>
    </div>
  </AppLayout>
</template>
