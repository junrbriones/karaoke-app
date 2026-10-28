<script setup lang="ts">
import { Form, Head, Link, router, usePage } from "@inertiajs/vue3"
import { LoaderCircle } from "lucide-vue-next"
import { computed, ref } from "vue"

import SongCard from "@/components/karaoke/SongCard.vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import AppLayout from "@/layouts/AppLayout.vue"
import {
  groups as groupsRoutes,
  liveSession as liveSessionRoutes,
  memberships as membershipsRoutes,
  setlists as setlistsRoutes,
} from "@/routes"
import type { BreadcrumbItem, Group, LiveSessionSummary, Song } from "@/types"

const props = defineProps<{
  group: Group
  songs: Song[]
  live_session: LiveSessionSummary | null
}>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Groups", href: groupsRoutes.index().url },
  { title: props.group.name, href: groupsRoutes.show(props.group.slug).url },
]

const { auth } = usePage().props

const members = computed(() => props.group.members ?? [])
const ownMembership = computed(() =>
  members.value.find((m) => m.user_id === auth.user.id),
)

function removeMember(membershipId: number) {
  router.delete(
    membershipsRoutes.destroy({ group_id: props.group.slug, id: membershipId })
      .url,
    { preserveScroll: true },
  )
}

function leaveGroup() {
  if (!ownMembership.value) return
  if (
    confirm(
      `Leave "${props.group.name}"? You'll lose access to its shared songs.`,
    )
  ) {
    removeMember(ownMembership.value.id)
  }
}

function removeOtherMember(memberName: string, membershipId: number) {
  if (confirm(`Remove ${memberName} from "${props.group.name}"?`)) {
    removeMember(membershipId)
  }
}

function destroyGroup() {
  if (
    confirm(
      `Delete "${props.group.name}"? This removes every member and unshares all songs. This cannot be undone.`,
    )
  ) {
    router.delete(groupsRoutes.destroy(props.group.slug).url)
  }
}

const query = ref("")
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.songs
  return props.songs.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      (s.artist ?? "").toLowerCase().includes(q),
  )
})

const goLiveSongId = ref<number | null>(props.songs[0]?.id ?? null)
function startLiveSession() {
  if (!goLiveSongId.value) return
  router.post(
    liveSessionRoutes.create({ group_id: props.group.slug }).url,
    { song_id: goLiveSongId.value },
    { preserveScroll: true },
  )
}
</script>

<template>
  <Head :title="group.name" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="flex flex-col gap-4 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">{{ group.name }}</h1>
          <p class="text-muted-foreground text-sm">
            {{ group.member_count }} member{{
              group.member_count === 1 ? "" : "s"
            }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Link :href="setlistsRoutes.index({ group_id: group.slug })">
            <Button variant="outline">Setlists</Button>
          </Link>
          <template v-if="group.is_owner">
            <Link :href="groupsRoutes.edit(group.slug)">
              <Button variant="outline">Edit group</Button>
            </Link>
            <Button variant="destructive" @click="destroyGroup"
              >Delete group</Button
            >
          </template>
          <Button v-else variant="outline" @click="leaveGroup"
            >Leave group</Button
          >
        </div>
      </div>

      <div class="bg-card rounded-xl border p-4">
        <h2
          class="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase"
        >
          Members
        </h2>
        <ul class="flex flex-col gap-2">
          <li
            v-for="member in members"
            :key="member.id"
            class="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span class="flex items-center gap-2">
              <span class="font-medium">{{ member.name }}</span>
              <span class="text-muted-foreground">{{ member.email }}</span>
              <Badge
                :variant="member.role === 'owner' ? 'default' : 'secondary'"
              >
                {{ member.role }}
              </Badge>
            </span>
            <Button
              v-if="group.is_owner && member.role !== 'owner'"
              variant="ghost"
              size="sm"
              @click="removeOtherMember(member.name, member.id)"
            >
              Remove
            </Button>
          </li>
        </ul>

        <Form
          v-if="group.is_owner"
          :action="membershipsRoutes.create({ group_id: group.slug })"
          :options="{ preserveScroll: true }"
          reset-on-success
          class="mt-4 flex flex-wrap items-end gap-3 border-t pt-4"
          #default="{ errors, processing }"
        >
          <FieldGroup class="max-w-xs flex-1">
            <Field>
              <FieldLabel for="email">Add a member by email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="bandmate@example.com"
              />
              <FieldError :errors="errors.email" />
            </Field>
          </FieldGroup>
          <Button type="submit" :disabled="processing">
            <LoaderCircle v-if="processing" class="size-4 animate-spin" />
            Add member
          </Button>
        </Form>
        <p v-else class="text-muted-foreground mt-3 border-t pt-3 text-xs">
          Only the group owner can add or remove members.
        </p>
      </div>

      <div class="bg-card rounded-xl border p-4">
        <template v-if="live_session">
          <p class="text-sm">
            <span class="mr-1 text-red-500">&#9679;</span>
            <span class="font-semibold">Live now</span> &mdash;
            {{ live_session.current_song_title ?? "a song" }}, led by
            {{ live_session.leader_name }}.
          </p>
          <Link
            :href="liveSessionRoutes.show({ group_id: group.slug })"
            class="mt-2 inline-block"
          >
            <Button>Join live session</Button>
          </Link>
        </template>
        <template v-else-if="songs.length">
          <h2
            class="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase"
          >
            Go live
          </h2>
          <p class="text-muted-foreground mb-3 text-sm">
            Pick a song and everyone in {{ group.name }} who opens the group's
            Live page will see it scroll and highlight in sync, live.
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <select
              v-model.number="goLiveSongId"
              class="bg-background rounded border px-2 py-1.5 text-sm"
            >
              <option v-for="song in songs" :key="song.id" :value="song.id">
                {{ song.title }}
              </option>
            </select>
            <Button @click="startLiveSession">Start live session</Button>
          </div>
        </template>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <Input
          v-model="query"
          type="search"
          placeholder="Search this group's songs&hellip;"
          class="max-w-xs"
        />
      </div>

      <div
        v-if="filtered.length"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <SongCard v-for="song in filtered" :key="song.id" :song="song" />
      </div>
      <p
        v-else-if="songs.length"
        class="text-muted-foreground py-10 text-center"
      >
        No songs match &quot;{{ query }}&quot;.
      </p>
      <p v-else class="text-muted-foreground py-10 text-center">
        No songs shared here yet. Members can share a song into this group from
        the song's page.
      </p>
    </div>
  </AppLayout>
</template>
