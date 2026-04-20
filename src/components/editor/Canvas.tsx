"use client";

import { useEffect, useRef } from "react";
import { PixiRenderer } from "@/lib/compositor/PixiRenderer";
import { useEditor } from "@/lib/state/editorStore";
import { PRESETS_BY_ID } from "@/lib/captions/presets";
import CursorsOverlay from "./CursorsOverlay";

export default function Canvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PixiRenderer | null>(null);
  const videoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());

  const timeline = useEditor((s) => s.timeline);
  const playhead = useEditor((s) => s.playhead);
  const tick = useEditor((s) => s.tick);

  // Init renderer
  useEffect(() => {
    if (!canvasRef.current) return;
    const meta = timeline?.meta;
    const w = (meta?.get("width") as number) ?? 1920;
    const h = (meta?.get("height") as number) ?? 1080;
    const r = new PixiRenderer();
    rendererRef.current = r;
    r.init(canvasRef.current, { width: w, height: h })
      .then(() => {
        r.setCaptionStyleResolver((id) => PRESETS_BY_ID[id] ?? null);
      })
      .catch((e) => console.error("Pixi init failed", e));
    return () => {
      r.destroy();
      rendererRef.current = null;
    };
  }, [timeline]);

  // Responsive resize — fit canvas into wrapper while preserving aspect
  useEffect(() => {
    const wrap = wrapRef.current;
    const cvs = canvasRef.current;
    if (!wrap || !cvs || !timeline) return;
    const w = (timeline.meta.get("width") as number) ?? 1920;
    const h = (timeline.meta.get("height") as number) ?? 1080;
    const ratio = w / h;
    const ro = new ResizeObserver(() => {
      const aw = wrap.clientWidth - 32;
      const ah = wrap.clientHeight - 32;
      let cw = aw;
      let ch = aw / ratio;
      if (ch > ah) {
        ch = ah;
        cw = ah * ratio;
      }
      cvs.style.width = `${cw}px`;
      cvs.style.height = `${ch}px`;
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [timeline]);

  // Attach videos for new video clips
  useEffect(() => {
    if (!timeline || !rendererRef.current) return;
    const clips = Array.from(timeline.clips.values());
    for (const clip of clips) {
      if (clip.kind !== "video" || !clip.assetId) continue;
      if (videoElsRef.current.has(clip.id)) continue;
      const asset = timeline.assets.get(clip.assetId);
      if (!asset?.url) continue;
      const v = document.createElement("video");
      v.src = asset.url;
      v.crossOrigin = "anonymous";
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.addEventListener("loadeddata", () => {
        rendererRef.current?.attachVideo(clip.id, v);
      });
      videoElsRef.current.set(clip.id, v);
    }
  }, [timeline, tick]);

  // Sync captions → compositor
  useEffect(() => {
    if (!timeline || !rendererRef.current) return;
    rendererRef.current.setCaptionSegments(timeline.captions.toArray());
  }, [tick, timeline]);

  // Sync playhead → compositor
  useEffect(() => {
    if (!timeline || !rendererRef.current) return;
    const clips = Array.from(timeline.clips.values());
    rendererRef.current.updateFromTimeline(clips, playhead);
  }, [playhead, tick, timeline]);

  return (
    <div
      ref={wrapRef}
      className="min-h-0 bg-[#050505] grid place-items-center relative"
    >
      <canvas
        ref={canvasRef}
        className="rounded-lg shadow-[0_0_60px_rgba(0,0,0,0.6)]"
      />
      <CursorsOverlay />
    </div>
  );
}
