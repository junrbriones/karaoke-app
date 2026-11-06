<script setup lang="ts">
import { Head, Link } from "@inertiajs/vue3"

import AdminNav from "@/components/admin/AdminNav.vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import AppLayout from "@/layouts/AppLayout.vue"
import { timeAgo } from "@/lib/userAgent"
import { adminActivity, adminUsers } from "@/routes"
import type { BreadcrumbItem } from "@/types"

interface AdminUser {
  id: number
  name: string
  email: string
  admin: boolean
  verified: boolean
  created_at: string
  last_sign_in_at: string | null
  last_active_at: string | null
  failed_sign_ins_today: number
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
      <AdminNav current="users" />
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
            <span class="text-muted-foreground flex items-center gap-3 text-xs">
              <Badge
                v-if="user.failed_sign_ins_today"
                variant="outline"
                class="border-amber-500/60 text-amber-700 dark:text-amber-400"
                >{{ user.failed_sign_ins_today }} failed sign-in{{
                  user.failed_sign_ins_today === 1 ? "" : "s"
                }}
                today</Badge
              >
              <span
                :title="
                  user.last_sign_in_at
                    ? new Date(user.last_sign_in_at).toLocaleString()
                    : undefined
                "
                >{{
                  user.last_sign_in_at
                    ? `Last signed in ${timeAgo(user.last_sign_in_at)}`
                    : "No sign-ins logged"
                }}</span
              >
              <Link
                :href="
                  adminActivity.index({
                    query: { user_id: user.id, days: 'all' },
                  }).url
                "
                class="underline-offset-2 hover:underline"
                >Activity</Link
              >
            </span>
          </li>
        </ul>
      </div>
    </div>
  </AppLayout>
</template>
