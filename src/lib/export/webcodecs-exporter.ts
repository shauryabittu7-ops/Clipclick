"use client";

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { PixiRenderer } from "@/lib/compositor/PixiRenderer";
import type { YjsTimeline, ClipData } from "@/lib/timeline/YjsTimeline";
import { PRESETS_BY_ID } from "@/lib/captions/presets";
import { LUT_PRESETS_BY_ID } from "@/lib/color/presets";
import { applyLUTToImageData } from "@/lib/color/lut";

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  bitrate?: number; // bits per second
  /** Sub-frame samples per output frame (1 = off, 4 = cinematic motion blur). */
  motionBlurSamples?: number;
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio mixing helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decode the audio from a blob URL into an AudioBuffer at the target sample rate.
 * Returns null if the URL has no audio track or decoding fails.
 */
async function decodeAudio(url: string, sampleRate: number): Promise<AudioBuffer | null> {
  try {
    const resp = await fetch(url);
    const ab = await resp.arrayBuffer();
    const ctx = new OfflineAudioContext(2, 1, sampleRate);
    const buf = await ctx.decodeAudioData(ab);
    return buf;
  } catch {
    return null; // video-only file or unsupported codec
  }
}

/**
 * Mix all audio-bearing clips (kind === "video" | "audio") into a single
 * interleaved Float32Array at the given sample rate.
 */
async function mixAudioTracks(
  clips: ClipData[],
  timeline: YjsTimeline,
  totalDuration: number,
  sampleRate: number
): Promise<Float32Array> {
  const totalSamples = Math.ceil(totalDuration * sampleRate);
  const mixed = new Float32Array(totalSamples * 2); // stereo interleaved

  const audioCandidates = clips.filter(
    (c) => (c.kind === "video" || c.kind === "audio") && !!c.assetId && !c.muted
  );

  await Promise.all(
    audioCandidates.map(async (clip) => {
      const asset = timeline.assets.get(clip.assetId!);
      if (!asset?.url) return;

      const buf = await decodeAudio(asset.url, sampleRate);
      if (!buf) return;

      const vol = clip.volume ?? 1;
      const chL = buf.numberOfChannels > 0 ? buf.getChannelData(0) : null;
      const chR = buf.numberOfChannels > 1 ? buf.getChannelData(1) : chL;
      if (!chL) return;

      // Map timeline position → source position
      const timelineStartSample = Math.round(clip.start * sampleRate);
      const sourceStartSample = Math.round(clip.sourceIn * sampleRate);
      const durationSamples = Math.round(clip.duration * sampleRate);

      for (let i = 0; i < durationSamples; i++) {
        const srcIdx = sourceStartSample + i;
        const dstIdx = timelineStartSample + i;
        if (dstIdx >= totalSamples) break;
        if (srcIdx >= buf.length) break;
        mixed[dstIdx * 2] += (chL[srcIdx] ?? 0) * vol;
        mixed[dstIdx * 2 + 1] += ((chR ?? chL)[srcIdx] ?? 0) * vol;
      }
    })
  );

  return mixed;
}

/**
 * Encode a Float32 stereo interleaved PCM buffer as AAC using WebCodecs AudioEncoder.
 * Feeds each encoded chunk to the provided callback.
 */
