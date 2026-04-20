/**
 * Noise suppression interface.
 *
 * Production slot for DeepFilterNet WASM (broadcast-grade) or RNNoise.
 * Default implementation: spectral-gate denoiser — naive but useful fallback
 * that already removes hum and hiss without extra downloads.
 *
 * To plug in DeepFilterNet:
 *   - load the wasm module, expose `init()` + `processFrame(Float32Array) => Float32Array`
 *   - swap the `denoiseBuffer` implementation below.
 */

export interface Denoiser {
  ready: boolean;
  denoise(channel: Float32Array, sampleRate: number): Float32Array;
}

/** Spectral subtraction — noise floor estimated from quietest 0.3s of the signal. */
export class SpectralGateDenoiser implements Denoiser {
  ready = true;
  private strength: number;
  constructor(strength = 0.6) {
    this.strength = Math.max(0, Math.min(1, strength));
  }
  denoise(channel: Float32Array, sampleRate: number): Float32Array {
    const frame = 1024;
    const hop = 512;
    const fft = new NaiveFFT(frame);
    const win = hannWindow(frame);

    // Estimate noise magnitude from quietest window
    let minRms = Infinity;
    let minStart = 0;
    const rmsStep = Math.max(frame, Math.floor(sampleRate * 0.1));
    for (let i = 0; i + frame <= channel.length; i += rmsStep) {
      let s = 0;
      for (let k = 0; k < frame; k++) s += channel[i + k] * channel[i + k];
      const rms = Math.sqrt(s / frame);
      if (rms < minRms) {
        minRms = rms;
        minStart = i;
      }
    }
    const noiseMag = new Float32Array(frame / 2 + 1);
    {
      const re = new Float32Array(frame);
      const im = new Float32Array(frame);
      for (let k = 0; k < frame && minStart + k < channel.length; k++)
        re[k] = channel[minStart + k] * win[k];
      fft.forward(re, im);
      for (let k = 0; k <= frame / 2; k++) noiseMag[k] = Math.hypot(re[k], im[k]);
    }

    const out = new Float32Array(channel.length);
    const re = new Float32Array(frame);
    const im = new Float32Array(frame);

    for (let i = 0; i + frame <= channel.length; i += hop) {
      for (let k = 0; k < frame; k++) {
        re[k] = channel[i + k] * win[k];
        im[k] = 0;
      }
      fft.forward(re, im);
      for (let k = 0; k <= frame / 2; k++) {
        const mag = Math.hypot(re[k], im[k]);
        const phase = Math.atan2(im[k], re[k]);
        const nm = noiseMag[k] * (1 + this.strength);
        const newMag = Math.max(0, mag - nm);
        re[k] = newMag * Math.cos(phase);
        im[k] = newMag * Math.sin(phase);
        if (k > 0 && k < frame / 2) {
          re[frame - k] = re[k];
          im[frame - k] = -im[k];
        }
      }
      fft.inverse(re, im);
      for (let k = 0; k < frame; k++) out[i + k] += re[k] * win[k];
    }
    // Normalize overlap
    const norm = frame / hop / 2;
    for (let i = 0; i < out.length; i++) out[i] /= norm;
    return out;
  }
}

/** Minimal iterative FFT, good enough for 1024-sample frames. */
class NaiveFFT {
  private n: number;
  private reverse: Int32Array;
  private cos: Float32Array;
  private sin: Float32Array;
  constructor(n: number) {
    if ((n & (n - 1)) !== 0) throw new Error("FFT size must be power of two");
    this.n = n;
    this.reverse = new Int32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let j = 0;
      for (let b = 0; b < bits; b++) if ((i >> b) & 1) j |= 1 << (bits - 1 - b);
      this.reverse[i] = j;
    }
    this.cos = new Float32Array(n / 2);
    this.sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / n);
      this.sin[i] = Math.sin((-2 * Math.PI * i) / n);
    }
  }
  forward(re: Float32Array, im: Float32Array) {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const j = this.reverse[i];
      if (j > i) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let k = 0; k < half; k++) {
          const c = this.cos[k * step];
          const s = this.sin[k * step];
          const tre = c * re[i + k + half] - s * im[i + k + half];
          const tim = s * re[i + k + half] + c * im[i + k + half];
          re[i + k + half] = re[i + k] - tre;
          im[i + k + half] = im[i + k] - tim;
          re[i + k] += tre;
          im[i + k] += tim;
        }
      }
    }
  }
  inverse(re: Float32Array, im: Float32Array) {
    const n = this.n;
    for (let i = 0; i < n; i++) im[i] = -im[i];
    this.forward(re, im);
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] = -im[i] / n;
    }
  }
}

function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}
