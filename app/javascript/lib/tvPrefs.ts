import { useLocalStorage } from "@vueuse/core"
import { computed } from "vue"

// Per-device display preferences for the TV views (Stage Mode, Live
// Sync). Read from localStorage only once mounted, so server-side rendering
// and hydration always agree on the defaults.
const opts = { initOnMounted: true, listenToStorageChanges: false }

export type TvView = "karaoke" | "sheet"

export const LYRIC_SCALE = { min: 0.7, max: 1.4, step: 0.1 }
export const SHEET_SCALE = { min: 0.6, max: 2, step: 0.1 }

export function stepValue(
  value: number,
  dir: 1 | -1,
  range: { min: number; max: number; step: number },
): number {
  const next = Math.round((value + dir * range.step) * 100) / 100
  return Math.min(range.max, Math.max(range.min, next))
}

export function useTvPrefs() {
  const rawView = useLocalStorage<string>("chordstage:tv-view", "karaoke", opts)
  const view = computed<TvView>({
    get: () => (rawView.value === "sheet" ? "sheet" : "karaoke"),
    set: (v) => (rawView.value = v),
  })
  return {
    view,
    lyricScale: useLocalStorage("chordstage:tv-lyric-scale", 1, opts),
    sheetScale: useLocalStorage("chordstage:tv-sheet-scale", 1, opts),
    showChords: useLocalStorage("chordstage:tv-chords", false, opts),
  }
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}
