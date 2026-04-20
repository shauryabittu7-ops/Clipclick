"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useEditor } from "@/lib/state/editorStore";
import { probeMedia } from "@/lib/media/proxy";
import type { AssetData, ClipData, ClipKind } from "@/lib/timeline/YjsTimeline";

function nanoid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function UploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const timeline = useEditor((s) => s.timeline);
  const [busy, setBusy] = useState(false);
  useEditor((s) => s.tick); // re-render on asset change

  const assets = timeline ? Array.from(timeline.assets.values()) : [];

  async function onFiles(files: FileList | null) {
    if (!files || !timeline) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const kind: ClipKind = file.type.startsWith("audio/")
          ? "audio"
          : file.type.startsWith("image/")
          ? "image"
          : "video";
        const info = kind === "image"
          ? { url: URL.createObjectURL(file), duration: 5, width: 1920, height: 1080 }
          : await probeMedia(file);

        const asset: AssetData = {
          id: nanoid(),
          kind,
          name: file.name,
          url: info.url,
          duration: info.duration,
          width: info.width,
          height: info.height,
        };
        timeline.addAsset(asset);

        // Auto-drop at end of relevant track
        const trackId = kind === "audio" ? "t-audio" : "t-video";
        const existing = Array.from(timeline.clips.values()).filter((c) => c.trackId === trackId);
        const start = existing.reduce((acc, c) => Math.max(acc, c.start + c.duration), 0);
        const clip: ClipData = {
          id: nanoid(),
          kind,
          trackId,
          start,
          duration: info.duration,
          sourceIn: 0,
          sourceOut: info.duration,
          assetId: asset.id,
        };
        timeline.addClip(clip);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="font-semibold text-[var(--fg)]">Upload</p>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="border-2 border-dashed border-[var(--border-strong)] rounded-xl p-6 flex flex-col items-center gap-2 text-[var(--fg-muted)] hover:border-[var(--accent)] hover:text-[var(--fg)] transition-colors disabled:opacity-60"
      >
        <Upload size={20} />
        <span className="font-medium">{busy ? "Processing…" : "Drop files or click"}</span>
        <span className="text-xs">MP4 · MOV · MP3 · WAV · PNG · JPG</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="video/*,audio/*,image/*"
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />
      {assets.length > 0 && (
        <>
          <p className="text-xs uppercase tracking-wider text-[var(--fg-muted)] mt-2">
            Media · {assets.length}
          </p>
          <ul className="flex flex-col gap-1">
            {assets.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--bg-panel)]"
              >
                <span className="truncate text-xs">{a.name}</span>
                <span className="text-[10px] text-[var(--fg-muted)] font-mono">
                  {a.duration.toFixed(1)}s
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
