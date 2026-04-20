"use client";

import { useEditor } from "@/lib/state/editorStore";
import { formatTime } from "@/lib/utils";

type KBAxis = "none" | "x" | "y";
type KBPreset = { label: string; from: number; to: number; axis: KBAxis };

const KB_PRESETS: KBPreset[] = [
  { label: "Off", from: 1, to: 1, axis: "none" },
  { label: "Zoom in", from: 1.0, to: 1.12, axis: "none" },
  { label: "Zoom out", from: 1.12, to: 1.0, axis: "none" },
  { label: "Pan right", from: 1.08, to: 1.08, axis: "x" },
  { label: "Pan up", from: 1.08, to: 1.08, axis: "y" },
];

export default function RightPanel() {
  const timeline = useEditor((s) => s.timeline);
  const selectedId = useEditor((s) => s.selectedClipId);
  const tick = useEditor((s) => s.tick);
  void tick;

  const clip = selectedId && timeline ? timeline.clips.get(selectedId) : null;
  const isVideoish = clip?.kind === "video" || clip?.kind === "image";

  const applyKB = (p: KBPreset) => {
    if (!timeline || !clip) return;
    const kenBurns =
      p.axis === "none" && p.from === 1 && p.to === 1
        ? null
        : { from: p.from, to: p.to, axis: p.axis };
    timeline.updateClip(clip.id, { kenBurns });
  };

  const activeKB = (() => {
    const k = clip?.kenBurns;
    if (!k) return "Off";
    return (
      KB_PRESETS.find(
        (p) => p.from === k.from && p.to === k.to && p.axis === k.axis
      )?.label ?? "Custom"
    );
  })();

  return (
    <aside className="w-[320px] shrink-0 border-l border-[var(--border)] bg-[var(--bg-elevated)] overflow-y-auto p-4">
      {clip ? (
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--fg-muted)] mb-1">
              {clip.kind} clip
            </p>
            <p className="font-semibold truncate">
              {timeline?.assets.get(clip.assetId ?? "")?.name ?? clip.id}
            </p>
          </div>
          <Row label="Start" value={formatTime(clip.start)} />
          <Row label="Duration" value={formatTime(clip.duration)} />
          <Row label="In" value={formatTime(clip.sourceIn)} />
          <Row label="Out" value={formatTime(clip.sourceOut)} />

          {isVideoish && (
            <div className="space-y-2 pt-2 border-t border-[var(--border)]">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-[var(--fg-muted)]">
                  Ken Burns
                </p>
                <span className="text-[11px] font-mono text-[var(--fg-muted)]">
                  {activeKB}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {KB_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => applyKB(p)}
                    className={`h-8 rounded border text-[11px] font-medium transition-colors ${
                      activeKB === p.label
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg)]"
                        : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => timeline?.removeClip(clip.id)}
            className="w-full h-9 rounded-md border border-red-500/40 text-red-400 text-xs font-semibold hover:bg-red-500/10"
          >
            Delete clip
          </button>
        </div>
      ) : (
        <div className="text-sm text-[var(--fg-muted)]">
          <p className="font-semibold text-[var(--fg)] mb-1">Inspector</p>
          Select a clip to edit its properties.
        </div>
      )}
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-[var(--fg-muted)]">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
