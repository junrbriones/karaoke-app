// Line-by-line karaoke sync: tap once as each line of the song starts, and
// the words of the line are placed for you.
//
// - Tempo: the line taps are real musical events (lines nearly always
//   start on a beat), so a steady beat grid fitted through them gives the
//   song's tempo and where its beats fall (`detectTempo`). Lines starting
//   on a bar line fit several tempos equally well (90, 120, 180...), so
//   it returns the best few and the editor lets you pick; the song's own
//   tempo, when it has one, is used as a hint.
// - Words: each word is sung for as long as its syllables take at the
//   song's pace (half a beat a syllable by default), adjusted by the timing
//   marks written in the lyrics ("~" hold, "/" pause, "^" quick; see
//   lib/phrasing.ts), from the line's tap on; the time left before the next
//   line is a breath. A line too wordy for that pace (or with its end
//   marked by a held tap, or with the pace set to "fill") shares out its
//   whole length instead. With a tempo, the words then snap to the nearest
//   beat or half/quarter beat so the highlight moves in time with the
//   music (`placeLine`).
//
// Everything is derived from the line taps, so changing the tempo, the
// snapping or the marks re-places the words instantly without re-tapping.

import type {
  PhrasingLine,
  PhrasingScreen,
  PhrasingSync,
  PhrasingToken,
} from "@/lib/phrasing"

/* ------------------------------------------------------------ syllables */

// Rough syllable count: vowel groups. Works for Tagalog (ma-ga-nda) and
// most English; an English silent final "e" ("love", "time") counts half,
// since it's sometimes sung ("pa-re") and sometimes not.
export function syllableCount(text: string): number {
  const word = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
  if (!word) return 1
  let groups = word.match(/[aeiou]+/g)?.length ?? 0
  if (!groups) return Math.max(1, word.match(/y+/g)?.length ?? 1)
  if (groups > 1 && /[^aeiouly]e$/.test(word)) groups -= 0.5
  return groups
}

// How long a token is sung, in units (about one syllable each).
export function tokenUnits(token: PhrasingToken): number {
  const base = syllableCount(token.text) * 0.5 ** (token.quick ?? 0)
  return base + (token.hold ?? 0)
}

/* ---------------------------------------------------------------- grid */

export interface BeatGrid {
  bpm: number
  phase: number // seconds: where a beat falls
  sub: number // notes per beat to snap to (1 = beats, 2 = eighths...)
}

export interface Placed {
  time: number
  end: number
}

function proportional(
  tokens: PhrasingToken[],
  start: number,
  end: number,
): { starts: number[]; ends: number[] } {
  const a: number[] = []
  const b: number[] = []
  let cursor = 0
  for (const t of tokens) {
    cursor += t.restBefore ?? 0
    a.push(cursor)
    cursor += tokenUnits(t)
    b.push(cursor)
    cursor += t.restAfter ?? 0
  }
  const scale = cursor > 0 ? (end - start) / cursor : 0
  return {
    starts: a.map((x) => start + x * scale),
    ends: b.map((x) => start + x * scale),
  }
}

// How long a word must last before the next may start: one grid step, or
// a half/quarter/... of one for a quick word ("^", "^^"), which is also
// allowed to hand over to the next word between grid lines.
function minGap(token: PhrasingToken, step: number): number {
  return step / 2 ** Math.min(4, token.quick ?? 0)
}

function snapped(
  tokens: PhrasingToken[],
  start: number,
  end: number,
  step: number,
  phase: number,
): Placed[] | null {
  const snapTo = (x: number, s: number) =>
    phase + Math.round((x - phase) / s) * s
  const n = tokens.length
  const gaps = tokens.map((t) => minGap(t, step))
  const S = snapTo(start, step)
  let E = snapTo(end, step)
  if (E <= S) E = S + step
  const need = gaps.reduce((a, b) => a + b, 0)
  if (E - S + 1e-6 < need) return null

  const { starts, ends } = proportional(tokens, S, E)
  // Room the words after i still need, so they all fit before the end.
  const after = gaps.map((_, i) => gaps.slice(i).reduce((a, b) => a + b, 0))
  const times: number[] = []
  for (let i = 0; i < n; i++) {
    // A word after a quick one snaps to that word's finer grid.
    const grid = i === 0 ? step : gaps[i - 1]
    const lo = i === 0 ? S : times[i - 1] + gaps[i - 1]
    const hi = E - after[i]
    times.push(Math.min(hi, Math.max(lo, snapTo(starts[i], grid))))
  }
  return tokens.map((t, i) => {
    const next = i + 1 < n ? times[i + 1] : E
    if (!(t.restAfter ?? 0) && i + 1 < n) return { time: times[i], end: next }
    // Before a pause (or at the end of the line), the word ends on the
    // grid too -- at least one (quick) step after it starts.
    const want = i + 1 < n || t.restAfter ? snapTo(ends[i], gaps[i]) : E
    const lo = Math.min(next, times[i] + gaps[i])
    return { time: times[i], end: Math.min(next, Math.max(lo, want)) }
  })
}

