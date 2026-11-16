<script setup lang="ts">
import { Head, Link, router } from "@inertiajs/vue3"
import { Check, Copy, Play, Share2 } from "lucide-vue-next"
import { computed, ref } from "vue"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AppLayout from "@/layouts/AppLayout.vue"
import {
  mySetlistSongs,
  mySetlists,
  sharedSetlists,
  songs as songsRoutes,
} from "@/routes"
import type { BreadcrumbItem, Setlist } from "@/types"

const props = defineProps<{ setlist: Setlist }>()

// Your own setlist (the editor), or one someone else shared with everyone
// (read-only).
const isOwner = computed(() => props.setlist.is_owner !== false)

const breadcrumbs: BreadcrumbItem[] = [
  {
    title: isOwner.value ? "My setlists" : "Setlists",
    href: mySetlists.index().url,
  },
  {
    title: props.setlist.name,
    href: isOwner.value
      ? mySetlists.show({ id: props.setlist.slug }).url
      : sharedSetlists.show({ id: props.setlist.id }).url,
  },
]

const entries = computed(() => props.setlist.entries ?? [])
const playable = computed(() => entries.value.filter((e) => !e.unavailable))

// Stage Mode, from the top or from one song (its place among the songs
// that play).
function stageUrl(start?: number) {
  const options = start ? { query: { start } } : undefined
  return isOwner.value
    ? mySetlists.stage({ id: props.setlist.slug }, options).url
    : sharedSetlists.stage({ id: props.setlist.id }, options).url
}
function playableIndex(entryId: number) {
  return playable.value.findIndex((e) => e.id === entryId)
}

/* ---- sharing with everyone ---- */
function setShared(shared: boolean) {
  if (
    shared &&
    !confirm(
      `Share "${props.setlist.name}" with everyone who uses JBKaraoke? They'll be able to open it and play it in Stage Mode, including your own songs in it.`,
    )
  )
    return
  router.patch(
    mySetlists.share({ id: props.setlist.slug }).url,
    { shared },
    { preserveScroll: true },
  )
}
const copied = ref(false)
async function copyLink() {
  if (!props.setlist.shared_url) return
  try {
    await navigator.clipboard.writeText(props.setlist.shared_url)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // No clipboard (not https): the link is on screen to copy by hand.
  }
}

function entryParams(id: number) {
  return { my_setlist_id: props.setlist.slug, id }
}
function moveEntry(id: number, direction: "up" | "down") {
  router.patch(
    mySetlistSongs.move(entryParams(id)).url,
    { direction },
    { preserveScroll: true },
  )
}
function removeEntry(title: string, id: number) {
  if (confirm(`Remove "${title}" from this setlist?`)) {
    router.delete(mySetlistSongs.destroy(entryParams(id)).url, {
      preserveScroll: true,
    })
  }
}
function addSong(songId: number) {
  router.post(
    mySetlistSongs.create({ my_setlist_id: props.setlist.slug }).url,
    { song_id: songId },
    { preserveScroll: true },
  )
}
function destroySetlist() {
  if (confirm(`Delete "${props.setlist.name}"? This cannot be undone.`)) {
    router.delete(mySetlists.destroy({ id: props.setlist.slug }).url)
  }
}

/* ---- add a song: everything you can open, filtered as you type ---- */
const search = ref("")
const availableSongs = computed(() => {
  const all = props.setlist.available_songs ?? []
  const q = search.value.trim().toLowerCase()
  if (!q) return all
  return all.filter((s) =>
    [s.title, s.artist, s.owner_name]
      .filter(Boolean)
      .some((t) => t!.toLowerCase().includes(q)),
  )
})
</script>