async function encodeAac(
  pcm: Float32Array,
  sampleRate: number,
  numberOfChannels: number,
  onChunk: (chunk: EncodedAudioChunk, meta: EncodedAudioChunkMetadata | undefined) => void
): Promise<void> {
  if (!("AudioEncoder" in window)) return; // Safari < 17 fallback — skip audio

  const FRAME_SIZE = 1024; // AAC frame size
  const totalFrames = Math.ceil(pcm.length / (numberOfChannels * FRAME_SIZE));

  const encoder = new AudioEncoder({
    output: onChunk,
    error: (e) => console.error("AudioEncoder error", e),
  });

  encoder.configure({
    codec: "mp4a.40.2", // AAC-LC
    sampleRate,
    numberOfChannels,
    bitrate: 128_000,
  });

  for (let f = 0; f < totalFrames; f++) {
    const offset = f * FRAME_SIZE * numberOfChannels;
    const remaining = pcm.length - offset;
    const frameData = pcm.subarray(offset, offset + Math.min(FRAME_SIZE * numberOfChannels, remaining));

    // AudioData requires separate channel data (planar, not interleaved)
    const chL = new Float32Array(FRAME_SIZE);
    const chR = new Float32Array(FRAME_SIZE);
    for (let s = 0; s < Math.min(FRAME_SIZE, remaining / numberOfChannels); s++) {
      chL[s] = frameData[s * numberOfChannels] ?? 0;
      chR[s] = frameData[s * numberOfChannels + 1] ?? 0;
    }

    const planes = numberOfChannels === 1 ? [chL] : [chL, chR];
    const frameCount = Math.min(FRAME_SIZE, Math.ceil(remaining / numberOfChannels));

    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: frameCount,
      numberOfChannels,
      timestamp: Math.round((f * FRAME_SIZE * 1_000_000) / sampleRate),
      data: planes[0], // will be overwritten below via copyTo
    });

    // Re-create with proper planar data
    const planarBuf = new Float32Array(frameCount * numberOfChannels);
    for (let ch = 0; ch < numberOfChannels; ch++) {
      planarBuf.set(planes[ch].subarray(0, frameCount), ch * frameCount);
    }
    const audioData2 = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: frameCount,
      numberOfChannels,
      timestamp: Math.round((f * FRAME_SIZE * 1_000_000) / sampleRate),
      data: planarBuf,
    });
    audioData.close();

    encoder.encode(audioData2);
    audioData2.close();
  }

  await encoder.flush();
  encoder.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Offline export: seeks each video element frame-by-frame, composites via Pixi
 * onto an offscreen canvas, encodes with VideoEncoder, mixes audio, muxes into MP4.
 */