export const DEFAULT_PACE = 0.5 // beats per syllable

// The line's words at their natural length, in units (rests included).
export function lineUnits(tokens: PhrasingToken[]): number {
  return tokens.reduce(
    (sum, t) => sum + tokenUnits(t) + (t.restBefore ?? 0) + (t.restAfter ?? 0),
    0,
  )
}

// Places a line's tokens between its start and end. With `unitSeconds`
// (a syllable's natural length, from the tempo) the words are sung at that
// pace from the start and the line ends when they're done -- the rest of
// the time until the next line is a breath, and a quick word ("^") really
// is quicker. A line with more words than fit at that pace is squeezed to
// fit. Without it, the words share the whole line.
export function placeLine(
  tokens: PhrasingToken[],
  start: number,
  lineEnd: number,
  grid?: BeatGrid | null,
  unitSeconds?: number | null,
): Placed[] {
  if (!tokens.length) return []
  const end =
    unitSeconds && unitSeconds > 0
      ? Math.min(lineEnd, start + lineUnits(tokens) * unitSeconds)
      : lineEnd
  if (grid && grid.bpm > 0 && grid.sub > 0) {
    const step = 60 / grid.bpm / grid.sub
    // Too many words for the grid? Try twice as fine before giving up.
    const placed =
      snapped(tokens, start, end, step, grid.phase) ??
      snapped(tokens, start, end, step / 2, grid.phase)
    if (placed) return placed
  }
  const { starts, ends } = proportional(tokens, start, end)
  return tokens.map((t, i) => ({
    time: starts[i],
    end: t.restAfter || i === tokens.length - 1 ? ends[i] : starts[i + 1],
  }))
}

/* ------------------------------------------------------------- the song */

export interface Cue {
  kind: "line" | "break" // a lyric line, or an [Instrumental] break
  screenIndex: number
  lineIndex: number // -1 for a break
  time: number | null
}

// Everything that's tapped in line mode, in song order.
export function cuesOf(screens: PhrasingScreen[]): Cue[] {
  const cues: Cue[] = []
  screens.forEach((screen, screenIndex) => {
    if (screen.instrumental) {
      cues.push({
        kind: "break",
        screenIndex,
        lineIndex: -1,
        time: screen.start ?? null,
      })
      return
    }
    screen.lines.forEach((line, lineIndex) => {
      cues.push({
        kind: "line",
        screenIndex,
        lineIndex,
        time: line.start ?? null,
      })
    })
  })
  return cues
}

export function cueLine(
  screens: PhrasingScreen[],
  cue: Cue,
): PhrasingLine | null {
  return cue.kind === "line"
    ? (screens[cue.screenIndex]?.lines[cue.lineIndex] ?? null)
    : null
}

// When a tapped line ends: where its tap was let go, else the next tap
// (the next line, or a break), else an estimate from its length.
export function lineEnd(
  screens: PhrasingScreen[],
  cues: Cue[],
  index: number,
  bpm: number | null,
): number | null {
  const cue = cues[index]
  const line = cueLine(screens, cue)
  if (!line || cue.time == null) return null
  if (line.end != null && line.end > cue.time) return line.end
  const next = cues[index + 1]?.time
  if (next != null && next > cue.time) return next
  const unitSec = bpm && bpm > 0 ? 30 / bpm : 0.3
  return cue.time + Math.max(1, lineUnits(line.tokens)) * unitSec
}

// The words' times for a line-synced phrasing, derived from the line taps.
// Returns a copy; a line that hasn't been tapped gets no times.
export function applyLineSync(
  screens: PhrasingScreen[],
  sync: PhrasingSync,
): { screens: PhrasingScreen[]; complete: boolean } {
  const out = JSON.parse(JSON.stringify(screens)) as PhrasingScreen[]
  const cues = cuesOf(out)
  const grid =
    sync.bpm && sync.grid > 0
      ? { bpm: sync.bpm, phase: sync.phase ?? 0, sub: sync.grid }
      : null
  const pace = sync.pace ?? DEFAULT_PACE
  const unitSeconds = sync.bpm && pace > 0 ? (pace * 60) / sync.bpm : null
  let complete = out.some((s) => s.lines.length > 0)
  cues.forEach((cue, i) => {
    const line = cueLine(out, cue)
    if (!line) return
    const end = lineEnd(out, cues, i, sync.bpm)
    if (cue.time == null || end == null) {
      complete = false
      for (const t of line.tokens) {
        t.time = null
        delete t.end
      }
      return
    }
    // A line whose end was marked (a held tap) is sung right up to it.
    const paced = line.end != null ? null : unitSeconds
    placeLine(line.tokens, cue.time, end, grid, paced).forEach((p, k) => {
      line.tokens[k].time = round3(p.time)
      line.tokens[k].end = round3(p.end)
    })
  })
  return { screens: out, complete }
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000
}

