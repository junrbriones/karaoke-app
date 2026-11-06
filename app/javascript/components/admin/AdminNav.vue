<script setup lang="ts">
import { Link } from "@inertiajs/vue3"

import { adminActivity, adminUsers } from "@/routes"

// Tabs across the admin pages.
defineProps<{ current: "users" | "activity" }>()

const tabs = [
  { key: "users", label: "Users", href: adminUsers.index().url },
  { key: "activity", label: "Activity", href: adminActivity.index().url },
] as const
</script>

<template>
  <nav class="flex gap-1 border-b" aria-label="Admin">
    <Link
      v-for="tab in tabs"
      :key="tab.key"
      :href="tab.href"
      class="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors"
      :class="
        current === tab.key
          ? 'border-primary text-foreground'
          : 'text-muted-foreground hover:text-foreground border-transparent'
      "
      :aria-current="current === tab.key ? 'page' : undefined"
    >
      {{ tab.label }}
    </Link>
  </nav>
</template>
