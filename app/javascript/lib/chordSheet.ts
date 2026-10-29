// Parsing for the chord+lyric body of a Song.
//
// - A line made up only of chords (and whitespace) is paired with the
//   plain-text line right below it; the chords sit over the syllables where
//   they change, by column.
// - A line wrapped in [Brackets] is a section header. Blank lines are
//   spacers. Force a line's type with a leading marker if detection ever
//   gets it wrong:  "| Am  G  F  C" forces chords, "> spoken intro" lyrics.
//
// Chords: roots A-G with #/b, any of the usual qualities and extensions
// (m, maj7, m7b5, 7sus, sus4, add9, dim, aug, +, 6/9, 7(b9), ...), slash
// bass notes (D/F#), and "N.C.". Several chords strummed within one bar
// can be joined with dashes -- "Dm-G7sus-G7-" -- and a chord line may also
// contain bar lines and other markings ("|", "-", "/", "%") that aren't
// chords themselves.
//
// A chord line with no lyrics under it is instrumental (an intro, interlude,
// solo...). Each chord -- or dash-joined group of chords -- is one bar, the
// way bands read them: "F Em Dm-G7sus-G7-" is three bars. Add "x2" (or
// "2x") at the end to play the run that many times.
//
// Repeats: a header like [Repeat Chorus 1], [Repeat Refrain 2x], or
// [Repeat Chorus 2 2x, fade] plays an earlier section again without
// retyping it. It's expanded right here, so Stage Mode, Live Sync, the
// tempo guide, and the phrasing editor all see the song as it's actually
// performed. "Repeat" can also be written "Rpt", "Ulit", or "Ulitin".

export type LyricToken = {
  text: string
  isWord: boolean
  wordIndex: number
}

export interface RepeatInfo {
  pass: number // 1-based
  passes: number
  note: string | null // e.g. "fade"
}

export type SongBlock =
  | { type: "blank" }
  | { type: "section"; text: string; repeat?: RepeatInfo }
  // `times`: how many times an instrumental chord run is played ("x2").
  | { type: "pair"; chords: string; lyrics: string; times?: number }

export interface BodyIssue {
  line: number // 1-based line in the text as typed
  message: string
}

export interface BodyAnalysis {
  blocks: SongBlock[]
  issues: BodyIssue[]
  sections: string[] // section names, in order, that can be repeated
}

/* ------------------------------------------------------------ chords */

const ROOT = "[A-G](?:#|b)?"
const EXTENSION =
  "(?:maj|min|dim|aug|sus|add|alt|m|M|°|ø|\\+|\\d{1,2}|[b#]\\d{1,2}|\\([^()\\s]*\\))*"
const CHORD_RE = new RegExp(`^${ROOT}${EXTENSION}(?:\\/(?:${ROOT}|\\d{1,2}))?$`)
// Bar lines, beat slashes, hold dashes, simile marks -- fine in a chord
// line, but not chords.
const SYMBOL_RE = /^[-–—|/%.:~*]+$/
const REPEAT_TOKEN_RE = /^\(?(?:[xX×]\s?\d+|\d+\s?[xX×])\)?$/
const NO_CHORD_RE = /^N\.?C\.?$/i

export type ChordTokenKind = "chord" | "symbol" | "repeat"

function unwrapParens(token: string): string {
  const m = token.match(/^\((.*)\)$/)
  return m ? m[1] : token
}

// Splits a dash-joined group like "Dm-G7sus-G7-" into its chords.
function splitGroup(token: string): string[] {
  return unwrapParens(token)
    .split(/[-–]+/)
    .filter((p) => p.length > 0)
}

export function isChord(name: string): boolean {
  return CHORD_RE.test(name) || NO_CHORD_RE.test(name)
}

export function classifyChordToken(token: string): ChordTokenKind | null {
  if (SYMBOL_RE.test(token)) return "symbol"
  if (REPEAT_TOKEN_RE.test(token)) return "repeat"
  const parts = splitGroup(token)
  return parts.length && parts.every(isChord) ? "chord" : null
}

export function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return false
  let chords = 0
  for (const t of tokens) {
    const kind = classifyChordToken(t)
    if (!kind) return false
    if (kind === "chord") chords++
  }
  return chords > 0
}

// The bars of a chord line: one entry per chord (or dash-joined group),
// each listing the chords played in that bar. Markings that aren't chords
// are dropped.
export function chordGroups(chordLine: string): string[][] {
  return chordLine
    .trim()
    .split(/\s+/)
    .filter((t) => classifyChordToken(t) === "chord")
    .map(splitGroup)
}

