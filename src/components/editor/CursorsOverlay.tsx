"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor } from "@/lib/state/editorStore";
import { getLocalUser, type User } from "@/lib/collab/presence";

interface RemoteState {
  user: User;
  x: number;
  y: number;
  playhead?: number;
}

/**
 * Renders multi-cursor overlays from Yjs awareness. Writes local cursor + playhead.
 */
export default function CursorsOverlay() {
  const timeline = useEditor((s) => s.timeline);
  const playhead = useEditor((s) => s.playhead);
  const containerRef = useRef<HTMLDivElement>(null);
  const [remotes, setRemotes] = useState<RemoteState[]>([]);

  // Publish local cursor on pointer move.
  useEffect(() => {
    const aw = timeline?.awareness;
    if (!aw) return;
    const me = getLocalUser();
    aw.setLocalStateField("user", me);

    const onMove = (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      aw.setLocalStateField("cursor", {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      });
    };
    const el = containerRef.current;
    el?.addEventListener("pointermove", onMove);
    return () => {
      el?.removeEventListener("pointermove", onMove);
    };
  }, [timeline]);

  // Publish playhead changes.
  useEffect(() => {
    timeline?.awareness?.setLocalStateField("playhead", playhead);
  }, [timeline, playhead]);

  // Subscribe to remote awareness.
  useEffect(() => {
    const aw = timeline?.awareness;
    if (!aw) return;
    const update = () => {
      const list: RemoteState[] = [];
      aw.getStates().forEach((state, clientId) => {
        if (clientId === aw.clientID) return;
        const user = state.user as User | undefined;
        const cursor = state.cursor as { x: number; y: number } | undefined;
        const ph = state.playhead as number | undefined;
        if (user && cursor) {
          list.push({ user, x: cursor.x, y: cursor.y, playhead: ph });
        }
      });
      setRemotes(list);
    };
    aw.on("change", update);
    update();
    return () => {
      aw.off("change", update);
    };
  }, [timeline]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-40">
      {remotes.map((r) => (
        <div
          key={r.user.id}
          className="absolute transition-transform duration-100 ease-out"
          style={{
            transform: `translate(${r.x * 100}%, ${r.y * 100}%)`,
            left: 0,
            top: 0,
          }}
        >
          <svg width="16" height="18" viewBox="0 0 16 18" fill="none">
            <path
              d="M1 1L1 14L5 10.5L8 17L10 16L7 10L13 10L1 1Z"
              fill={r.user.color}
              stroke="white"
              strokeWidth="1"
            />
          </svg>
          <div
            className="mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white whitespace-nowrap"
            style={{ backgroundColor: r.user.color }}
          >
            {r.user.name}
          </div>
        </div>
      ))}
    </div>
  );
}
