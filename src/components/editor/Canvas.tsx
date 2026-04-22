"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor } from "@/lib/state/editorStore";
import { Video } from "lucide-react";

export default function Canvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const timeline = useEditor((s) => s.timeline);
  const playhead = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);
  const tick = useEditor((s) => s.tick);

  // The active video clip at the current playhead
  const [activeVideo, setActiveVideo] = useState<{
    url: string;
    sourceIn: number;
    clipStart: number;
  } | null>(null);

  // Resolve which clip is active right now
  useEffect(() => {
    if (!timeline) { setActiveVideo(null); return; }
    const clips = Array.from(timeline.clips.values());
    const active = clips.find(
      (c) =>
        c.kind === "video" &&
        playhead >= c.start &&
        playhead < c.start + c.duration
    );
    if (!active) { setActiveVideo(null); return; }
    const asset = active.assetId ? timeline.assets.get(active.assetId) : null;
    if (!asset?.url) { setActiveVideo(null); return; }
    setActiveVideo({ url: asset.url, sourceIn: active.sourceIn, clipStart: active.start });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, playhead, tick]);

  // Sync the <video> element to the playhead + play/pause state
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeVideo) return;

    const target = activeVideo.sourceIn + (playhead - activeVideo.clipStart);
    if (Math.abs(v.currentTime - target) > 0.1) {
      v.currentTime = target;
    }
    if (playing) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [playhead, playing, activeVideo]);

  const hasClips = timeline
    ? Array.from(timeline.clips.values()).some((c) => c.kind === "video")
    : false;

  return (
    <div
      ref={wrapRef}
      className="min-h-0 bg-[#050505] grid place-items-center relative overflow-hidden"
    >
      {activeVideo ? (
        /* ── Live video preview ── */
        <video
          ref={videoRef}
          key={activeVideo.url}
          src={activeVideo.url}
          className="max-w-full max-h-full object-contain rounded-sm"
          style={{ maxHeight: "calc(100% - 16px)", maxWidth: "calc(100% - 16px)" }}
          muted
          playsInline
          preload="auto"
        />
      ) : hasClips ? (
        /* ── Has clips but playhead is in a gap ── */
        <div className="flex flex-col items-center gap-2 text-[var(--fg-muted)] select-none">
          <Video size={32} strokeWidth={1} />
          <p className="text-xs">Move the playhead over a clip to preview</p>
        </div>
      ) : (
        /* ── Empty state ── */
        <div className="flex flex-col items-center gap-3 text-[var(--fg-muted)] select-none">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-[var(--border-strong)] flex items-center justify-center">
            <Video size={24} strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-[var(--fg)]">Drop a video to start</p>
          <p className="text-xs opacity-60">Drag an MP4 onto the Upload panel →</p>
        </div>
      )}
    </div>
  );
}
