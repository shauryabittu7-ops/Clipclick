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

/**
 * Offline export: seeks each video element frame-by-frame, composites via Pixi
 * onto an offscreen canvas, encodes with VideoEncoder, muxes into MP4.
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

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: "avc",
      width,
      height,
      frameRate: fps,
    },
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
      onProgress?.(f / totalFrames);
    }

    await encoder.flush();
    encoder.close();
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
