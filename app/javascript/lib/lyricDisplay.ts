// The display model behind the TV/kiosk lyric stage (components/karaoke/tv).
//
// Both of this app's timing sources -- a KaraFun-style tapped phrasing
// synced to real audio (lib/phrasing.ts) and the BPM-paced tempo guide over
// a chord sheet (lib/tempoGuide.ts) -- are turned into the same shape here:
// a list of screens of at most two lines, every token carrying an absolute
// start/end time. The renderer then only ever asks one question, "what is
// on screen at time t?", and gets back the current screen, a one-line
// "next up" preview, and a countdown cue when vocals are about to resume
// after an intro or a long instrumental break.
//
// Times are seconds on the track's own clock. `origin` is where that clock
// starts: 0 for audio, or negative for a tempo-guide count-in (the song
// itself always starts at 0).

import {
  type SongBlock,
  classifyChordToken,
  sectionLabel,
} from "@/lib/chordSheet"
import type { DuetLabel, Phrasing } from "@/lib/phrasing"
import { buildTimeline } from "@/lib/tempoGuide"
import { transposeToken } from "@/lib/transpose"

export type Part = DuetLabel | null

export interface DisplayToken {
  text: string
  // Starts a new word: rendered with a space before it unless it's first in
  // its line. False only for continuation syllables of a hyphen-split word.
  wordStart: boolean
  start: number // Infinity = never sung (an untapped token in the editor)
  end: number
  chord: string | null // chord change on this word (chord-sheet tracks only)
}

export interface DisplayLine {
  tokens: DisplayToken[]
}

export interface DisplayChord {
  text: string
  start: number
  end: number
  bar: number // 0-based bar within the screen's whole run, repeats included
}

export interface DisplayScreen {
  label: string | null // section name ("Chorus") or duet part ("Female")
  part: Part // drives the highlight color for duets
  instrumental: boolean
  chords: DisplayChord[] // an instrumental's chord run (chord sheets only)
  bars: number // how many bars that run lasts, repeats included
  lines: DisplayLine[] // never more than two
  start: number // first sung token (instrumental: when the rest begins)
  end: number // last token ends (instrumental: when vocals resume)
  showAt: number // when this screen takes over the display
  restBefore: number // silence leading into `start`, in seconds
}

export interface DisplayTrack {
  screens: DisplayScreen[]
  origin: number
  end: number // last sung moment, for the end-of-song card
  // Countdown unit: seconds per beat for a tempo track (so 4-3-2-1 lands on
  // the beat), or 1 for audio, where we don't know where the beat falls.
  countUnit: number
  countFrom: number
  // Bar length, for guiding a band through instrumentals (chord sheets
  // only; null for an audio sync, where we don't know the meter).
  beatsPerBar: number | null
  barDuration: number | null
}

// Where the band is in an instrumental: which bar, which beat, which chord
// -- or, before the run starts, how many beats of count-in are left.
export interface BandState {
  bar: number // 0-based
  bars: number
  beat: number // 0-based within the bar; -1 during the count-in
  beatsPerBar: number
  chord: number // index into screen.chords; -1 during the count-in
  countIn: number | null // beats left before the first chord
}

export interface DisplayCue {
  remaining: number // seconds until vocals start
  total: number // length of the whole rest, for a progress bar
  count: number | null // big 3-2-1 number, only in the final few units
}

export interface DisplayState {
  index: number // -1 before the first screen appears (intro card)
  screen: DisplayScreen | null
  preview: DisplayLine | null // next line that isn't on screen yet
  previewPart: Part
  cue: DisplayCue | null
  band: BandState | null
  ended: boolean
}

// A screen switches in as soon as the previous one's last word is done
// (plus a short hold so the final word doesn't vanish mid-sweep), but never
// more than LEAD_IN seconds before its own first word -- enough to read
// ahead without stealing the display from an instrumental too early.
export const LEAD_IN = 3
export const SCREEN_HOLD = 0.35
// Only rests at least this long get a countdown -- a normal breath between
// lines doesn't need one. The intro (or a tempo-guide count-in) gets one
// from a much shorter lead.
export const CUE_MIN_REST = 3.5
export const CUE_MIN_INTRO = 1
// A tapped token has a start but no end; it ends where the next one
// starts, except the last word of a line, which would otherwise "sweep"
// all the way through the breath that follows it.
export const MAX_TAIL = 2
const END_CARD_DELAY = 3

const DUET_RE = /^(male|female|all)$/i

