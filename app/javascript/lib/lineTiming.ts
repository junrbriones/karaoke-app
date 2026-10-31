// Per-line timing for the tempo guide: how many beats each line of a chord
// sheet really lasts, so the highlight, the ball and the sheet's scrolling
// move at the song's actual pace instead of a flat "every line is one bar".
//
// Edited (or tapped out live) on the song's Line timing page and saved on
// the song as `line_timing`. Lengths are in beats, not seconds, so the
// Tempo control still speeds the whole song up or slows it down evenly.
//
// A line is identified by its section and its position in that section
// ("Chorus 1#2" = the third line of Chorus 1), so a repeated section
// ([Repeat Chorus 1]) shares the timing of the original, and editing one
// line doesn't shift the others. The saved text is checked too: if a line
// is rewritten, its old timing is dropped rather than applied to the wrong
// words, and it goes back to the default length.

import { type SongBlock, chordGroups } from "@/lib/chordSheet"

export interface LineTimingEntry {
  text: string
  beats: number
}

export interface LineTiming {
  bpm?: number | null // the tempo the timing was made at, for reference
  lines: Record<string, LineTimingEntry>
}

export interface TimedLine {
  blockIndex: number
  id: string
  section: string
  text: string
  instrumental: boolean
  repeat: boolean // inside a [Repeat ...] copy
  defaultBeats: number
}

export const BEAT_STEP = 0.25
export const MIN_BEATS = 0.5
export const MAX_BEATS = 128

export function roundBeats(beats: number): number {
  const rounded = Math.round(beats / BEAT_STEP) * BEAT_STEP
  return Math.min(MAX_BEATS, Math.max(MIN_BEATS, rounded))
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ")
}

// Every line the tempo guide times (lyric lines and instrumental chord
// lines), in song order, repeats included.
export function timedLines(
  blocks: SongBlock[],
  beatsPerLine: number,
): TimedLine[] {
  const bpl = beatsPerLine > 0 ? beatsPerLine : 4
  const out: TimedLine[] = []
  let section = ""
  let key = ""
  let repeat = false
  let n = 0
  // Two sections can share a name (two plain [Verse]s with different
  // words); the second becomes "Verse~2" so their timings don't collide.
  // A repeat uses whichever section of that name was last written out.
  const seen = new Map<string, number>()
  const latest = new Map<string, string>()
  blocks.forEach((block, blockIndex) => {
    if (block.type === "section") {
      section = block.text
      repeat = !!block.repeat
      if (repeat) {
        key = latest.get(section) ?? section
      } else {
        const count = (seen.get(section) ?? 0) + 1
        seen.set(section, count)
        key = count > 1 ? `${section}~${count}` : section
        latest.set(section, key)
      }
      n = 0
      return
    }
    if (block.type !== "pair") return
    const lyrics = normalize(block.lyrics || "")
    const instrumental = !lyrics && !!block.chords.trim()
    if (!lyrics && !instrumental) return
    const bars = instrumental
      ? Math.max(1, chordGroups(block.chords).length)
      : 1
    const passes =
      instrumental && block.times && block.times > 0 ? block.times : 1
    out.push({
      blockIndex,
      id: `${key}#${n++}`,
      section,
      text: lyrics || normalize(block.chords),
      instrumental,
      repeat,
      defaultBeats: bpl * bars * passes,
    })
  })
  return out
}

export function savedBeats(
  line: TimedLine,
  timing: LineTiming | null | undefined,
): number | null {
  const entry = timing?.lines?.[line.id]
  if (!entry || entry.text !== line.text) return null
  const beats = Number(entry.beats)
  return Number.isFinite(beats) && beats > 0 ? beats : null
}

// Per-block beat lengths for buildTimeline (null = use the default).
export function lineBeatsFor(
  blocks: SongBlock[],
  timing: LineTiming | null | undefined,
  beatsPerLine: number,
): (number | null)[] {
  const out: (number | null)[] = blocks.map(() => null)
  if (!timing?.lines) return out
  for (const line of timedLines(blocks, beatsPerLine)) {
    out[line.blockIndex] = savedBeats(line, timing)
  }
  return out
}
