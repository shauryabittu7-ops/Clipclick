/**
 * ITU-R BS.1770 integrated loudness (LUFS) measurement.
 * Streaming K-weighting pre-filter + 400ms blocks with 75% overlap,
 * absolute gate at -70 LUFS, relative gate at -10 LU below ungated mean.
 */

// K-weighting biquad coefficients for 48kHz. We retune for arbitrary fs.
// Stage 1: high-shelf +4dB at ~1681 Hz. Stage 2: high-pass at ~38 Hz.

class Biquad {
  private z1 = 0;
  private z2 = 0;
  constructor(
    private b0: number,
    private b1: number,
    private b2: number,
    private a1: number,
    private a2: number
  ) {}
  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

function designHighShelf(fs: number): Biquad {
  // Transposed-Direct-Form coefficients from BS.1770-4 reference, retuned by bilinear warp.
  const f0 = 1681.974450955533;
  const G = 3.999843853973347;
  const Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.499666774155);
  const a0 = 1 + K / Q + K * K;
  const b0 = (Vh + (Vb * K) / Q + K * K) / a0;
  const b1 = (2 * (K * K - Vh)) / a0;
  const b2 = (Vh - (Vb * K) / Q + K * K) / a0;
  const a1 = (2 * (K * K - 1)) / a0;
  const a2 = (1 - K / Q + K * K) / a0;
  return new Biquad(b0, b1, b2, a1, a2);
}

function designHighPass(fs: number): Biquad {
  const f0 = 38.13547087602444;
  const Q = 0.5003270373238773;
  const K = Math.tan((Math.PI * f0) / fs);
  const a0 = 1 + K / Q + K * K;
  const b0 = 1 / a0;
  const b1 = -2 / a0;
  const b2 = 1 / a0;
  const a1 = (2 * (K * K - 1)) / a0;
  const a2 = (1 - K / Q + K * K) / a0;
  return new Biquad(b0, b1, b2, a1, a2);
}

export function measureLUFS(audio: AudioBuffer): number {
  const fs = audio.sampleRate;
  const ch = audio.numberOfChannels;
  const filters: [Biquad, Biquad][] = Array.from({ length: ch }, () => [
    designHighShelf(fs),
    designHighPass(fs),
  ]);
  const data: Float32Array[] = [];
  for (let c = 0; c < ch; c++) data.push(audio.getChannelData(c));

  const blockSize = Math.round(0.4 * fs);
  const hop = Math.round(0.1 * fs);
  const N = audio.length;
  const G = [1, 1, 1, 1.41, 1.41]; // surround weights; stereo/mono use [1,1]
  const blockLoudness: number[] = [];

  // Pre-filter + energy accumulation per block
  const filtered: Float32Array[] = data.map((_, c) => new Float32Array(N));
  for (let c = 0; c < ch; c++) {
    const [s1, s2] = filters[c];
    const dst = filtered[c];
    const src = data[c];
    for (let i = 0; i < N; i++) dst[i] = s2.process(s1.process(src[i]));
  }

  for (let start = 0; start + blockSize <= N; start += hop) {
    let sum = 0;
    for (let c = 0; c < ch; c++) {
      const w = G[c] ?? 1;
      const arr = filtered[c];
      let acc = 0;
      for (let i = start; i < start + blockSize; i++) acc += arr[i] * arr[i];
      sum += w * (acc / blockSize);
    }
    if (sum <= 0) continue;
    const lufs = -0.691 + 10 * Math.log10(sum);
    blockLoudness.push(lufs);
  }

  if (blockLoudness.length === 0) return -Infinity;

  // Absolute gate -70 LUFS
  const abs = blockLoudness.filter((v) => v > -70);
  if (abs.length === 0) return -Infinity;
  const mean1 = abs.reduce((a, b) => a + Math.pow(10, b / 10), 0) / abs.length;
  const gate = 10 * Math.log10(mean1) - 10;
  const rel = abs.filter((v) => v > gate);
  if (rel.length === 0) return -Infinity;
  const mean2 = rel.reduce((a, b) => a + Math.pow(10, b / 10), 0) / rel.length;
  return 10 * Math.log10(mean2);
}

/** Linear gain needed to move `currentLUFS` to `targetLUFS`. */
export function gainToTargetLUFS(currentLUFS: number, targetLUFS: number): number {
  if (!isFinite(currentLUFS)) return 1;
  const db = targetLUFS - currentLUFS;
  return Math.pow(10, db / 20);
}

export const LUFS_TARGETS = {
  reels: -14,
  youtube: -14,
  podcast: -16,
  broadcast: -23,
} as const;
export type LUFSTarget = keyof typeof LUFS_TARGETS;