function asPart(label: string | null): Part {
  if (!label || !DUET_RE.test(label.trim())) return null
  const s = label.trim()
  return (s[0].toUpperCase() + s.slice(1).toLowerCase()) as DuetLabel
}

/* ---------------------------------------------------------------- build */

type DraftScreen = Omit<
  DisplayScreen,
  "start" | "end" | "showAt" | "restBefore"
>

interface TrackMeter {
  countUnit: number
  countFrom: number
  beatsPerBar: number | null
  barDuration: number | null
}

function finalize(
  drafts: DraftScreen[],
  origin: number,
  meter: TrackMeter,
): DisplayTrack {
  const screens: DisplayScreen[] = []
  let prevEnd = origin // end of the last sung screen
  let prevContentEnd = origin // end of the last screen of any kind
  let prevWasRun = false // last screen was a timed chord run
  let prevShowAt = -Infinity
  let blocked = false // an untimed screen hides everything after it

  for (const d of drafts) {
    // No hold before the very first screen -- there's nothing to hold.
    const hold = screens.length ? SCREEN_HOLD : 0
    if (d.instrumental) {
      // A chord-sheet instrumental knows exactly when its chords fall; a
      // phrasing rest just starts when the singing stops.
      const run = d.chords.length > 0
      const start = run ? d.chords[0].start : prevEnd
      const runEnd = run ? d.chords[d.chords.length - 1].end : Infinity
      const showAt = blocked
        ? Infinity
        : Math.max(prevShowAt, Math.min(start, prevContentEnd + hold))
      screens.push({ ...d, start, end: runEnd, showAt, restBefore: 0 })
      if (!blocked) prevShowAt = showAt
      if (run) prevContentEnd = runEnd
      prevWasRun = run
      continue
    }

    const tokens = d.lines.flatMap((l) => l.tokens)
    const starts = tokens.map((t) => t.start).filter(Number.isFinite)
    const ends = tokens.map((t) => t.end).filter(Number.isFinite)

    if (!starts.length || blocked) {
      // Not tapped yet (phrasing editor). The first such screen still shows
      // up right after the last tapped one, so you can see what you're about
      // to tap; anything past it stays hidden.
      const showAt = blocked ? Infinity : Math.max(prevShowAt, prevEnd + hold)
      screens.push({
        ...d,
        start: Infinity,
        end: Infinity,
        showAt,
        restBefore: 0,
      })
      blocked = true
      continue
    }

    const start = Math.min(...starts)
    const end = Math.max(start, ...ends)
    const restBefore = Math.max(0, start - prevEnd)
    // Lyrics slide in early to be read ahead -- but never over the end of
    // a band's chord run, which needs its bar/beat guide to the last beat
    // (the Next preview already shows what's coming).
    const floor = prevWasRun ? prevContentEnd : prevEnd + hold
    const showAt = Math.max(
      prevShowAt,
      Math.min(start, Math.max(floor, start - LEAD_IN)),
    )
    screens.push({ ...d, start, end, showAt, restBefore })
    prevShowAt = showAt
    prevEnd = end
    prevContentEnd = end
    prevWasRun = false
    // Partly tapped: keep it up until the rest of its words are tapped.
    if (starts.length < tokens.length) blocked = true
  }

  // An instrumental runs until the next sung screen starts (or, at the end
  // of the song, until its last chord -- or forever for an audio outro).
  let lastEnd = prevEnd
  for (let i = 0; i < screens.length; i++) {
    const s = screens[i]
    if (!s.instrumental) continue
    const next = screens.slice(i + 1).find((x) => !x.instrumental)
    if (next) s.end = Math.max(next.start, Number.isFinite(s.end) ? s.end : 0)
    if (Number.isFinite(s.end)) lastEnd = Math.max(lastEnd, s.end)
  }

  return { screens, origin, end: lastEnd, ...meter }
}

