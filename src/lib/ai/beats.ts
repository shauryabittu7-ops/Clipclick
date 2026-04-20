"use client";

/**
 * Beat / tempo detection via spectral flux onset + autocorrelation.
 * Fast, single-pass, no model download. Uses Meyda for frame features.
 */

import Meyda from "meyda";

export interface BeatResult {
  bpm: number;
  beats: number[]; // timeline seconds
}

export function detectBeats(buffer: AudioBuffer): BeatResult {
  const fs = buffer.sampleRate;
  const mono = toMono(buffer);
  const frameSize = 1024;
  const hop = 512;
  const hopSec = hop / fs;

  const flux: number[] = [];
  let prev: number[] | null = null;

  for (let i = 0; i + frameSize <= mono.length; i += hop) {
    const slice = mono.subarray(i, i + frameSize);
    const feats = Meyda.extract("amplitudeSpectrum", slice) as number[] | undefined;
    if (!feats) continue;
    let f = 0;
    if (prev) {
      for (let k = 0; k < feats.length; k++) {
        const d = feats[k] - prev[k];
        if (d > 0) f += d;
      }
    }
    flux.push(f);
    prev = feats.slice();
  }

  if (flux.length === 0) return { bpm: 0, beats: [] };

  // Normalize + peak-pick
  const mean = flux.reduce((a, b) => a + b, 0) / flux.length;
  const std = Math.sqrt(flux.reduce((a, b) => a + (b - mean) ** 2, 0) / flux.length);
  const cutoff = mean + 0.8 * std;

  const peaks: number[] = [];
  const minGap = Math.round(0.12 / hopSec); // at least 120 ms between beats
  for (let i = 1; i < flux.length - 1; i++) {
    if (flux[i] > cutoff && flux[i] > flux[i - 1] && flux[i] >= flux[i + 1]) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1] > minGap) {
        peaks.push(i);
      }
    }
  }
  const beats = peaks.map((p) => p * hopSec);

  // BPM: median of inter-beat intervals, mapped into [60, 200]
  const ibis: number[] = [];
  for (let i = 1; i < beats.length; i++) ibis.push(beats[i] - beats[i - 1]);
  const median = ibis.length ? ibis.sort((a, b) => a - b)[Math.floor(ibis.length / 2)] : 0;
  let bpm = median > 0 ? 60 / median : 0;
  while (bpm > 0 && bpm < 60) bpm *= 2;
  while (bpm > 200) bpm /= 2;

  return { bpm: Math.round(bpm), beats };
}

function toMono(b: AudioBuffer): Float32Array {
  if (b.numberOfChannels === 1) return b.getChannelData(0);
  const out = new Float32Array(b.length);
  const ch = b.numberOfChannels;
  for (let c = 0; c < ch; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += d[i] / ch;
  }
  return out;
}
