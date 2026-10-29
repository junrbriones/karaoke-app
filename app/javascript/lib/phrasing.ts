// KaraFun-style phrasing: breaking a song's lyrics into two-line "screens"
// synced to an audio track, so a singer can read ahead, breathe, and stay
// on beat -- see the phrasing editor (pages/songs/phrasing.vue) and Stage
// Mode's audio playback path (pages/songs/stage.vue).
//
// Authoring format for the raw lyrics text:
//   - A single line break creates the second line of the same screen.
//   - A blank line (double line break) clears the screen and starts a new
//     one -- ordinary paragraph breaks.
//   - A screen is capped at two lines: if a paragraph has more than two
//     non-blank lines, they're auto-chunked into consecutive screens of (up
//     to) two lines each, so the two-line rule holds regardless of how the
//     text was broken up.
//   - "[Male]", "[Female]", or "[All]" alone on a line labels every screen
//     from that point on (until the next marker), for duets.
//   - "[Instrumental]" alone on a line marks a rest: an empty screen with
//     no lyrics, shown in Stage Mode as a "take a breath" countdown to the
//     next line.
//   - A word written with hyphens ("a-ma-zing") is split into that many
//     syllable tokens, each independently tapped, so the highlight can
//     sweep across the word instead of lighting it up all at once.

import type { SongBlock } from "@/lib/chordSheet"

export type DuetLabel = "Male" | "Female" | "All"

export interface PhrasingToken {
  text: string
  // True for a syllable that starts a new word -- controls whether a space
  // is rendered before it. False for a continuation syllable of the same
  // hyphen-split word.
  wordStart: boolean
  // Seconds from the start of the audio, or null until tapped.
  time: number | null
}

export interface PhrasingLine {
  tokens: PhrasingToken[]
}

export interface PhrasingScreen {
  label: DuetLabel | null
  instrumental: boolean
  lines: PhrasingLine[]
}

export interface Phrasing {
  sourceText: string
  complete: boolean
  screens: PhrasingScreen[]
}

export interface TokenRef {
  screenIndex: number
  lineIndex: number
  tokenIndex: number
}

export interface PhrasingLint {
  screenIndex: number
  lineIndex: number
  message: string
}

const MARKER_RE = /^\[(male|female|all)\]$/i
const INSTRUMENTAL_RE = /^\[instrumental\]$/i

function titleCaseLabel(s: string): DuetLabel {
  return (s[0].toUpperCase() + s.slice(1).toLowerCase()) as DuetLabel
}

export function tokenizeLine(lineText: string): PhrasingToken[] {
  const words = lineText.split(/\s+/).filter(Boolean)
  const tokens: PhrasingToken[] = []
  for (const word of words) {
    const syllables = word.split("-").filter(Boolean)
    const parts = syllables.length ? syllables : [word]
    parts.forEach((syl, i) => {
      tokens.push({ text: syl, wordStart: i === 0, time: null })
    })
  }
  return tokens
}

export function parsePhrasingText(raw: string): PhrasingScreen[] {
  const text = raw.replace(/\r\n/g, "\n")
  const paragraphs = text
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const screens: PhrasingScreen[] = []
  let label: DuetLabel | null = null

  for (const para of paragraphs) {
    const nonBlank = para
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    let buffer: string[] = []
    const flush = () => {
      if (!buffer.length) return
      screens.push({
        label,
        instrumental: false,
        lines: buffer.map((l) => ({ tokens: tokenizeLine(l) })),
      })
      buffer = []
    }

    for (const line of nonBlank) {
      const marker = line.match(MARKER_RE)
      if (marker) {
        flush()
        label = titleCaseLabel(marker[1])
        continue
      }
      if (INSTRUMENTAL_RE.test(line)) {
        flush()
        screens.push({ label, instrumental: true, lines: [] })
        continue
      }
      buffer.push(line)
      if (buffer.length === 2) flush()
    }
    flush()
  }

  return screens
}

// Re-parsing after an edit produces a fresh token tree with no times. This
// carries over previously-tapped times by flattened position, so a small
// text tweak doesn't throw away the whole recording. A bigger restructure
// just means the carried-over times land on the wrong tokens past the edit
// point -- the editor's token list makes that easy to spot and re-tap.
export function rehydrateTimes(
  freshScreens: PhrasingScreen[],
  previousScreens: PhrasingScreen[],
): PhrasingScreen[] {
  const previousTimes = flattenTokens(previousScreens).map(
    (ref) => resolveToken(previousScreens, ref).time,
  )

  let i = 0
  for (const screen of freshScreens) {
    for (const line of screen.lines) {
      for (const token of line.tokens) {
        if (i < previousTimes.length) token.time = previousTimes[i]
        i++
      }
    }
  }
  return freshScreens
}

export function flattenTokens(screens: PhrasingScreen[]): TokenRef[] {
  const refs: TokenRef[] = []
  screens.forEach((screen, screenIndex) => {
    screen.lines.forEach((line, lineIndex) => {
      line.tokens.forEach((_token, tokenIndex) => {
        refs.push({ screenIndex, lineIndex, tokenIndex })
      })
    })
  })
  return refs
}

export function resolveToken(
  screens: PhrasingScreen[],
  ref: TokenRef,
): PhrasingToken {
  return screens[ref.screenIndex].lines[ref.lineIndex].tokens[ref.tokenIndex]
}

export function isComplete(screens: PhrasingScreen[]): boolean {
  if (!screens.length) return false
  return flattenTokens(screens).every(
    (ref) => resolveToken(screens, ref).time != null,
  )
}

export function lintScreens(screens: PhrasingScreen[]): PhrasingLint[] {
  const warnings: PhrasingLint[] = []
  screens.forEach((screen, screenIndex) => {
    screen.lines.forEach((line, lineIndex) => {
      const wordCount = line.tokens.filter((t) => t.wordStart).length
      if (wordCount === 1) {
        warnings.push({
          screenIndex,
          lineIndex,
          message:
            "This line is just one word -- consider merging it into the line above.",
        })
      }
    })
  })
  return warnings
}

// Playback timing (screen windows, the active token, sweep progress) lives
// in lib/lyricDisplay.ts, shared with the chord-sheet tempo guide.

// Seeds the phrasing textarea from a song's existing chord-sheet body, so
// there's no retyping: lyric lines carry over as-is, section/blank breaks
// become paragraph breaks, and an instrumental (chords-only) block becomes
// an explicit [Instrumental] marker.
export function lyricsOnlyText(blocks: SongBlock[]): string {
  const paragraphs: string[][] = [[]]
  const breakParagraph = () => {
    if (paragraphs[paragraphs.length - 1].length > 0) paragraphs.push([])
  }

  for (const block of blocks) {
    if (block.type === "blank" || block.type === "section") {
      breakParagraph()
      // A chord sheet's [Male]/[Female]/[All] sections carry over as the
      // phrasing's duet markers.
      if (
        block.type === "section" &&
        MARKER_RE.test(`[${block.text.trim()}]`)
      ) {
        paragraphs[paragraphs.length - 1].push(`[${block.text.trim()}]`)
      }
      continue
    }

    const lyrics = block.lyrics.trim()
    if (lyrics) {
      paragraphs[paragraphs.length - 1].push(lyrics)
    } else if (block.chords) {
      breakParagraph()
      paragraphs[paragraphs.length - 1].push("[Instrumental]")
      breakParagraph()
    }
  }

  return paragraphs
    .filter((p) => p.length > 0)
    .map((p) => p.join("\n"))
    .join("\n\n")
    .trim()
}
