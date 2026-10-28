<script setup lang="ts">
import { Link, usePage } from "@inertiajs/vue3"
import { ListMusic, ShieldCheck, Users } from "lucide-vue-next"
import { computed } from "vue"

import NavFooter from "@/components/NavFooter.vue"
import NavMain from "@/components/NavMain.vue"
import NavUser from "@/components/NavUser.vue"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { adminUsers, groups, songs } from "@/routes"
import { type NavItem, type User } from "@/types"

import AppLogo from "./AppLogo.vue"

const page = usePage()

const mainNavItems = computed<NavItem[]>(() => {
  const items: NavItem[] = [
    {
      title: "Songs",
      href: songs.index().url,
      icon: ListMusic,
    },
    {
      title: "Groups",
      href: groups.index().url,
      icon: Users,
    },
  ]

  const auth = page.props.auth as { user: User }
  if (auth.user.admin) {
    items.push({
      title: "Admin",
      href: adminUsers.index().url,
      icon: ShieldCheck,
    })
  }

  return items
})

const footerNavItems: NavItem[] = [
  // {
  //   title: "Github Repo",
  //   href: "https://github.com/inertia-rails/vue-starter-kit",
  //   icon: Folder,
  // },
  // {
  //   title: "Documentation",
  //   href: "https://inertia-rails.dev",
  //   icon: BookOpen,
  // },
]
</script>

<template>
  <Sidebar collapsible="icon" variant="inset">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" as-child>
            <Link :href="songs.index()">
              <AppLogo />
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarContent>
      <NavMain :items="mainNavItems" />
    </SidebarContent>

    <SidebarFooter>
      <NavFooter :items="footerNavItems" />
      <NavUser />
    </SidebarFooter>
  </Sidebar>
  <slot />
</template>
