"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor } from "@/lib/state/editorStore";
import { LUT_PRESETS } from "@/lib/color/presets";
import { applyLUTToImageData, type LUTData } from "@/lib/color/lut";

export default function ColorPanel() {
  const timeline = useEditor((s) => s.timeline);
  const tick = useEditor((s) => s.tick);
  void tick;

  const activeId = (timeline?.meta.get("lutId") as string | undefined) ?? "neutral";
  const intensity = (timeline?.meta.get("lutIntensity") as number | undefined) ?? 1;

  const setLUT = (id: string) => {
    timeline?.doc.transact(() => {
      timeline.meta.set("lutId", id);
    });
  };
  const setIntensity = (v: number) => {
    timeline?.doc.transact(() => {
      timeline.meta.set("lutIntensity", v);
    });
  };

  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="font-semibold text-[var(--fg)] mb-1">Color grading</p>
        <p className="text-xs text-[var(--fg-muted)]">
          LUTs bake into your export. Preview is approximate.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {LUT_PRESETS.map((p) => (
          <LUTTile
            key={p.id}
            name={p.name}
            build={p.build}
            active={activeId === p.id}
            onClick={() => setLUT(p.id)}
          />
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-[var(--fg-muted)] mb-1">
          <span>Intensity</span>
          <span className="font-mono">{Math.round(intensity * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(intensity * 100)}
          onChange={(e) => setIntensity(parseInt(e.target.value) / 100)}
          className="w-full accent-[var(--accent)]"
        />
      </div>

      {activeId !== "neutral" && (
        <button
          onClick={() => {
            setLUT("neutral");
            setIntensity(1);
          }}
          className="w-full h-8 rounded-md border border-[var(--border-strong)] text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
        >
          Reset grade
        </button>
      )}
    </div>
  );
}

function LUTTile({
  name,
  build,
  active,
  onClick,
}: {
  name: string;
  build: (s?: number) => LUTData;
  active: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lut = useMemo(() => build(17), [build]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = c.width;
    const h = c.height;
    // Paint a color-ramp + gray-ramp so the LUT shift is visible at a glance.
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / (w - 1);
        const v = y / (h - 1);
        const hue = u;
        const [r, g, b] = hsv(hue, 0.75, 0.5 + v * 0.5);
        const i = (y * w + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    applyLUTToImageData(img, lut, 1);
    ctx.putImageData(img, 0, 0);
    setReady(true);
  }, [lut]);

  return (
    <button
      onClick={onClick}
      className={`group rounded-lg overflow-hidden border text-left transition-colors ${
        active
          ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
          : "border-[var(--border-strong)] hover:border-[var(--fg-muted)]"
      }`}
    >
      <canvas
        ref={ref}
        width={96}
        height={54}
        className="block w-full h-[54px] bg-black"
        style={{ opacity: ready ? 1 : 0.2 }}
      />
      <div className="px-2 py-1 text-[11px] font-medium">{name}</div>
    </button>
  );
}

function hsv(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0,
    g = 0,
    b = 0;
  switch (i % 6) {
    case 0:
      r = v; g = t; b = p; break;
    case 1:
      r = q; g = v; b = p; break;
    case 2:
      r = p; g = v; b = t; break;
    case 3:
      r = p; g = q; b = v; break;
    case 4:
      r = t; g = p; b = v; break;
    case 5:
      r = v; g = p; b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
