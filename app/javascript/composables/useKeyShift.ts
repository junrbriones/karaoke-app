import { type Ref, onBeforeUnmount, ref, watch } from "vue"

import { isBrowser } from "@/lib/browser"
import { PITCH_PROCESSOR_NAME, workletSource } from "@/lib/pitchShift"

// Routes an <audio> element through the pitch-shift AudioWorklet so the
// backing track's key can change without its tempo changing (see
// lib/pitchShift.ts). The Web Audio graph is only built the first time the
// key actually moves off 0 -- until then playback is the plain, untouched
// <audio> element, so a browser that can't do this loses nothing.
//
// AudioWorklet needs a secure context: https, or http://localhost. A TV
// opening the app over plain http on a LAN IP won't have it, and `supported`
// is false there.
export function useKeyShift(
  media: Ref<HTMLMediaElement | null>,
  semitones: Ref<number>,
) {
  const supported = ref(
    isBrowser &&
      typeof window.AudioWorkletNode !== "undefined" &&
      window.isSecureContext,
  )
  const failed = ref(false)

  let ctx: AudioContext | null = null
  let node: AudioWorkletNode | null = null
  let building: Promise<boolean> | null = null
  let boundTo: HTMLMediaElement | null = null

  async function build(el: HTMLMediaElement): Promise<boolean> {
    const context = new AudioContext()
    const url = URL.createObjectURL(
      new Blob([workletSource()], { type: "application/javascript" }),
    )
    try {
      await context.audioWorklet.addModule(url)
    } catch {
      // Nothing is wired up yet, so the element still plays normally.
      void context.close()
      failed.value = true
      return false
    } finally {
      URL.revokeObjectURL(url)
    }
    // From here on the element's sound only reaches the speakers through
    // this graph -- createMediaElementSource can only ever be called once
    // per element, so the graph stays for the element's lifetime.
    const source = context.createMediaElementSource(el)
    node = new AudioWorkletNode(context, PITCH_PROCESSOR_NAME, {
      outputChannelCount: [2],
    })
    source.connect(node).connect(context.destination)
    ctx = context
    boundTo = el
    el.addEventListener("play", resume)
    return true
  }

  function resume() {
    if (ctx?.state === "suspended") void ctx.resume()
  }

  async function ensure(): Promise<boolean> {
    if (node) return media.value === boundTo
    if (!supported.value || failed.value || !media.value) return false
    building ??= build(media.value)
    return building
  }

  watch(semitones, async (s) => {
    if (s === 0 && !node) return
    if (!(await ensure())) return
    node?.port.postMessage({ semitones: s })
    if (media.value && !media.value.paused) resume()
  })

  onBeforeUnmount(() => {
    boundTo?.removeEventListener("play", resume)
    void ctx?.close()
  })

  return { supported, failed }
}
