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

export function transposeToken(
  token: string,
  semitones: number,
  preferFlat: boolean,
): string {
  if (!semitones) return token
  return token
    .split("/")
    .map((part) => {
      const m = part.match(ROOT_REGEX)
      if (!m) return part
      const root = m[1]
      const rest = part.slice(root.length)
      return transposeRoot(root, semitones, preferFlat) + rest
    })
    .join("/")
}

export function transposeChordLine(
  line: string,
  semitones: number,
  preferFlat: boolean,
): string {
  if (!semitones) return line
  const tokenRegex = /\S+/g
  let result = ""
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = tokenRegex.exec(line)) !== null) {
    result += line.slice(lastIndex, match.index)
    result += transposeToken(match[0], semitones, preferFlat)
    lastIndex = match.index + match[0].length
  }
  result += line.slice(lastIndex)
  return result
}
