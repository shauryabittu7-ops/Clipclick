"use client";

import { useEffect, useRef, useState } from "react";
import type { YjsTimeline } from "@/lib/timeline/YjsTimeline";

interface Props {
  timeline: YjsTimeline;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  duration: number;
}

/**
 * Shows a 160x90 thumbnail preview above the cursor when hovering the timeline ruler.
 * Uses a per-asset hidden HTMLVideoElement cache and seeks on demand.
 */
export default function ThumbScrub({ timeline, containerRef, zoom, duration }: Props) {
  const [hover, setHover] = useState<{ clientX: number; clientY: number; t: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoCache = useRef(new Map<string, HTMLVideoElement>());
  const seekQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      // Only show when hovering over the ruler (first child with data-ruler)
      const inRuler = target?.closest?.("[data-ruler='1']");
      if (!inRuler) {
        setHover(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left + el.scrollLeft;
      const t = Math.max(0, Math.min(duration, x / zoom));
      setHover({ clientX: e.clientX, clientY: rect.top, t });
    };
    const onLeave = () => setHover(null);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [containerRef, zoom, duration]);

  useEffect(() => {
    if (!hover) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Find the active video clip at hover time.
    const clips = Array.from(timeline.clips.values()).filter(
      (c) => c.kind === "video" && !!c.assetId
    );
    const clip = clips.find((c) => hover.t >= c.start && hover.t < c.start + c.duration);
    if (!clip || !clip.assetId) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const asset = timeline.assets.get(clip.assetId);
    if (!asset?.url) return;

    let v = videoCache.current.get(clip.assetId);
    if (!v) {
      v = document.createElement("video");
      v.src = asset.url;
      v.muted = true;
      v.crossOrigin = "anonymous";
      v.preload = "auto";
      videoCache.current.set(clip.assetId, v);
    }
    const target = clip.sourceIn + (hover.t - clip.start);
    const render = async () => {
      try {
        if (v!.readyState < 2) {
          await new Promise<void>((res) => {
            const on = () => {
              v!.removeEventListener("loadeddata", on);
              res();
            };
            v!.addEventListener("loadeddata", on);
          });
        }
        v!.currentTime = Math.min(target, Math.max(0, (v!.duration || 0) - 0.05));
        await new Promise<void>((res) => {
          const on = () => {
            v!.removeEventListener("seeked", on);
            res();
          };
          v!.addEventListener("seeked", on);
        });
        ctx.drawImage(v!, 0, 0, canvas.width, canvas.height);
      } catch {
        // ignore
      }
    };
    seekQueue.current = seekQueue.current.then(render);
  }, [hover, timeline]);

  useEffect(() => {
    const cache = videoCache.current;
    return () => {
      cache.forEach((v) => {
        v.src = "";
        v.load();
      });
      cache.clear();
    };
  }, []);

  if (!hover) return null;
  return (
    <div
      className="fixed z-[60] pointer-events-none"
      style={{
        left: Math.max(6, hover.clientX - 80),
        top: hover.clientY - 116,
      }}
    >
      <div className="rounded-md overflow-hidden border border-[var(--border-strong)] bg-black shadow-xl">
        <canvas ref={canvasRef} width={160} height={90} className="block" />
        <div className="px-2 py-1 text-[10px] font-mono text-[var(--fg-muted)] bg-[var(--bg-panel)]">
          {hover.t.toFixed(2)}s
        </div>
      </div>
    </div>
  );
}
