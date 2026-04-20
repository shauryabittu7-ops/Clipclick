"use client";

import { useEffect } from "react";
import { useEditor } from "@/lib/state/editorStore";
import Canvas from "@/components/editor/Canvas";
import Transport from "@/components/editor/Transport";
import Timeline from "@/components/editor/Timeline";
import PresenceStack from "@/components/editor/PresenceStack";

/**
 * Read-only share viewer. Joins the same Yjs room as the owner so edits stream
 * in live, but local writes are suppressed (see YjsTimeline readOnly flag).
 */
export default function ShareViewer({ projectId }: { projectId: string }) {
  const init = useEditor((s) => s.init);
  const timeline = useEditor((s) => s.timeline);

  useEffect(() => {
    init(projectId, { readOnly: true });
  }, [init, projectId]);

  if (!timeline) {
    return (
      <div className="h-full w-full grid place-items-center text-[var(--fg-muted)]">
        Loading shared reel…
      </div>
    );
  }

  return (
    <div className="h-full w-full grid grid-rows-[48px_1fr] bg-[var(--bg)] text-[var(--fg)]">
      <header className="h-12 border-b border-[var(--border)] flex items-center justify-between px-4 bg-[var(--bg-elevated)]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-[var(--accent)] grid place-items-center font-black text-sm">
            R
          </div>
          <span className="text-sm font-semibold">Shared reel</span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)] border border-[var(--border-strong)] px-2 py-0.5 rounded">
            Read-only
          </span>
        </div>
        <PresenceStack />
      </header>
      <div className="min-h-0 grid grid-rows-[1fr_48px_260px]">
        <Canvas />
        <Transport />
        <Timeline />
      </div>
    </div>
  );
}
