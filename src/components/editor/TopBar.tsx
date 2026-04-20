"use client";

import { useState } from "react";
import { Undo2, Redo2, Download, Sparkles, Share2 } from "lucide-react";
import { useEditor } from "@/lib/state/editorStore";
import PresenceStack from "./PresenceStack";
import ShareDialog from "./ShareDialog";

export default function TopBar() {
  const timeline = useEditor((s) => s.timeline);
  const openExport = useEditor((s) => s.openExport);
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <header className="h-12 border-b border-[var(--border)] flex items-center justify-between px-4 bg-[var(--bg-elevated)]">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-md bg-[var(--accent)] grid place-items-center font-black text-sm">
          R
        </div>
        <span className="text-sm font-semibold">Untitled project</span>
      </div>
      <div className="flex items-center gap-1 text-[var(--fg-muted)]">
        <IconBtn onClick={() => timeline?.undoManager.undo()} title="Undo ⌘Z">
          <Undo2 size={16} />
        </IconBtn>
        <IconBtn onClick={() => timeline?.undoManager.redo()} title="Redo ⌘⇧Z">
          <Redo2 size={16} />
        </IconBtn>
      </div>
      <div className="flex items-center gap-3">
        <PresenceStack />
        <button className="h-8 px-3 rounded-md text-sm border border-[var(--border-strong)] hover:bg-[var(--bg-panel)] flex items-center gap-2">
          <Sparkles size={14} /> AI
        </button>
        <button
          onClick={() => setShareOpen(true)}
          className="h-8 px-3 rounded-md text-sm border border-[var(--border-strong)] hover:bg-[var(--bg-panel)] flex items-center gap-2"
        >
          <Share2 size={14} /> Share
        </button>
        <button
          onClick={openExport}
          className="btn-accent h-8 px-4 rounded-md text-sm font-semibold flex items-center gap-2"
        >
          <Download size={14} /> Export
        </button>
      </div>
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} />
    </header>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="h-8 w-8 grid place-items-center rounded hover:bg-[var(--bg-panel)] hover:text-[var(--fg)]"
    >
      {children}
    </button>
  );
}
