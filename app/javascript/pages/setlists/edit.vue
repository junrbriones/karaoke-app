<script setup lang="ts">
import { Head, Link } from "@inertiajs/vue3"

import SetlistForm from "@/components/karaoke/SetlistForm.vue"
import { Button } from "@/components/ui/button"
import AppLayout from "@/layouts/AppLayout.vue"
import { mySetlists } from "@/routes"
import type { BreadcrumbItem, Setlist } from "@/types"

const props = defineProps<{ setlist: Setlist }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "My setlists", href: mySetlists.index().url },
  {
    title: props.setlist.name,
    href: mySetlists.show({ id: props.setlist.slug }).url,
  },
  { title: "Rename", href: mySetlists.edit({ id: props.setlist.slug }).url },
]
</script>

<template>
  <Head :title="`Rename ${setlist.name}`" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="p-4">
      <h1 class="mb-4 text-2xl font-bold">Rename setlist</h1>
      <SetlistForm
        :setlist="setlist"
        :action="mySetlists.update({ id: setlist.slug })"
        submit-label="Save"
      >
        <template #extra-actions>
          <Link :href="mySetlists.show({ id: setlist.slug })">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
        </template>
      </SetlistForm>
    </div>
  </AppLayout>
</template>
