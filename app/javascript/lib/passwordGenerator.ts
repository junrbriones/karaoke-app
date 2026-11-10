// Random passwords for an admin to hand out, made with the browser's
// cryptographic random numbers (never Math.random). Characters that are
// easy to misread or mistype -- 0/O, 1/l/I, quotes, backslashes -- are
// left out, since the password gets read off a screen or out loud.

export type PasswordStyle = "shareable" | "strong"

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
const LOWER = "abcdefghijkmnopqrstuvwxyz"
const DIGITS = "23456789"
const SYMBOLS = "!@#$%&*+=?-_"

// A whole number in [0, n), with no bias (rejection sampling).
function randomBelow(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % n
  }
}

const pick = (chars: string) => chars[randomBelow(chars.length)]

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1)
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

// "strong": `length` characters from letters, digits and symbols, with at
// least one of each kind.
// "shareable": groups of four letters and digits joined by dashes
// ("Kx7m-Pq2r-Tz9w-Hn4c") -- easy to read out or type on a phone, and
// still about 90 bits of randomness at the default size.
export function generatePassword(
  style: PasswordStyle = "shareable",
  length = 16,
): string {
  if (style === "shareable") {
    const groups = Math.max(3, Math.round(length / 4))
    const alphabet = UPPER + LOWER + DIGITS
    for (;;) {
      const chars = Array.from({ length: groups * 4 }, () => pick(alphabet))
      const text = chars.join("")
      // Every kind of character, so it passes any "must contain" rule.
      if (!/[A-Z]/.test(text) || !/[a-z]/.test(text) || !/\d/.test(text))
        continue
      return Array.from({ length: groups }, (_, g) =>
        text.slice(g * 4, g * 4 + 4),
      ).join("-")
    }
  }
  const size = Math.max(12, length)
  const sets = [UPPER, LOWER, DIGITS, SYMBOLS]
  const all = sets.join("")
  const chars = sets.map(pick)
  while (chars.length < size) chars.push(pick(all))
  return shuffle(chars).join("")
}

// Roughly how many bits of randomness a generated password has.
export function passwordStrengthBits(
  style: PasswordStyle,
  length = 16,
): number {
  if (style === "shareable") {
    const groups = Math.max(3, Math.round(length / 4))
    return Math.floor(
      groups * 4 * Math.log2(UPPER.length + LOWER.length + DIGITS.length),
    )
  }
  const size = Math.max(12, length)
  return Math.floor(
    size *
      Math.log2(UPPER.length + LOWER.length + DIGITS.length + SYMBOLS.length),
  )
}
