// Pentatonic scales on the guitar (and the blues scale, the minor
// pentatonic plus its "blue" note), worked out the same way as the chord
// charts (lib/guitarChords.ts): a scale is a root and a set of intervals;
// its notes are spelled from music theory, and the five classic box
// positions are found on the fretboard -- two notes on every string,
// starting from each note of the scale on the low E string.

import { type ParsedChord, TUNING } from "@/lib/guitarChords"

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"]
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11]
const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
// How each key is usually written (major keys, and minor keys).
const MAJOR_KEYS = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
]
const MINOR_KEYS = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "Bb",
  "B",
]

interface Degree {
  semi: number // semitones above the root
  step: number // letters above the root's (0 = the root's letter)
  label: string // "b3"
  blue?: boolean // the blues scale's added note
}
const D = (semi: number, step: number, label: string, blue = false): Degree =>
  blue ? { semi, step, label, blue } : { semi, step, label }

export type ScaleId = "minor-pentatonic" | "major-pentatonic" | "blues"

export interface ScaleType {
  id: ScaleId
  name: string // "minor pentatonic"
  minor: boolean
  degrees: Degree[]
  about: string
}

export const SCALE_TYPES: ScaleType[] = [
  {
    id: "minor-pentatonic",
    name: "minor pentatonic",
    minor: true,
    degrees: [
      D(0, 0, "1"),
      D(3, 2, "b3"),
      D(5, 3, "4"),
      D(7, 4, "5"),
      D(10, 6, "b7"),
    ],
    about:
      "The go-to scale for rock, blues and pop solos — play it over minor chords, or over a whole blues in its key.",
  },
  {
    id: "major-pentatonic",
    name: "major pentatonic",
    minor: false,
    degrees: [
      D(0, 0, "1"),
      D(2, 1, "2"),
      D(4, 2, "3"),
      D(7, 4, "5"),
      D(9, 5, "6"),
    ],
    about:
      "The bright, sweet sound of country, folk and pop melodies — play it over major chords.",
  },
  {
    id: "blues",
    name: "blues",
    minor: true,
    degrees: [
      D(0, 0, "1"),
      D(3, 2, "b3"),
      D(5, 3, "4"),
      D(6, 4, "b5", true),
      D(7, 4, "5"),
      D(10, 6, "b7"),
    ],
    about:
      "The minor pentatonic with one extra note, the flat five (the “blue” note) — use it as a passing note on the way between 4 and 5.",
  },
]
const BY_ID = new Map(SCALE_TYPES.map((t) => [t.id, t]))

export interface ParsedScale {
  root: string // "A", "C#", "Bb"
  rootPc: number
  type: ScaleType
  name: string // "A minor pentatonic"
}

function pcOf(root: string): number {
  const base = LETTER_PC[LETTERS.indexOf(root[0])]
  const shift = root[1] === "#" ? 1 : root[1] === "b" ? -1 : 0
  return (base + shift + 12) % 12
}

export function scaleOf(root: string, id: ScaleId): ParsedScale {
  const type = BY_ID.get(id)!
  const name = root[0].toUpperCase() + (root[1] ?? "")
  return { root: name, rootPc: pcOf(name), type, name: `${name} ${type.name}` }
}

