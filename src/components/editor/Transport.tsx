"use client";

import { useEffect, useRef } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { useEditor } from "@/lib/state/editorStore";
import { formatTime } from "@/lib/utils";
import { rippleDelete, splitAtPlayhead } from "@/lib/timeline/ops";

export default function Transport() {
  const playing = useEditor((s) => s.playing);
  const setPlaying = useEditor((s) => s.setPlaying);
  const playhead = useEditor((s) => s.playhead);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const timeline = useEditor((s) => s.timeline);
  const tick = useEditor((s) => s.tick);

  const totalDuration = timeline
    ? Array.from(timeline.clips.values()).reduce(
        (acc, c) => Math.max(acc, c.start + c.duration),
        0
      )
    : 0;

  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    if (!playing) return;
    lastRef.current = performance.now();
    const loop = (now: number) => {
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      const next = useEditor.getState().playhead + dt;
      if (next >= totalDuration) {
        setPlayhead(totalDuration);
        setPlaying(false);
        return;
      }
      setPlayhead(next);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, totalDuration, setPlayhead, setPlaying]);

  // Keyboard: space toggles play
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.matches("input, textarea")) return;
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.timeline?.undoManager.redo();
        else s.timeline?.undoManager.undo();
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying(!s.playing);
      } else if (e.key === "j") {
        setPlayhead(Math.max(0, s.playhead - 5));
      } else if (e.key === "l") {
        setPlayhead(s.playhead + 5);
      } else if (e.key === "k") {
        setPlaying(false);
      } else if (e.key.toLowerCase() === "s" && s.timeline) {
        e.preventDefault();
        splitAtPlayhead(s.timeline, s.playhead);
      } else if ((e.key === "Delete" || e.key === "Backspace") && s.selectedClipId && s.timeline) {
        e.preventDefault();
        if (e.shiftKey) rippleDelete(s.timeline, s.selectedClipId);
        else s.timeline.removeClip(s.selectedClipId);
        useEditor.setState({ selectedClipId: null });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPlaying, setPlayhead]);

  void tick;

  return (
    <div className="h-12 border-y border-[var(--border)] bg-[var(--bg-elevated)] flex items-center justify-between px-4">
      <span className="font-mono text-xs text-[var(--fg-muted)]">
        {formatTime(playhead)} <span className="opacity-50">/ {formatTime(totalDuration)}</span>
      </span>
      <div className="flex items-center gap-1">
        <TBtn onClick={() => setPlayhead(0)}><SkipBack size={16} /></TBtn>
        <button
          onClick={() => setPlaying(!playing)}
          className="h-9 w-9 grid place-items-center rounded-full btn-accent"
        >
          {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>
        <TBtn onClick={() => setPlayhead(totalDuration)}><SkipForward size={16} /></TBtn>
      </div>
      <span className="text-xs text-[var(--fg-muted)] font-mono">30 fps · 1920×1080</span>
    </div>
  );
}

function TBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-8 w-8 grid place-items-center rounded hover:bg-[var(--bg-panel)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
    >
      {children}
    </button>
  );
}
