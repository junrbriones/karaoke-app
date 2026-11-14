// One timing for both: the karaoke sync's line taps and the chord sheet's
// Line timing are the same thing -- when each line of the song starts --
// so tapping either one fills in the other, and saving either page saves
// both.
//
// The two are matched line by line by their words (lib/syncedSheet.ts):
// the sync is just the lyrics, while the sheet also has chord-only lines
// (intros, interludes) and its own wording, so a line that doesn't match
// keeps what it had. Both run on the same clock -- the song's recording,
// or the music player's when it was timed against another app.

import type { SongBlock } from "@/lib/chordSheet"
import {
  applyLineSync,
  cueLine,
  cuesOf,
  detectTempo,
  fitPhase,
  onsetsOf,
} from "@/lib/lineSync"
import { type LineTiming, savedStart, timedLines } from "@/lib/lineTiming"
import {
  type Phrasing,
  type PhrasingLine,
  type PhrasingScreen,
  type PhrasingSync,
  lyricsOnlyText,
  parsePhrasingText,
} from "@/lib/phrasing"
import {
  matchSheetLines,
  normalizeLyrics,
  syncedLines,
  timelineFromSync,
} from "@/lib/syncedSheet"

const round3 = (x: number) => Math.round(x * 1000) / 1000
const round1 = (x: number) => Math.round(x * 10) / 10
const LOOKAHEAD = 8

export interface SharedResult<T> {
  value: T
  matched: number // lyric lines given a time from the other side
  total: number // lyric lines on this side
}

/* ---------------------------------------------- karaoke sync -> sheet */

// The Line timing a karaoke sync gives the chord sheet: each sheet line
// that matches a sync line starts when it does; chord-only and unmatched
// lines in between share out the time around them; the line after the
// last match starts as that one ends. Null when nothing's tapped.
export function lineTimingFromSync(
  blocks: SongBlock[],
  screens: PhrasingScreen[],
  opts: { bpm: number; source: "audio" | "external" },
): SharedResult<LineTiming> | null {
  const synced = syncedLines({ screens })
  if (!synced.length) return null
  const slots = matchSheetLines(blocks, synced)
  const lastMatch = slots.reduce((m, s, i) => (s.match ? i : m), -1)
  if (lastMatch < 0) return null
  const timeline = timelineFromSync(blocks, { screens }, 2)
  const position = new Map(slots.map((s, i) => [s.index, i]))

  // An [Instrumental] break's tap is when the chord-only line after the
  // line before it (an intro, an interlude) starts.
  const breakStart = new Map<number, number>() // slot position -> time
  const cues = cuesOf(screens)
  let prevLineStart: number | null = null
  let atTop = true
  for (const cue of cues) {
    if (cue.kind === "line") {
      prevLineStart = cue.time
      atTop = false
      continue
    }
    if (cue.time == null) continue
    let from = -1
    if (!atTop) {
      from = slots.findIndex((s) => s.match && s.match.start === prevLineStart)
      if (from < 0) continue
    }
    for (let k = from + 1; k < slots.length && !slots[k].match; k++) {
      if (!slots[k].lyrics.length) {
        breakStart.set(k, cue.time)
        break
      }
    }
  }
  // Where the last line ends, if its end was tapped (held).
  const lastLineCue = [...cues].reverse().find((c) => c.kind === "line")
  const heldEnd = lastLineCue
    ? (cueLine(screens, lastLineCue)?.end ?? null)
    : null

  const entries: LineTiming["lines"] = {}
  let end: number | null = null
  let total = 0
  let matched = 0
  const lines = timedLines(blocks, 4)
  for (const line of lines) {
    const pos = position.get(line.blockIndex)
    if (!line.instrumental) total++
    if (pos == null || pos > lastMatch + 1) continue
    const tl = timeline.lines[line.blockIndex]
    if (!tl) continue
    const start = breakStart.get(pos) ?? tl.lineStart
    entries[line.id] = { text: line.text, start: round3(start) }
    // (The line after the last one sung starts as that one ends.)
    if (pos > lastMatch) continue
    if (slots[pos].match) matched++
    if (pos === lastMatch && line === lines[lines.length - 1]) {
      end = round3(heldEnd ?? tl.lineEnd)
    }
  }
  return {
    value: {
      version: 2,
      bpm: Math.round(opts.bpm) || null,
      source: opts.source,
      end,
      lines: entries,
    },
    matched,
    total,
  }
}

