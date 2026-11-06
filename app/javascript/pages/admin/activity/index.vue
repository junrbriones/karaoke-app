<script setup lang="ts">
import { Head, Link, router } from "@inertiajs/vue3"
import { useDebounceFn } from "@vueuse/core"
import { computed, ref, watch } from "vue"

import AdminNav from "@/components/admin/AdminNav.vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AppLayout from "@/layouts/AppLayout.vue"
import { describeUserAgent, timeAgo } from "@/lib/userAgent"
import { adminActivity, adminUsers } from "@/routes"
import type { BreadcrumbItem } from "@/types"

interface ActivityEvent {
  id: number
  at: string
  action: string
  label: string
  category: string
  outcome: "ok" | "failed"
  user_id: number | null
  actor: string | null
  subject: string | null
  subject_type: string | null
  details: {
    note?: string
    group?: string
    email?: string
    device?: string
    ip?: string
    errors?: Record<string, string>
  }
  ip_address: string | null
  user_agent: string | null
}

interface Filters {
  user_id: number | null
  category: string | null
  outcome: "failed" | null
  days: string
  q: string | null
}

const props = defineProps<{
  events: ActivityEvent[]
  next_before: number | null
  filters: Filters
  users: { id: number; name: string; email: string }[]
  categories: { value: string; label: string }[]
  summary: {
    sign_ins_today: number
    failed_sign_ins_today: number
    active_users_week: number
  }
  retention_days: number
}>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Admin", href: adminUsers.index().url },
  { title: "Activity", href: adminActivity.index().url },
]

const PERIODS = [
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
]

/* ---- filters: every change reloads the list (from the newest) ---- */
const userId = ref(props.filters.user_id ? String(props.filters.user_id) : "")
const category = ref(props.filters.category ?? "")
const failedOnly = ref(props.filters.outcome === "failed")
const days = ref(props.filters.days)
const search = ref(props.filters.q ?? "")

function query(extra: Record<string, unknown> = {}) {
  return {
    user_id: userId.value || undefined,
    category: category.value || undefined,
    outcome: failedOnly.value ? "failed" : undefined,
    days: days.value !== "7" ? days.value : undefined,
    q: search.value.trim() || undefined,
    ...extra,
  }
}
function reload(extra: Record<string, unknown> = {}) {
  router.get(
    adminActivity.index({ query: query(extra) }).url,
    {},
    {
      preserveState: true,
      preserveScroll: !("before" in extra),
      replace: true,
    },
  )
}
watch([userId, category, failedOnly, days], () => reload())
const searchLater = useDebounceFn(() => reload(), 350)
watch(search, () => void searchLater())

function onlyUser(id: number | null) {
  if (id == null) return
  userId.value = String(id)
}
function clearFilters() {
  userId.value = ""
  category.value = ""
  failedOnly.value = false
  days.value = "7"
  search.value = ""
}
const filtered = computed(
  () =>
    !!(
      userId.value ||
      category.value ||
      failedOnly.value ||
      days.value !== "7" ||
      search.value.trim()
    ),
)
const paged = computed(() =>
  new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  ).has("before"),
)

/* ---- the list, grouped by day ---- */
const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
  year: "numeric",
})
const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
})
const fullFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "full",
  timeStyle: "medium",
})
function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
  return dayFormat.format(d)
}
const days_ = computed(() => {
  const groups: { label: string; events: ActivityEvent[] }[] = []
  for (const e of props.events) {
    const label = dayLabel(e.at)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.events.push(e)
    else groups.push({ label, events: [e] })
  }
  return groups
})

