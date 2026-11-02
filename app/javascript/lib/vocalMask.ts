// Videoke-style vocal masking for an uploaded track, in the browser.
//
// There's no AI separation here (that needs a trained model, far too heavy
// for a TV's browser). This is the classic karaoke "center cancel": in a
// studio mix the lead vocal is panned dead center -- identical in the left
// and right channels -- while most instruments, reverb and backing vocals
// are spread across the stereo field. So the track is split into
//
//   mid  = (L + R) / 2   -- everything in the center: vocal, but also bass,
//                           kick drum, snare
//   side = (L - R) / 2   -- everything that differs between the channels
//
// and only the mid's *vocal range* (roughly 160 Hz - 8 kHz) is turned down.
// The mid's lows (bass, kick) and highs (cymbals, air) are kept, and so is
// all of the side, so the band still sounds like a band.
//
// Turned down part way ("guide"), the singer can still hear the melody
// faintly. Fully up, the original signal goes straight through untouched.
//
// Limits: a mono recording has no side at all (nothing to keep apart from
// the vocal), a vocal with wide stereo reverb leaves a ghost of its reverb,
// and centered instruments in the vocal range (a centered piano or guitar)
// are lowered with it. `useTrackFx` measures the side against the mid to
// warn about a mono track; a proper "minus-one" upload is always cleaner.

export const VOCAL_LOW_HZ = 160
export const VOCAL_HIGH_HZ = 8000
const RAMP = 0.06 // seconds, so level changes don't click

export interface VocalMask {
  input: AudioNode
  output: AudioNode
  // 1 = original (untouched), 0 = vocal range of the center removed.
  setLevel: (level: number) => void
  // Loudness of the center and the sides right now (for spotting a mono
  // track, where the side is silent).
  levels: () => { mid: number; side: number }
}

function filters(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  frequency: number,
): { first: BiquadFilterNode; last: BiquadFilterNode } {
  // Two in a row: 24 dB/octave, so the crossover is reasonably tight.
  const a = ctx.createBiquadFilter()
  const b = ctx.createBiquadFilter()
  for (const f of [a, b]) {
    f.type = type
    f.frequency.value = frequency
    f.Q.value = Math.SQRT1_2
  }
  a.connect(b)
  return { first: a, last: b }
}

function rms(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buf)
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  return Math.sqrt(sum / buf.length)
}

export function createVocalMask(ctx: BaseAudioContext): VocalMask {
  const input = ctx.createGain()
  input.channelCount = 2
  input.channelCountMode = "explicit"
  input.channelInterpretation = "speakers"
  const output = ctx.createGain()

  // Untouched path, used when the vocal is fully up.
  const dry = ctx.createGain()
  input.connect(dry).connect(output)

  // Masked path.
  const wet = ctx.createGain()
  wet.gain.value = 0
  const split = ctx.createChannelSplitter(2)
  input.connect(split)

  const mid = ctx.createGain() // (L + R) / 2
  mid.gain.value = 0.5
  split.connect(mid, 0)
  split.connect(mid, 1)

  const side = ctx.createGain() // (L - R) / 2
  side.gain.value = 0.5
  const invertR = ctx.createGain()
  invertR.gain.value = -1
  split.connect(side, 0)
  split.connect(invertR, 1).connect(side)

  // The center, minus its vocal range (at the vocal level).
  const center = ctx.createGain()
  const lows = filters(ctx, "lowpass", VOCAL_LOW_HZ)
  const highs = filters(ctx, "highpass", VOCAL_HIGH_HZ)
  const bandLow = filters(ctx, "highpass", VOCAL_LOW_HZ)
  const bandHigh = filters(ctx, "lowpass", VOCAL_HIGH_HZ)
  const vocal = ctx.createGain()
  vocal.gain.value = 0
  mid.connect(lows.first)
  lows.last.connect(center)
  mid.connect(highs.first)
  highs.last.connect(center)
  mid.connect(bandLow.first)
  bandLow.last.connect(bandHigh.first)
  bandHigh.last.connect(vocal).connect(center)

  // Back to stereo: L = center + side, R = center - side.
  const merge = ctx.createChannelMerger(2)
  const invertSide = ctx.createGain()
  invertSide.gain.value = -1
  center.connect(merge, 0, 0)
  center.connect(merge, 0, 1)
  side.connect(merge, 0, 0)
  side.connect(invertSide).connect(merge, 0, 1)
  merge.connect(wet).connect(output)

  // Meters for the mono check.
  const midMeter = ctx.createAnalyser()
  const sideMeter = ctx.createAnalyser()
  midMeter.fftSize = sideMeter.fftSize = 2048
  mid.connect(midMeter)
  side.connect(sideMeter)
  const buf = new Float32Array(new ArrayBuffer(2048 * 4))

  function setLevel(level: number) {
    const v = Math.min(1, Math.max(0, level))
    const t = ctx.currentTime
    const full = v >= 0.999
    dry.gain.setTargetAtTime(full ? 1 : 0, t, RAMP / 3)
    wet.gain.setTargetAtTime(full ? 0 : 1, t, RAMP / 3)
    vocal.gain.setTargetAtTime(full ? 1 : v, t, RAMP / 3)
  }

  return {
    input,
    output,
    setLevel,
    levels: () => ({ mid: rms(midMeter, buf), side: rms(sideMeter, buf) }),
  }
}
