// Builds a word-by-word timing map for a song from its parsed blocks + a
// tempo, so the UI can point at "the word to be singing right now" without
// an audio track or manually-tapped timestamps.
//
// Heuristic: each lyric line takes `beatsPerLine` beats (one bar in 4/4 by
// default). Within a line, time is split across its words in proportion
// to word length, which tracks singing pace better than splitting evenly.
//
// A chords-only line (an intro, interlude, solo...) is timed the way a band
// reads it: one bar per chord, or per dash-joined group ("Dm-G7sus-G7-" is
// one bar split three ways), the whole run played `times` times ("x2").
// Each chord gets a timeline entry, so the highlight steps through the
// chords exactly when they're due and the band can follow along.

import { type SongBlock, chordGroups } from "@/lib/chordSheet"

export type TimelineWord = {
  text: string
  // Lyric word index, or for an instrumental the chord's index within one
  // pass of the run (so it lines up with the chords as written).
  wordIndex: number
  start: number
  end: number
  // Instrumentals only.
  bar?: number // 0-based bar within the run
  pass?: number // 0-based repeat
}

export type TimelineLine = {
  lineStart: number
  lineEnd: number
  words: TimelineWord[]
  // Instrumentals only.
  bars?: number // bars per pass
  passes?: number
  barDuration?: number
} | null

export type Timeline = {
  lines: TimelineLine[]
  totalDuration: number
}

export type ActiveWord = {
  blockIndex: number
  wordIndex: number
}

// Spaces tokens across [start, end) in proportion to each token's length --
// good for lyric words, where longer words tend to take longer to sing.
function distributeByLength(
  tokens: string[],
  start: number,
  end: number,
): TimelineWord[] {
  const span = end - start
  const totalChars = tokens.reduce((sum, t) => sum + t.length, 0) || 1
  let acc = 0
  return tokens.map((text, i) => {
    const share = text.length / totalChars
    const tokenStart = start + acc * span
    acc += share
    const tokenEnd = start + acc * span
    return { text, wordIndex: i, start: tokenStart, end: tokenEnd }
  })
}

// One bar per chord group, each bar split evenly between the group's
// chords, the whole run repeated `passes` times.
function distributeBars(
  groups: string[][],
  start: number,
  barDuration: number,
  passes: number,
): TimelineWord[] {
  const words: TimelineWord[] = []
  for (let pass = 0; pass < passes; pass++) {
    let wordIndex = 0
    groups.forEach((group, g) => {
      const barStart = start + (pass * groups.length + g) * barDuration
      const each = barDuration / group.length
      group.forEach((text, k) => {
        words.push({
          text,
          wordIndex: wordIndex++,
          start: barStart + k * each,
          end: barStart + (k + 1) * each,
          bar: g,
          pass,
        })
      })
    })
  }
  return words
}

export function buildTimeline(
  blocks: SongBlock[],
  bpm: number,
  beatsPerLine: number,
): Timeline {
  const safeBpm = bpm > 0 ? bpm : 100
  const safeBeats = beatsPerLine > 0 ? beatsPerLine : 4
  const secPerBeat = 60 / safeBpm
  const lineDuration = secPerBeat * safeBeats

  let t = 0
  const lines: TimelineLine[] = blocks.map((block) => {
    if (block.type !== "pair") return null

    const lineStart = t
    const lyrics = block.lyrics || ""
    const wordMatches = [...lyrics.matchAll(/\S+/g)].map((m) => m[0])

    if (wordMatches.length || !block.chords) {
      const lineEnd = t + lineDuration
      t = lineEnd
      return {
        lineStart,
        lineEnd,
        words: distributeByLength(wordMatches, lineStart, lineEnd),
      }
    }

    const groups = chordGroups(block.chords)
    const bars = Math.max(1, groups.length)
    const passes = block.times && block.times > 0 ? block.times : 1
    const lineEnd = t + lineDuration * bars * passes
    t = lineEnd
    return {
      lineStart,
      lineEnd,
      words: distributeBars(groups, lineStart, lineDuration, passes),
      bars,
      passes,
      barDuration: lineDuration,
    }
  })

  return { lines, totalDuration: t }
}

