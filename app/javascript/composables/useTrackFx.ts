import { type Ref, onBeforeUnmount, ref, watch } from "vue"

import { isBrowser } from "@/lib/browser"
import { PITCH_PROCESSOR_NAME, workletSource } from "@/lib/pitchShift"
import { type VocalMask, createVocalMask } from "@/lib/vocalMask"

// Routes an <audio> element through Stage Mode's effects:
//
//   element -> vocal mask (lib/vocalMask.ts) -> key shift (lib/pitchShift.ts)
//           -> speakers
//
// The Web Audio graph is only built the first time it's needed -- the key
// moves off 0, or the vocal comes down from full -- so until then playback
// is the plain, untouched <audio> element and a browser that can't do this
// loses nothing. Once built it stays for the element's lifetime (an element
// can only ever be attached to one graph), with both effects passing the
// sound straight through when they're not in use.
//
// The vocal mask is plain Web Audio and works anywhere. The key shift is an
// AudioWorklet, which needs a secure context: https, or http://localhost --
// a TV opening the app over plain http on a LAN IP won't have it, and
// `supported` is false there (the vocal mask still works).
export function useTrackFx(
  media: Ref<HTMLMediaElement | null>,
  semitones: Ref<number>,
  vocals: Ref<number>, // 1 = original, 0 = lead vocal masked
) {
  const supported = ref(
    isBrowser &&
      typeof window.AudioWorkletNode !== "undefined" &&
      window.isSecureContext,
  )
  const vocalSupported = ref(
    isBrowser && typeof window.AudioContext !== "undefined",
  )
  const failed = ref(false)
  // null until measured: whether the track is (near) mono, which leaves the
  // vocal mask nothing to work with.
  const mono = ref<boolean | null>(null)

  let ctx: AudioContext | null = null
  let pitch: AudioWorkletNode | null = null
  let mask: VocalMask | null = null
  let building: Promise<boolean> | null = null
  let boundTo: HTMLMediaElement | null = null

  async function loadPitch(context: AudioContext): Promise<boolean> {
    if (!supported.value) return false
    const url = URL.createObjectURL(
      new Blob([workletSource()], { type: "application/javascript" }),
    )
    try {
      await context.audioWorklet.addModule(url)
      return true
    } catch {
      failed.value = true
      return false
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  async function build(el: HTMLMediaElement): Promise<boolean> {
    let context: AudioContext
    try {
      context = new AudioContext()
    } catch {
      vocalSupported.value = false
      failed.value = true
      return false
    }
    const hasPitch = await loadPitch(context)
    // From here on the element's sound only reaches the speakers through
    // this graph.
    const source = context.createMediaElementSource(el)
    mask = createVocalMask(context)
    mask.setLevel(vocals.value)
    source.connect(mask.input)
    if (hasPitch) {
      pitch = new AudioWorkletNode(context, PITCH_PROCESSOR_NAME, {
        outputChannelCount: [2],
      })
      pitch.port.postMessage({ semitones: semitones.value })
      mask.output.connect(pitch).connect(context.destination)
    } else {
      mask.output.connect(context.destination)
    }
    ctx = context
    boundTo = el
    el.addEventListener("play", resume)
    el.addEventListener("loadstart", resetMono)
    resume()
    return true
  }

  function resume() {
    if (ctx?.state === "suspended") void ctx.resume()
  }

  async function ensure(): Promise<boolean> {
    if (ctx) return media.value === boundTo
    if (!media.value) return false
    if (!vocalSupported.value && !supported.value) return false
    building ??= build(media.value)
    return building
  }

  watch(semitones, async (s) => {
    if (s === 0 && !ctx) return
    if (!(await ensure())) return
    pitch?.port.postMessage({ semitones: s })
    if (media.value && !media.value.paused) resume()
  })

  watch(vocals, async (v) => {
    if (v >= 1 && !ctx) return
    if (!(await ensure())) return
    mask?.setLevel(v)
    if (v < 1) startMonoCheck()
    if (media.value && !media.value.paused) resume()
  })

  /* ---- is there any stereo to work with? ---- */
  let monoTimer: ReturnType<typeof setInterval> | null = null
  let samples = 0
  let midSum = 0
  let sideSum = 0
  function resetMono() {
    mono.value = null
    samples = midSum = sideSum = 0
    if (vocals.value < 1) startMonoCheck()
  }
  function startMonoCheck() {
    if (monoTimer || mono.value != null) return
    monoTimer = setInterval(() => {
      const el = media.value
      if (!mask || !el || el.paused) return
      const { mid, side } = mask.levels()
      if (mid < 0.01) return // too quiet to tell (silence, a fade)
      midSum += mid
      sideSum += side
      if (++samples >= 6) {
        mono.value = sideSum / midSum < 0.04
        if (monoTimer) clearInterval(monoTimer)
        monoTimer = null
      }
    }, 500)
  }

  onBeforeUnmount(() => {
    boundTo?.removeEventListener("play", resume)
    boundTo?.removeEventListener("loadstart", resetMono)
    if (monoTimer) clearInterval(monoTimer)
    void ctx?.close()
  })

  return { supported, failed, vocalSupported, mono }
}