// A KaraFun-style tapped phrasing, synced to the song's audio.
export function fromPhrasing(phrasing: Phrasing): DisplayTrack {
  type Ref = { token: DisplayToken; lastInLine: boolean }
  const refs: Ref[] = []

  const drafts: DraftScreen[] = phrasing.screens.map((screen) => ({
    label: screen.label,
    part: screen.label,
    instrumental: screen.instrumental,
    chords: [],
    bars: 0,
    lines: screen.lines.map((line) => ({
      tokens: line.tokens.map((t, i) => {
        const token: DisplayToken = {
          text: t.text,
          wordStart: t.wordStart,
          start: t.time ?? Infinity,
          end: Infinity,
          chord: null,
        }
        refs.push({ token, lastInLine: i === line.tokens.length - 1 })
        return token
      }),
    })),
  }))

  refs.forEach(({ token, lastInLine }, i) => {
    if (!Number.isFinite(token.start)) return
    const next = refs[i + 1]?.token.start ?? Infinity
    const tail = token.start + MAX_TAIL
    const end =
      lastInLine || !Number.isFinite(next) ? Math.min(next, tail) : next
    token.end = Math.max(token.start, end)
  })

  return finalize(drafts, 0, {
    countUnit: 1,
    countFrom: 3,
    beatsPerBar: null,
    barDuration: null,
  })
}

export interface ChordSheetOptions {
  bpm: number
  beatsPerLine: number
  countInBeats?: number
  semitones?: number
  preferFlat?: boolean
  // Per-block line lengths in beats (lib/lineTiming.ts).
  lineBeats?: (number | null)[] | null
}

// Which word each chord in a chord line lands on, by column: a chord sits
// over the syllable where the change happens, so it belongs to the word
// under it (or the next word, if it's sitting over a gap).
function chordsByWord(
  chordLine: string,
  wordSpans: { index: number; length: number }[],
  semitones: number,
  preferFlat: boolean,
): (string | null)[] {
  const out: (string | null)[] = wordSpans.map(() => null)
  if (!wordSpans.length) return out
  for (const m of chordLine.matchAll(/\S+/g)) {
    // Bar lines, hold dashes, etc. aren't chords to show over a word.
    if (classifyChordToken(m[0]) !== "chord") continue
    const col = m.index ?? 0
    let w = wordSpans.findIndex((s) => col < s.index + s.length)
    if (w === -1) w = wordSpans.length - 1
    const chord = transposeToken(m[0], semitones, preferFlat).replace(
      /[-–]+$/,
      "",
    )
    out[w] = out[w] ? `${out[w]} ${chord}` : chord
  }
  return out
}

// A chord sheet paced by the tempo guide. Paragraphs (blank lines and
// [Section] headers) are breath breaks; within one, lines pair up two to a
// screen. A chords-only line is an instrumental rest.
export function fromChordSheet(
  blocks: SongBlock[],
  opts: ChordSheetOptions,
): DisplayTrack {
  const bpm = opts.bpm > 0 ? opts.bpm : 100
  const beatsPerLine = opts.beatsPerLine > 0 ? opts.beatsPerLine : 4
  const semitones = opts.semitones ?? 0
  const preferFlat = opts.preferFlat ?? false
  const secPerBeat = 60 / bpm
  const timeline = buildTimeline(blocks, bpm, beatsPerLine, opts.lineBeats)

  const drafts: DraftScreen[] = []
  let label: string | null = null
  let part: Part = null
  let buffer: DisplayLine[] = []

  const flush = () => {
    if (!buffer.length) return
    drafts.push({
      label,
      part,
      instrumental: false,
      chords: [],
      bars: 0,
      lines: buffer,
    })
    buffer = []
  }

  blocks.forEach((block, i) => {
    if (block.type === "blank") return flush()
    if (block.type === "section") {
      flush()
      label = sectionLabel(block)
      part = asPart(block.text)
      return
    }
    const line = timeline.lines[i]
    if (!line) return

    const spans = [...(block.lyrics || "").matchAll(/\S+/g)].map((m) => ({
      index: m.index ?? 0,
      length: m[0].length,
    }))

    if (!spans.length) {
      flush()
      // Back-to-back chord lines in one section are one continuous run.
      const prev = drafts[drafts.length - 1]
      const target =
        prev?.instrumental && prev.label === label
          ? prev
          : {
              label,
              part,
              instrumental: true,
              chords: [] as DisplayChord[],
              bars: 0,
              lines: [],
            }
      if (target !== prev) drafts.push(target)
      const barsPerPass = line.bars ?? 1
      for (const w of line.words) {
        target.chords.push({
          text: transposeToken(w.text, semitones, preferFlat),
          start: w.start,
          end: w.end,
          bar: target.bars + (w.pass ?? 0) * barsPerPass + (w.bar ?? 0),
        })
      }
      target.bars += barsPerPass * (line.passes ?? 1)
      return
    }

    const chords = chordsByWord(block.chords, spans, semitones, preferFlat)
    buffer.push({
      tokens: line.words.map((w, wi) => ({
        text: w.text,
        wordStart: true,
        start: w.start,
        end: w.end,
        chord: chords[wi] ?? null,
      })),
    })
    if (buffer.length === 2) flush()
  })
  flush()

  const countIn = Math.max(0, opts.countInBeats ?? 0)
  const countFrom = Math.min(8, Math.max(3, Math.round(beatsPerLine)))
  return finalize(drafts, -countIn * secPerBeat, {
    countUnit: secPerBeat,
    countFrom,
    beatsPerBar: beatsPerLine,
    barDuration: secPerBeat * beatsPerLine,
  })
}