<template>
  <Head :title="setlist.name" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="flex flex-col gap-4 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">{{ setlist.name }}</h1>
          <p class="text-muted-foreground text-sm">
            {{ entries.length }} song{{ entries.length === 1 ? "" : "s" }}
            <template v-if="!isOwner">
              &middot; shared by {{ setlist.owner_name }}</template
            >
            <template v-else-if="setlist.shared">
              &middot; shared with everyone</template
            >
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Link v-if="playable.length" :href="stageUrl()">
            <Button>Start Stage Mode</Button>
          </Link>
          <template v-if="isOwner">
            <Link :href="mySetlists.edit({ id: setlist.slug })">
              <Button variant="outline">Rename</Button>
            </Link>
            <Button variant="destructive" @click="destroySetlist"
              >Delete setlist</Button
            >
          </template>
        </div>
      </div>

      <!-- sharing (the owner's) -->
      <div
        v-if="isOwner"
        class="bg-card flex flex-col gap-2 rounded-xl border p-4"
        :class="setlist.shared ? 'border-primary/40' : ''"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2
            class="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase"
          >
            <Share2 class="size-4" /> Sharing
          </h2>
          <Button
            size="sm"
            :variant="setlist.shared ? 'outline' : 'default'"
            @click="setShared(!setlist.shared)"
          >
            {{ setlist.shared ? "Stop sharing" : "Share with everyone" }}
          </Button>
        </div>
        <p v-if="!setlist.shared" class="text-muted-foreground text-sm">
          Only you can see this setlist. Share it and everyone who uses
          JBKaraoke can find it under Setlists, open it, and play it in Stage
          Mode &mdash; only you can change it.
        </p>
        <template v-else>
          <p class="text-sm">
            Everyone who uses JBKaraoke can open this setlist and play it in
            Stage Mode. Your own songs in it go with it; songs you have from
            your groups only play for people who can open them anyway. Only you
            can change it.
          </p>
          <div v-if="setlist.shared_url" class="flex items-center gap-2">
            <code
              class="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1 text-xs"
              >{{ setlist.shared_url }}</code
            >
            <Button
              size="sm"
              variant="outline"
              :aria-label="copied ? 'Copied' : 'Copy link'"
              @click="copyLink"
            >
              <Check v-if="copied" class="size-4 text-green-600" />
              <Copy v-else class="size-4" />
              {{ copied ? "Copied" : "Copy link" }}
            </Button>
          </div>
        </template>
      </div>

      <div class="bg-card rounded-xl border p-4">
        <h2
          class="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase"
        >
          Running order
        </h2>
        <ol v-if="entries.length" class="flex flex-col gap-2">
          <li
            v-for="(entry, index) in entries"
            :key="entry.id"
            class="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
            :class="entry.unavailable ? 'opacity-60' : ''"
          >
            <span class="flex min-w-0 flex-wrap items-center gap-x-2">
              <span class="text-muted-foreground w-5 text-right font-mono"
                >{{ index + 1 }}.</span
              >
              <Link
                v-if="!entry.unavailable && entry.openable !== false"
                :href="songsRoutes.show(entry.song.slug)"
                class="font-medium hover:underline"
                >{{ entry.song.title }}</Link
              >
              <span v-else class="font-medium">{{ entry.song.title }}</span>
              <span v-if="entry.song.artist" class="text-muted-foreground">
                &mdash; {{ entry.song.artist }}
              </span>
              <span
                v-if="entry.unavailable"
                class="text-xs text-amber-600 dark:text-amber-500"
              >
                {{
                  isOwner ? "no longer shared with you" : "not shared with you"
                }}
                &mdash; skipped in Stage Mode
              </span>
              <span
                v-else-if="
                  !entry.song.owned &&
                  entry.song.owner_name &&
                  entry.song.owner_name !== setlist.owner_name
                "
                class="text-muted-foreground text-xs"
              >
                (shared by {{ entry.song.owner_name }})
              </span>
            </span>
            <span class="flex items-center gap-1">
              <Link
                v-if="!entry.unavailable"
                :href="stageUrl(playableIndex(entry.id))"
                :title="`Play from ${entry.song.title} in Stage Mode`"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  :aria-label="`Play from ${entry.song.title}`"
                >
                  <Play class="size-3.5" />
                </Button>
              </Link>
              <template v-if="isOwner">
                <Button
                  variant="ghost"
                  size="sm"
                  :disabled="index === 0"
                  title="Move up"
                  @click="moveEntry(entry.id, 'up')"
                >
                  &#9650;
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  :disabled="index === entries.length - 1"
                  title="Move down"
                  @click="moveEntry(entry.id, 'down')"
                >
                  &#9660;
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  @click="removeEntry(entry.song.title, entry.id)"
                >
                  Remove
                </Button>
              </template>
            </span>
          </li>
        </ol>
        <p v-else class="text-muted-foreground text-sm">
          No songs in this setlist yet<template v-if="isOwner">
            &mdash; add some below</template
          >.
        </p>
      </div>

      <div v-if="isOwner" class="bg-card rounded-xl border p-4">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2
            class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Add a song
          </h2>
          <Input
            v-model="search"
            type="search"
            class="h-8 w-56"
            placeholder="Find a song or artist…"
            aria-label="Find a song"
          />
        </div>
        <ul
          v-if="availableSongs.length"
          class="flex max-h-96 flex-col gap-2 overflow-y-auto"
        >
          <li
            v-for="song in availableSongs"
            :key="song.id"
            class="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span>
              <span class="font-medium">{{ song.title }}</span>
              <span v-if="song.artist" class="text-muted-foreground">
                &mdash; {{ song.artist }}</span
              >
              <span
                v-if="!song.owned && song.owner_name"
                class="text-muted-foreground text-xs"
              >
                (shared by {{ song.owner_name }})
              </span>
            </span>
            <Button variant="outline" size="sm" @click="addSong(song.id)"
              >+ Add</Button
            >
          </li>
        </ul>
        <p v-else-if="search" class="text-muted-foreground text-sm">
          No other songs match &ldquo;{{ search }}&rdquo;.
        </p>
        <p v-else class="text-muted-foreground text-sm">
          Every song you can open is already in this setlist.
        </p>
      </div>
    </div>
  </AppLayout>
</template>
