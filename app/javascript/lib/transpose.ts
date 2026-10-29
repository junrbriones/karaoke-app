const SHARP_NAMES = [
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
const FLAT_NAMES = [
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

const NOTE_INDEX: Record<string, number> = {
  C: 0,
  "B#": 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  "E#": 5,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
}

const ROOT_REGEX = /^([A-G](?:#|b)?)/

export function transposeRoot(
  root: string,
  semitones: number,
  preferFlat: boolean,
): string {
  const idx = NOTE_INDEX[root]
  if (idx === undefined) return root
  const newIdx = (((idx + semitones) % 12) + 12) % 12
  return preferFlat ? FLAT_NAMES[newIdx] : SHARP_NAMES[newIdx]
}

// Transposes every chord in a chord-line token: a plain chord ("Am7"), a
// slash chord ("D/F#"), or a dash-joined run ("Dm-G7sus-G7-"). Anything
// that isn't a note name (extensions, "N.C.", bar lines) is left alone.
export function transposeToken(
  token: string,
  semitones: number,
  preferFlat: boolean,
): string {
  if (!semitones) return token
  return token
    .split(/([-–/()])/)
    .map((part) => {
      const m = part.match(ROOT_REGEX)
      if (!m) return part
      const root = m[1]
      return (
        transposeRoot(root, semitones, preferFlat) + part.slice(root.length)
      )
    })
    .join("")
}

// Transposes a whole chord line, keeping every chord at its original column
// (so it stays over the right syllable) even when a name gets longer or
// shorter, e.g. C -> C#. A chord only shifts right when the one before it
// grew into its spot, and then by just enough to keep a space between.
export function transposeChordLine(
  line: string,
  semitones: number,
  preferFlat: boolean,
): string {
  if (!semitones) return line
  let out = ""
  for (const m of line.matchAll(/\S+/g)) {
    const col = m.index ?? 0
    if (out.length < col) out += " ".repeat(col - out.length)
    else if (out.length > 0) out += " "
    out += transposeToken(m[0], semitones, preferFlat)
  }
  return out
}
