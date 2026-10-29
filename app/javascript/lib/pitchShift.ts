// Videoke-style "key change" for an uploaded backing track: shifts pitch
// without changing tempo, so the tapped lyric timings stay in sync.
//
// A classic granular (two-tap delay-line) shifter: two read heads trail the
// write head through a short delay buffer, sliding at (1 - ratio) samples
// per sample -- reading faster than we write raises the pitch, slower
// lowers it. Each head fades in and out on a sin^2 window, half a cycle
// apart, so their gains always sum to 1 and the jump when a head wraps
// around happens while it's silent. Good for the +/-6 semitones a singer
// actually uses; it adds at most one window (~40ms) of latency, and is
// bypassed entirely at 0.
//
// PitchCore is plain, dependency-free code so the very same class can be
// unit-tested in Node and shipped into the AudioWorklet (see
// WORKLET_SOURCE) via Function#toString -- one implementation, no drift.

export class PitchCore {
  buf: Float32Array
  mask: number
  win: number
  write = 0
  phase = 0
  ratio = 1

  constructor(sampleRate: number) {
    this.win = Math.max(64, Math.round(sampleRate * 0.04))
    let size = 1
    while (size < this.win * 2 + 8) size <<= 1
    this.buf = new Float32Array(size)
    this.mask = size - 1
  }

  setSemitones(semitones: number): void {
    this.ratio = Math.pow(2, semitones / 12)
  }

  read(delay: number): number {
    const pos = this.write - delay
    const i = Math.floor(pos)
    const frac = pos - i
    const a = this.buf[i & this.mask]
    const b = this.buf[(i + 1) & this.mask]
    return a + (b - a) * frac
  }

  process(input: Float32Array, output: Float32Array): void {
    const bypass = Math.abs(this.ratio - 1) < 1e-6
    const step = (1 - this.ratio) / this.win
    for (let n = 0; n < output.length; n++) {
      const x = n < input.length ? input[n] : 0
      this.buf[this.write & this.mask] = x
      if (bypass) {
        output[n] = x
      } else {
        const p1 = this.phase
        const p2 = p1 + 0.5 < 1 ? p1 + 0.5 : p1 - 0.5
        const g1 = Math.sin(Math.PI * p1) ** 2
        const g2 = Math.sin(Math.PI * p2) ** 2
        output[n] =
          g1 * this.read(p1 * this.win + 1) + g2 * this.read(p2 * this.win + 1)
        this.phase += step
        if (this.phase >= 1) this.phase -= 1
        else if (this.phase < 0) this.phase += 1
      }
      this.write = (this.write + 1) & 0x3fffffff
    }
  }
}

export const PITCH_PROCESSOR_NAME = "chordstage-pitch-shift"

export function workletSource(): string {
  return `
const PitchCore = (${PitchCore.toString()});
class ChordStagePitchShift extends AudioWorkletProcessor {
  constructor() {
    super();
    this.cores = [];
    this.semitones = 0;
    this.port.onmessage = (e) => {
      this.semitones = Number(e.data && e.data.semitones) || 0;
      for (const core of this.cores) core.setSemitones(this.semitones);
    };
  }
  process(inputs, outputs) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    for (let ch = 0; ch < output.length; ch++) {
      if (!this.cores[ch]) {
        this.cores[ch] = new PitchCore(sampleRate);
        this.cores[ch].setSemitones(this.semitones);
      }
      const src = input[ch] || input[0] || new Float32Array(output[ch].length);
      this.cores[ch].process(src, output[ch]);
    }
    return true;
  }
}
registerProcessor(${JSON.stringify(PITCH_PROCESSOR_NAME)}, ChordStagePitchShift);
`
}
