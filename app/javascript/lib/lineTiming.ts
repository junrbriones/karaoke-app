// Per-line timing for the tempo guide: when each line of a chord sheet
// really starts, so the highlight, the ball and the sheet's scrolling move
// at the song's actual pace instead of a flat "every line is one bar".
//
// Tapped out on the song's Line timing page -- against the song's
// uploaded audio, or the music playing in another app -- and saved on the
// song as `line_timing`:
//
//   { version: 2, bpm, source, end, lines: { id: { text, start } } }
//
// `start` is when the line starts, in seconds on the clock it was tapped
// against; a line lasts until the next line's start (the last one until
// `end`). `bpm` is the song's tempo when it was timed: Stage Mode plays the
// timing in real time at that tempo, and its Tempo control speeds the whole
// thing up or slows it down evenly from there.
//
// Timings saved before this were lengths in beats ({ text, beats }); they
// still play exactly as before, and open in the editor as times.
//
// A line is identified by its section and its position in that section
// ("Chorus 1#2" = the third line of Chorus 1). A repeated section is timed
// on its own ("Chorus 1@1#2" for the first repeat), and plays at the
// original's pace until it is. The saved text is checked too: if a line is
// rewritten, its old timing is dropped rather than applied to the wrong
// words.

import { type SongBlock, chordGroups } from "@/lib/chordSheet"

export interface LineTimingEntry {
  text: string
  start?: number // seconds (version 2)
  beats?: number // length in beats (older timings)
}

export interface LineTiming {
  version?: number | null
  bpm?: number | null // the song's tempo when it was timed
  source?: "audio" | "external" | null // what the taps were timed against
  end?: number | null // where the last line ends, in seconds
  lines: Record<string, LineTimingEntry>
}

export interface TimedLine {
  blockIndex: number
  id: string // unique per line as performed (repeats included)
  baseId: string // the original line's id (the same as `id` unless a repeat)
  section: string
  text: string
  instrumental: boolean
  repeat: boolean // inside a [Repeat ...] copy
  defaultBeats: number
}

