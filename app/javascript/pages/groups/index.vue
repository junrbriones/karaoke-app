<script setup lang="ts">
import { Head, Link, usePage } from "@inertiajs/vue3"

import { Button } from "@/components/ui/button"
import AppLayout from "@/layouts/AppLayout.vue"
import { adminGroups, groups as groupsRoutes } from "@/routes"
import type { BreadcrumbItem, Group, User } from "@/types"

defineProps<{ groups: Group[] }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Groups", href: groupsRoutes.index().url },
]

const page = usePage()
const auth = page.props.auth as { user: User }
</script>

<template>
  <Head title="Groups" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="flex flex-col gap-4 p-4">
      <div class="flex items-center justify-between">
        <p class="text-muted-foreground max-w-lg text-sm">
          A group is a shared songbook for a band. Everyone in the group can
          view and run any song a member shares into it.
        </p>
        <Link v-if="auth.user.admin" :href="adminGroups.new()">
          <Button>+ New group</Button>
        </Link>
      </div>

      <div
        v-if="groups.length"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Link
          v-for="group in groups"
          :key="group.id"
          :href="groupsRoutes.show(group.slug)"
          class="bg-card hover:border-primary/50 flex flex-col gap-1 rounded-xl border p-4 shadow-sm transition-colors"
        >
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">{{ group.name }}</h3>
            <span
              v-if="group.is_owner"
              class="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium"
            >
              Owner
            </span>
          </div>
          <p class="text-muted-foreground text-sm">
            {{ group.member_count }} member{{
              group.member_count === 1 ? "" : "s"
            }}
          </p>
        </Link>
      </div>
      <p v-else class="text-muted-foreground py-10 text-center">
        You're not in any groups yet &mdash; create one to start sharing songs
        with your band.
      </p>
    </div>
  </AppLayout>
</template>