/* ---------------------------------------------------------------- tempo */

export interface TempoCandidate {
  bpm: number
  phase: number
  fit: number // 0..1: how tightly the taps sit on its beats
  error: number // average distance from a tap to its beat, in seconds
}

function resultant(onsets: number[], period: number) {
  let c = 0
  let s = 0
  for (const t of onsets) {
    const a = (2 * Math.PI * t) / period
    c += Math.cos(a)
    s += Math.sin(a)
  }
  return {
    r: Math.hypot(c, s) / onsets.length,
    angle: Math.atan2(s, c),
  }
}

function mod(x: number, m: number): number {
  return ((x % m) + m) % m
}

// The best place for the beats at a given tempo, and how well taps sit
// on them.
export function fitPhase(onsets: number[], bpm: number): TempoCandidate {
  const period = 60 / bpm
  const { r, angle } = resultant(onsets, period)
  const phase = mod((angle / (2 * Math.PI)) * period, period)
  const error =
    onsets.reduce((sum, t) => {
      const d = mod(t - phase, period)
      return sum + Math.min(d, period - d)
    }, 0) / Math.max(1, onsets.length)
  return { bpm, phase, fit: r, error }
}

// Least-squares fit of a steady beat through the taps, starting from a
// close guess: each tap is put on its nearest beat, then the line through
// them gives the exact beat length.
function refine(onsets: number[], bpm: number, phase: number) {
  let b = bpm
  let ph = phase
  for (let pass = 0; pass < 3; pass++) {
    const period = 60 / b
    const ns = onsets.map((t) => Math.round((t - ph) / period))
    const meanN = ns.reduce((x, y) => x + y, 0) / ns.length
    const meanT = onsets.reduce((x, y) => x + y, 0) / onsets.length
    let cov = 0
    let varN = 0
    ns.forEach((n, i) => {
      cov += (n - meanN) * (onsets[i] - meanT)
      varN += (n - meanN) ** 2
    })
    if (varN === 0) break
    const p = cov / varN
    const nextBpm = 60 / p
    if (!Number.isFinite(nextBpm) || Math.abs(nextBpm / b - 1) > 0.03) break
    b = nextBpm
    ph = mod(meanT - p * meanN, p)
  }
  return b
}

const MIN_BPM = 50
const MAX_BPM = 200

function prior(bpm: number, hint: number | null): number {
  const center = hint && hint > 0 ? hint : 110
  const sigma = hint && hint > 0 ? 0.3 : 0.6 // in octaves
  const d = Math.log2(bpm / center)
  return Math.exp(-(d * d) / (2 * sigma * sigma))
}

export function onsetsOf(screens: PhrasingScreen[]): number[] {
  return cuesOf(screens)
    .map((c) => c.time)
    .filter((t): t is number => t != null && Number.isFinite(t))
    .sort((a, b) => a - b)
}

// The tempos that best explain the taps, best first (up to `count`).
// Needs at least four taps.
export function detectTempo(
  rawOnsets: number[],
  hint: number | null = null,
  count = 3,
): TempoCandidate[] {
  const onsets = [...rawOnsets].sort((a, b) => a - b)
  if (onsets.length < 4) return []
  const span = onsets[onsets.length - 1] - onsets[0]
  if (span < 2) return []
  // Fine enough that the beat can't drift more than ~1/20 of a beat over
  // the whole song between two neighboring candidates.
  const step = Math.min(0.1, 3 / span)
  const scores: { bpm: number; score: number }[] = []
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += step) {
    const { r } = resultant(onsets, 60 / bpm)
    scores.push({ bpm, score: r ** 4 * prior(bpm, hint) })
  }
  const peaks = scores
    .filter(
      (s, i) =>
        (i === 0 || s.score >= scores[i - 1].score) &&
        (i === scores.length - 1 || s.score >= scores[i + 1].score),
    )
    .sort((a, b) => b.score - a.score)

  const picked: TempoCandidate[] = []
  for (const peak of peaks) {
    if (picked.length >= count) break
    const guess = fitPhase(onsets, peak.bpm)
    const bpm = refine(onsets, peak.bpm, guess.phase)
    if (picked.some((p) => Math.abs(p.bpm / bpm - 1) < 0.03)) continue
    const fit = fitPhase(onsets, bpm)
    if (fit.fit < 0.3) continue
    picked.push(fit)
  }
  return picked.sort(
    (a, b) => b.fit ** 4 * prior(b.bpm, hint) - a.fit ** 4 * prior(a.bpm, hint),
  )
}
