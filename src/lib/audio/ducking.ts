"use client";

/**
 * Sidechain auto-ducking: given a speech buffer (the trigger) and a music buffer,
 * returns a new music AudioBuffer where music is attenuated in lockstep with
 * speech energy. 20ms attack, 300ms release, -12 dB floor by default.
 */

export interface DuckingOptions {
  floorDb?: number;      // gain reduction depth when speech is present
  attackMs?: number;
  releaseMs?: number;
  threshold?: number;    // linear speech RMS above which ducking kicks in
}

export function duckMusic(
  speech: AudioBuffer,
  music: AudioBuffer,
  opts: DuckingOptions = {}
): AudioBuffer {
  const floorDb = opts.floorDb ?? -12;
  const floor = Math.pow(10, floorDb / 20);
  const atk = opts.attackMs ?? 20;
  const rel = opts.releaseMs ?? 300;
  const th = opts.threshold ?? 0.02;

  const fs = music.sampleRate;
  const atkCoef = Math.exp(-1 / (fs * (atk / 1000)));
  const relCoef = Math.exp(-1 / (fs * (rel / 1000)));

  // Collapse speech to mono envelope at music sample rate
  const speechMono = toMono(speech);
  const env = new Float32Array(music.length);
  const ratio = speech.sampleRate / fs;
  let follower = 0;
  for (let i = 0; i < env.length; i++) {
    const srcIdx = Math.min(speechMono.length - 1, Math.floor(i * ratio));
    const x = Math.abs(speechMono[srcIdx]);
    follower = x > follower ? atkCoef * follower + (1 - atkCoef) * x
                             : relCoef * follower + (1 - relCoef) * x;
    env[i] = follower;
  }

  const out = new AudioBuffer({
    length: music.length,
    numberOfChannels: music.numberOfChannels,
    sampleRate: fs,
  });

  // Smooth gain envelope: full (1.0) when silent, `floor` when speech is above threshold
  const gain = new Float32Array(music.length);
  let g = 1;
  for (let i = 0; i < gain.length; i++) {
    const target = env[i] > th ? floor : 1;
    g = target < g ? atkCoef * g + (1 - atkCoef) * target
                   : relCoef * g + (1 - relCoef) * target;
    gain[i] = g;
  }

  for (let c = 0; c < music.numberOfChannels; c++) {
    const src = music.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < src.length; i++) dst[i] = src[i] * gain[i];
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
