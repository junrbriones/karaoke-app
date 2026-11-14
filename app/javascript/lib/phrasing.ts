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
//   - A hyphenated word ("Gabi-gabi", "taga-Frisco") keeps its hyphen on
//     screen, and each part is its own word for timing: tapped (or placed)
//     and highlighted separately.
//   - "|" splits a word into syllables without showing anything
//     ("a|ma|zing"), each tapped and highlighted independently, so the
//     sweep can move across a long word instead of lighting it all at once.
//
// Timing marks, for syncing a line at a time (lib/lineSync.ts places the
// words of a tapped line by how long each one is sung). They're never
// shown on screen:
//   - "~" after a word or syllable holds it one unit longer per "~"
//     ("ma-hal~~"). A unit is about one syllable.
//   - "/" is a pause of one unit per "/": on its own between words
//     ("ikaw / at ako"), or stuck to a word ("ikaw/", "/at"). At the
//     start of a line it delays the first word after the line's tap.
//   - "^" after a word or syllable makes it quick: half as long per "^"
//     ("ang^ ganda", "Si^^ Annie"), and with snapping on, the next word
//     may start on a grid twice as fine per "^".

import type { SongBlock } from "@/lib/chordSheet"

export type DuetLabel = "Male" | "Female" | "All"

export interface PhrasingToken {
  text: string
  // True for a token that starts a new word -- controls whether a space is
  // rendered before it. False for the next part of a hyphenated word
  // ("gabi" in "Gabi-gabi"; the hyphen stays on "Gabi-") or the next
  // syllable of a "|"-split one.
  wordStart: boolean
  // Seconds from the start of the audio, or null until tapped.
  time: number | null
  // When the word stops being sung, if not where the next one starts (a
  // pause after it, or the end of a line-synced line). Optional.
  end?: number | null
  // Timing marks (see above), only present when written.
  hold?: number // "~" count
  quick?: number // "^" count
  restBefore?: number // "/" units before it
  restAfter?: number // "/" units after it
}

export interface PhrasingLine {
  tokens: PhrasingToken[]
  // Line sync: when the line was tapped, and (if the tap was held) when
  // it ended. Seconds from the start of the audio.
  start?: number | null
  end?: number | null
}

export interface PhrasingScreen {
  label: DuetLabel | null
  instrumental: boolean
  lines: PhrasingLine[]
  // Line sync: when an [Instrumental] break was tapped (it ends the line
  // before it).
  start?: number | null
}

// How the sync was made. "word": every word tapped. "line": every line
// tapped, the words placed automatically -- at `bpm` (found from the taps)
// and snapped to `grid` notes per beat (0 = no snapping), counting beats
// from `phase` seconds.
export interface PhrasingSync {
  mode: "word" | "line"
  bpm: number | null
  phase: number | null
  grid: number
  // How long a syllable is sung, in beats (0 = spread the words over the
  // whole line). Missing = the default, half a beat.
  pace?: number
  // What the taps were timed against: the song's uploaded audio, or music
  // playing in another app (a stopwatch, from when the music starts). An
  // "external" sync plays silently in Stage Mode, alongside the music.
  // Missing = the uploaded audio.
  source?: "audio" | "external"
}