export async function exportTimeline(
  timeline: YjsTimeline,
  opts: ExportOptions
): Promise<Blob> {
  const { width, height, fps, onProgress, signal } = opts;
  const bitrate = opts.bitrate ?? 8_000_000;
  const mbSamples = Math.max(1, Math.min(8, opts.motionBlurSamples ?? 1));

  const clips = Array.from(timeline.clips.values());
  const duration = clips.reduce((acc, c) => Math.max(acc, c.start + c.duration), 0);
  const totalFrames = Math.ceil(duration * fps);
  if (totalFrames === 0) throw new Error("Timeline is empty");

  // ── Check audio capability ─────────────────────────────────────────────
  const hasAudioEncoder = "AudioEncoder" in window;
  const SAMPLE_RATE = 48_000;
  const NUM_CHANNELS = 2;

  // Offscreen rendering canvas (Pixi draws into this)
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const renderer = new PixiRenderer();
  await renderer.init(canvas, { width, height });
  renderer.setCaptionStyleResolver((id) => PRESETS_BY_ID[id] ?? null);
  renderer.setCaptionSegments(timeline.captions.toArray());

  // Prepare video elements
  const videoEls = new Map<string, HTMLVideoElement>();
  const videoClips = clips.filter((c): c is ClipData => c.kind === "video" && !!c.assetId);
  await Promise.all(
    videoClips.map(async (c) => {
      const asset = timeline.assets.get(c.assetId!);
      if (!asset?.url) return;
      const v = document.createElement("video");
      v.src = asset.url;
      v.muted = true;
      v.crossOrigin = "anonymous";
      v.preload = "auto";
      await new Promise<void>((res, rej) => {
        v.onloadeddata = () => res();
        v.onerror = () => rej(new Error(`Failed to load ${asset.name}`));
      });
      videoEls.set(c.id, v);
      renderer.attachVideo(c.id, v);
    })
  );

  // ── Pre-mix audio (done before video encoding to avoid blocking) ──────────
  onProgress?.(0);
  const audioPcm = hasAudioEncoder
    ? await mixAudioTracks(clips, timeline, duration, SAMPLE_RATE)
    : null;

  // ── Set up muxer with optional audio track ────────────────────────────────
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: "avc",
      width,
      height,
      frameRate: fps,
    },
    ...(audioPcm
      ? {
          audio: {
            codec: "aac",
            sampleRate: SAMPLE_RATE,
            numberOfChannels: NUM_CHANNELS,
          },
        }
      : {}),
    fastStart: "in-memory",
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error("Encoder error", e),
  });
  encoder.configure({
    codec: "avc1.640028",
    width,
    height,
    bitrate,
    framerate: fps,
    latencyMode: "quality",
  });

  const seekVideo = (v: HTMLVideoElement, t: number) =>
    new Promise<void>((res) => {
      const done = () => {
        v.removeEventListener("seeked", done);
        res();
      };
      v.addEventListener("seeked", done);
      v.currentTime = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.001));
    });

  // Accumulator canvas used for motion-blur sub-frame averaging
  const accum = mbSamples > 1 ? document.createElement("canvas") : null;
  const accumCtx = accum ? accum.getContext("2d")! : null;
  if (accum) { accum.width = width; accum.height = height; }

  // LUT color grade (baked at export time)
  const lutId = (timeline.meta.get("lutId") as string | undefined) ?? "neutral";
  const lutIntensity = (timeline.meta.get("lutIntensity") as number | undefined) ?? 1;
  const lutData =
    lutId !== "neutral" && LUT_PRESETS_BY_ID[lutId]
      ? LUT_PRESETS_BY_ID[lutId].build(33)
      : null;
  const gradeCanvas = lutData ? document.createElement("canvas") : null;
  const gradeCtx = gradeCanvas ? gradeCanvas.getContext("2d")! : null;
  if (gradeCanvas) { gradeCanvas.width = width; gradeCanvas.height = height; }

  try {
    // ── Video encoding loop ───────────────────────────────────────────────
    for (let f = 0; f < totalFrames; f++) {
      if (signal?.aborted) throw new Error("Export cancelled");
      const baseT = f / fps;
      const dt = 1 / fps;

      if (accumCtx) {
        accumCtx.globalCompositeOperation = "source-over";
        accumCtx.globalAlpha = 1;
        accumCtx.clearRect(0, 0, width, height);
      }

      for (let sub = 0; sub < mbSamples; sub++) {
        const t = baseT + (sub / mbSamples) * dt;
        await Promise.all(
          videoClips.map((c) => {
            const v = videoEls.get(c.id);
            if (!v) return;
            const active = t >= c.start && t < c.start + c.duration;
            if (!active) return;
            return seekVideo(v, c.sourceIn + (t - c.start));
          })
        );
        renderer.updateFromTimeline(clips, t);
        renderer.app.renderer.render(renderer.app.stage);
        if (accumCtx) {
          accumCtx.globalAlpha = 1 / mbSamples;
          accumCtx.drawImage(canvas, 0, 0, width, height);
        }
      }

      let source: HTMLCanvasElement = accum ?? canvas;
      if (lutData && gradeCtx && gradeCanvas) {
        gradeCtx.clearRect(0, 0, width, height);
        gradeCtx.drawImage(source, 0, 0, width, height);
        const img = gradeCtx.getImageData(0, 0, width, height);
        applyLUTToImageData(img, lutData, lutIntensity);
        gradeCtx.putImageData(img, 0, 0);
        source = gradeCanvas;
      }
      const frame = new VideoFrame(source, {
        timestamp: Math.round((f / fps) * 1_000_000),
        duration: Math.round(1_000_000 / fps),
      });
      const keyFrame = f % (fps * 2) === 0;
      encoder.encode(frame, { keyFrame });
      frame.close();

      if (encoder.encodeQueueSize > 10) {
        await new Promise((r) => setTimeout(r, 0));
      }
      // Video progress = 0–90%; audio encoding = 90–100%
      onProgress?.((f / totalFrames) * (audioPcm ? 0.9 : 1));
    }

    await encoder.flush();
    encoder.close();

    // ── Audio encoding ────────────────────────────────────────────────────
    if (audioPcm) {
      await encodeAac(audioPcm, SAMPLE_RATE, NUM_CHANNELS, (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta);
      });
      onProgress?.(1);
    }

    muxer.finalize();
    onProgress?.(1);

    const buf = (muxer.target as ArrayBufferTarget).buffer;
    return new Blob([buf], { type: "video/mp4" });
  } finally {
    renderer.destroy();
    videoEls.forEach((v) => {
      v.src = "";
      v.load();
    });
  }
}
