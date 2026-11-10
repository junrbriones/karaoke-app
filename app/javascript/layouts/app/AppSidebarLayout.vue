<script setup lang="ts">
import AppContent from "@/components/AppContent.vue"
import AppShell from "@/components/AppShell.vue"
import AppSidebar from "@/components/AppSidebar.vue"
import AppSidebarHeader from "@/components/AppSidebarHeader.vue"
import type { BreadcrumbItemType } from "@/types"

interface Props {
  breadcrumbs?: BreadcrumbItemType[]
}

withDefaults(defineProps<Props>(), {
  breadcrumbs: () => [],
})
</script>

<template>
  <AppShell variant="sidebar">
    <AppSidebar />
    <!-- overflow-x-clip, not -hidden: "hidden" turns this into a scroll
         container, which stops sticky panels (the karaoke sync's side by
         side, the guide's contents) from staying in view. -->
    <AppContent variant="sidebar" class="overflow-x-clip">
      <AppSidebarHeader :breadcrumbs="breadcrumbs" />
      <slot />
    </AppContent>
  </AppShell>
</template>
