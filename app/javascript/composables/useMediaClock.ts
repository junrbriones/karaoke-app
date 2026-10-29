import { type Ref, onBeforeUnmount, ref, watch } from "vue"

// An <audio>/<video> element's currentTime, read on every animation frame
// while it plays. The element's own `timeupdate` event only fires a few
// times a second (~4Hz in Chrome), which makes a lyric color-sweep visibly
// step word-to-word instead of gliding; rAF gives a smooth 60fps sweep.
export function useMediaClock(media: Ref<HTMLMediaElement | null>) {
  const time = ref(0)
  const playing = ref(false)
  let raf: number | null = null

  const sync = () => {
    if (media.value) time.value = media.value.currentTime
  }
  const loop = () => {
    sync()
    raf = requestAnimationFrame(loop)
  }
  const start = () => {
    playing.value = true
    if (raf == null) raf = requestAnimationFrame(loop)
  }
  const stop = () => {
    playing.value = false
    if (raf != null) cancelAnimationFrame(raf)
    raf = null
    sync()
  }

  const handlers: [string, () => void][] = [
    ["play", start],
    ["playing", start],
    ["pause", stop],
    ["ended", stop],
    ["emptied", stop],
    ["seeked", sync],
    ["timeupdate", sync],
    ["loadedmetadata", sync],
  ]

  watch(
    media,
    (el, old) => {
      handlers.forEach(([ev, fn]) => old?.removeEventListener(ev, fn))
      handlers.forEach(([ev, fn]) => el?.addEventListener(ev, fn))
      if (el && !el.paused) start()
      else stop()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    handlers.forEach(([ev, fn]) => media.value?.removeEventListener(ev, fn))
    if (raf != null) cancelAnimationFrame(raf)
  })

  return { time, playing }
}