function actorName(e: ActivityEvent): string {
  if (e.actor) return e.actor.replace(/\s*<[^>]*>$/, "")
  if (e.details.email) return e.details.email
  return "Someone"
}
function actorEmail(e: ActivityEvent): string | null {
  return e.actor?.match(/<([^>]*)>$/)?.[1] ?? null
}
function detailLine(e: ActivityEvent): string | null {
  const parts: string[] = []
  if (e.subject && e.subject_type !== "User") parts.push(`“${e.subject}”`)
  if (e.subject && e.subject_type === "User") parts.push(e.subject)
  if (e.details.group && e.subject !== e.details.group) {
    parts.push(`in ${e.details.group}`)
  }
  if (e.action === "sign_in_failed" && e.details.email) {
    parts.push(
      e.user_id ? "wrong password" : `no account for ${e.details.email}`,
    )
  }
  if (e.action === "session_revoked" && e.details.device) {
    parts.push(describeUserAgent(e.details.device))
  }
  const errors = e.details.errors ? Object.values(e.details.errors) : []
  if (e.outcome === "failed" && errors.length) parts.push(errors.join("; "))
  else if (e.details.note) parts.push(e.details.note)
  return parts.join(" · ") || null
}
const CATEGORY_TONE: Record<string, string> = {
  sign_in: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  account: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  admin: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  songs: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  groups: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
}
const categoryLabel = (value: string) =>
  props.categories.find((c) => c.value === value)?.label ?? value
</script>

