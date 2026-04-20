"use client";

/**
 * Lightweight energy-based VAD — good enough for silence-cut and auto-chaptering.
 * (Swap for Silero VAD ONNX if you want 95th-percentile accuracy.)
 */

export interface SilenceRegion {
  start: number;
  end: number;
}

export interface SilenceOptions {
  /** dBFS threshold. Anything below this is "silence". */
  thresholdDb?: number;
  /** Regions shorter than this (seconds) are ignored. */
  minSilence?: number;
  /** Padding kept at each edge, so edits don't clip speech. */
  padding?: number;
}

export function detectSilence(
  buffer: AudioBuffer,
  opts: SilenceOptions = {}
): SilenceRegion[] {
  const thresholdDb = opts.thresholdDb ?? -40;
  const minSilence = opts.minSilence ?? 0.35;
  const padding = opts.padding ?? 0.08;

  const fs = buffer.sampleRate;
  const hop = Math.floor(fs * 0.02); // 20 ms frames
  const data = toMono(buffer);
  const threshold = Math.pow(10, thresholdDb / 20);

  const frames: boolean[] = [];
  for (let i = 0; i + hop <= data.length; i += hop) {
    let sum = 0;
    for (let k = 0; k < hop; k++) sum += data[i + k] * data[i + k];
    const rms = Math.sqrt(sum / hop);
    frames.push(rms < threshold);
  }

  const out: SilenceRegion[] = [];
  let runStart = -1;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i]) {
      if (runStart < 0) runStart = i;
    } else if (runStart >= 0) {
      const startSec = (runStart * hop) / fs;
      const endSec = (i * hop) / fs;
      if (endSec - startSec >= minSilence) {
        out.push({
          start: startSec + padding,
          end: Math.max(startSec + padding + 0.05, endSec - padding),
        });
      }
      runStart = -1;
    }
  }
  if (runStart >= 0) {
    const startSec = (runStart * hop) / fs;
    const endSec = data.length / fs;
    if (endSec - startSec >= minSilence) {
      out.push({ start: startSec + padding, end: endSec });
    }
  }
  return out;
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
