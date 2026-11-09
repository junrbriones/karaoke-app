// Bulk song import: turns chord sheet files (plain chords-over-lyrics text,
// or ChordPro) and pasted text into songs in this app's format -- section
// headers in [brackets], chord lines above lyric lines.
//
// - ChordPro ({title: ...}, [C]inline [G]chords, {start_of_chorus}...) is
//   converted: each inline chord goes on a chord line above the lyric, at
//   the column where it was.
// - Plain text keeps its chord lines as they are. "Title:", "Artist:",
//   "Key:", "Capo:", "Tempo:"/"BPM:" lines near the top are read as the
//   song's details; otherwise the first line is the title ("Title - Artist"
//   or "Title by Artist" split the artist off), or the file name is
//   ("Artist - Title.txt").
// - Section labels written as "Chorus:", "VERSE 1", "(Bridge)" become
//   [Chorus], [Verse 1], [Bridge].
//
// Pasted text holds several songs separated by a line of three or more
// dashes (---). Files can be .txt, .cho/.chopro/.chordpro/.crd/.pro, or a
// .zip of them.

import { isChord, isChordLine } from "@/lib/chordSheet"

export interface ImportedSong {
  title: string
  artist: string
  key: string
  capo: string
  tempo: number | null
  body: string
  source: string // where it came from: a file name, or "Pasted song 3"
  format: "chordpro" | "plain"
}

export const TEXT_EXTENSIONS = [
  "txt",
  "text",
  "cho",
  "chopro",
  "chordpro",
  "crd",
  "pro",
]
export const MAX_FILE_BYTES = 1024 * 1024
export const MAX_ZIP_BYTES = 25 * 1024 * 1024

/* ------------------------------------------------------------- helpers */

function clean(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ")
}

function tidyBody(lines: string[]): string {
  const out = lines.map((l) => l.replace(/\s+$/, ""))
  while (out.length && !out[0].trim()) out.shift()
  while (out.length && !out[out.length - 1].trim()) out.pop()
  return out.join("\n").replace(/\n{3,}/g, "\n\n")
}

const SECTION_WORDS =
  "intro|verse|chorus|refrain|pre-?chorus|prechorus|bridge|interlude|instrumental|solo|outro|coda|ending|hook|tag|break|riff|adlib|ad-lib|koro|koda"
const SECTION_RE = new RegExp(
  `^\\s*[([]?\\s*((?:${SECTION_WORDS})(?:\\s*\\d+)?(?:\\s*[x×]\\s*\\d+)?)\\s*[)\\]]?\\s*:?\\s*$`,
  "i",
)

// "Chorus:", "VERSE 2", "(Bridge)" -> "[Chorus]", "[Verse 2]", "[Bridge]".
export function sectionHeader(line: string): string | null {
  if (
    /^\s*\[.+\]\s*$/.test(line) &&
    !isChordLine(line.replace(/[[\]]/g, " "))
  ) {
    return line.trim()
  }
  const m = line.match(SECTION_RE)
  if (!m) return null
  const label = m[1].trim().toLowerCase().replace(/\s+/g, " ")
  return `[${label[0].toUpperCase()}${label.slice(1)}]`
}

const META_RE =
  /^\s*(title|song|artist|singer|by|composer|key|capo|tempo|bpm)\s*[:=]\s*(.+?)\s*$/i

function splitTitleArtist(text: string, artistFirst: boolean) {
  const by = text.match(/^(.+?)\s+by\s+(.+)$/i)
  if (by) return { title: by[1].trim(), artist: by[2].trim() }
  const dash = text.split(/\s+[-–—]\s+/)
  if (dash.length === 2) {
    const [a, b] = dash.map((s) => s.trim())
    return artistFirst ? { title: b, artist: a } : { title: a, artist: b }
  }
  return { title: text.trim(), artist: "" }
}

function fileStem(name: string): string {
  return name
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_]+/g, " ")
    .trim()
}

function toTempo(value: string): number | null {
  const n = parseInt(value, 10)
  return Number.isFinite(n) && n >= 20 && n <= 300 ? n : null
}

/* ------------------------------------------------------------ ChordPro */

const DIRECTIVE_RE = /^\s*\{\s*([a-z_-]+)\s*(?:[:\s]\s*(.*?))?\s*\}\s*$/i
const INLINE_CHORD_RE = /\[([^\]\s]+)\]/g

// How many [X] in the text are chords -- a ChordPro sheet has plenty.
function inlineChordCount(text: string): number {
  let n = 0
  for (const m of text.matchAll(INLINE_CHORD_RE)) if (isChord(m[1])) n++
  return n
}