<template>
  <Head title="Activity" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="flex flex-col gap-4 p-4">
      <AdminNav current="activity" />

      <!-- At a glance -->
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="bg-card rounded-xl border p-4">
          <p class="text-muted-foreground text-xs font-semibold uppercase">
            Sign-ins, last 24 hours
          </p>
          <p class="text-2xl font-bold tabular-nums">
            {{ summary.sign_ins_today }}
          </p>
        </div>
        <button
          type="button"
          class="bg-card rounded-xl border p-4 text-left transition-colors hover:border-amber-500/60"
          :class="
            summary.failed_sign_ins_today
              ? 'border-amber-500/50 bg-amber-500/5'
              : ''
          "
          title="Show failed sign-ins"
          @click="
            () => {
              category = 'sign_in'
              failedOnly = true
              days = '1'
            }
          "
        >
          <p class="text-muted-foreground text-xs font-semibold uppercase">
            Failed sign-ins, last 24 hours
          </p>
          <p
            class="text-2xl font-bold tabular-nums"
            :class="
              summary.failed_sign_ins_today
                ? 'text-amber-600 dark:text-amber-400'
                : ''
            "
          >
            {{ summary.failed_sign_ins_today }}
          </p>
        </button>
        <div class="bg-card rounded-xl border p-4">
          <p class="text-muted-foreground text-xs font-semibold uppercase">
            Active people, last 7 days
          </p>
          <p class="text-2xl font-bold tabular-nums">
            {{ summary.active_users_week }}
          </p>
        </div>
      </div>

      <!-- Filters -->
      <div
        class="bg-card flex flex-wrap items-center gap-2 rounded-xl border p-3"
      >
        <select
          v-model="userId"
          class="border-input bg-background h-9 rounded-md border px-2 text-sm"
          aria-label="Person"
        >
          <option value="">Everyone</option>
          <option v-for="u in users" :key="u.id" :value="String(u.id)">
            {{ u.name }} ({{ u.email }})
          </option>
        </select>
        <select
          v-model="category"
          class="border-input bg-background h-9 rounded-md border px-2 text-sm"
          aria-label="Kind of activity"
        >
          <option value="">All activity</option>
          <option v-for="c in categories" :key="c.value" :value="c.value">
            {{ c.label }}
          </option>
        </select>
        <select
          v-model="days"
          class="border-input bg-background h-9 rounded-md border px-2 text-sm"
          aria-label="Period"
        >
          <option v-for="p in PERIODS" :key="p.value" :value="p.value">
            {{ p.label }}
          </option>
        </select>
        <label class="flex items-center gap-2 px-1 text-sm">
          <input v-model="failedOnly" type="checkbox" />
          Failed only
        </label>
        <Input
          v-model="search"
          class="h-9 w-56"
          type="search"
          placeholder="Search names, songs, IPs…"
          aria-label="Search"
        />
        <Button v-if="filtered" size="sm" variant="ghost" @click="clearFilters">
          Clear
        </Button>
      </div>

      <!-- The log -->
      <div class="bg-card rounded-xl border">
        <p
          v-if="!events.length"
          class="text-muted-foreground p-6 text-center text-sm"
        >
          Nothing {{ filtered ? "matches these filters" : "recorded yet" }}.
        </p>
        <section v-for="day in days_" :key="day.label">
          <h2
            class="bg-muted/40 text-muted-foreground sticky top-0 border-b px-4 py-1.5 text-xs font-semibold tracking-wide uppercase"
          >
            {{ day.label }}
          </h2>
          <ul class="divide-y">
            <li
              v-for="e in day.events"
              :key="e.id"
              class="grid gap-x-4 gap-y-1 px-4 py-2.5 text-sm md:grid-cols-[5.5rem_minmax(0,14rem)_minmax(0,1fr)_minmax(0,13rem)]"
              :class="e.outcome === 'failed' ? 'bg-amber-500/5' : ''"
            >
              <time
                class="text-muted-foreground tabular-nums"
                :datetime="e.at"
                :title="`${fullFormat.format(new Date(e.at))} (${timeAgo(e.at)})`"
                >{{ timeFormat.format(new Date(e.at)) }}</time
              >
              <div class="min-w-0">
                <button
                  v-if="e.user_id"
                  type="button"
                  class="truncate font-medium hover:underline"
                  :title="`Only ${actorName(e)}'s activity`"
                  @click="onlyUser(e.user_id)"
                >
                  {{ actorName(e) }}
                </button>
                <span v-else class="truncate font-medium">{{
                  actorName(e)
                }}</span>
                <p
                  v-if="actorEmail(e)"
                  class="text-muted-foreground truncate text-xs"
                >
                  {{ actorEmail(e) }}
                </p>
              </div>
              <div class="min-w-0">
                <p class="flex flex-wrap items-center gap-2">
                  <span
                    class="rounded px-1.5 py-0.5 text-[0.7rem] font-semibold"
                    :class="CATEGORY_TONE[e.category]"
                    >{{ categoryLabel(e.category) }}</span
                  >
                  <span class="font-medium">{{ e.label }}</span>
                  <Badge
                    v-if="e.outcome === 'failed'"
                    variant="outline"
                    class="border-amber-500/60 text-amber-700 dark:text-amber-400"
                    >didn't go through</Badge
                  >
                </p>
                <p
                  v-if="detailLine(e)"
                  class="text-muted-foreground mt-0.5 truncate text-xs"
                  :title="detailLine(e) ?? undefined"
                >
                  {{ detailLine(e) }}
                </p>
              </div>
              <div class="text-muted-foreground min-w-0 text-xs md:text-right">
                <p class="truncate" :title="e.user_agent ?? undefined">
                  {{ describeUserAgent(e.user_agent) }}
                </p>
                <p class="truncate tabular-nums">{{ e.ip_address }}</p>
              </div>
            </li>
          </ul>
        </section>
        <div
          v-if="next_before || paged"
          class="flex items-center justify-between gap-2 border-t px-4 py-3"
        >
          <Link
            v-if="paged"
            :href="adminActivity.index({ query: query() }).url"
            class="text-sm underline-offset-2 hover:underline"
            >&larr; Back to the newest</Link
          >
          <span v-else></span>
          <Button
            v-if="next_before"
            size="sm"
            variant="outline"
            @click="reload({ before: next_before })"
          >
            Older entries &rarr;
          </Button>
        </div>
      </div>

      <p class="text-muted-foreground text-xs">
        Sign-ins (and failed attempts), sign-outs, account changes, and changes
        to songs, groups and live sessions are logged, with the device and IP
        address they came from. Page views and live-session play/pause commands
        aren't. Entries older than {{ retention_days }} days are removed
        automatically.
      </p>
    </div>
  </AppLayout>
</template>
