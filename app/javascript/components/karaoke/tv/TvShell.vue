<script setup lang="ts">
import "@fontsource/montserrat/700.css"
import "@fontsource/montserrat/900.css"
import "./tv.css"

import { useEventListener, useWakeLock } from "@vueuse/core"
import { computed, nextTick, ref, watch } from "vue"

import { isTypingTarget, useAutoHide } from "@/composables/useTv"
import { isBrowser } from "@/lib/browser"

// Full-screen frame for the singer-facing TV views: a slim title bar, the
// stage, and a big control dock that's always reserved at the bottom (so
// the lyrics never move when it fades in or out).
//
// Remote / D-pad behavior, handled here for every TV page:
// - While the dock is hidden, the first arrow or Enter press only brings it
//   back and focuses the primary (Play) button -- nothing fires blind.
// - While shown, arrows move focus through the dock (or the open settings
//   panel): Left/Up = previous, Right/Down = next, wrapping around.
// - Escape hides the dock straight away while a song is playing.
// Page-level shortcuts (Space, N, etc.) are left to the page; this runs in
// the capture phase first and marks anything it handled with
// preventDefault, so a page handler should bail on `e.defaultPrevented`.
const props = defineProps<{
  title?: string
  subtitle?: string | null
  status?: string | null
  playing: boolean
  panelOpen?: boolean
}>()

const dock = ref<HTMLElement | null>(null)
const panelLayer = ref<HTMLElement | null>(null)
const autoHide = computed(() => props.playing && !props.panelOpen)
const { visible, poke, hide } = useAutoHide(autoHide)

// Keep a TV from dimming or sleeping mid-song.
const wakeLock = useWakeLock()
watch(
  () => props.playing,
  (playing) => {
    if (!wakeLock.isSupported.value) return
    if (playing) void wakeLock.request("screen").catch(() => {})
    else void wakeLock.release().catch(() => {})
  },
)

const FOCUSABLE =
  "button:not([disabled]), a[href], input:not([disabled]), [tabindex='0']"

function focusables(root: Element | null): HTMLElement[] {
  if (!root) return []
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null,
  )
}

function navRoot(): HTMLElement | null {
  return props.panelOpen ? panelLayer.value : dock.value
}

function focusPrimary() {
  const root = navRoot()
  const primary = root?.querySelector<HTMLElement>(
    "[data-tv-primary]:not([disabled])",
  )
  ;(primary ?? focusables(root)[0])?.focus()
}

const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]

function onKeydown(e: KeyboardEvent) {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
  const wasHidden = !visible.value
  poke()
  if (isTypingTarget(e)) return

  if (e.key === "Escape" && !props.panelOpen && !wasHidden && autoHide.value) {
    e.preventDefault()
    hide()
    return
  }

  const isArrow = ARROWS.includes(e.key)
  if (!isArrow && !(wasHidden && e.key === "Enter")) return
  e.preventDefault()

  if (wasHidden) {
    void nextTick(focusPrimary)
    return
  }

  const active = isBrowser ? (document.activeElement as HTMLElement) : null
  const group = active?.closest<HTMLElement>("[data-tv-nav]")
  if (!group || !navRoot()?.contains(group)) {
    focusPrimary()
    return
  }
  const items = focusables(group)
  if (!items.length) return
  const i = items.indexOf(active as HTMLElement)
  const dir = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1
  items[(i + dir + items.length) % items.length].focus()
}

if (isBrowser) useEventListener(window, "keydown", onKeydown, { capture: true })

// When the settings panel closes, hand focus back to the dock.
watch(
  () => props.panelOpen,
  (open) => {
    if (!open) void nextTick(focusPrimary)
  },
)

defineExpose({ poke })
</script>

<template>
  <div class="tv-theme tv-shell" :class="{ 'is-idle': !visible }">
    <header class="tv-header">
      <div class="tv-header__title">
        <slot name="title">
          {{ title }}
          <span v-if="subtitle" class="tv-header__subtitle"
            >&mdash; {{ subtitle }}</span
          >
        </slot>
      </div>
      <div v-if="status" class="tv-header__status">{{ status }}</div>
    </header>

    <main class="tv-main">
      <slot />
    </main>

    <footer class="tv-dock-wrap">
      <div
        ref="dock"
        class="tv-dock"
        data-tv-nav
        aria-label="Player controls"
        role="toolbar"
        :inert="!visible || panelOpen || undefined"
      >
        <slot name="dock" />
      </div>
    </footer>

    <div v-if="panelOpen" ref="panelLayer" class="tv-panel-layer">
      <slot name="panel" />
    </div>
  </div>
</template>

<style scoped>
.tv-shell {
  --tv-dock-h: clamp(124px, 17vh, 290px);
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) var(--tv-dock-h);
  /* minmax(0, ...) so a wide dock or lyric line can never stretch the page
     past the screen edge -- they scroll or shrink inside it instead. */
  grid-template-columns: minmax(0, 1fr);
  overflow: hidden;
}
.tv-shell.is-idle {
  cursor: none;
}
.tv-header {
  display: flex;
  align-items: center;
  gap: 2vh;
  min-height: max(40px, 6vh);
  padding: max(8px, 1.4vh) 3vw 0;
  font-size: max(15px, 2.4vh);
  font-weight: 700;
  transition: opacity 0.4s ease;
}
.is-idle .tv-header {
  opacity: 0.45;
}
.tv-header__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tv-header__subtitle {
  color: var(--tv-dim);
}
.tv-header__status {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0.3em 0.8em;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.1);
  color: var(--tv-dim);
  font-size: 0.85em;
  white-space: nowrap;
}
.tv-main {
  position: relative;
  min-height: 0;
}
.tv-dock-wrap {
  min-width: 0;
  min-height: 0;
  padding: 0 max(8px, 1.5vw) max(8px, 1.4vh);
}
.tv-dock {
  display: flex;
  align-items: center;
  height: 100%;
  padding: max(8px, 1.2vh) max(4px, 0.6vh);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  transition:
    opacity 0.35s ease,
    transform 0.35s ease;
}
.tv-dock::-webkit-scrollbar {
  display: none;
}
/* Centered when it fits, scrollable from the first button when it doesn't
   (plain justify-content: center would clip the start out of reach). */
.tv-dock > :deep(:first-child) {
  margin-left: auto;
}
.tv-dock > :deep(:last-child) {
  margin-right: auto;
}
.is-idle .tv-dock {
  opacity: 0;
  transform: translateY(25%);
  pointer-events: none;
}
.tv-panel-layer {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 0.8);
}
@media (prefers-reduced-motion: reduce) {
  .tv-dock,
  .tv-header {
    transition: none;
  }
}
</style>