function lastValidLineIndex(lines: TimelineLine[]): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]) return i
  }
  return -1
}

export function findActive(
  lines: TimelineLine[],
  elapsed: number,
  totalDuration: number,
): ActiveWord {
  if (elapsed < 0) return { blockIndex: -1, wordIndex: -1 }

  if (elapsed >= totalDuration) {
    const i = lastValidLineIndex(lines)
    if (i === -1) return { blockIndex: -1, wordIndex: -1 }
    const words = lines[i]?.words ?? []
    return {
      blockIndex: i,
      wordIndex: words.length ? words[words.length - 1].wordIndex : -1,
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    if (elapsed >= line.lineStart && elapsed < line.lineEnd) {
      let wordIndex = -1
      for (const w of line.words) {
        if (elapsed >= w.start && elapsed < w.end) {
          wordIndex = w.wordIndex
          break
        }
      }
      return { blockIndex: i, wordIndex }
    }
  }
  return { blockIndex: -1, wordIndex: -1 }
}

export interface TempoSetting {
  bpm: number
  beatsPerLine: number
}

// Changing the tempo mid-song must keep the song where it is -- otherwise
// the highlight leaps ahead or back to wherever the same number of seconds
// lands at the new speed. Every timeline here is measured in musical time
// (the count-in in beats, the song in lines of `beatsPerLine` beats), so
// the elapsed clock simply scales by how much those got longer or shorter.
// Mirrors LiveSession.rescale_elapsed on the server.
export function rescaleElapsed(
  elapsed: number,
  from: TempoSetting,
  to: TempoSetting,
): number {
  const fromBpm = from.bpm > 0 ? from.bpm : 100
  const toBpm = to.bpm > 0 ? to.bpm : 100
  const beatRatio = fromBpm / toBpm
  if (elapsed < 0) return elapsed * beatRatio
  const fromBpl = from.beatsPerLine > 0 ? from.beatsPerLine : 4
  const toBpl = to.beatsPerLine > 0 ? to.beatsPerLine : 4
  return elapsed * beatRatio * (toBpl / fromBpl)
}

// Where the tempo guide is, precisely enough to animate: the word (or
// instrumental chord) being sung, how far through it we are, and the one
// after it -- which may be on the next line -- so a bouncing ball can be
// mid-flight between the two instead of jumping.
export interface GuidePosition {
  blockIndex: number
  wordIndex: number
  progress: number // 0..1 through the current word
  next: { blockIndex: number; wordIndex: number } | null
}

function firstWordFrom(
  lines: TimelineLine[],
  from: number,
): { blockIndex: number; wordIndex: number } | null {
  for (let i = from; i < lines.length; i++) {
    const w = lines[i]?.words[0]
    if (w) return { blockIndex: i, wordIndex: w.wordIndex }
  }
  return null
}

export function guideAt(
  lines: TimelineLine[],
  elapsed: number,
): GuidePosition | null {
  let last: GuidePosition | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line || !line.words.length) continue
    if (elapsed < line.lineStart) return null
    const words = line.words
    for (let k = 0; k < words.length; k++) {
      const w = words[k]
      if (elapsed >= w.start && elapsed < w.end) {
        const following = words[k + 1]
        return {
          blockIndex: i,
          wordIndex: w.wordIndex,
          progress:
            w.end > w.start ? (elapsed - w.start) / (w.end - w.start) : 1,
          next: following
            ? { blockIndex: i, wordIndex: following.wordIndex }
            : firstWordFrom(lines, i + 1),
        }
      }
    }
    const tail = words[words.length - 1]
    last = { blockIndex: i, wordIndex: tail.wordIndex, progress: 1, next: null }
  }
  // Past the end: rest on the very last word.
  return last
}
