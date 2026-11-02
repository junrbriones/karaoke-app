// Lines a song's minus-one (instrumental) track up with the original
// recording, so the lyrics tapped against the original fit it too.
//
// The two share the band -- the drums and bass hit at the same moments --
// so their onset envelopes (how sharply the loudness rises, every 10 ms)
// correlate strongly at the right shift. The shift is searched within
// +/-15 s over the first two minutes and refined to a fraction of a frame.

const HOP = 0.01 // seconds per envelope frame
const MAX_SECONDS = 120
const MAX_SHIFT = 15

export interface Alignment {
  offset: number // seconds the minus-one runs ahead (starts later if > 0)
  confidence: number // 0..1-ish: how much the best match stands out
}

// Onset strength: the rise in log energy from one frame to the next.
export function onsetEnvelope(
  samples: Float32Array,
  sampleRate: number,
): Float32Array {
  const hop = Math.max(1, Math.round(sampleRate * HOP))
  const frames = Math.floor(samples.length / hop)
  const env = new Float32Array(frames)
  let prev = 0
  for (let f = 0; f < frames; f++) {
    let e = 0
    const start = f * hop
    for (let i = start; i < start + hop; i++) e += samples[i] * samples[i]
    // The floor keeps hiss and near-silence from counting as onsets.
    const level = Math.log(1e-5 + e / hop)
    env[f] = f === 0 ? 0 : Math.max(0, level - prev)
    prev = level
  }
  // A little smoothing, so the same hit landing across a frame boundary in
  // one file and inside a frame in the other still lines up.
  const kernel = [1, 2, 3, 2, 1]
  const smooth = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let sum = 0
    for (let k = 0; k < kernel.length; k++) {
      const i = f + k - 2
      if (i >= 0 && i < frames) sum += env[i] * kernel[k]
    }
    smooth[f] = sum / 9
  }
  return smooth
}

// The shift (in frames) that best lines `b` up with `a`: b[i + lag] ~ a[i].
export function bestLag(
  a: Float32Array,
  b: Float32Array,
  maxLag: number,
): { lag: number; confidence: number } {
  const scores = new Float32Array(2 * maxLag + 1)
  let best = -Infinity
  let bestIndex = maxLag
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    // Normalized over just the overlapping part, so silence lined up with
    // silence counts for nothing and partial overlaps aren't favored.
    let sum = 0
    let aa = 0
    let bb = 0
    const from = Math.max(0, -lag)
    const to = Math.min(a.length, b.length - lag)
    for (let i = from; i < to; i++) {
      const x = a[i]
      const y = b[i + lag]
      sum += x * y
      aa += x * x
      bb += y * y
    }
    // Music repeats every beat and bar, so shifts by a whole bar can score
    // nearly as well; a gentle lean towards smaller shifts settles ties.
    const lean = 1 - (0.1 * Math.abs(lag)) / maxLag
    const score =
      aa > 0 && bb > 0 ? (sum / Math.sqrt(aa * bb)) * lean : -Infinity
    scores[lag + maxLag] = score
    if (score > best) {
      best = score
      bestIndex = lag + maxLag
    }
  }
  // Parabolic refinement between neighboring frames.
  let refined = bestIndex - maxLag
  const l = scores[bestIndex - 1]
  const r = scores[bestIndex + 1]
  if (l !== undefined && r !== undefined) {
    const denom = l - 2 * best + r
    if (denom < 0) refined += (0.5 * (l - r)) / denom
  }
  // How far the peak stands above the next best peak elsewhere.
  let runnerUp = -Infinity
  scores.forEach((s, i) => {
    if (Math.abs(i - bestIndex) > 10 && s > runnerUp) runnerUp = s
  })
  const confidence =
    best > 0 && Number.isFinite(runnerUp)
      ? Math.max(0, Math.min(1, 1 - Math.max(0, runnerUp) / best))
      : 0
  return { lag: refined, confidence }
}

export function alignSamples(
  original: Float32Array,
  instrumental: Float32Array,
  sampleRate: number,
): Alignment {
  const a = onsetEnvelope(original, sampleRate)
  const b = onsetEnvelope(instrumental, sampleRate)
  const { lag, confidence } = bestLag(a, b, Math.round(MAX_SHIFT / HOP))
  return { offset: Math.round(lag * HOP * 1000) / 1000, confidence }
}

async function decodeMono(url: string): Promise<{
  samples: Float32Array
  sampleRate: number
}> {
  const response = await fetch(url, { credentials: "same-origin" })
  if (!response.ok) throw new Error(`Couldn't load ${url}`)
  const data = await response.arrayBuffer()
  const sampleRate = 22050
  const ctx = new OfflineAudioContext(1, 1, sampleRate)
  const audio = await ctx.decodeAudioData(data)
  const length = Math.min(
    audio.length,
    Math.round(audio.sampleRate * MAX_SECONDS),
  )
  const samples = new Float32Array(length)
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const ch = audio.getChannelData(c)
    for (let i = 0; i < length; i++)
      samples[i] += ch[i] / audio.numberOfChannels
  }
  return { samples, sampleRate: audio.sampleRate }
}

export async function alignTracks(
  originalUrl: string,
  instrumentalUrl: string,
): Promise<Alignment> {
  const [a, b] = await Promise.all([
    decodeMono(originalUrl),
    decodeMono(instrumentalUrl),
  ])
  // decodeAudioData resamples to the context's rate, so both match.
  return alignSamples(a.samples, b.samples, a.sampleRate)
}