export const NUDGE = 0.05 // seconds per −/+ on a tap
export const MAX_LINE_SECONDS = 120

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
  let key = "" // the section's own key ("Verse", "Verse~2")
  let idKey = "" // this copy's key ("Verse", or "Verse@1" for a repeat)
  let repeat = false
  let n = 0
  // Two sections can share a name (two plain [Verse]s with different
  // words); the second becomes "Verse~2" so their timings don't collide.
  // A repeat uses whichever section of that name was last written out.
  const seen = new Map<string, number>()
  const latest = new Map<string, string>()
  const repeats = new Map<string, number>()
  blocks.forEach((block, blockIndex) => {
    if (block.type === "section") {
      section = block.text
      repeat = !!block.repeat
      if (repeat) {
        key = latest.get(section) ?? section
        const count = (repeats.get(key) ?? 0) + 1
        repeats.set(key, count)
        idKey = `${key}@${count}`
      } else {
        const count = (seen.get(section) ?? 0) + 1
        seen.set(section, count)
        key = count > 1 ? `${section}~${count}` : section
        latest.set(section, key)
        idKey = key
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
    const i = n++
    out.push({
      blockIndex,
      id: `${idKey}#${i}`,
      baseId: `${key}#${i}`,
      section,
      text: lyrics || normalize(block.chords),
      instrumental,
      repeat,
      defaultBeats: bpl * bars * passes,
    })
  })
  return out
}

export function isTimeBased(timing: LineTiming | null | undefined): boolean {
  if (!timing?.lines) return false
  if (timing.version === 2) return true
  return Object.values(timing.lines).some((e) => e && e.start != null)
}

function entryFor(
  id: string,
  line: TimedLine,
  timing: LineTiming | null | undefined,
): LineTimingEntry | null {
  const entry = timing?.lines?.[id]
  return entry && entry.text === line.text ? entry : null
}

// When a line starts, as saved (version 2 timings only).
export function savedStart(
  line: TimedLine,
  timing: LineTiming | null | undefined,
): number | null {
  const start = Number(entryFor(line.id, line, timing)?.start)
  return Number.isFinite(start) && start >= 0 ? start : null
}

// An older timing's length in beats (repeats share their original's).
export function savedBeats(
  line: TimedLine,
  timing: LineTiming | null | undefined,
): number | null {
  const beats = Number(entryFor(line.baseId, line, timing)?.beats)
  return Number.isFinite(beats) && beats > 0 ? beats : null
}

// How long each line lasts, in seconds, from the start times: until the
// next line starts (the last one until `end`). A line without both ends
// tapped has no length of its own -- a repeat then borrows the original's,
// anything else gets null (the default length).
export function lineLengths(
  lines: TimedLine[],
  starts: (number | null)[],
  end: number | null | undefined,
): (number | null)[] {
  const own = lines.map((_, i) => {
    const s = starts[i]
    if (s == null) return null
    const next = i + 1 < lines.length ? starts[i + 1] : (end ?? null)
    if (next == null) return null
    const len = next - s
    return len > 0.05 && len <= MAX_LINE_SECONDS ? len : null
  })
  const byId = new Map<string, number>()
  lines.forEach((line, i) => {
    const len = own[i]
    if (len != null && !line.repeat) byId.set(line.id, len)
  })
  return lines.map(
    (line, i) =>
      own[i] ?? (line.repeat ? (byId.get(line.baseId) ?? null) : null),
  )
}

// Per-block line lengths in beats for buildTimeline (null = the default
// length). A time-based timing is turned into beats at the tempo it was
// made at (`timing.bpm`, else `fallbackBpm`), so it plays in real time at
// that tempo and scales evenly with the Tempo control.
export function lineBeatsFor(
  blocks: SongBlock[],
  timing: LineTiming | null | undefined,
  beatsPerLine: number,
  fallbackBpm?: number | null,
): (number | null)[] {
  const out: (number | null)[] = blocks.map(() => null)
  if (!timing?.lines) return out
  const lines = timedLines(blocks, beatsPerLine)
  if (!isTimeBased(timing)) {
    for (const line of lines) out[line.blockIndex] = savedBeats(line, timing)
    return out
  }
  const ref = Number(timing.bpm) || Number(fallbackBpm) || 100
  const lengths = lineLengths(
    lines,
    lines.map((line) => savedStart(line, timing)),
    timing.end,
  )
  lines.forEach((line, i) => {
    const seconds = lengths[i]
    if (seconds != null) out[line.blockIndex] = (seconds * ref) / 60
  })
  return out
}

// Whether a song has any line timing that applies to its current text.
export function hasLineTiming(
  blocks: SongBlock[],
  timing: LineTiming | null | undefined,
): boolean {
  return lineBeatsFor(blocks, timing, 4).some((b) => b != null)
}

/* ---- times typed in by hand (read off a music player's clock) ---- */

// "1:23.45" (minutes:seconds), "83.45" (seconds) or "1:02:03" (hours too);
// null for an empty box, NaN for something that isn't a time.
export function parseClockTime(text: string): number | null {
  const t = text.trim().replace(/,/g, ".")
  if (!t) return null
  const parts = t.split(":")
  if (parts.length > 3) return NaN
  const last = parts.length - 1
  let total = 0
  for (let i = 0; i <= last; i++) {
    const part = parts[i]
    const ok = i === last ? /^\d+(\.\d*)?$/.test(part) : /^\d+$/.test(part)
    if (!ok) return NaN
    const value = Number(part)
    // Seconds (and minutes, after hours) only go up to 59.
    if (i > 0 && value >= 60) return NaN
    total = total * 60 + value
  }
  return Math.round(total * 1000) / 1000
}

// 83.456 -> "1:23.46" (with hours past an hour: "1:02:03.00").
export function formatClockTime(t: number): string {
  const cs = Math.round(Math.max(0, t) * 100)
  const h = Math.floor(cs / 360000)
  const m = Math.floor((cs % 360000) / 6000)
  const s = ((cs % 6000) / 100).toFixed(2).padStart(5, "0")
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`
}
