// Parsing for the chord+lyric body of a Song. A line made up only of chords
// (and whitespace) is paired with the plain-text line right below it. A
// line wrapped in [Brackets] is a section header. Blank lines are spacers.
// Force a line's type with a leading marker if detection ever gets it wrong:
//   "| Am  G  F  C"   forces a chord line
//   "> spoken intro"  forces a lyric line
//
// A chord line with nothing below it (an instrumental intro, ad lib, etc.)
// is its own block with no lyrics. By default it takes up exactly as many
// beats as a normal verse line -- one bar -- so it stays in step with the
// rest of the song. Give it more room with a trailing "xN" marker when it
// needs to span several bars, e.g. a 4-bar intro:
//   "G   D   Em   C   x4"

export type LyricToken = {
  text: string
  isWord: boolean
  wordIndex: number
}

export type SongBlock =
  | { type: "blank" }
  | { type: "section"; text: string }
  | { type: "pair"; chords: string; lyrics: string; bars?: number }

const CHORD_TOKEN_REGEX =
  /^[A-G](#|b)?(?:maj7|min7|dim7|maj9|min9|sus2|sus4|add9|add11|add13|maj|min|dim|aug|sus|add|m|M)*[0-9]*(?:(?:b|#)(?:5|9|11|13))?(?:\/[A-G](#|b)?(?:maj|min|dim|aug|sus|add|m)?[0-9]*)?$/

const BAR_MULTIPLIER_REGEX = /^(.*\S)\s+[xX](\d+)$/

export function isChordLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  const tokens = trimmed.split(/\s+/)
  return (
    tokens.length > 0 &&
    tokens.every((t) => t.length <= 8 && CHORD_TOKEN_REGEX.test(t))
  )
}

// Splits a trailing "xN" bar-count marker off a chord line, e.g.
// "G D Em C  x4" -> { base: "G D Em C", bars: 4 }. Returns bars: null when
// there's no such marker (the normal case), so callers know nothing changed.
function splitBarMultiplier(content: string): {
  base: string
  bars: number | null
} {
  const match = content.match(BAR_MULTIPLIER_REGEX)
  if (!match) return { base: content, bars: null }

  const bars = parseInt(match[2], 10)
  if (!Number.isFinite(bars) || bars < 1) return { base: content, bars: null }

  return { base: match[1], bars }
}

export function parseBody(body: string): SongBlock[] {
  const bodyLines = (body || "").replace(/\r\n/g, "\n").split("\n")
  const blocks: SongBlock[] = []
  let idx = 0

  while (idx < bodyLines.length) {
    const rawLine = bodyLines[idx]

    if (rawLine.trim() === "") {
      blocks.push({ type: "blank" })
      idx++
      continue
    }

    const sectionMatch = rawLine.trim().match(/^\[(.+)\]$/)
    if (sectionMatch) {
      blocks.push({ type: "section", text: sectionMatch[1] })
      idx++
      continue
    }

    let forced: "chords" | "lyrics" | null = null
    let content = rawLine
    if (rawLine.startsWith("| ")) {
      forced = "chords"
      content = rawLine.slice(2)
    } else if (rawLine.startsWith("> ")) {
      forced = "lyrics"
      content = rawLine.slice(2)
    }

    // Only chord lines can carry a bar-count marker, and only once we know
    // stripping it still leaves something that reads as chords -- this
    // keeps an ordinary lyric that happens to end in, say, "x4 times" from
    // being misread.
    let chordContent = content
    let bars = 1
    if (forced !== "lyrics") {
      const split = splitBarMultiplier(content)
      if (
        split.bars !== null &&
        (forced === "chords" || isChordLine(split.base))
      ) {
        chordContent = split.base
        bars = split.bars
      }
    }

    const treatAsChords =
      forced === "chords" || (forced !== "lyrics" && isChordLine(chordContent))

    if (treatAsChords) {
      // A multi-bar instrumental always stands on its own -- it's already
      // spanning several bars, so it doesn't also pair with a lyric line.
      if (bars > 1) {
        blocks.push({ type: "pair", chords: chordContent, lyrics: "", bars })
        idx += 1
        continue
      }

      const next = bodyLines[idx + 1]
      const nextIsPlain =
        next !== undefined &&
        next.trim() !== "" &&
        !/^\[(.+)\]$/.test(next.trim()) &&
        !next.startsWith("| ") &&
        !isChordLine(next)
      if (nextIsPlain) {
        blocks.push({ type: "pair", chords: chordContent, lyrics: next })
        idx += 2
      } else {
        blocks.push({ type: "pair", chords: chordContent, lyrics: "" })
        idx += 1
      }
    } else {
      blocks.push({ type: "pair", chords: "", lyrics: content })
      idx += 1
    }
  }

  return blocks
}

export function tokenizeLyrics(text: string): LyricToken[] {
  if (!text) return []
  let wordIndex = 0
  return text
    .split(/(\s+)/)
    .filter((p) => p.length > 0)
    .map((p) => {
      const isWord = !/^\s+$/.test(p)
      const tok: LyricToken = {
        text: p,
        isWord,
        wordIndex: isWord ? wordIndex : -1,
      }
      if (isWord) wordIndex++
      return tok
    })
}
