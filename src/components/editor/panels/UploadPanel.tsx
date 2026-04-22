"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Plus, AlertCircle } from "lucide-react";
import { useEditor } from "@/lib/state/editorStore";
import { probeMedia, generateWaveformPeaks } from "@/lib/media/proxy";
import { saveMediaFile, loadMediaFile } from "@/lib/media/mediaStore";
import type { AssetData, ClipData, ClipKind } from "@/lib/timeline/YjsTimeline";

function nanoid() {
  return Math.random().toString(36).slice(2, 10);
}

/** Blob URLs are session-scoped — they die on page reload. Detect them. */
function isStaleBlobUrl(url: string | undefined): boolean {
  return !!url && url.startsWith("blob:");
}

export default function UploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const timeline = useEditor((s) => s.timeline);
  const setWaveform = useEditor((s) => s.setWaveform);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  useEditor((s) => s.tick); // re-render on asset/clip change

  const assets = timeline ? Array.from(timeline.assets.values()) : [];

  // ── Restore or purge stale blob-URL assets AFTER IndexedDB has loaded ─────
  // Blob URLs are session-scoped and die on page reload. The Yjs IndexedDB
  // provider loads asynchronously — we must wait for timeline.synced before
  // scanning so we see the real persisted state (not an empty map).
  //
  // For each stale asset we first try to restore it from our separate
  // mediaStore (which holds the raw file bytes). If found we recreate a fresh
  // blob URL in-place. Only if the file is missing do we remove the asset.
  useEffect(() => {
    if (!timeline) return;
    let cancelled = false;

    timeline.synced.then(async () => {
      if (cancelled) return;

      const staleAssets = Array.from(timeline.assets.values()).filter((a) =>
        isStaleBlobUrl(a.url)
      );
      if (staleAssets.length === 0) return;

      for (const asset of staleAssets) {
        if (cancelled) break;
        const stored = await loadMediaFile(asset.id);
        if (stored) {
          // Recreate fresh blob URL from persisted bytes
          const freshUrl = URL.createObjectURL(stored.blob);
          timeline.assets.set(asset.id, { ...asset, url: freshUrl });
        } else {
          // File bytes not in store — remove clips + asset
          Array.from(timeline.clips.values())
            .filter((c) => c.assetId === asset.id)
            .forEach((c) => timeline.removeClip(c.id));
          timeline.assets.delete(asset.id);
        }
      }
    });

    return () => { cancelled = true; };
  }, [timeline]);

  // ── Core upload handler ───────────────────────────────────────────────────
  async function onFiles(files: FileList | File[] | null) {
    if (!files || !timeline) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const kind: ClipKind = file.type.startsWith("audio/")
          ? "audio"
          : file.type.startsWith("image/")
          ? "image"
          : "video";

        const info =
          kind === "image"
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

        // Persist raw bytes so the blob URL can be recreated on next reload
        await saveMediaFile(asset.id, file, file.name);

        timeline.addAsset(asset);
        addAssetToTimeline(asset);

        // Generate waveform peaks async (don't block UI)
        if (kind === "audio" || kind === "video") {
          generateWaveformPeaks(file, 400).then((peaks) => {
            if (peaks.length > 0) setWaveform(asset.id, peaks);
          });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  /** Place an asset at the end of its track */
  function addAssetToTimeline(asset: AssetData) {
    if (!timeline) return;
    const trackId = asset.kind === "audio" ? "t-audio" : "t-video";
    const existing = Array.from(timeline.clips.values()).filter(
      (c) => c.trackId === trackId
    );
    const start = existing.reduce((acc, c) => Math.max(acc, c.start + c.duration), 0);
    const clip: ClipData = {
      id: nanoid(),
      kind: asset.kind,
      trackId,
      start,
      duration: asset.duration,
      sourceIn: 0,
      sourceOut: asset.duration,
      assetId: asset.id,
    };
    timeline.addClip(clip);
  }

  // ── Drag-and-drop handlers ────────────────────────────────────────────────
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      onFiles(Array.from(e.dataTransfer.files));
    }
  }

  // Only show the stale warning for assets that truly can't be restored
  // (i.e. we don't have their bytes in mediaStore). We optimistically hide
  // the warning — restoration happens async after synced resolves.
  const staleCount = assets.filter((a) => isStaleBlobUrl(a.url)).length;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="font-semibold text-[var(--fg)]">Upload</p>

      {/* ── Drop zone ── */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !busy && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors
          ${dragging
            ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg)]"
            : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:border-[var(--accent)] hover:text-[var(--fg)]"
          }
          ${busy ? "opacity-60 cursor-not-allowed" : ""}
        `}
      >
        <Upload size={20} />
        <span className="font-medium text-center">
          {busy ? "Processing…" : dragging ? "Drop to add" : "Drop files or click"}
        </span>
        <span className="text-xs">MP4 · MOV · MP3 · WAV · PNG · JPG</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="video/*,audio/*,image/*"
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />

      {/* ── Stale session warning (only while restoring) ── */}
      {staleCount > 0 && (
        <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>Restoring {staleCount} file{staleCount > 1 ? "s" : ""} from previous session…</span>
        </div>
      )}

      {/* ── Media library ── */}
      {assets.filter((a) => !isStaleBlobUrl(a.url)).length > 0 && (
        <>
          <p className="text-xs uppercase tracking-wider text-[var(--fg-muted)] mt-2">
            Media · {assets.filter((a) => !isStaleBlobUrl(a.url)).length}
          </p>
          <ul className="flex flex-col gap-1">
            {assets
              .filter((a) => !isStaleBlobUrl(a.url))
              .map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--bg-panel)] group">
                  <span className="truncate text-xs flex-1">{a.name}</span>
                  <span className="text-[10px] text-[var(--fg-muted)] font-mono">
                    {a.duration.toFixed(1)}s
                  </span>
                  {/* Add to timeline button */}
                  <button
                    onClick={() => addAssetToTimeline(a)}
                    title="Add to timeline"
                    className="opacity-0 group-hover:opacity-100 h-5 w-5 rounded flex items-center justify-center bg-[var(--accent)]/20 hover:bg-[var(--accent)]/40 text-[var(--accent)] transition-all"
                  >
                    <Plus size={11} />
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