/* ---------------------------------------------- sheet -> karaoke sync */

function phrasingLineKey(line: PhrasingLine): string {
  const words: string[] = []
  for (const t of line.tokens) {
    if (t.wordStart || !words.length) words.push(t.text)
    else words[words.length - 1] += t.text
  }
  return normalizeLyrics(words.join(" "))
}

function hasWordTaps(phrasing: Phrasing | null | undefined): boolean {
  return (phrasing?.screens ?? []).some((s) =>
    s.lines.some((l) => l.tokens.some((t) => t.time != null)),
  )
}

// A tapped word-by-word sync is more exact than line starts: it's left
// alone (the sheet still takes its timing from it).
export function syncIsWordTapped(
  phrasing: Phrasing | null | undefined,
): boolean {
  return phrasing?.sync?.mode === "word" && hasWordTaps(phrasing)
}

// The karaoke sync a Line timing gives the lyrics: each sync line that
// matches a timed sheet line starts when it does, an [Instrumental] break
// when the sheet line after the one before it starts, and the last line
// ends where the sheet says. The words are then placed from the line
// starts as the karaoke sync does (tempo found from them, if it has none).
// Null for a word-tapped sync, or when nothing matches.
export function syncFromLineTiming(
  blocks: SongBlock[],
  timing: LineTiming,
  base: Phrasing | null | undefined,
  opts: { songTempo: number | null; source: "audio" | "external" },
): SharedResult<Phrasing> | null {
  if (syncIsWordTapped(base)) return null
  const sourceText = base?.sourceText ?? lyricsOnlyText(blocks)
  const screens: PhrasingScreen[] = base?.screens?.length
    ? JSON.parse(JSON.stringify(base.screens))
    : parsePhrasingText(sourceText)

  const sheet = timedLines(blocks, 4)
  const starts = sheet.map((line) => savedStart(line, timing))
  const sung = sheet
    .map((line, i) => ({ line, i, start: starts[i] }))
    .filter((s) => !s.line.instrumental && s.start != null)
    .map((s) => ({ ...s, key: normalizeLyrics(s.line.text) }))

  const cues = cuesOf(screens)
  let j = 0
  let lastSheet = -1 // the sheet line matched to the last line cue
  let matched = 0
  let total = 0
  const lineCues = cues.filter((c) => c.kind === "line")
  const lastLineCue = lineCues[lineCues.length - 1]
  for (const cue of cues) {
    if (cue.kind === "break") {
      // The chord-only line (intro, interlude) after the last line sung;
      // else, when that line ended.
      let at: number | null = null
      for (let k = lastSheet + 1; k < sheet.length; k++) {
        if (!sheet[k].instrumental) break
        if (starts[k] != null) {
          at = starts[k]
          break
        }
      }
      if (at == null && lastSheet >= 0) at = starts[lastSheet + 1]
      if (at != null) screens[cue.screenIndex].start = at
      continue
    }
    total++
    const line = cueLine(screens, cue)
    if (!line) continue
    const key = phrasingLineKey(line)
    for (let k = j; k < Math.min(sung.length, j + LOOKAHEAD); k++) {
      if (sung[k].key === key) {
        line.start = sung[k].start
        line.end = null
        lastSheet = sung[k].i
        j = k + 1
        matched++
        if (cue === lastLineCue) {
          const after =
            lastSheet + 1 < sheet.length
              ? starts[lastSheet + 1]
              : (timing.end ?? null)
          if (after != null && after > (line.start ?? 0)) line.end = after
        }
        break
      }
    }
  }
  if (!matched) return null

  const sync: PhrasingSync = {
    grid: 2,
    phase: null,
    bpm: null,
    ...(base?.sync ?? {}),
    mode: "line",
    source: opts.source,
  }
  const onsets = onsetsOf(screens)
  if (!sync.bpm) {
    const best = detectTempo(onsets, opts.songTempo)[0]
    if (best) sync.bpm = round1(best.bpm)
  }
  if (sync.bpm && onsets.length >= 2) {
    sync.phase = round3(fitPhase(onsets, sync.bpm).phase)
  }
  const applied = applyLineSync(screens, sync)
  return {
    value: {
      sourceText,
      complete: applied.complete,
      screens: applied.screens,
      sync,
      instrumentalOffset: base?.instrumentalOffset ?? 0,
    },
    matched,
    total,
  }
}
