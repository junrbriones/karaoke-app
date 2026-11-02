// The chord sheet, timed by the song's karaoke sync instead of the tempo
// guide -- for Stage Mode's sheet view of an audio-synced song. The sheet
// then scrolls (and its ball hops) line by line exactly as the song was
// tapped out, without playing the recording: a band reading the chords
// keeps the song's real pace, at its own tempo.
//
// The sync's lyric lines are matched to the sheet's lyric lines by their
// words, in order (both come from the same song, repeats expanded, but the
// sync's text can have been edited, so lines that don't match are simply
// skipped). Each matched line takes the sync's times -- word by word when
// the words line up, otherwise spread over the line. Lines with no match,
// and chord-only lines (intros, interludes), share out the time between
// the matched lines around them; anything after the last one gets a bar
// each.

import { type SongBlock, chordGroups } from "@/lib/chordSheet"
import type { Phrasing } from "@/lib/phrasing"
import type { Timeline, TimelineLine, TimelineWord } from "@/lib/tempoGuide"

interface SyncedLine {
  key: string
  start: number
  end: number
  words: { key: string; start: number; end: number }[]
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

// The sync's lyric lines with their times, in order.
export function syncedLines(phrasing: Phrasing): SyncedLine[] {
  const out: SyncedLine[] = []
  for (const screen of phrasing.screens) {
    for (const line of screen.lines) {
      const timed = line.tokens.filter((t) => t.time != null)
      if (!timed.length) continue
      const words: SyncedLine["words"] = []
      line.tokens.forEach((t, i) => {
        if (t.time == null) return
        const next = line.tokens[i + 1]
        const end = t.end ?? next?.time ?? t.time
        if (t.wordStart || !words.length) {
          words.push({ key: t.text, start: t.time, end })
        } else {
          const w = words[words.length - 1]
          w.key += t.text
          w.end = Math.max(w.end, end)
        }
      })
      out.push({
        key: normalize(words.map((w) => w.key).join(" ")),
        start: line.start ?? words[0].start,
        end: words[words.length - 1].end,
        words: words.map((w) => ({ ...w, key: normalize(w.key) })),
      })
    }
  }
  return out
}

function spread(
  texts: string[],
  start: number,
  end: number,
  weight: (t: string) => number,
): TimelineWord[] {
  const total = texts.reduce((s, t) => s + weight(t), 0) || 1
  let acc = 0
  return texts.map((text, i) => {
    const a = start + ((end - start) * acc) / total
    acc += weight(text)
    const b = start + ((end - start) * acc) / total
    return { text, wordIndex: i, start: a, end: b }
  })
}

export function timelineFromSync(
  blocks: SongBlock[],
  phrasing: Phrasing,
  fallbackBar = 2,
): Timeline {
  const synced = syncedLines(phrasing)
  const lines: TimelineLine[] = blocks.map(() => null)
  type Slot = { index: number; lyrics: string[]; match: SyncedLine | null }
  const slots: Slot[] = []

  // Match lyric lines in order, looking a few lines ahead for each.
  let j = 0
  blocks.forEach((block, index) => {
    if (block.type !== "pair") return
    const lyrics = [...(block.lyrics || "").matchAll(/\S+/g)].map((m) => m[0])
    if (!lyrics.length && !block.chords.trim()) return
    let match: SyncedLine | null = null
    if (lyrics.length) {
      const key = normalize(lyrics.join(" "))
      for (let k = j; k < Math.min(synced.length, j + 8); k++) {
        if (synced[k].key === key) {
          match = synced[k]
          j = k + 1
          break
        }
      }
    }
    slots.push({ index, lyrics, match })
  })

  // Times for every slot: matched ones from the sync, the rest sharing the
  // gaps between them.
  const starts: number[] = slots.map(() => NaN)
  const ends: number[] = slots.map(() => NaN)
  slots.forEach((s, i) => {
    if (s.match) {
      starts[i] = s.match.start
      ends[i] = s.match.end
    }
  })
  let i = 0
  while (i < slots.length) {
    if (slots[i].match) {
      i++
      continue
    }
    let k = i
    while (k < slots.length && !slots[k].match) k++
    const from = i > 0 ? ends[i - 1] : 0
    const count = k - i
    const to =
      k < slots.length ? Math.max(from, starts[k]) : from + count * fallbackBar
    for (let n = 0; n < count; n++) {
      starts[i + n] = from + ((to - from) * n) / count
      ends[i + n] = from + ((to - from) * (n + 1)) / count
    }
    i = k
  }

  // Back to back: each line runs until the next one starts, so the sheet
  // glides through the breaths too (the ball rests on the last word).
  slots.forEach((s, n) => {
    const start = starts[n]
    const next = n + 1 < slots.length ? starts[n + 1] : ends[n]
    const end = Math.max(start, next, ends[n])
    const block = blocks[s.index]
    let words: TimelineWord[]
    if (s.lyrics.length) {
      const m = s.match
      if (m && m.words.length === s.lyrics.length) {
        words = s.lyrics.map((text, w) => ({
          text,
          wordIndex: w,
          start: m.words[w].start,
          end: w + 1 < s.lyrics.length ? m.words[w + 1].start : end,
        }))
      } else {
        words = spread(s.lyrics, start, end, (t) => t.length)
      }
    } else {
      const chords =
        block.type === "pair" ? chordGroups(block.chords).flat() : []
      words = spread(chords.length ? chords : [""], start, end, () => 1)
    }
    lines[s.index] = { lineStart: start, lineEnd: end, words }
  })

  const last = slots.length ? Math.max(...ends, ...starts) : 0
  return { lines, totalDuration: Number.isFinite(last) ? last : 0 }
}
