"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import {
  Play, Pause, Scissors, Download, Upload, Sparkles, Wand2,
  Undo2, Redo2, Captions, Eraser, Music,
} from "lucide-react";
import { useEditor } from "@/lib/state/editorStore";
import { splitAtPlayhead } from "@/lib/timeline/ops";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const timeline = useEditor((s) => s.timeline);
  const playing = useEditor((s) => s.playing);
  const setPlaying = useEditor((s) => s.setPlaying);
  const openExport = useEditor((s) => s.openExport);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  const trigger = (id: string) => {
    const el = document.querySelector<HTMLButtonElement>(`[data-nav-tab="${id}"]`);
    el?.click();
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-start pt-[12vh] bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div onClick={(e) => e.stopPropagation()} className="w-[520px] max-w-[92vw] panel rounded-xl overflow-hidden shadow-2xl">
        <Command className="text-sm">
          <Command.Input
            autoFocus
            placeholder="Type a command or search…"
            className="w-full h-12 px-4 bg-transparent outline-none border-b border-[var(--border)] placeholder:text-[var(--fg-muted)]"
          />
          <Command.List className="max-h-[50vh] overflow-y-auto p-2">
            <Command.Empty className="text-[var(--fg-muted)] text-xs p-4">
              No commands found.
            </Command.Empty>

            <Group title="Playback">
              <Item icon={playing ? Pause : Play} label={playing ? "Pause" : "Play"} hint="Space" onSelect={() => run(() => setPlaying(!playing))} />
              <Item icon={Scissors} label="Split at playhead" hint="S" onSelect={() => run(() => timeline && splitAtPlayhead(timeline, useEditor.getState().playhead))} />
            </Group>

            <Group title="Navigate">
              <Item icon={Upload} label="Upload media" onSelect={() => run(() => trigger("upload"))} />
              <Item icon={Captions} label="Captions panel" onSelect={() => run(() => trigger("captions"))} />
              <Item icon={Music} label="Audio enhance" onSelect={() => run(() => trigger("audio"))} />
              <Item icon={Sparkles} label="AI tools" onSelect={() => run(() => trigger("ai"))} />
            </Group>

            <Group title="AI">
              <Item icon={Eraser} label="Remove silences" onSelect={() => run(() => trigger("ai"))} />
              <Item icon={Wand2} label="Remove filler words" onSelect={() => run(() => trigger("ai"))} />
            </Group>

            <Group title="Project">
              <Item icon={Undo2} label="Undo" hint="⌘Z" onSelect={() => run(() => timeline?.undoManager.undo())} />
              <Item icon={Redo2} label="Redo" hint="⌘⇧Z" onSelect={() => run(() => timeline?.undoManager.redo())} />
              <Item icon={Download} label="Export video" onSelect={() => run(openExport)} />
            </Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Command.Group heading={title} className="mb-1">
      <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">{title}</div>
      {children}
    </Command.Group>
  );
}

function Item({
  icon: Icon, label, hint, onSelect,
}: {
  icon: typeof Play; label: string; hint?: string; onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 h-9 rounded-md cursor-pointer aria-selected:bg-[var(--bg-panel)] hover:bg-[var(--bg-panel)]"
    >
      <Icon size={14} className="text-[var(--fg-muted)]" />
      <span className="flex-1">{label}</span>
      {hint && (
        <kbd className="text-[10px] font-mono text-[var(--fg-muted)] border border-[var(--border-strong)] rounded px-1.5 h-5 grid place-items-center">
          {hint}
        </kbd>
      )}
    </Command.Item>
  );
}
