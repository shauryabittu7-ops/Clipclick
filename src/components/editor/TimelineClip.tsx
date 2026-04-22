"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ClipData, YjsTimeline } from "@/lib/timeline/YjsTimeline";
import { moveClip, snapCandidates, snapTime, trimLeft, trimRight } from "@/lib/timeline/ops";

interface Props {
  clip: ClipData;
  zoom: number;
  label: string;
  color: string;
  selected: boolean;
  onSelect: () => void;
  timeline: YjsTimeline;
  playhead: number;
  waveform?: Float32Array;
}

type DragMode = "move" | "trim-l" | "trim-r" | null;

/** Render audio peaks into a canvas element sized to the clip. */
function WaveformCanvas({ peaks }: { peaks: Float32Array }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  function drawPeaks(canvas: HTMLCanvasElement) {
    if (!canvas || peaks.length === 0) return;
    // Sync canvas pixel resolution to its CSS size
    canvas.width = canvas.offsetWidth || 200;
    canvas.height = canvas.offsetHeight || 40;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    const barW = Math.max(1, width / peaks.length);
    const mid = height / 2;
    for (let i = 0; i < peaks.length; i++) {
      const x = (i / peaks.length) * width;
      const barH = Math.max(1, peaks[i] * mid * 1.8);
      ctx.fillRect(Math.floor(x), mid - barH, Math.ceil(barW), barH * 2);
    }
  }

  // Redraw whenever peaks change
  useEffect(() => {
    if (canvasRef.current) drawPeaks(canvasRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peaks]);

  // Callback ref: fires when the element mounts/unmounts
  const refCb = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    if (el) drawPeaks(el);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peaks]);

  return (
    <canvas
      ref={refCb}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ display: "block" }}
    />
  );
}

export default function TimelineClip({
  clip,
  zoom,
  label,
  color,
  selected,
  onSelect,
  timeline,
  playhead,
  waveform,
}: Props) {
  const dragRef = useRef<{ mode: DragMode; startX: number; base: ClipData } | null>(null);

  const onPointerDown = (e: React.PointerEvent, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = { mode, startX: e.clientX, base: { ...clip } };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !d.mode) return;
    const dx = (e.clientX - d.startX) / zoom;
    const snaps = snapCandidates(timeline, playhead, clip.id);

    if (d.mode === "move") {
      const target = snapTime(d.base.start + dx, zoom, snaps);
      moveClip(timeline, clip.id, target);
    } else if (d.mode === "trim-l") {
      const target = snapTime(d.base.start + dx, zoom, snaps);
      trimLeft(timeline, clip.id, target);
    } else if (d.mode === "trim-r") {
      const target = snapTime(d.base.start + d.base.duration + dx, zoom, snaps);
      trimRight(timeline, clip.id, target);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  // Show waveform only for audio and video clips when peaks are available
  const showWaveform =
    (clip.kind === "audio" || clip.kind === "video") &&
    waveform &&
    waveform.length > 0;

  return (
    <div
      className={`absolute top-1 bottom-1 rounded-md select-none overflow-hidden transition-shadow ${
        selected ? "ring-2 ring-[var(--accent)] z-10" : "ring-1 ring-black/40"
      }`}
      style={{
        left: clip.start * zoom,
        width: Math.max(20, clip.duration * zoom),
        background: color,
      }}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Waveform canvas rendered behind the label */}
      {showWaveform && <WaveformCanvas peaks={waveform!} />}

      <div className="relative px-2 py-1 text-[11px] font-medium truncate pointer-events-none z-10">
        {label}
      </div>
      <div
        className="absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize hover:bg-white/40 z-20"
        onPointerDown={(e) => onPointerDown(e, "trim-l")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <div
        className="absolute top-0 bottom-0 right-0 w-1.5 cursor-ew-resize hover:bg-white/40 z-20"
        onPointerDown={(e) => onPointerDown(e, "trim-r")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </div>
  );
}
