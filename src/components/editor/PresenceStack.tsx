"use client";

import { useEffect, useState } from "react";
import { useEditor } from "@/lib/state/editorStore";
import type { User } from "@/lib/collab/presence";

export default function PresenceStack() {
  const timeline = useEditor((s) => s.timeline);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const aw = timeline?.awareness;
    if (!aw) return;
    const update = () => {
      const all: User[] = [];
      aw.getStates().forEach((state) => {
        const u = state.user as User | undefined;
        if (u) all.push(u);
      });
      // dedupe by id
      const seen = new Set<string>();
      setUsers(all.filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true))));
    };
    aw.on("change", update);
    update();
    return () => aw.off("change", update);
  }, [timeline]);

  if (users.length === 0) return null;
  const shown = users.slice(0, 4);
  const extra = users.length - shown.length;

  return (
    <div className="flex items-center -space-x-2">
      {shown.map((u) => (
        <div
          key={u.id}
          title={u.name}
          className="h-7 w-7 rounded-full grid place-items-center text-[11px] font-bold text-white border-2 border-[var(--bg-elevated)]"
          style={{ backgroundColor: u.color }}
        >
          {u.name[0]}
        </div>
      ))}
      {extra > 0 && (
        <div className="h-7 w-7 rounded-full grid place-items-center text-[10px] font-bold bg-[var(--bg-panel)] text-[var(--fg-muted)] border-2 border-[var(--bg-elevated)]">
          +{extra}
        </div>
      )}
    </div>
  );
}
