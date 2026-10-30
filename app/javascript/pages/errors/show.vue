<script setup lang="ts">
import { Head, Link } from "@inertiajs/vue3"
import {
  ArrowLeft,
  Check,
  Copy,
  ListMusic,
  LogIn,
  RotateCcw,
} from "lucide-vue-next"
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue"

import AppLogoIcon from "@/components/AppLogoIcon.vue"
import { Button } from "@/components/ui/button"
import {
  autoRetrySeconds,
  errorCopy,
  isRetryable,
  recoveryLinks,
} from "@/lib/errorCopy"
import { sessions, songs } from "@/routes"

// The friendly error page (see app/controllers/concerns/error_pages.rb):
// says what happened in plain words and always offers a way forward --
// try again, go back, or jump to the nearest page that still works.
const props = defineProps<{
  status: number
  path: string
  retry_path?: string | null
  request_id?: string | null
  signed_in: boolean
}>()

const copy = computed(() => errorCopy(props.status, props.path))
const nearby = computed(() => recoveryLinks(props.path))
const canRetry = computed(() => isRetryable(props.status) && !!props.retry_path)
const showReference = computed(() => props.status >= 500 && !!props.request_id)

/* ---- go back: only when there's somewhere to go back to (set after
   mount, so server and client render the same thing first) ---- */
const canGoBack = ref(false)
function goBack() {
  window.history.back()
}

function retry() {
  if (props.retry_path) window.location.assign(props.retry_path)
  else window.location.reload()
}

/* ---- server restarting/busy: try again on our own after a short wait ---- */
const countdown = ref<number | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
function cancelAutoRetry() {
  if (timer) clearInterval(timer)
  timer = null
  countdown.value = null
}
function startAutoRetry(seconds: number) {
  countdown.value = seconds
  timer = setInterval(() => {
    if (document.hidden || countdown.value == null) return
    countdown.value -= 1
    if (countdown.value <= 0) {
      cancelAutoRetry()
      retry()
    }
  }, 1000)
}

/* ---- error reference, for reporting a crash ---- */
const copied = ref(false)
async function copyReference() {
  if (!props.request_id) return
  try {
    await navigator.clipboard.writeText(props.request_id)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    /* clipboard blocked: the reference is on screen to copy by hand */
  }
}

const actions = ref<HTMLElement | null>(null)

onMounted(async () => {
  canGoBack.value = window.history.length > 1
  const seconds = autoRetrySeconds(props.status)
  if (seconds && props.retry_path) startAutoRetry(seconds)
  // Keyboard / TV remote: the main way out is focused and one press away.
  await nextTick()
  actions.value?.querySelector<HTMLElement>("a, button")?.focus()
})
onBeforeUnmount(cancelAutoRetry)
</script>

<template>
  <Head :title="copy.title" />

  <main
    class="bg-background text-foreground flex min-h-svh items-center justify-center p-6"
  >
    <div class="flex w-full max-w-lg flex-col items-center text-center">
      <Link
        :href="signed_in ? songs.index() : sessions.new()"
        class="mb-8 flex items-center gap-2 font-semibold"
      >
        <AppLogoIcon class="size-9" />
        <span>JBKaraoke</span>
      </Link>

      <p
        class="bg-gradient-to-br from-[#00e5ff] via-[#7c6bff] to-[#ff3df2] bg-clip-text text-7xl font-black tracking-tight text-transparent tabular-nums sm:text-8xl"
        aria-hidden="true"
      >
        {{ status }}
      </p>
      <h1 class="mt-3 text-2xl font-semibold text-balance">
        {{ copy.title }}
      </h1>
      <p class="text-muted-foreground mt-2 text-balance">
        {{ copy.message }}
      </p>
      <p
        v-if="status === 404"
        class="text-muted-foreground mt-3 max-w-full truncate font-mono text-xs"
        :title="path"
      >
        {{ path }}
      </p>

      <div
        ref="actions"
        class="mt-8 flex flex-wrap items-center justify-center gap-3"
      >
        <Button v-if="canRetry" size="lg" @click="retry">
          <RotateCcw class="size-4" /> Try again
        </Button>
        <Button
          v-if="canGoBack"
          size="lg"
          :variant="canRetry ? 'outline' : 'default'"
          @click="goBack"
        >
          <ArrowLeft class="size-4" /> Go back
        </Button>
        <Button
          v-if="signed_in"
          as-child
          size="lg"
          :variant="canRetry || canGoBack ? 'outline' : 'default'"
        >
          <Link :href="songs.index()"
            ><ListMusic class="size-4" /> My songs</Link
          >
        </Button>
        <Button
          v-else
          as-child
          size="lg"
          :variant="canRetry || canGoBack ? 'outline' : 'default'"
        >
          <Link :href="sessions.new()"><LogIn class="size-4" /> Sign in</Link>
        </Button>
      </div>

      <p
        v-if="countdown !== null"
        class="text-muted-foreground mt-4 text-sm"
        role="status"
      >
        Trying again in {{ countdown }}s&hellip;
        <button
          type="button"
          class="text-foreground underline underline-offset-4"
          @click="cancelAutoRetry"
        >
          Cancel
        </button>
      </p>

      <nav
        v-if="nearby.length"
        class="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm"
        aria-label="Nearby pages"
      >
        <span class="text-muted-foreground">Or go to:</span>
        <Link
          v-for="link in nearby"
          :key="link.href"
          :href="link.href"
          class="hover:bg-accent rounded-full border px-3 py-1"
        >
          {{ link.label }}
        </Link>
      </nav>

      <p
        v-if="showReference"
        class="text-muted-foreground mt-10 flex items-center gap-2 text-xs"
      >
        Error reference:
        <code class="bg-muted rounded px-1.5 py-0.5 font-mono">{{
          request_id
        }}</code>
        <button
          type="button"
          class="hover:text-foreground inline-flex items-center gap-1"
          :aria-label="copied ? 'Copied' : 'Copy error reference'"
          @click="copyReference"
        >
          <Check v-if="copied" class="size-3.5" />
          <Copy v-else class="size-3.5" />
        </button>
      </p>
    </div>
  </main>
</template>
