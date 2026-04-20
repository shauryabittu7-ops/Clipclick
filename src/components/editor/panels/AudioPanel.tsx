"use client";

import { useMemo, useState } from "react";
import { Wand2, Loader2, CheckCircle2 } from "lucide-react";
import { useEditor } from "@/lib/state/editorStore";
import { enhanceAudio } from "@/lib/audio/enhance";
import { LUFS_TARGETS, type LUFSTarget } from "@/lib/audio/lufs";

type TargetKey = LUFSTarget;
const TARGETS: { id: TargetKey; label: string; lufs: number }[] = [
  { id: "reels",     label: "Reels / TikTok", lufs: LUFS_TARGETS.reels     },
  { id: "youtube",   label: "YouTube",        lufs: LUFS_TARGETS.youtube   },
  { id: "podcast",   label: "Podcast",        lufs: LUFS_TARGETS.podcast   },
  { id: "broadcast", label: "Broadcast",      lufs: LUFS_TARGETS.broadcast },
];

export default function AudioPanel() {
  const timeline = useEditor((s) => s.timeline);
  const tick = useEditor((s) => s.tick);
  void tick;

  const [target, setTarget] = useState<TargetKey>("reels");
  const [denoise, setDenoise] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<
    { name: string; before: number; after: number; gainDb: number } | null
  >(null);

  const enhanceable = useMemo(() => {
    if (!timeline) return [];
    return Array.from(timeline.assets.values()).filter(
      (a) => a.kind === "audio" || a.kind === "video"
    );
  }, [timeline, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (assetId: string) => {
    if (!timeline) return;
    const asset = timeline.assets.get(assetId);
    if (!asset?.url) return;
    setError(null);
    setBusy(`Loading ${asset.name}`);
    setReport(null);
    try {
      const blob = await fetch(asset.url).then((r) => r.blob());
      const result = await enhanceAudio(blob, {
        denoise,
        target,
        onProgress: (stage, pct) =>
          setBusy(pct !== undefined ? `${stage} ${Math.round(pct * 100)}%` : stage),
      });
      timeline.addAsset({ ...asset, url: result.url });
      setReport({
        name: asset.name,
        before: result.originalLUFS,
        after: result.finalLUFS,
        gainDb: result.gainAppliedDb,
      });
      setBusy(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="font-semibold text-[var(--fg)]">Audio enhance</p>

      <div className="grid grid-cols-2 gap-2">
        {TARGETS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTarget(t.id)}
            className={`h-12 rounded-lg border text-left px-3 text-[11px] transition-colors ${
              target === t.id
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg)]"
                : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
            }`}
          >
            <div className="text-xs font-semibold text-[var(--fg)]">{t.label}</div>
            <div className="font-mono opacity-70">{t.lufs} LUFS</div>
          </button>
        ))}
      </div>

      <label className="flex items-center justify-between h-9 px-3 rounded-md bg-[var(--bg-panel)]">
        <span className="text-xs">Noise suppression</span>
        <input
          type="checkbox"
          checked={denoise}
          onChange={(e) => setDenoise(e.target.checked)}
          className="accent-[var(--accent)]"
        />
      </label>

      {enhanceable.length === 0 && (
        <p className="text-xs text-[var(--fg-muted)]">Upload a video or audio clip first.</p>
      )}
      <ul className="flex flex-col gap-1">
        {enhanceable.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--bg-panel)]"
          >
            <span className="truncate text-xs">{a.name}</span>
            <button
              onClick={() => run(a.id)}
              disabled={!!busy}
              className="btn-accent h-7 px-2 rounded-md text-[11px] font-semibold flex items-center gap-1 disabled:opacity-60"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
              Enhance
            </button>
          </li>
        ))}
      </ul>

      {busy && (
        <div className="text-xs text-[var(--fg-muted)] font-mono">{busy}</div>
      )}
      {error && (
        <div className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 rounded-md p-2">
          {error}
        </div>
      )}
      {report && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-[11px]">
          <div className="flex items-center gap-2 text-emerald-300 font-semibold mb-1">
            <CheckCircle2 size={12} /> {report.name}
          </div>
          <div className="grid grid-cols-3 gap-2 text-[var(--fg-muted)]">
            <Stat label="Before" value={`${report.before.toFixed(1)} LU`} />
            <Stat label="After" value={`${report.after.toFixed(1)} LU`} />
            <Stat label="Gain" value={`${report.gainDb.toFixed(1)} dB`} />
          </div>
        </div>
      )}

      <p className="text-[11px] text-[var(--fg-muted)]">
        HP 80 Hz · presence +3 dB · air +2 dB · 4:1 comp · brickwall limiter · LUFS target
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="uppercase tracking-wider text-[9px]">{label}</div>
      <div className="font-mono text-[var(--fg)]">{value}</div>
    </div>
  );
}
