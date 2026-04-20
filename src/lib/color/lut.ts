"use client";

export interface LUTData {
  /** Cube size (e.g. 33). */
  size: number;
  /** Linearised RGB, length = size^3 * 4 (Uint8). */
  data: Uint8Array;
}

/** Parse an Adobe .cube LUT file. */
export function parseCubeLUT(text: string): LUTData {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  let size = 0;
  const entries: [number, number, number][] = [];
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("TITLE") || line.startsWith("DOMAIN_")) continue;
    if (line.startsWith("LUT_3D_SIZE")) {
      size = parseInt(line.split(/\s+/)[1], 10);
      continue;
    }
    if (line.startsWith("LUT_1D_SIZE")) continue;
    const parts = line.split(/\s+/).map(Number);
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      entries.push([parts[0], parts[1], parts[2]]);
    }
  }
  if (!size || entries.length !== size * size * size) {
    throw new Error(`Invalid .cube LUT (expected ${size ** 3} entries, got ${entries.length})`);
  }
  const data = new Uint8Array(size * size * size * 4);
  for (let i = 0; i < entries.length; i++) {
    const [r, g, b] = entries[i];
    data[i * 4 + 0] = clamp255(r * 255);
    data[i * 4 + 1] = clamp255(g * 255);
    data[i * 4 + 2] = clamp255(b * 255);
    data[i * 4 + 3] = 255;
  }
  return { size, data };
}

function clamp255(v: number) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Apply a 3D LUT to an RGBA ImageData in-place with trilinear sampling.
 * Exported so we can use it for thumbnail previews and CPU fallbacks without
 * coupling to a specific renderer.
 */
export function applyLUTToImageData(img: ImageData, lut: LUTData, intensity = 1) {
  const { data, size } = lut;
  const s = size;
  const smax = s - 1;
  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i] / 255;
    const g = img.data[i + 1] / 255;
    const b = img.data[i + 2] / 255;
    const [lr, lg, lb] = sampleTrilinear(data, s, smax, r, g, b);
    img.data[i + 0] = lerp(img.data[i + 0], lr, intensity);
    img.data[i + 1] = lerp(img.data[i + 1], lg, intensity);
    img.data[i + 2] = lerp(img.data[i + 2], lb, intensity);
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function sampleTrilinear(
  d: Uint8Array, s: number, smax: number, r: number, g: number, b: number
): [number, number, number] {
  const rf = r * smax, gf = g * smax, bf = b * smax;
  const r0 = Math.floor(rf), g0 = Math.floor(gf), b0 = Math.floor(bf);
  const r1 = Math.min(r0 + 1, smax), g1 = Math.min(g0 + 1, smax), b1 = Math.min(b0 + 1, smax);
  const rd = rf - r0, gd = gf - g0, bd = bf - b0;
  const idx = (rr: number, gg: number, bb: number) => ((bb * s + gg) * s + rr) * 4;
  const c00 = lerp3(d, idx(r0, g0, b0), idx(r1, g0, b0), rd);
  const c10 = lerp3(d, idx(r0, g1, b0), idx(r1, g1, b0), rd);
  const c01 = lerp3(d, idx(r0, g0, b1), idx(r1, g0, b1), rd);
  const c11 = lerp3(d, idx(r0, g1, b1), idx(r1, g1, b1), rd);
  const c0 = blend(c00, c10, gd);
  const c1 = blend(c01, c11, gd);
  return blend(c0, c1, bd);
}
function lerp3(d: Uint8Array, i0: number, i1: number, t: number): [number, number, number] {
  return [lerp(d[i0], d[i1], t), lerp(d[i0 + 1], d[i1 + 1], t), lerp(d[i0 + 2], d[i1 + 2], t)];
}
function blend(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
