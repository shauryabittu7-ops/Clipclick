"use client";

/**
 * Upload → proxy pipeline.
 * Fast path: HTMLVideoElement playback directly (browser decodes).
 * Proxy generation (540p) is attempted via WebCodecs + OffscreenCanvas when supported,
 * otherwise we fall back to the original URL for scrubbing.
 */

export interface MediaInfo {
  url: string;
  duration: number;
  width: number;
  height: number;
}

export async function probeMedia(file: File): Promise<MediaInfo> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.preload = "metadata";
  v.muted = true;
  v.src = url;
  await new Promise<void>((res, rej) => {
    v.onloadedmetadata = () => res();
    v.onerror = () => rej(new Error("Failed to load media"));
  });
  return {
    url,
    duration: v.duration,
    width: v.videoWidth,
    height: v.videoHeight,
  };
}

export async function generateThumbnailStrip(
  file: File,
  count = 20,
  thumbWidth = 160
): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.preload = "auto";
  v.muted = true;
  v.src = url;
  await new Promise<void>((res, rej) => {
    v.onloadedmetadata = () => res();
    v.onerror = () => rej(new Error("Failed to load"));
  });
  const ratio = v.videoHeight / Math.max(1, v.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = thumbWidth;
  canvas.height = Math.round(thumbWidth * ratio);
  const ctx = canvas.getContext("2d")!;
  const thumbs: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = (v.duration * i) / count;
    await seek(v, t);
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    thumbs.push(canvas.toDataURL("image/jpeg", 0.6));
  }
  URL.revokeObjectURL(url);
  return thumbs;
}

function seek(v: HTMLVideoElement, t: number) {
  return new Promise<void>((res) => {
    const done = () => {
      v.removeEventListener("seeked", done);
      res();
    };
    v.addEventListener("seeked", done);
    v.currentTime = Math.min(t, Math.max(0, v.duration - 0.01));
  });
}

/**
 * Decode the audio track of a media file and return `resolution` normalized
 * peak values (0–1). Used for waveform rendering in the timeline.
 * Returns an empty Float32Array if the file has no audio or decoding fails.
 */
export async function generateWaveformPeaks(
  file: File,
  resolution = 200
): Promise<Float32Array> {
  try {
    const ab = await file.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, 44_100);
    const decoded = await ctx.decodeAudioData(ab);
    const raw = decoded.getChannelData(0);
    const blockSize = Math.floor(raw.length / resolution);
    const peaks = new Float32Array(resolution);
    for (let i = 0; i < resolution; i++) {
      let max = 0;
      const start = i * blockSize;
      for (let j = 0; j < blockSize; j++) {
        const abs = Math.abs(raw[start + j] ?? 0);
        if (abs > max) max = abs;
      }
      peaks[i] = max;
    }
    return peaks;
  } catch {
    return new Float32Array(0); // no audio track or decode failure
  }
}
