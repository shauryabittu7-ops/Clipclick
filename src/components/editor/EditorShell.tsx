"use client";

import { useEffect } from "react";
import { useEditor } from "@/lib/state/editorStore";
import TopBar from "./TopBar";
import LeftNav from "./LeftNav";
import Canvas from "./Canvas";
import Transport from "./Transport";
import Timeline from "./Timeline";
import RightPanel from "./RightPanel";
import ExportDialog from "./ExportDialog";
import CommandPalette from "./CommandPalette";

export default function EditorShell() {
  const init = useEditor((s) => s.init);
  const timeline = useEditor((s) => s.timeline);

  useEffect(() => {
    init("default");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!timeline) {
    return (
      <div className="h-full w-full grid place-items-center text-[var(--fg-muted)]">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="h-full w-full grid grid-rows-[48px_1fr] bg-[var(--bg)] text-[var(--fg)]">
      <TopBar />
      <div className="min-h-0 grid grid-cols-[auto_1fr_auto] overflow-hidden">
        <LeftNav />
        <div className="min-w-0 min-h-0 grid grid-rows-[1fr_48px_220px] overflow-hidden">
          <Canvas />
          <Transport />
          <Timeline />
        </div>
        <RightPanel />
      </div>
      <ExportDialog />
      <CommandPalette />
    </div>
  );
}
