"use client";

import { measureLUFS, gainToTargetLUFS, LUFS_TARGETS, type LUFSTarget } from "./lufs";
import { SpectralGateDenoiser, type Denoiser } from "./denoise";
import { audioBufferToWav } from "./wav";

export interface EnhanceOptions {
  denoise: boolean;
  denoiser?: Denoiser;
  target: LUFSTarget;
  onProgress?: (stage: string, pct?: number) => void;
}

export interface EnhanceResult {
  url: string;
  blob: Blob;
  originalLUFS: number;
  finalLUFS: number;
  gainAppliedDb: number;
}

/**
 * Broadcast-grade offline chain:
 *   [denoise] → high-pass 80Hz → EQ (presence +3dB @3kHz, air +2dB @12kHz)
 *   → compressor (4:1, -18dB, 10ms/150ms) → limiter (-1dB) → LUFS gain
 * Returns a new WAV Blob and its URL.
 */
export async function enhanceAudio(
  source: Blob | string,
  opts: EnhanceOptions
): Promise<EnhanceResult> {
  const { target, onProgress } = opts;
  const arrayBuf =
    typeof source === "string"
      ? await fetch(source).then((r) => r.arrayBuffer())
      : await source.arrayBuffer();

  onProgress?.("decoding");
  const tmpCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const decoded = await tmpCtx.decodeAudioData(arrayBuf.slice(0));
  tmpCtx.close();

  let input = decoded;

  // Denoise (per-channel, pure-JS spectral gate by default)
  if (opts.denoise) {
    onProgress?.("denoising");
    const d = opts.denoiser ?? new SpectralGateDenoiser(0.55);
    const denoised = new AudioBuffer({
      length: input.length,
      numberOfChannels: input.numberOfChannels,
      sampleRate: input.sampleRate,
    });
    for (let c = 0; c < input.numberOfChannels; c++) {
      const out = d.denoise(input.getChannelData(c), input.sampleRate);
      const dst = denoised.getChannelData(c);
      dst.set(out.subarray(0, dst.length));
    }
    input = denoised;
  }

  // Offline graph: HP 80 Hz → presence shelf → air shelf → comp → limiter
  onProgress?.("processing");
  const off = new OfflineAudioContext({
    numberOfChannels: input.numberOfChannels,
    length: input.length,
    sampleRate: input.sampleRate,
  });

  const src = off.createBufferSource();
  src.buffer = input;

  const hp = off.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 80;

  const presence = off.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 3000;
  presence.Q.value = 1.0;
  presence.gain.value = 3;

  const air = off.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 12000;
  air.gain.value = 2;

  const comp = off.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  comp.knee.value = 6;
  comp.attack.value = 0.01;
  comp.release.value = 0.15;

  const limiter = off.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.ratio.value = 20;
  limiter.knee.value = 0;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  src.connect(hp).connect(presence).connect(air).connect(comp).connect(limiter).connect(off.destination);
  src.start();

  const processed = await off.startRendering();

  // LUFS measure + single-pass gain to target
  onProgress?.("measuring loudness");
  const currentLUFS = measureLUFS(processed);
  const targetLufs = LUFS_TARGETS[target];
  const gain = gainToTargetLUFS(currentLUFS, targetLufs);

  // Apply gain with brickwall safety (< -0.3 dBFS peak)
  onProgress?.("normalizing");
  const final = new AudioBuffer({
    length: processed.length,
    numberOfChannels: processed.numberOfChannels,
    sampleRate: processed.sampleRate,
  });
  let peak = 0;
  for (let c = 0; c < processed.numberOfChannels; c++) {
    const data = processed.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const s = data[i] * gain;
      if (Math.abs(s) > peak) peak = Math.abs(s);
    }
  }
  const ceiling = Math.pow(10, -0.3 / 20); // -0.3 dBFS
  const safety = peak > ceiling ? ceiling / peak : 1;
  const appliedGain = gain * safety;
  for (let c = 0; c < processed.numberOfChannels; c++) {
    const src2 = processed.getChannelData(c);
    const dst = final.getChannelData(c);
    for (let i = 0; i < src2.length; i++) dst[i] = src2[i] * appliedGain;
  }

  const finalLUFS = measureLUFS(final);
  onProgress?.("encoding");
  const blob = audioBufferToWav(final);
  const url = URL.createObjectURL(blob);

  return {
    url,
    blob,
    originalLUFS: currentLUFS,
    finalLUFS,
    gainAppliedDb: 20 * Math.log10(appliedGain),
  };
}