// "G D Em C x2" -> { base: "G D Em C", times: 2 }; times is null when
// there's no trailing repeat count.
const TRAILING_COUNT_RE = /^(.*\S)\s+\(?(?:[xX×]\s?(\d+)|(\d+)\s?[xX×])\)?$/
function splitRepeatCount(content: string): {
  base: string
  times: number | null
} {
  const m = content.match(TRAILING_COUNT_RE)
  if (!m) return { base: content, times: null }
  const times = parseInt(m[2] ?? m[3], 10)
  if (!Number.isFinite(times) || times < 1)
    return { base: content, times: null }
  return { base: m[1], times }
}

/* ----------------------------------------------------------- repeats */

const HEADER_RE = /^\[(.+)\]$/
const REPEAT_DIRECTIVE_RE = /^(?:repeat|rpt\.?|ulitin|ulit)\b[\s:.-]*(.*)$/i
const WORD_COUNTS: Record<string, number> = { once: 1, twice: 2, thrice: 3 }

export interface RepeatDirective {
  target: string // section name; "" = the section just before
  times: number
  note: string | null
}

function takeCount(text: string): { rest: string; times: number | null } {
  let m = text.match(
    /^(.*?)\s*\(?(?:(\d+)\s*[xX×]|[xX×]\s*(\d+)|(\d+)\s+times)\)?$/,
  )
  if (m && (m[2] ?? m[3] ?? m[4])) {
    return { rest: m[1].trim(), times: parseInt(m[2] ?? m[3] ?? m[4], 10) }
  }
  m = text.match(/^(.*?)\s*\b(once|twice|thrice)$/i)
  if (m) return { rest: m[1].trim(), times: WORD_COUNTS[m[2].toLowerCase()] }
  return { rest: text.trim(), times: null }
}

