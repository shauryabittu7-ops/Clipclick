"use client";

import { useMemo, useRef } from "react";
import { useEditor } from "@/lib/state/editorStore";
import TimelineClip from "./TimelineClip";
import ThumbScrub from "./ThumbScrub";

export default function Timeline() {
  const timeline = useEditor((s) => s.timeline);
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const playhead = useEditor((s) => s.playhead);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const selectedId = useEditor((s) => s.selectedClipId);
  const select = useEditor((s) => s.select);
  const tick = useEditor((s) => s.tick);
  const rulerRef = useRef<HTMLDivElement>(null);

  const { tracks, clips, totalDuration } = useMemo(() => {
    if (!timeline) return { tracks: [], clips: [], totalDuration: 0 };
    const tr = Array.from(timeline.tracks.values());
    const cl = Array.from(timeline.clips.values());
    const td = cl.reduce((acc, c) => Math.max(acc, c.start + c.duration), 0);
    return { tracks: tr, clips: cl, totalDuration: Math.max(td, 30) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, tick]);

  const trackColor = (kind: string) =>
    kind === "video" ? "#2a3b5f" : kind === "audio" ? "#2a5f4a" : "#5f2a4a";

  const onRulerClick = (e: React.MouseEvent) => {
    const rect = rulerRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left + (rulerRef.current?.scrollLeft ?? 0);
    setPlayhead(Math.max(0, x / zoom));
  };

  const contentWidth = totalDuration * zoom;

  return (
    <div className="min-h-0 bg-[var(--bg-elevated)] border-t border-[var(--border)] grid grid-rows-[28px_1fr]">
      <div className="flex items-center justify-between px-4 text-xs text-[var(--fg-muted)]">
        <span>Timeline</span>
        <div className="flex items-center gap-2">
          <span className="font-mono">{zoom}px/s</span>
          <input
            type="range"
            min={20}
            max={300}
            value={zoom}
            onChange={(e) => setZoom(parseInt(e.target.value))}
            className="w-24 accent-[var(--accent)]"
          />
        </div>
      </div>
      <div className="min-h-0 flex">
        <div className="w-28 shrink-0 border-r border-[var(--border)] bg-[var(--bg-panel)]">
          <div className="h-6 border-b border-[var(--border)]" />
          {tracks.map((t) => (
            <div
              key={t.id}
              className="flex items-center px-3 text-[11px] font-medium text-[var(--fg-muted)] border-b border-[var(--border)]"
              style={{ height: t.height }}
            >
              {t.label}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden relative" ref={rulerRef}>
          <div style={{ width: contentWidth, position: "relative" }}>
            <Ruler duration={totalDuration} zoom={zoom} onClick={onRulerClick} />
            {tracks.map((t) => (
              <div
                key={t.id}
                className="relative border-b border-[var(--border)]"
                style={{ height: t.height }}
              >
                {timeline &&
                  clips
                    .filter((c) => c.trackId === t.id)
                    .map((c) => (
                      <TimelineClip
                        key={c.id}
                        clip={c}
                        zoom={zoom}
                        label={
                          c.text ?? timeline.assets.get(c.assetId ?? "")?.name ?? c.kind
                        }
                        color={trackColor(c.kind)}
                        selected={selectedId === c.id}
                        onSelect={() => select(c.id)}
                        timeline={timeline}
                        playhead={playhead}
                      />
                    ))}
              </div>
            ))}
            <div
              className="absolute top-0 bottom-0 w-px bg-[var(--accent)] pointer-events-none"
              style={{ left: playhead * zoom }}
            >
              <div className="w-3 h-3 -translate-x-[5px] -translate-y-[2px] bg-[var(--accent)] rotate-45" />
            </div>
            {timeline && (
              <ThumbScrub
                timeline={timeline}
                containerRef={rulerRef}
                zoom={zoom}
                duration={totalDuration}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Ruler({
  duration,
  zoom,
  onClick,
}: {
  duration: number;
  zoom: number;
  onClick: (e: React.MouseEvent) => void;
}) {
  const step = zoom >= 120 ? 1 : zoom >= 60 ? 2 : zoom >= 30 ? 5 : 10;
  const marks = [];
  for (let t = 0; t <= duration; t += step) marks.push(t);
  return (
    <div
      onClick={onClick}
      data-ruler="1"
      className="sticky top-0 h-6 bg-[var(--bg-panel)] border-b border-[var(--border)] cursor-pointer relative z-10"
    >
      {marks.map((t) => (
        <div
          key={t}
          className="absolute top-0 bottom-0 border-l border-[var(--border-strong)] text-[10px] font-mono text-[var(--fg-muted)] pl-1"
          style={{ left: t * zoom }}
        >
          {t}s
        </div>
      ))}
    </div>
  );
}
