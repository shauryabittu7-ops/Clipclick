"use client";

import { useRef } from "react";
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
}

type DragMode = "move" | "trim-l" | "trim-r" | null;

export default function TimelineClip({
  clip,
  zoom,
  label,
  color,
  selected,
  onSelect,
  timeline,
  playhead,
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
      <div className="px-2 py-1 text-[11px] font-medium truncate pointer-events-none">
        {label}
      </div>
      <div
        className="absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize hover:bg-white/40"
        onPointerDown={(e) => onPointerDown(e, "trim-l")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <div
        className="absolute top-0 bottom-0 right-0 w-1.5 cursor-ew-resize hover:bg-white/40"
        onPointerDown={(e) => onPointerDown(e, "trim-r")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </div>
  );
}
