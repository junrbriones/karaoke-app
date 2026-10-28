// Builds a word-by-word timing map for a song from its parsed blocks + a
// tempo, so the UI can point at "the word to be singing right now" without
// an audio track or manually-tapped timestamps.
//
// Heuristic: each lyric line takes `beatsPerLine` beats (one bar in 4/4 by
// default), or a multiple of that for a multi-bar instrumental block (see
// chordSheet.ts's "xN" marker). Within a line, time is split across its
// words in proportion to word length, which tracks singing pace better
// than splitting evenly. A chords-only line (an intro, ad lib, etc.) has no
// words to pace against, so its chords step evenly through the line
// instead -- that keeps the tempo guide's highlight/ball useful there too,
// rather than just going dark until the lyrics resume.

import type { SongBlock } from "@/lib/chordSheet"

export type TimelineWord = {
  text: string
  wordIndex: number
  start: number
  end: number
}

export type TimelineLine = {
  lineStart: number
  lineEnd: number
  words: TimelineWord[]
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

// Spaces tokens evenly across [start, end) -- used for a chords-only line,
// where a chord's length has nothing to do with how long it's held.
function distributeEvenly(
  tokens: string[],
  start: number,
  end: number,
): TimelineWord[] {
  const span = end - start
  return tokens.map((text, i) => ({
    text,
    wordIndex: i,
    start: start + (i / tokens.length) * span,
    end: start + ((i + 1) / tokens.length) * span,
  }))
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

    const bars = block.bars && block.bars > 0 ? block.bars : 1
    const lineStart = t
    const lineEnd = t + lineDuration * bars
    const lyrics = block.lyrics || ""
    const wordMatches = [...lyrics.matchAll(/\S+/g)].map((m) => m[0])

    let words: TimelineWord[]
    if (wordMatches.length) {
      words = distributeByLength(wordMatches, lineStart, lineEnd)
    } else if (block.chords) {
      const chordTokens = block.chords.trim().split(/\s+/).filter(Boolean)
      words = distributeEvenly(chordTokens, lineStart, lineEnd)
    } else {
      words = []
    }

    t = lineEnd
    return { lineStart, lineEnd, words }
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
