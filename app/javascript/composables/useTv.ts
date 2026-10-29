import { useEventListener } from "@vueuse/core"
import { type Ref, onBeforeUnmount, ref, watch } from "vue"

import { isBrowser } from "@/lib/browser"

// Kiosk/TV helpers for the full-screen singer views (Stage Mode, Live
// Sync). See components/karaoke/tv/TvShell.vue for how they're used.

// The control dock fades out while a song plays so nothing competes with
// the lyrics, and comes straight back on any mouse/air-mouse movement,
// touch, or remote/keyboard press. While paused it stays up.
export function useAutoHide(autoHide: Ref<boolean>, idleMs = 4000) {
  const visible = ref(true)
  let timer: ReturnType<typeof setTimeout> | null = null

  const clear = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  const poke = () => {
    visible.value = true
    clear()
    if (autoHide.value)
      timer = setTimeout(() => (visible.value = false), idleMs)
  }
  const hide = () => {
    clear()
    if (autoHide.value) visible.value = false
  }

  watch(autoHide, poke)
  if (isBrowser) {
    for (const ev of ["pointermove", "pointerdown", "wheel", "touchstart"]) {
      useEventListener(window, ev, poke, { passive: true })
    }
  }
  onBeforeUnmount(clear)

  return { visible, poke, hide }
}

export interface MediaSessionActions {
  play: () => void
  pause: () => void
  next?: () => void
  prev?: () => void
  restart?: () => void
}

// Bluetooth/HDMI-CEC remotes and keyboards' media keys arrive through the
// Media Session API rather than as key events in most TV browsers.
export function useMediaSession(
  meta: Ref<{ title: string; artist?: string | null } | null>,
  playing: Ref<boolean>,
  actions: MediaSessionActions,
) {
  if (!isBrowser || !("mediaSession" in navigator)) return
  const ms = navigator.mediaSession
  const set = (
    action: MediaSessionAction,
    handler: (() => void) | undefined,
  ) => {
    try {
      ms.setActionHandler(action, handler ? () => handler() : null)
    } catch {
      /* action not supported by this browser */
    }
  }

  set("play", actions.play)
  set("pause", actions.pause)
  set("nexttrack", actions.next)
  set("previoustrack", actions.prev)
  set("seekbackward", actions.restart)
  set("stop", actions.pause)

  watch(
    meta,
    (m) => {
      ms.metadata = m
        ? new MediaMetadata({ title: m.title, artist: m.artist ?? "" })
        : null
    },
    { immediate: true },
  )
  watch(
    playing,
    (p) => {
      ms.playbackState = p ? "playing" : "paused"
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    for (const a of [
      "play",
      "pause",
      "nexttrack",
      "previoustrack",
      "seekbackward",
      "stop",
    ] as MediaSessionAction[]) {
      set(a, undefined)
    }
    ms.metadata = null
  })
}

// Global stage shortcuts should never fire while typing, and Space/Enter
// belong to a focused button (activating it) rather than to the stage.
export function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  )
}

export function isButtonTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  return !!el && (el.tagName === "BUTTON" || el.tagName === "A")
}