export function looksLikeChordPro(text: string): boolean {
  return (
    /^\s*\{\s*(title|t|subtitle|st|artist|start_of_|soc|sov|c|comment)\b/im.test(
      text,
    ) || inlineChordCount(text) >= 3
  )
}

// "[G]Hello my [D]friend" -> chord line "G        D" over "Hello my friend".
export function splitInlineChords(line: string): string[] {
  if (!INLINE_CHORD_RE.test(line)) return [line]
  INLINE_CHORD_RE.lastIndex = 0
  let lyric = ""
  const chords: { at: number; name: string }[] = []
  let last = 0
  for (const m of line.matchAll(INLINE_CHORD_RE)) {
    lyric += line.slice(last, m.index)
    if (isChord(m[1])) chords.push({ at: lyric.length, name: m[1] })
    else lyric += m[0] // [Chorus], a bracketed aside: keep it as written
    last = (m.index ?? 0) + m[0].length
  }
  lyric += line.slice(last)
  if (!chords.length) return [lyric]
  let chordLine = ""
  for (const c of chords) {
    const col = Math.max(c.at, chordLine.length ? chordLine.length + 1 : 0)
    chordLine = chordLine.padEnd(col, " ") + c.name
  }
  return lyric.trim()
    ? [chordLine, lyric.replace(/\s+$/, "")]
    : [chords.map((c) => c.name).join("  ")]
}

export function parseChordPro(text: string, source: string): ImportedSong {
  const song: ImportedSong = {
    title: "",
    artist: "",
    key: "",
    capo: "",
    tempo: null,
    body: "",
    source,
    format: "chordpro",
  }
  const lines: string[] = []
  for (const raw of clean(text).split("\n")) {
    if (/^\s*#/.test(raw)) continue // a ChordPro comment
    const d = raw.match(DIRECTIVE_RE)
    if (d) {
      const name = d[1].toLowerCase().replace(/-/g, "_")
      const value = (d[2] ?? "").trim()
      switch (name) {
        case "title":
        case "t":
          song.title ||= value
          break
        case "subtitle":
        case "st":
        case "artist":
          song.artist ||= value
          break
        case "key":
          song.key ||= value
          break
        case "capo":
          song.capo ||= value
          break
        case "tempo":
          song.tempo ??= toTempo(value)
          break
        case "comment":
        case "c":
        case "comment_italic":
        case "ci":
        case "comment_box":
        case "cb":
        case "highlight":
          if (value) lines.push("", sectionHeader(value) ?? `[${value}]`)
          break
        case "start_of_chorus":
        case "soc":
          lines.push("", `[${value || "Chorus"}]`)
          break
        case "start_of_verse":
        case "sov":
          lines.push("", `[${value || "Verse"}]`)
          break
        case "start_of_bridge":
        case "sob":
          lines.push("", `[${value || "Bridge"}]`)
          break
        case "start_of_tab":
        case "sot":
          lines.push("", `[${value || "Tab"}]`)
          break
        case "chorus":
          lines.push("", "[Repeat Chorus]")
          break
        default:
          if (/^end_of_|^eo[cvbt]$/.test(name)) lines.push("")
        // other directives (columns, fonts...) don't matter here
      }
      continue
    }
    const header =
      /^\s*\[[^\]]+\]\s*$/.test(raw) && !isChord(raw.trim().slice(1, -1))
        ? sectionHeader(raw)
        : null
    if (header) {
      lines.push(header)
      continue
    }
    lines.push(...splitInlineChords(raw))
  }
  song.body = tidyBody(lines)
  if (!song.title) {
    Object.assign(song, splitTitleArtist(fileStem(source), true))
  }
  return song
}

/* ---------------------------------------------------------- plain text */

export function parsePlain(text: string, source: string): ImportedSong {
  const song: ImportedSong = {
    title: "",
    artist: "",
    key: "",
    capo: "",
    tempo: null,
    body: "",
    source,
    format: "plain",
  }
  const lines = clean(text).split("\n")
  const body: string[] = []
  let started = false // past the details at the top
  let titleFromText = false
  lines.forEach((line, i) => {
    const meta = !started && i < 15 ? line.match(META_RE) : null
    if (meta) {
      const value = meta[2]
      switch (meta[1].toLowerCase()) {
        case "title":
        case "song":
          song.title ||= value
          titleFromText = true
          break
        case "artist":
        case "singer":
        case "by":
        case "composer":
          song.artist ||= value
          break
        case "key":
          song.key ||= value.replace(/\s.*$/, "")
          break
        case "capo":
          song.capo ||= value
          break
        default:
          song.tempo ??= toTempo(value)
      }
      return
    }
    if (!started && !line.trim()) return
    // The first line, if it isn't chords or a section, is the title.
    if (
      !started &&
      !song.title &&
      !titleFromText &&
      !isChordLine(line) &&
      !sectionHeader(line) &&
      line.trim().length <= 80
    ) {
      Object.assign(song, {
        ...splitTitleArtist(line, false),
        artist: song.artist || splitTitleArtist(line, false).artist,
      })
      titleFromText = true
      return
    }
    started = true
    body.push(sectionHeader(line) ?? line)
  })
  song.body = tidyBody(body)
  if (!song.title) {
    const fromName = splitTitleArtist(fileStem(source), true)
    song.title = fromName.title
    song.artist ||= fromName.artist
  }
  return song
}

export function parseSongText(text: string, source: string): ImportedSong {
  const ext = source.split(".").pop()?.toLowerCase() ?? ""
  const chordPro =
    ["cho", "chopro", "chordpro", "crd", "pro"].includes(ext) ||
    looksLikeChordPro(text)
  const song = chordPro ? parseChordPro(text, source) : parsePlain(text, source)
  song.title = song.title.slice(0, 200) || "Untitled"
  song.artist = song.artist.slice(0, 200)
  song.key = song.key.slice(0, 20)
  song.capo = song.capo.slice(0, 20)
  return song
}

// Several pasted songs, separated by a line of dashes.
export function splitPasted(text: string): string[] {
  return clean(text)
    .split(/\n\s*-{3,}\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/* --------------------------------------------------------------- files */

// UTF-8, or -- if that turns up garbage -- Windows-1252 (older Windows
// editors), so "ñ" and "é" survive.
export function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes)
  if (!utf8.includes("�")) return utf8
  try {
    return new TextDecoder("windows-1252").decode(bytes)
  } catch {
    return utf8
  }
}

export function isTextName(name: string): boolean {
  return TEXT_EXTENSIONS.includes(name.split(".").pop()?.toLowerCase() ?? "")
}

// A small .zip reader (stored and deflated entries) using the browser's
// own DecompressionStream -- no library needed.
export async function readZip(
  data: ArrayBuffer,
): Promise<{ name: string; bytes: Uint8Array }[]> {
  const view = new DataView(data)
  const bytes = new Uint8Array(data)
  // End of central directory: the last 22+ bytes, signature 0x06054b50.
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error("That doesn't look like a .zip file")
  const count = view.getUint16(eocd + 10, true)
  let ptr = view.getUint32(eocd + 16, true)
  const out: { name: string; bytes: Uint8Array }[] = []
  for (let n = 0; n < count; n++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break
    const method = view.getUint16(ptr + 10, true)
    const compressed = view.getUint32(ptr + 20, true)
    const nameLen = view.getUint16(ptr + 28, true)
    const extraLen = view.getUint16(ptr + 30, true)
    const commentLen = view.getUint16(ptr + 32, true)
    const local = view.getUint32(ptr + 42, true)
    const name = new TextDecoder().decode(
      bytes.subarray(ptr + 46, ptr + 46 + nameLen),
    )
    ptr += 46 + nameLen + extraLen + commentLen

    if (name.endsWith("/") || name.includes("__MACOSX") || !isTextName(name))
      continue
    const localNameLen = view.getUint16(local + 26, true)
    const localExtraLen = view.getUint16(local + 28, true)
    const start = local + 30 + localNameLen + localExtraLen
    const raw = bytes.slice(start, start + compressed)
    if (method === 0) {
      out.push({ name, bytes: raw })
    } else if (method === 8) {
      const stream = new Blob([raw])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"))
      out.push({
        name,
        bytes: new Uint8Array(await new Response(stream).arrayBuffer()),
      })
    }
  }
  return out
}

// Every song in a set of picked/dropped files (zips opened up). Problems
// with individual files are reported, not thrown.
export async function songsFromFiles(files: File[]): Promise<{
  songs: ImportedSong[]
  skipped: string[]
}> {
  const songs: ImportedSong[] = []
  const skipped: string[] = []
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    try {
      if (ext === "zip") {
        if (file.size > MAX_ZIP_BYTES) {
          skipped.push(`${file.name}: over 25 MB`)
          continue
        }
        const entries = await readZip(await file.arrayBuffer())
        if (!entries.length)
          skipped.push(`${file.name}: no chord sheets inside`)
        for (const entry of entries) {
          if (entry.bytes.length > MAX_FILE_BYTES) {
            skipped.push(`${entry.name}: over 1 MB`)
            continue
          }
          songs.push(
            parseSongText(
              decodeText(entry.bytes),
              entry.name.split("/").pop()!,
            ),
          )
        }
      } else if (isTextName(file.name)) {
        if (file.size > MAX_FILE_BYTES) {
          skipped.push(`${file.name}: over 1 MB`)
          continue
        }
        songs.push(
          parseSongText(
            decodeText(new Uint8Array(await file.arrayBuffer())),
            file.name,
          ),
        )
      } else {
        skipped.push(
          `${file.name}: not a chord sheet (.txt, .cho, .chopro, .zip)`,
        )
      }
    } catch (e) {
      skipped.push(
        `${file.name}: ${e instanceof Error ? e.message : "couldn't be read"}`,
      )
    }
  }
  return { songs, skipped }
}