export interface Phrasing {
  sourceText: string
  complete: boolean
  screens: PhrasingScreen[]
  sync?: PhrasingSync | null
  // How many seconds the song's minus-one track runs ahead of the original
  // (it starts later when positive), so its lyrics line up the same.
  instrumentalOffset?: number | null
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

// Marks can sit among a word's punctuation ("sayaw~,", "gabi/.",
// "(oh~)"), so they're looked for in the non-letter run at each end of a
// word -- a "/" between letters ("and/or") is left alone -- and "~"/"^"
// anywhere, since lyrics never use them.
const HEAD_RE = /^[^\p{L}\p{N}]*/u
const TAIL_RE = /[^\p{L}\p{N}]*$/u

function add(
  token: PhrasingToken,
  key: "hold" | "quick" | "restBefore" | "restAfter",
  n: number,
) {
  if (n > 0) token[key] = (token[key] ?? 0) + n
}
function count(text: string, ch: string): number {
  return text.split(ch).length - 1
}

export function tokenizeLine(lineText: string): PhrasingToken[] {
  const words = lineText.split(/\s+/).filter(Boolean)
  const tokens: PhrasingToken[] = []
  let pendingRest = 0 // "/" before any word on the line
  for (const word of words) {
    const head = word.match(HEAD_RE)?.[0] ?? ""
    const rest = word.slice(head.length)
    const tail = rest.match(TAIL_RE)?.[0] ?? ""
    const core = rest.slice(0, rest.length - tail.length)
    const before = count(head, "/")
    const after = count(tail, "/")
    const cleaned = head.replaceAll("/", "") + core + tail.replaceAll("/", "")
    const last = tokens[tokens.length - 1]

    // Nothing left but marks: they belong to the word before.
    if (!cleaned.replace(/[~^|]/g, "")) {
      if (last) {
        add(last, "restAfter", before + after)
        add(last, "hold", count(cleaned, "~"))
        add(last, "quick", count(cleaned, "^"))
      } else {
        pendingRest += before + after
      }
      continue
    }

    if (last) add(last, "restAfter", before)
    else pendingRest += before
    // Split after each hyphen (which stays, on the part before it) and at
    // each "|" (which goes).
    const parts = cleaned
      .split(/(?<=-)|\|/)
      .filter((x) => x.replace(/[~^]/g, ""))
    if (!parts.length) parts.push(cleaned.replace(/\|/g, ""))
    const first = tokens.length
    parts.forEach((syl, i) => {
      const token: PhrasingToken = {
        text: syl.replace(/[~^]/g, ""),
        wordStart: i === 0,
        time: null,
      }
      add(token, "hold", count(syl, "~"))
      add(token, "quick", count(syl, "^"))
      tokens.push(token)
    })
    if (first === 0) add(tokens[0], "restBefore", pendingRest)
    add(tokens[tokens.length - 1], "restAfter", after)
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
  const previousTokens = flattenTokens(previousScreens).map((ref) =>
    resolveToken(previousScreens, ref),
  )
  // Line taps and break taps carry over the same way, line by line.
  const previousLines = previousScreens.flatMap((s) => s.lines)
  const previousBreaks = previousScreens.filter((s) => s.instrumental)

  let i = 0
  let l = 0
  let b = 0
  for (const screen of freshScreens) {
    if (screen.instrumental) {
      const prev = previousBreaks[b++]
      if (prev?.start != null) screen.start = prev.start
    }
    for (const line of screen.lines) {
      const prevLine = previousLines[l++]
      if (prevLine?.start != null) line.start = prevLine.start
      if (prevLine?.end != null) line.end = prevLine.end
      for (const token of line.tokens) {
        const prev = previousTokens[i++]
        if (!prev) continue
        token.time = prev.time
        if (prev.end != null) token.end = prev.end
      }
    }
  }
  return freshScreens
}

// The shape of a phrasing: its screens, which are breaks, and how many
// lines each has. Edits that keep the shape (changing words, adding timing
// marks, relabeling a part) can be applied live without disturbing a
// single tap.
export function phrasingShape(screens: PhrasingScreen[]): string {
  return screens
    .map((s) => (s.instrumental ? "I" : String(s.lines.length)))
    .join(",")
}

// Applies re-parsed text of the same shape: every line keeps its own line
// tap (and end), every break its tap, and each word its tapped time by
// position within its own line.
export function carrySameShape(
  freshScreens: PhrasingScreen[],
  previousScreens: PhrasingScreen[],
): PhrasingScreen[] {
  freshScreens.forEach((screen, si) => {
    const prev = previousScreens[si]
    if (!prev) return
    if (screen.instrumental && prev.start != null) screen.start = prev.start
    screen.lines.forEach((line, li) => {
      const prevLine = prev.lines[li]
      if (!prevLine) return
      if (prevLine.start != null) line.start = prevLine.start
      if (prevLine.end != null) line.end = prevLine.end
      line.tokens.forEach((token, ti) => {
        const prevToken = prevLine.tokens[ti]
        if (!prevToken) return
        token.time = prevToken.time
        if (prevToken.end != null) token.end = prevToken.end
      })
    })
  })
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

// What's still to tap before a sync is complete (and Stage Mode plays it):
// lines for a line-by-line sync, words for a word-by-word one.
export function untapped(phrasing: Phrasing | null | undefined): {
  count: number
  unit: "line" | "word"
} {
  const screens = phrasing?.screens ?? []
  if (phrasing?.sync?.mode === "line") {
    const lines = screens.flatMap((s) => s.lines)
    return { count: lines.filter((l) => l.start == null).length, unit: "line" }
  }
  const tokens = screens.flatMap((s) => s.lines.flatMap((l) => l.tokens))
  return { count: tokens.filter((t) => t.time == null).length, unit: "word" }
}

// A sync saved before a change to how words are read (hyphens used to be
// hidden) shows its words the current way: re-read from its own text,
// keeping every time. A line whose words no longer line up is left as is.
export function withCurrentTokens(phrasing: Phrasing): Phrasing {
  if (!phrasing.sourceText) return phrasing
  const fresh = parsePhrasingText(phrasing.sourceText)
  if (phrasingShape(fresh) !== phrasingShape(phrasing.screens)) return phrasing
  return {
    ...phrasing,
    screens: phrasing.screens.map((screen, si) => ({
      ...screen,
      lines: screen.lines.map((line, li) => {
        const tokens = fresh[si].lines[li]?.tokens ?? []
        if (tokens.length !== line.tokens.length) return line
        return {
          ...line,
          tokens: line.tokens.map((t, ti) => ({
            ...t,
            text: tokens[ti].text,
            wordStart: tokens[ti].wordStart,
          })),
        }
      }),
    })),
  }
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