/* ---------------------------------------------------------------- query */

export function tokenProgress(token: DisplayToken, t: number): number {
  if (!Number.isFinite(token.start) || t < token.start) return 0
  const span = token.end - token.start
  if (!(span > 0)) return 1
  return Math.min(1, (t - token.start) / span)
}

function screenIndexAt(screens: DisplayScreen[], t: number): number {
  let idx = -1
  for (let i = 0; i < screens.length; i++) {
    if (screens[i].showAt <= t) idx = i
    else if (Number.isFinite(screens[i].showAt)) break
  }
  return idx
}

function nextSung(
  screens: DisplayScreen[],
  from: number,
): DisplayScreen | null {
  for (let i = from; i < screens.length; i++) {
    const s = screens[i]
    if (!s.instrumental && s.lines.length) return s
  }
  return null
}

function bandStateAt(
  track: DisplayTrack,
  screen: DisplayScreen | null,
  t: number,
): BandState | null {
  const { beatsPerBar, barDuration } = track
  if (!screen?.instrumental || !screen.chords.length) return null
  if (!beatsPerBar || !barDuration) return null
  const chords = screen.chords
  const runStart = chords[0].start
  if (t < runStart) {
    // The count-in is counted in the song's own beats.
    const beatLength = barDuration / beatsPerBar
    return {
      bar: 0,
      bars: screen.bars,
      beat: -1,
      beatsPerBar,
      chord: -1,
      countIn: Math.max(1, Math.ceil((runStart - t) / beatLength - 1e-6)),
    }
  }
  let chord = chords.findIndex((c) => t >= c.start && t < c.end)
  if (chord === -1) chord = chords.length - 1
  // Measure the bar from its own chords: a run with a custom length (line
  // timing) has bars longer or shorter than the song's standard bar.
  const bar = chords[chord].bar
  const inBar = chords.filter((c) => c.bar === bar)
  const barStart = inBar[0].start
  const barLength = inBar[inBar.length - 1].end - barStart
  const beat =
    barLength > 0
      ? Math.min(
          beatsPerBar - 1,
          Math.max(
            0,
            Math.floor(((t - barStart) / barLength) * beatsPerBar + 1e-9),
          ),
        )
      : 0
  return { bar, bars: screen.bars, beat, beatsPerBar, chord, countIn: null }
}

export function displayStateAt(track: DisplayTrack, t: number): DisplayState {
  const { screens } = track
  const index = screenIndexAt(screens, t)
  const screen = index >= 0 ? screens[index] : null

  // The next line that isn't already up: line 1 of the next sung screen.
  const upcoming = nextSung(screens, index + 1)
  const preview = upcoming?.lines[0] ?? null

  // Vocals about to come in after an intro or a long break?
  let cue: DisplayCue | null = null
  const target =
    screen && !screen.instrumental && t < screen.start ? screen : upcoming
  const leadingIn =
    target &&
    Number.isFinite(target.start) &&
    t < target.start &&
    (!screen || screen.instrumental || screen === target)
  const minRest = target === nextSung(screens, 0) ? CUE_MIN_INTRO : CUE_MIN_REST
  if (leadingIn && target.restBefore >= minRest) {
    const remaining = target.start - t
    const units = Math.ceil(remaining / track.countUnit - 1e-6)
    cue = {
      remaining,
      total: target.restBefore,
      count: units <= track.countFrom ? Math.max(1, units) : null,
    }
  }

  const band = bandStateAt(track, screen, t)
  // During the band's count-in, its 4-3-2-1 is the count that matters.
  if (band?.countIn) cue = null

  const ended =
    Number.isFinite(track.end) &&
    screens.length > 0 &&
    t >= track.end + END_CARD_DELAY &&
    !screens.some((s) => s.instrumental && s.start >= track.end && t < s.end)

  return {
    index,
    screen,
    preview,
    previewPart: upcoming?.part ?? null,
    cue,
    band,
    ended,
  }
}
