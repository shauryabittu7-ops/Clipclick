"use client";

import { useState } from "react";
import {
  Loader2,
  Scissors,
  Music as MusicIcon,
  Eraser,
  Sparkles,
  Image as ImageIcon,
} from "lucide-react";
import { useEditor } from "@/lib/state/editorStore";
import { detectSilence } from "@/lib/ai/silence";
import { applySilenceCut } from "@/lib/ai/silence-cut";
import { removeFillers } from "@/lib/ai/filler";
import { detectBeats } from "@/lib/ai/beats";
import { removeBackground } from "@/lib/ai/bg-remove";

export default function AIPanel() {
  const timeline = useEditor((s) => s.timeline);
  const tick = useEditor((s) => s.tick);
  void tick;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const mediaAssets = timeline
    ? Array.from(timeline.assets.values()).filter(
        (a) => a.kind === "video" || a.kind === "audio"
      )
    : [];
  const imageAssets = timeline
    ? Array.from(timeline.assets.values()).filter((a) => a.kind === "image")
    : [];
  const primary = mediaAssets[0];
  const hasCaptions = !!timeline && timeline.captions.length > 0;

  const decode = async (url: string): Promise<AudioBuffer> => {
    const buf = await fetch(url).then((r) => r.arrayBuffer());
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const decoded = await ctx.decodeAudioData(buf);
    ctx.close();
    return decoded;
  };

  const runSilenceCut = async () => {
    if (!timeline || !primary?.url) return;
    setError(null); setMessage(null); setBusy("Analyzing audio…");
    try {
      const audio = await decode(primary.url);
      const regions = detectSilence(audio, { thresholdDb: -40, minSilence: 0.4 });
      const { removed, totalSec } = applySilenceCut(timeline, primary.id, regions);
      setMessage(`Removed ${removed} silences · saved ${totalSec.toFixed(1)}s`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const runFillerCut = async () => {
    if (!timeline || !primary) return;
    if (!hasCaptions) {
      setError("Generate captions first — we use them to find filler words.");
      return;
    }
    setError(null); setMessage(null); setBusy("Removing fillers…");
    try {
      const segs = timeline.captions.toArray();
      const { count, seconds } = removeFillers(timeline, segs, primary.id);
      setMessage(`Cut ${count} filler words · ${seconds.toFixed(1)}s`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const runBeatSnap = async () => {
    if (!timeline || !primary?.url) return;
    setError(null); setMessage(null); setBusy("Detecting beats…");
    try {
      const audio = await decode(primary.url);
      const { bpm, beats } = detectBeats(audio);
      timeline.meta.set("beats", beats);
      timeline.meta.set("bpm", bpm);
      setMessage(`${bpm} BPM · ${beats.length} beat markers`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const runBgRemove = async (assetId: string) => {
    if (!timeline) return;
    const asset = timeline.assets.get(assetId);
    if (!asset?.url) return;
    setError(null); setMessage(null); setBusy("Loading BiRefNet…");
    try {
      const blob = await fetch(asset.url).then((r) => r.blob());
      const out = await removeBackground(blob, (stage, pct) =>
        setBusy(pct !== undefined ? `${stage} ${Math.round(pct * 100)}%` : stage)
      );
      const url = URL.createObjectURL(out);
      timeline.addAsset({ ...asset, url });
      setMessage(`Background removed: ${asset.name}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const Tool = ({
    icon: Icon, label, desc, onClick, disabled,
  }: {
    icon: typeof Scissors; label: string; desc: string; onClick: () => void; disabled?: boolean;
  }) => (
    <button
      onClick={onClick}
      disabled={!!busy || disabled}
      className="w-full text-left p-3 rounded-lg border border-[var(--border-strong)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex gap-3 items-start"
    >
      <div className="h-8 w-8 shrink-0 rounded-md bg-[var(--bg-panel)] grid place-items-center text-[var(--accent)]">
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-[11px] text-[var(--fg-muted)] leading-snug">{desc}</div>
      </div>
    </button>
  );

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="font-semibold text-[var(--fg)] mb-1 flex items-center gap-2">
        <Sparkles size={14} className="text-[var(--accent)]" /> AI tools
      </p>

      <Tool
        icon={Scissors}
        label="Remove silences"
        desc="Auto-cut quiet regions with rippled timeline. Saves 10–30% on talking-head footage."
        onClick={runSilenceCut}
        disabled={!primary}
      />
      <Tool
        icon={Eraser}
        label="Remove filler words"
        desc='Cuts "um", "uh", "like", "you know"… from captions and timeline.'
        onClick={runFillerCut}
        disabled={!primary || !hasCaptions}
      />
      <Tool
        icon={MusicIcon}
        label="Detect beat & BPM"
        desc="Pulls markers you can snap cuts to. Viral-edit feel, one click."
        onClick={runBeatSnap}
        disabled={!primary}
      />

      {imageAssets.length > 0 && (
        <>
          <div className="mt-2 text-[11px] uppercase tracking-wider text-[var(--fg-muted)]">
            Background removal
          </div>
          {imageAssets.map((a) => (
            <Tool
              key={a.id}
              icon={ImageIcon}
              label={`Remove bg · ${a.name}`}
              desc="BiRefNet on WebGPU. First run downloads ~170MB."
              onClick={() => runBgRemove(a.id)}
            />
          ))}
        </>
      )}

      {busy && (
        <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)] mt-2">
          <Loader2 size={12} className="animate-spin" />
          {busy}
        </div>
      )}
      {message && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 text-emerald-300 text-[11px] p-2 mt-2">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 text-red-300 text-[11px] p-2 mt-2">
          {error}
        </div>
      )}

      {!primary && (
        <p className="text-[11px] text-[var(--fg-muted)] mt-2">
          Upload a video or audio clip to unlock these tools.
        </p>
      )}
    </div>
  );
}