// "A minor pentatonic", "Am pentatonic", "a pent", "C major pentatonic",
// "E blues", "F# minor pentatonic scale". Needs "pent", "blues" or
// "scale" in it; without major/minor, a pentatonic is the minor one (the
// one guitarists mean) unless it says major.
export function parseScale(input: string): ParsedScale | null {
  const text = input
    .trim()
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/\s+/g, " ")
  const m = text.match(
    /^([A-Ga-g])([#b]?)\s*(m|min|minor|maj|major|M)?\s*(pent(?:atonic)?|blues)?\s*(scale)?$/i,
  )
  if (!m || (!m[4] && !m[5])) return null
  const root = m[1].toUpperCase() + m[2]
  const quality = m[3] ?? ""
  if (m[4] && /^blues$/i.test(m[4])) return scaleOf(root, "blues")
  const major = quality === "M" || /^maj/i.test(quality)
  return scaleOf(root, major ? "major-pentatonic" : "minor-pentatonic")
}

// The scale's notes, spelled the way music theory writes them (A minor
// pentatonic is A C D E G; F# major pentatonic is F# G# A# C# D#).
export function scaleNotes(scale: ParsedScale): string[] {
  const rootLetter = LETTERS.indexOf(scale.root[0])
  return scale.type.degrees.map((d) => noteName(scale, d, rootLetter))
}

function noteName(scale: ParsedScale, d: Degree, rootLetter: number): string {
  const letterIndex = (rootLetter + d.step) % 7
  const pc = (scale.rootPc + d.semi) % 12
  let diff = (pc - LETTER_PC[letterIndex] + 12) % 12
  if (diff > 6) diff -= 12
  const plain = (/b/.test(scale.root) ? FLATS : SHARPS)[pc]
  if (Math.abs(diff) > 1) return plain
  const name =
    LETTERS[letterIndex] + (diff === 1 ? "#" : diff === -1 ? "b" : "")
  // The blue note reads more easily as a plain note than as Fb or Cb.
  if (d.blue && ["Fb", "Cb", "E#", "B#"].includes(name)) return plain
  return name
}

export function scaleFormula(scale: ParsedScale): string {
  return scale.type.degrees.map((d) => d.label).join(" ")
}

// The major and minor pentatonic with the same five notes (A minor
// pentatonic = C major pentatonic), so the same shapes serve both.
export function relativeScale(scale: ParsedScale): ParsedScale | null {
  if (scale.type.id === "minor-pentatonic") {
    return scaleOf(MAJOR_KEYS[(scale.rootPc + 3) % 12], "major-pentatonic")
  }
  if (scale.type.id === "major-pentatonic") {
    return scaleOf(MINOR_KEYS[(scale.rootPc + 9) % 12], "minor-pentatonic")
  }
  return null
}

// The pentatonic that fits a chord, for soloing over it: minor chords
// (anything with a flat third) take the minor pentatonic, the rest the
// major one.
export function scaleForChord(chord: ParsedChord): ParsedScale {
  const minor = chord.type.tones.some((t) => t.semi === 3)
  const root = (minor ? MINOR_KEYS : MAJOR_KEYS)[chord.rootPc]
  return scaleOf(
    chord.root.length > 1 && root !== chord.root ? chord.root : root,
    minor ? "minor-pentatonic" : "major-pentatonic",
  )
}

/* ------------------------------------------------------- on the neck */

export interface FretNote {
  string: number // 0 = low E
  fret: number
  note: string
  degree: string
  root: boolean
  blue: boolean
}

function noteAt(
  scale: ParsedScale,
  string: number,
  fret: number,
): FretNote | null {
  const pc = (TUNING[string] + fret) % 12
  const rootLetter = LETTERS.indexOf(scale.root[0])
  const d = scale.type.degrees.find((x) => (scale.rootPc + x.semi) % 12 === pc)
  if (!d) return null
  return {
    string,
    fret,
    note: noteName(scale, d, rootLetter),
    degree: d.label,
    root: d.semi === 0,
    blue: !!d.blue,
  }
}

// Every note of the scale on the neck, open strings to `maxFret`.
export function neckNotes(scale: ParsedScale, maxFret = 15): FretNote[] {
  const out: FretNote[] = []
  for (let s = 0; s < 6; s++) {
    for (let f = 0; f <= maxFret; f++) {
      const n = noteAt(scale, s, f)
      if (n) out.push(n)
    }
  }
  return out
}

export interface ScalePosition {
  number: number // 1-5
  from: number // lowest fret used
  to: number // highest
  notes: FretNote[]
}

// The five box positions: two notes on each string, going up the scale
// from each of its notes on the low E string -- position 1 starting on
// the root. Each is placed as low on the neck as it fits (open strings
// included). The blues scale uses the minor pentatonic's boxes, with its
// blue note added wherever it falls inside them.
export function scalePositions(scale: ParsedScale): ScalePosition[] {
  const pentatonic =
    scale.type.id === "blues" ? scaleOf(scale.root, "minor-pentatonic") : scale
  const semis = pentatonic.type.degrees.map((d) => d.semi)
  const rootFret = (scale.rootPc - TUNING[0] + 120) % 12
  const out: ScalePosition[] = []
  semis.forEach((startSemi, k) => {
    // The scale's pitches going up from this one, two per string.
    const rootPitch = TUNING[0] + rootFret
    const start = rootPitch + startSemi
    const pitches: number[] = []
    for (let p = start; pitches.length < 12; p++) {
      if (semis.includes((p - rootPitch + 120) % 12)) pitches.push(p)
    }
    let frets = pitches.map((p, i) => ({
      s: Math.floor(i / 2),
      f: p - TUNING[Math.floor(i / 2)],
    }))
    let low = Math.min(...frets.map((x) => x.f))
    // As low on the neck as it fits.
    while (low >= 12) {
      frets = frets.map((x) => ({ ...x, f: x.f - 12 }))
      low -= 12
    }
    while (low < 0) {
      frets = frets.map((x) => ({ ...x, f: x.f + 12 }))
      low += 12
    }
    const notes = frets.map((x) => noteAt(scale, x.s, x.f)!)
    let high = Math.max(...frets.map((x) => x.f))
    if (scale.type.id === "blues") {
      // The blue note on each string, where it lands inside the box.
      for (let s = 0; s < 6; s++) {
        for (let f = Math.max(0, low); f <= high; f++) {
          const n = noteAt(scale, s, f)
          if (n?.blue) notes.push(n)
        }
      }
      high = Math.max(high, ...notes.map((n) => n.fret))
    }
    notes.sort((a, b) => a.string - b.string || a.fret - b.fret)
    out.push({ number: k + 1, from: low, to: high, notes })
  })
  return out
}
