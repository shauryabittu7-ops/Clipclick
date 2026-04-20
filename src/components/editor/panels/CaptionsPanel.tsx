"use client";

import { useMemo, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { useEditor } from "@/lib/state/editorStore";
import { CATEGORY_LABELS, PRESETS } from "@/lib/captions/presets";
import type { CaptionCategory } from "@/lib/captions/schema";
import { transcribe } from "@/lib/ml/whisper-browser";

export default function CaptionsPanel() {
  const timeline = useEditor((s) => s.timeline);
  const tick = useEditor((s) => s.tick);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<CaptionCategory>("contentAware");

  const hasCaptions = !!timeline && timeline.captions.length > 0;
  const activeStyleId = hasCaptions ? timeline!.captions.get(0).styleId : "ca-hormozi";
  void tick;

  const filtered = useMemo(() => PRESETS.filter((p) => p.category === category), [category]);

  const firstAudioOrVideo = () => {
    if (!timeline) return null;
    const assets = Array.from(timeline.assets.values());
    return (
      assets.find((a) => a.kind === "video") ??
      assets.find((a) => a.kind === "audio") ??
      null
    );
  };

  const generate = async () => {
    if (!timeline) return;
    const src = firstAudioOrVideo();
    if (!src?.url) {
      setError("Upload a video or audio file first.");
      return;
    }
    setError(null);
    setBusy("preparing");
    try {
      const blob = await fetch(src.url).then((r) => r.blob());
      const segs = await transcribe(blob, {
        onProgress: (status, pct) =>
          setBusy(pct ? `${status} ${Math.round(pct)}%` : status),
      });
      const withStyle = segs.map((s) => ({ ...s, styleId: activeStyleId }));
      timeline.setCaptions(withStyle);
      setBusy(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const chooseStyle = (id: string) => {
    if (!timeline) return;
    if (!hasCaptions) return;
    timeline.updateCaptionsStyle(id);
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="font-semibold text-[var(--fg)]">Captions</p>

      <button
        onClick={generate}
        disabled={!!busy}
        className="btn-accent h-10 rounded-md flex items-center justify-center gap-2 font-semibold text-sm disabled:opacity-60"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {busy ?? (hasCaptions ? "Regenerate" : "Generate captions")}
      </button>
      {error && (
        <div className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 rounded-md p-2">
          {error}
        </div>
      )}
      <p className="text-[11px] text-[var(--fg-muted)]">
        Runs locally with Whisper on WebGPU · first run downloads ~80MB, cached after.
      </p>

      <div className="mt-2 flex gap-1 flex-wrap">
        {(Object.keys(CATEGORY_LABELS) as CaptionCategory[]).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-2.5 h-7 rounded-full text-[11px] font-medium border transition-colors ${
              category === c
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg)]"
                : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
            }`}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-1">
        {filtered.map((p) => {
          const active = activeStyleId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => chooseStyle(p.id)}
              disabled={!hasCaptions}
              className={`aspect-[4/3] rounded-lg border text-left p-2 flex flex-col justify-between transition-all disabled:opacity-40 ${
                active
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border-strong)] hover:border-[var(--fg-muted)]"
              }`}
              style={{ background: active ? undefined : "#0d0d0d" }}
            >
              <div className="flex-1 flex items-center justify-center overflow-hidden">
                <div
                  className="text-center text-[13px] truncate px-1"
                  style={{
                    color: p.color,
                    fontWeight: 900,
                    fontStyle: p.emphasis === "italic" ? "italic" : "normal",
                    fontFamily: `"${p.font}", system-ui, sans-serif`,
                    letterSpacing: p.letterSpacing ? `${p.letterSpacing}px` : undefined,
                    textTransform:
                      p.letterCasing === "uppercase"
                        ? "uppercase"
                        : p.letterCasing === "lowercase"
                        ? "lowercase"
                        : p.letterCasing === "capitalize"
                        ? "capitalize"
                        : undefined,
                    WebkitTextStroke: p.outline
                      ? `${Math.min(2, Math.max(0.5, p.outline.width / 5))}px ${p.outline.color}`
                      : undefined,
                    background:
                      p.background.type === "block" || p.background.type === "word"
                        ? p.background.color
                        : undefined,
                    padding:
                      p.background.type !== "none" ? "2px 6px" : undefined,
                    borderRadius:
                      p.background.type !== "none"
                        ? `${p.background.cornerRadius.topLeft}px`
                        : undefined,
                    textShadow: p.shadow
                      ? `${p.shadow.offsetX}px ${p.shadow.offsetY}px ${p.shadow.blur}px ${p.shadow.color}`
                      : undefined,
                  }}
                >
                  {activeWord(p)}
                </div>
              </div>
              <div className="text-[10px] text-[var(--fg-muted)] truncate">{p.name}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function activeWord(p: { animationColor: string; autoHighlightStyles: { color: string } }) {
  return (
    <>
      <span>BIG </span>
      <span style={{ color: p.animationColor || p.autoHighlightStyles.color }}>IDEA</span>
    </>
  );
}
