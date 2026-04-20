"use client";

import type { LUTData } from "./lut";

/** Programmatically generated LUTs — no asset downloads. */
export interface LUTPreset {
  id: string;
  name: string;
  build: (size?: number) => LUTData;
}

function makeLUT(size: number, fn: (r: number, g: number, b: number) => [number, number, number]): LUTData {
  const data = new Uint8Array(size * size * size * 4);
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rn = r / (size - 1);
        const gn = g / (size - 1);
        const bn = b / (size - 1);
        const [or, og, ob] = fn(rn, gn, bn);
        const i = ((b * size + g) * size + r) * 4;
        data[i + 0] = Math.max(0, Math.min(255, Math.round(or * 255)));
        data[i + 1] = Math.max(0, Math.min(255, Math.round(og * 255)));
        data[i + 2] = Math.max(0, Math.min(255, Math.round(ob * 255)));
        data[i + 3] = 255;
      }
    }
  }
  return { size, data };
}

const smooth = (x: number, s = 0.1) => (x < 0.5 ? Math.pow(x * 2, 1 + s) / 2 : 1 - Math.pow((1 - x) * 2, 1 + s) / 2);

export const LUT_PRESETS: LUTPreset[] = [
  {
    id: "neutral",
    name: "Neutral",
    build: (s = 33) => makeLUT(s, (r, g, b) => [r, g, b]),
  },
  {
    id: "cinematic",
    name: "Cinematic",
    build: (s = 33) =>
      makeLUT(s, (r, g, b) => {
        // lifted blacks, rolled highlights, slight teal in shadows + orange in mids
        const lr = smooth(r) * 0.95 + 0.04;
        const lg = smooth(g) * 0.94 + 0.03;
        const lb = smooth(b) * 0.92 + 0.06;
        return [lr + 0.04 * (1 - r), lg, lb + 0.03 * r];
      }),
  },
  {
    id: "tealOrange",
    name: "Teal & Orange",
    build: (s = 33) =>
      makeLUT(s, (r, g, b) => {
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const shadow = 1 - lum;
        const highlight = lum;
        return [
          r + 0.10 * highlight - 0.05 * shadow,
          g + 0.03 * highlight - 0.02 * shadow,
          b - 0.05 * highlight + 0.10 * shadow,
        ];
      }),
  },
  {
    id: "noir",
    name: "Noir",
    build: (s = 33) =>
      makeLUT(s, (r, g, b) => {
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const contr = smooth(lum, 0.6);
        return [contr, contr, contr];
      }),
  },
  {
    id: "vintage",
    name: "Vintage",
    build: (s = 33) =>
      makeLUT(s, (r, g, b) => [
        smooth(r) * 0.93 + 0.07,
        smooth(g) * 0.88 + 0.04,
        smooth(b) * 0.80,
      ]),
  },
  {
    id: "warm",
    name: "Warm",
    build: (s = 33) => makeLUT(s, (r, g, b) => [Math.min(1, r * 1.06), g, b * 0.94]),
  },
  {
    id: "cool",
    name: "Cool",
    build: (s = 33) => makeLUT(s, (r, g, b) => [r * 0.93, g, Math.min(1, b * 1.06)]),
  },
];

export const LUT_PRESETS_BY_ID: Record<string, LUTPreset> = Object.fromEntries(
  LUT_PRESETS.map((p) => [p.id, p])
);
