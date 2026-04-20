"use client";

import { useRef, useState } from "react";
import { X, Download, Loader2 } from "lucide-react";
import { useEditor } from "@/lib/state/editorStore";
import { exportTimeline } from "@/lib/export/webcodecs-exporter";

const PRESETS = [
  { id: "1080p30", label: "1080p · 30fps", width: 1920, height: 1080, fps: 30, bitrate: 8_000_000 },
  { id: "1080p60", label: "1080p · 60fps", width: 1920, height: 1080, fps: 60, bitrate: 12_000_000 },
  { id: "720p30", label: "720p · 30fps", width: 1280, height: 720, fps: 30, bitrate: 5_000_000 },
  { id: "9x16", label: "1080×1920 Reel", width: 1080, height: 1920, fps: 30, bitrate: 8_000_000 },
];

export default function ExportDialog() {
  const open = useEditor((s) => s.exportOpen);
  const close = useEditor((s) => s.closeExport);
  const timeline = useEditor((s) => s.timeline);
  const [presetId, setPresetId] = useState("1080p30");
  const [motionBlur, setMotionBlur] = useState<number>(1);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  if (!open) return null;

  const preset = PRESETS.find((p) => p.id === presetId)!;
  const busy = progress !== null;

  const run = async () => {
    if (!timeline) return;
    setError(null);
    setProgress(0);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      if (!("VideoEncoder" in window)) {
        throw new Error("WebCodecs unavailable — use Chrome, Edge, or Safari 17+.");
      }
      const blob = await exportTimeline(timeline, {
        width: preset.width,
        height: preset.height,
        fps: preset.fps,
        bitrate: preset.bitrate,
        motionBlurSamples: motionBlur,
        onProgress: setProgress,
        signal: ac.signal,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reel-${Date.now()}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setProgress(null);
      close();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
      <div className="w-[440px] panel rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Export video</h2>
          <button
            onClick={() => {
              if (busy) abortRef.current?.abort();
              else close();
            }}
            className="h-8 w-8 grid place-items-center rounded hover:bg-[var(--bg-panel)] text-[var(--fg-muted)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              disabled={busy}
              onClick={() => setPresetId(p.id)}
              className={`h-14 rounded-lg border px-3 text-left text-xs font-medium transition-colors ${
                presetId === p.id
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg)]"
                  : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
              }`}
            >
              <div className="text-sm font-semibold text-[var(--fg)]">{p.label}</div>
              <div className="mt-0.5 opacity-70 font-mono">
                {p.width}×{p.height}
              </div>
            </button>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-[var(--fg-muted)] mb-1">
            <span>Motion blur</span>
            <span className="font-mono">
              {motionBlur === 1 ? "Off" : `${motionBlur}× samples`}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {[1, 2, 4, 8].map((n) => (
              <button
                key={n}
                disabled={busy}
                onClick={() => setMotionBlur(n)}
                className={`h-8 rounded border text-[11px] font-semibold transition-colors ${
                  motionBlur === n
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg)]"
                    : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
                }`}
              >
                {n === 1 ? "Off" : `${n}×`}
              </button>
            ))}
          </div>
          {motionBlur > 1 && (
            <p className="mt-1 text-[10px] text-[var(--fg-muted)]">
              Higher samples = smoother motion, {motionBlur}× slower export.
            </p>
          )}
        </div>

        {progress !== null && (
          <div className="space-y-2">
            <div className="h-1.5 w-full bg-[var(--bg-panel)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-[width]"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <div className="text-xs text-[var(--fg-muted)] font-mono">
              Rendering · {Math.round(progress * 100)}%
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 rounded-md p-2">
            {error}
          </div>
        )}

        <button
          onClick={run}
          disabled={busy || !timeline}
          className="btn-accent w-full h-10 rounded-md font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Exporting…
            </>
          ) : (
            <>
              <Download size={16} /> Start export
            </>
          )}
        </button>
        <p className="text-[11px] text-[var(--fg-muted)] text-center">
          Rendered locally with WebCodecs · nothing uploaded
        </p>
      </div>
    </div>
  );
}