export function parseRepeatDirective(header: string): RepeatDirective | null {
  const m = header.trim().match(REPEAT_DIRECTIVE_RE)
  if (!m) return null
  let rest = m[1].trim()
  let note: string | null = null
  const comma = rest.search(/[,;]/)
  if (comma >= 0) {
    note = rest.slice(comma + 1).trim() || null
    rest = rest.slice(0, comma).trim()
  }
  let { rest: target, times } = takeCount(rest)
  if (times == null && note) {
    // "[Repeat Chorus, 2x]" or "[Repeat Chorus, 2x fade]"
    const fromNote = note.match(
      /^(?:\(?(\d+)\s*[xX×]\)?|[xX×]\s*(\d+)|(twice|thrice))\b\s*(.*)$/i,
    )
    if (fromNote) {
      times = fromNote[3]
        ? WORD_COUNTS[fromNote[3].toLowerCase()]
        : parseInt(fromNote[1] ?? fromNote[2], 10)
      note = fromNote[4].trim() || null
    }
  }
  // "[Repeat the Chorus]", "[Ulitin ang Chorus]"
  target = target.replace(/^(?:the|ang|sa)\s+/i, "").replace(/[:.\s]+$/, "")
  return { target, times: Math.max(1, Math.min(16, times ?? 1)), note }
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

interface Line {
  text: string
  src: number // 0-based index of the typed line it came from
  copy: boolean // part of an expanded repeat
  repeat?: RepeatInfo
}

interface Section {
  name: string
  lines: Line[]
}

function findSection(sections: Section[], target: string): Section | null {
  if (!sections.length) return null
  if (!target) return sections[sections.length - 1]
  const want = normalizeName(target)
  for (let i = sections.length - 1; i >= 0; i--) {
    if (normalizeName(sections[i].name) === want) return sections[i]
  }
  // "Chorus" repeats the most recent "Chorus 1"/"Chorus 2"...
  for (let i = sections.length - 1; i >= 0; i--) {
    if (normalizeName(sections[i].name).startsWith(`${want} `)) {
      return sections[i]
    }
  }
  return null
}

function expandRepeats(raw: string[]): {
  lines: Line[]
  issues: BodyIssue[]
  sections: string[]
} {
  const out: Line[] = []
  const issues: BodyIssue[] = []
  const sections: Section[] = []
  let current: Section | null = null

  raw.forEach((text, src) => {
    const header = text.trim().match(HEADER_RE)
    const directive = header ? parseRepeatDirective(header[1]) : null

    if (directive) {
      current = null
      const section = findSection(sections, directive.target)
      if (!section) {
        issues.push({
          line: src + 1,
          message: directive.target
            ? `There's no [${directive.target}] section above this to repeat.`
            : "There's no section above this to repeat.",
        })
        return
      }
      const body = [...section.lines]
      while (body.length && !body[body.length - 1].text.trim()) body.pop()
      for (let pass = 1; pass <= directive.times; pass++) {
        if (out.length && out[out.length - 1].text.trim()) {
          out.push({ text: "", src, copy: true })
        }
        out.push({
          text: `[${section.name}]`,
          src,
          copy: true,
          repeat: { pass, passes: directive.times, note: directive.note },
        })
        for (const line of body) out.push({ ...line, src, copy: true })
      }
      return
    }

    const line: Line = { text, src, copy: false }
    out.push(line)
    if (header) {
      current = { name: header[1].trim(), lines: [] }
      sections.push(current)
    } else if (current) {
      current.lines.push(line)
    }
  })

  const names: string[] = []
  for (const s of sections) if (!names.includes(s.name)) names.push(s.name)
  return { lines: out, issues, sections: names }
}

/* ------------------------------------------------------------- parse */

// A lyric line that's mostly chords probably has a typo in one of them.
function chordTypoIssue(text: string, line: number): BodyIssue | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return null
  const kinds = tokens.map(classifyChordToken)
  const chordish = kinds.filter((k) => k === "chord").length
  const unknown = tokens.filter((t, i) => !kinds[i] && /^\(?[A-G]/.test(t))
  if (!unknown.length || chordish === 0) return null
  if (chordish + unknown.length < tokens.length * 0.75) return null
  return {
    line,
    message: `Read as lyrics because ${unknown
      .map((t) => `"${t}"`)
      .join(
        ", ",
      )} ${unknown.length === 1 ? "isn't a chord" : "aren't chords"} I recognize. Fix the chord, or start the line with "| " to force it.`,
  }
}

export function analyzeBody(body: string): BodyAnalysis {
  const raw = (body || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .split("\n")
  const { lines, issues, sections } = expandRepeats(raw)
  const blocks: SongBlock[] = []
  let idx = 0

  while (idx < lines.length) {
    const line = lines[idx]
    const rawLine = line.text

    if (rawLine.trim() === "") {
      blocks.push({ type: "blank" })
      idx++
      continue
    }

    const sectionMatch = rawLine.trim().match(HEADER_RE)
    if (sectionMatch) {
      blocks.push(
        line.repeat
          ? {
              type: "section",
              text: sectionMatch[1].trim(),
              repeat: line.repeat,
            }
          : { type: "section", text: sectionMatch[1].trim() },
      )
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

    // Only a chord line can carry a repeat count, and only when what's left
    // still reads as chords -- so a lyric ending in "x4" isn't misread.
    let chordContent = content
    let times = 1
    if (forced !== "lyrics") {
      const split = splitRepeatCount(content)
      if (
        split.times !== null &&
        (forced === "chords" || isChordLine(split.base))
      ) {
        chordContent = split.base
        times = split.times
      }
    }

    const treatAsChords =
      forced === "chords" || (forced !== "lyrics" && isChordLine(chordContent))

    if (!treatAsChords) {
      if (!forced && !line.copy) {
        const issue = chordTypoIssue(content, line.src + 1)
        if (issue) issues.push(issue)
      }
      blocks.push({ type: "pair", chords: "", lyrics: content })
      idx += 1
      continue
    }

    // A repeated instrumental run always stands on its own.
    const next = lines[idx + 1]?.text
    const nextIsPlain =
      times === 1 &&
      next !== undefined &&
      next.trim() !== "" &&
      !HEADER_RE.test(next.trim()) &&
      !next.startsWith("| ") &&
      !isChordLine(next)
    if (nextIsPlain) {
      // A forced "> " lyric keeps its columns under the chords.
      const forcedLyric = next.startsWith("> ")
      const lyrics = forcedLyric ? `  ${next.slice(2)}` : next
      if (!forcedLyric && !lines[idx + 1].copy) {
        const issue = chordTypoIssue(next, lines[idx + 1].src + 1)
        if (issue) issues.push(issue)
      }
      blocks.push({ type: "pair", chords: chordContent, lyrics })
      idx += 2
    } else {
      blocks.push(
        times > 1
          ? { type: "pair", chords: chordContent, lyrics: "", times }
          : { type: "pair", chords: chordContent, lyrics: "" },
      )
      idx += 1
    }
  }

  issues.sort((a, b) => a.line - b.line)
  return { blocks, issues, sections }
}

export function parseBody(body: string): SongBlock[] {
  return analyzeBody(body).blocks
}

export function sectionLabel(block: {
  text: string
  repeat?: RepeatInfo
}): string {
  if (!block.repeat) return block.text
  const { pass, passes, note } = block.repeat
  const parts = [
    passes > 1 ? `repeat ${pass}/${passes}` : "repeat",
    ...(note ? [note] : []),
  ]
  return `${block.text} (${parts.join(", ")})`
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
