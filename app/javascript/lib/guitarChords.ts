// Guitar chord charts, worked out from music theory rather than typed in:
// a chord name ("C#m7", "Bb", "F#7sus4", "G/B") is read into a root and a
// chord type; the type says which notes the chord has; and the fingerings
// are found by searching the fretboard (standard tuning) for comfortable
// shapes that play exactly those notes -- so every chart is correct by
// construction, for any root, and the test suite checks the familiar open
// shapes come out on top.

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"]
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11]
export const ROOTS_SHARP = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
]
export const ROOTS_FLAT = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
]

/* ------------------------------------------------------------ chord types */

interface Tone {
  semi: number // semitones above the root
  degree: number // 1, 3, 5, 7, 9... -- for spelling and the formula
  label: string // "b3", "5", "#9"...
  optional?: boolean // can be left out of a voicing (the 5th, mostly)
}

export interface ChordType {
  id: string
  name: string // "minor seventh"
  symbol: string // how it's written after the root: "m7"
  aliases: string[]
  tones: Tone[]
}

const T = (label: string, optional = false): Tone => {
  const m = label.match(/^(bb|b|#)?(\d+)$/)!
  const degree = Number(m[2])
  const base: Record<number, number> = {
    1: 0,
    2: 2,
    3: 4,
    4: 5,
    5: 7,
    6: 9,
    7: 11,
    9: 2,
    11: 5,
    13: 9,
  }
  const shift = m[1] === "bb" ? -2 : m[1] === "b" ? -1 : m[1] === "#" ? 1 : 0
  return { semi: (base[degree] + shift + 12) % 12, degree, label, optional }
}

export const CHORD_TYPES: ChordType[] = [
  {
    id: "maj",
    name: "major",
    symbol: "",
    aliases: ["", "maj", "M", "major"],
    tones: [T("1"), T("3"), T("5", true)],
  },
  {
    id: "min",
    name: "minor",
    symbol: "m",
    aliases: ["m", "min", "-", "mi", "minor"],
    tones: [T("1"), T("b3"), T("5", true)],
  },
  {
    id: "7",
    name: "dominant seventh",
    symbol: "7",
    aliases: ["7", "dom7"],
    tones: [T("1"), T("3"), T("5", true), T("b7")],
  },
  {
    id: "maj7",
    name: "major seventh",
    symbol: "maj7",
    aliases: ["maj7", "M7", "Δ", "Δ7", "ma7", "j7"],
    tones: [T("1"), T("3"), T("5", true), T("7")],
  },
  {
    id: "m7",
    name: "minor seventh",
    symbol: "m7",
    aliases: ["m7", "min7", "-7", "mi7"],
    tones: [T("1"), T("b3"), T("5", true), T("b7")],
  },
  {
    id: "sus4",
    name: "suspended fourth",
    symbol: "sus4",
    aliases: ["sus4", "sus"],
    tones: [T("1"), T("4"), T("5")],
  },
  {
    id: "sus2",
    name: "suspended second",
    symbol: "sus2",
    aliases: ["sus2"],
    tones: [T("1"), T("2"), T("5")],
  },
  {
    id: "7sus4",
    name: "seventh, suspended fourth",
    symbol: "7sus4",
    aliases: ["7sus4", "7sus", "sus7"],
    tones: [T("1"), T("4"), T("5", true), T("b7")],
  },
  {
    id: "6",
    name: "sixth",
    symbol: "6",
    aliases: ["6", "maj6", "M6"],
    tones: [T("1"), T("3"), T("5", true), T("6")],
  },
  {
    id: "m6",
    name: "minor sixth",
    symbol: "m6",
    aliases: ["m6", "min6", "-6"],
    tones: [T("1"), T("b3"), T("5", true), T("6")],
  },
  {
    id: "add9",
    name: "added ninth",
    symbol: "add9",
    aliases: ["add9", "add2"],
    tones: [T("1"), T("3"), T("5", true), T("9")],
  },
  {
    id: "madd9",
    name: "minor, added ninth",
    symbol: "madd9",
    aliases: ["madd9", "madd2", "minadd9", "m(add9)"],
    tones: [T("1"), T("b3"), T("5", true), T("9")],
  },
  {
    id: "9",
    name: "dominant ninth",
    symbol: "9",
    aliases: ["9", "dom9"],
    tones: [T("1"), T("3"), T("5", true), T("b7"), T("9")],
  },
  {
    id: "maj9",
    name: "major ninth",
    symbol: "maj9",
    aliases: ["maj9", "M9", "Δ9"],
    tones: [T("1"), T("3"), T("5", true), T("7"), T("9")],
  },
  {
    id: "m9",
    name: "minor ninth",
    symbol: "m9",
    aliases: ["m9", "min9", "-9"],
    tones: [T("1"), T("b3"), T("5", true), T("b7"), T("9")],
  },
  {
    id: "69",
    name: "six-nine",
    symbol: "6/9",
    aliases: ["6/9", "69", "6add9"],
    tones: [T("1"), T("3"), T("5", true), T("6"), T("9")],
  },
  {
    id: "dim",
    name: "diminished",
    symbol: "dim",
    aliases: ["dim", "°", "o"],
    tones: [T("1"), T("b3"), T("b5")],
  },
  {
    id: "dim7",
    name: "diminished seventh",
    symbol: "dim7",
    aliases: ["dim7", "°7", "o7"],
    tones: [T("1"), T("b3"), T("b5"), T("bb7")],
  },
  {
    id: "m7b5",
    name: "half-diminished (minor seventh, flat five)",
    symbol: "m7b5",
    aliases: ["m7b5", "ø", "ø7", "min7b5", "-7b5", "m7-5"],
    tones: [T("1"), T("b3"), T("b5"), T("b7")],
  },
  {
    id: "aug",
    name: "augmented",
    symbol: "aug",
    aliases: ["aug", "+", "+5", "#5"],
    tones: [T("1"), T("3"), T("#5")],
  },
  {
    id: "aug7",
    name: "augmented seventh",
    symbol: "7#5",
    aliases: ["7#5", "aug7", "+7", "7+5", "7+"],
    tones: [T("1"), T("3"), T("#5"), T("b7")],
  },
  {
    id: "7b5",
    name: "seventh, flat five",
    symbol: "7b5",
    aliases: ["7b5", "7-5"],
    tones: [T("1"), T("3"), T("b5"), T("b7")],
  },
  {
    id: "7b9",
    name: "seventh, flat nine",
    symbol: "7b9",
    aliases: ["7b9", "7-9"],
    tones: [T("1"), T("3"), T("5", true), T("b7"), T("b9")],
  },
  {
    id: "7#9",
    name: "seventh, sharp nine",
    symbol: "7#9",
    aliases: ["7#9", "7+9"],
    tones: [T("1"), T("3"), T("5", true), T("b7"), T("#9")],
  },
  {
    id: "mmaj7",
    name: "minor-major seventh",
    symbol: "m(maj7)",
    aliases: ["mmaj7", "mM7", "m(maj7)", "minmaj7", "m/maj7", "-maj7", "-M7"],
    tones: [T("1"), T("b3"), T("5", true), T("7")],
  },
  {
    id: "11",
    name: "eleventh",
    symbol: "11",
    aliases: ["11", "dom11"],
    tones: [T("1"), T("5", true), T("b7"), T("9", true), T("11")],
  },
  {
    id: "m11",
    name: "minor eleventh",
    symbol: "m11",
    aliases: ["m11", "min11", "-11"],
    tones: [T("1"), T("b3"), T("5", true), T("b7"), T("9", true), T("11")],
  },
  {
    id: "13",
    name: "thirteenth",
    symbol: "13",
    aliases: ["13", "dom13"],
    tones: [T("1"), T("3"), T("5", true), T("b7"), T("9", true), T("13")],
  },
  {
    id: "5",
    name: "power chord (root and fifth)",
    symbol: "5",
    aliases: ["5"],
    tones: [T("1"), T("5")],
  },
]

const BY_ALIAS = new Map<string, ChordType>()
for (const type of CHORD_TYPES) {
  for (const alias of type.aliases) BY_ALIAS.set(alias, type)
}

/* -------------------------------------------------------------- reading */

export interface ParsedChord {
  root: string // as written, normalized: "C#", "Bb"
  rootPc: number
  type: ChordType
  bass: string | null // slash chord: "G/B" -> "B"
  bassPc: number | null
  name: string // tidy display name: "C#m7", "G/B"
}

function notePc(letter: string, accidental: string): number {
  const base = LETTER_PC[LETTERS.indexOf(letter)]
  const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0
  return (base + shift + 12) % 12
}

// "c#m7", "Db m7", "B♭maj7", "F#7(b9)", "G/B" -> a chord (or null).
export function parseChord(input: string): ParsedChord | null {
  const text = input
    .trim()
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/\s+/g, "")
  const m = text.match(/^([A-Ga-g])([#b]?)(.*?)(?:\/([A-Ga-g])([#b]?))?$/)
  if (!m) return null
  const letter = m[1].toUpperCase()
  const accidental = m[2]
  let suffix = m[3]
  // "(b9)" and friends: drop the brackets unless the alias has them.
  if (!BY_ALIAS.has(suffix)) suffix = suffix.replace(/[()]/g, "")
  const type = BY_ALIAS.get(suffix) ?? BY_ALIAS.get(suffix.toLowerCase())
  if (!type) return null
  const root = letter + accidental
  const bass = m[4] ? m[4].toUpperCase() + m[5] : null
  const rootPc = notePc(letter, accidental)
  const bassPc = bass ? notePc(bass[0], bass.slice(1)) : null
  return {
    root,
    rootPc,
    type,
    bass: bass && bassPc !== rootPc ? bass : null,
    bassPc: bass && bassPc !== rootPc ? bassPc : null,
    name: `${root}${type.symbol}${bass && bassPc !== rootPc ? `/${bass}` : ""}`,
  }
}

// The chord's notes, spelled the way music theory writes them (C#m7 is
// C# E G# B; Gm is G Bb D), with double flats/sharps simplified.
export function chordNotes(chord: ParsedChord): string[] {
  const rootLetter = LETTERS.indexOf(chord.root[0])
  return chord.type.tones.map((tone) => {
    const steps = [0, 0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5][tone.degree] ?? 0
    const letterIndex = (rootLetter + steps) % 7
    const letter = LETTERS[letterIndex]
    const pc = (chord.rootPc + tone.semi) % 12
    let diff = (pc - LETTER_PC[letterIndex] + 12) % 12
    if (diff > 6) diff -= 12
    if (Math.abs(diff) > 1) {
      // Ebb, F##...: name it plainly instead.
      return (/b/.test(chord.root) ? ROOTS_FLAT : ROOTS_SHARP)[pc]
    }
    return letter + (diff === 1 ? "#" : diff === -1 ? "b" : "")
  })
}

export function chordFormula(chord: ParsedChord): string {
  return chord.type.tones
    .map((t) => (t.optional ? `(${t.label})` : t.label))
    .join(" ")
}

// The same chord under its other name (C#m7 = Dbm7), if it has one.
export function enharmonicName(chord: ParsedChord): string | null {
  const sharp = ROOTS_SHARP[chord.rootPc]
  const flat = ROOTS_FLAT[chord.rootPc]
  if (sharp === flat) return null
  const other = chord.root.includes("#") ? flat : sharp
  if (other === chord.root) return null
  return `${other}${chord.type.symbol}${chord.bass ? `/${chord.bass}` : ""}`
}

/* --------------------------------------------------------- fingerings */

// Standard tuning, low E to high E (MIDI note numbers).
export const TUNING = [40, 45, 50, 55, 59, 64]
export const STRING_NAMES = ["E", "A", "D", "G", "B", "e"]

export interface Voicing {
  frets: number[] // per string, low E first; -1 = not played
  fingers: number[] // 0 = open or not played; 1-4
  barre: { fret: number; from: number; to: number } | null
  baseFret: number // the fret at the top of the diagram
  key: string // "x46454"
}

function voicingKey(frets: number[]): string {
  return frets.map((f) => (f < 0 ? "x" : f > 9 ? `(${f})` : String(f))).join("")
}

function fingering(frets: number[]): {
  ok: boolean
  fingers: number[]
  barre: Voicing["barre"]
} {
  const fretted = frets.map((f, s) => ({ f, s })).filter((n) => n.f > 0)
  const fingers = frets.map(() => 0)
  if (!fretted.length) return { ok: true, fingers, barre: null }
  const minF = Math.min(...fretted.map((n) => n.f))

  // Fingers in fret order, each finger roughly over its own fret (a note
  // two frets past the first finger goes to the ring finger, not the
  // middle), unless that would need more than four fingers.
  const assign = (notes: { f: number; s: number }[], first: number) => {
    const order = [...notes].sort((a, b) => a.f - b.f || a.s - b.s)
    for (const spread of [true, false]) {
      const out = new Map<number, number>()
      let next = first
      for (const n of order) {
        const finger = spread ? Math.max(next, n.f - minF + 1) : next
        out.set(n.s, finger)
        next = finger + 1
      }
      if (next - 1 <= 4) return out
    }
    return null
  }

  // Four notes or fewer: one finger each, no barre.
  if (fretted.length <= 4) {
    const plain = assign(fretted, 1)
    if (plain) {
      plain.forEach((finger, s) => (fingers[s] = finger))
      return { ok: true, fingers, barre: null }
    }
  }

  // Otherwise the first finger lies across the lowest fret.
  const atMin = fretted.filter((n) => n.f === minF)
  let barre: Voicing["barre"] = null
  if (atMin.length >= 2) {
    const from = atMin[0].s
    const to = atMin[atMin.length - 1].s
    // A finger can lie across from `from` to `to` only if nothing in
    // between is open or not played.
    const across = frets.slice(from, to + 1).every((f) => f >= minF)
    if (across) barre = { fret: minF, from, to }
  }
  if (!barre) return { ok: false, fingers, barre: null }
  for (let s = barre.from; s <= barre.to; s++)
    if (frets[s] === minF) fingers[s] = 1
  const rest = fretted.filter(
    (n) => !(n.f === minF && n.s >= barre.from && n.s <= barre.to),
  )
  const others = assign(rest, 2)
  if (!others) return { ok: false, fingers, barre }
  others.forEach((finger, s) => (fingers[s] = finger))
  return { ok: true, fingers, barre }
}

// The barre shapes every chord book teaches, as offsets from the barre
// (the open E and A shapes, moved up the neck); -1 = not played.
const BARRE_SHAPES: Record<string, number[][]> = {
  maj: [
    [0, 2, 2, 1, 0, 0],
    [-1, 0, 2, 2, 2, 0],
  ],
  min: [
    [0, 2, 2, 0, 0, 0],
    [-1, 0, 2, 2, 1, 0],
  ],
  "7": [
    [0, 2, 0, 1, 0, 0],
    [-1, 0, 2, 0, 2, 0],
  ],
  m7: [
    [0, 2, 0, 0, 0, 0],
    [-1, 0, 2, 0, 1, 0],
  ],
  maj7: [
    [0, -1, 1, 1, 0, -1],
    [-1, 0, 2, 1, 2, 0],
  ],
  sus4: [
    [0, 2, 2, 2, 0, 0],
    [-1, 0, 2, 2, 3, 0],
  ],
  sus2: [[-1, 0, 2, 2, 0, 0]],
  "7sus4": [
    [0, 2, 0, 2, 0, 0],
    [-1, 0, 2, 0, 3, 0],
  ],
}

function isBarreShape(typeId: string, frets: number[]): boolean {
  const fretted = frets.filter((f) => f > 0)
  if (!fretted.length || frets.includes(0)) return false
  const base = Math.min(...fretted)
  return (BARRE_SHAPES[typeId] ?? []).some((shape) =>
    shape.every((o, s) => (o < 0 ? frets[s] < 0 : frets[s] === base + o)),
  )
}

interface Candidate {
  frets: number[]
  score: number
  low: number // lowest fretted fret (0 if none)
}

function search(chord: ParsedChord): Candidate[] {
  const tonePcs = chord.type.tones.map((t) => (chord.rootPc + t.semi) % 12)
  const required = chord.type.tones
    .filter((t) => !t.optional)
    .map((t) => (chord.rootPc + t.semi) % 12)
  const allowed = new Set(tonePcs)
  const bassPc = chord.bassPc ?? chord.rootPc
  if (chord.bassPc != null) allowed.add(chord.bassPc)
  const out = new Map<string, Candidate>()

  for (let w = 0; w <= 12; w++) {
    const lo = Math.max(1, w)
    const hi = w === 0 ? 3 : w + 3
    const options = TUNING.map((open) => {
      const opts = [-1]
      if (allowed.has(open % 12)) opts.push(0)
      for (let f = lo; f <= hi; f++)
        if (allowed.has((open + f) % 12)) opts.push(f)
      return opts
    })
    const frets = [0, 0, 0, 0, 0, 0]
    const walk = (s: number) => {
      if (s === 6) {
        consider(frets.slice())
        return
      }
      for (const f of options[s]) {
        frets[s] = f
        walk(s + 1)
      }
    }
    const consider = (fr: number[]) => {
      const sounding = fr.map((f, s) => (f < 0 ? -1 : s)).filter((s) => s >= 0)
      if (sounding.length < Math.max(3, Math.min(4, required.length))) return
      const bassString = sounding[0]
      if ((TUNING[bassString] + fr[bassString]) % 12 !== bassPc) return
      const pcs = new Set(sounding.map((s) => (TUNING[s] + fr[s]) % 12))
      if (!required.every((pc) => pcs.has(pc))) return
      if (chord.bassPc != null && !pcs.has(chord.rootPc)) return
      const frettedFrets = fr.filter((f) => f > 0)
      if (
        frettedFrets.length &&
        Math.max(...frettedFrets) - Math.min(...frettedFrets) > 3
      )
        return
      const top = sounding[sounding.length - 1]
      let interior = 0
      for (let s = bassString; s <= top; s++) if (fr[s] < 0) interior++
      if (interior > 1) return
      const { ok, fingers } = fingering(fr)
      if (!ok) return
      const used = fingers.filter((x) => x > 0).length
        ? Math.max(...fingers)
        : 0
      const opens = fr.filter((f) => f === 0).length
      const low = frettedFrets.length ? Math.min(...frettedFrets) : 0
      const high = frettedFrets.length ? Math.max(...frettedFrets) : 0
      const highMutes = 5 - top
      // An open string squeezed between two fretted ones, next to a note
      // at the 3rd fret or higher, is hard to keep ringing (x20402 for Bm).
      let pinchedOpens = 0
      for (let s = 1; s < 5; s++)
        if (
          fr[s] === 0 &&
          fr[s - 1] > 0 &&
          fr[s + 1] > 0 &&
          Math.max(fr[s - 1], fr[s + 1]) >= 4
        )
          pinchedOpens++
      // What makes a shape comfortable and familiar: more strings, fewer
      // fingers, no muted strings in the middle, a small stretch, low on
      // the neck -- and open-position shapes (everything within the first
      // three frets) first, the way chord books teach them. Open strings
      // ringing under a hand far up the neck are awkward, so they lose.
      const score =
        sounding.length * 2 -
        interior * 7 -
        pinchedOpens * 3.5 -
        highMutes * 2.5 -
        bassString * 0.5 -
        used * 0.7 -
        low * 0.6 -
        (high - low) * 0.6 +
        (high <= 3 ? 4 + opens * 0.8 : 0) -
        (opens > 0 && high >= 5 ? 6 : 0) +
        (pcs.size === allowed.size ? 1 : 0) +
        (chord.bassPc == null && isBarreShape(chord.type.id, fr) ? 4 : 0)
      const key = voicingKey(fr)
      const prev = out.get(key)
      if (!prev || prev.score < score) out.set(key, { frets: fr, score, low })
    }
    walk(0)
  }
  return [...out.values()].sort((a, b) => b.score - a.score)
}

function toVoicing(frets: number[]): Voicing {
  const { fingers, barre } = fingering(frets)
  const fretted = frets.filter((f) => f > 0)
  const max = fretted.length ? Math.max(...fretted) : 0
  const min = fretted.length ? Math.min(...fretted) : 0
  return {
    frets,
    fingers,
    barre,
    baseFret: max <= 4 ? 1 : min,
    key: voicingKey(frets),
  }
}

const cache = new Map<string, Voicing[]>()

// Up to `count` fingerings: the most comfortable first, then others up
// the neck (each a few frets from the ones already picked).
export function voicingsFor(chord: ParsedChord, count = 5): Voicing[] {
  const cacheKey = `${chord.rootPc}|${chord.type.id}|${chord.bassPc ?? ""}|${count}`
  const hit = cache.get(cacheKey)
  if (hit) return hit
  const all = search(chord)
  const picked: Candidate[] = []
  for (const c of all) {
    if (picked.length >= count) break
    if (picked.some((p) => Math.abs(p.low - c.low) < 2)) continue
    picked.push(c)
  }
  const [first, ...rest] = picked
  const result = first
    ? [first, ...rest.sort((a, b) => a.low - b.low)].map((c) =>
        toVoicing(c.frets),
      )
    : []
  cache.set(cacheKey, result)
  return result
}

// What each string plays, for the chart's labels ("C#", "G#"...).
export function stringNotes(
  chord: ParsedChord,
  voicing: Voicing,
): (string | null)[] {
  const names = chordNotes(chord)
  const byPc = new Map<number, string>()
  chord.type.tones.forEach((t, i) =>
    byPc.set((chord.rootPc + t.semi) % 12, names[i]),
  )
  if (chord.bass && chord.bassPc != null) byPc.set(chord.bassPc, chord.bass)
  return voicing.frets.map((f, s) =>
    f < 0 ? null : (byPc.get((TUNING[s] + f) % 12) ?? null),
  )
}

/* ------------------------------------------------------------- naming */

// "C#" -> "C sharp", "Bb" -> "B flat".
export function spokenNote(note: string): string {
  return note[0] + (note[1] === "#" ? " sharp" : note[1] === "b" ? " flat" : "")
}

// "C sharp minor seventh", "G major, B in the bass".
export function chordFullName(chord: ParsedChord): string {
  const base = `${spokenNote(chord.root)} ${chord.type.name}`
  return chord.bass ? `${base}, ${spokenNote(chord.bass)} in the bass` : base
}

// The chord type a search names in words ("minor seventh", "dominant",
// "half diminished"), best match first.
export function typesMatching(text: string): ChordType[] {
  const q = text.trim().toLowerCase()
  if (q.length < 2) return []
  const words = q.split(/\s+/)
  return CHORD_TYPES.map((type) => {
    const name = type.name.toLowerCase()
    const all = `${name} ${type.aliases.join(" ").toLowerCase()}`
    if (name === q) return { type, rank: 0 }
    if (name.startsWith(q)) return { type, rank: 1 }
    if (words.every((w) => all.includes(w))) return { type, rank: 2 }
    return { type, rank: -1 }
  })
    .filter((m) => m.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map((m) => m.type)
}

// A chord from a root and a chord type, for the browse grid.
export function chordOf(root: string, type: ChordType): ParsedChord {
  return parseChord(root + type.symbol)!
}
