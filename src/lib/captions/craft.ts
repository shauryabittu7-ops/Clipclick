/**
 * Premium caption typography craft rules — the "why captions look pro" constants.
 * Derived from teardown of Submagic creator packs (Iman, Hormozi, Ali, Devin),
 * Captions.ai defaults, OpusClip 2026 animation packs, and actual top-creator output
 * (MrBeast, Ali Abdaal, Alex Hormozi, Devin Jatho, ASMR lifestyle, brutalist tech).
 *
 * Rule of thumb: `CaptionEngine` reads these when a `CaptionStyle` field is omitted;
 * preset JSON stays terse and inherits sensible defaults.
 */

export const CRAFT = {
  /** Stroke width per cap height. 1/12 is broadcast-safe; 1/10 is Beast-style heavy. */
  strokeRatioByCap: 1 / 12,
  strokeRatioBeast: 1 / 10,

  /** Word-count budget per screen for each style tier. */
  maxWordsPerScreen: { pop: 3, clean: 7 },

  /** Vertical placement for 9:16 (0 = top, 1 = bottom). 0.72 sits above TikTok UI. */
  verticalPos9x16: 0.72,
  /** Vertical placement for 16:9. */
  verticalPos16x9: 0.82,

  /** Emoji size as a multiple of cap height. */
  emojiSizeVsCap: 0.9,

  /** Corner radius (px) by visual tier. */
  pillRadiusByTier: {
    biz: 8,
    social: 16,
    gen_z: 22,
    brutalist: 0,
  },

  /** WCAG contrast floor against worst-case background pixel. */
  minContrast: 4.5,

  /** Above this rendered px size, apply negative tracking. */
  negativeTrackingThresholdPx: 72,
  /** Tracking (em) applied to large caps. */
  negativeTrackingEm: -0.02,

  /** Default per-character typewriter stagger. */
  typewriterStaggerMs: 30,
  /** Default chromatic RGB split offset. */
  chromaticOffsetPx: 2,
  /** Default color-cycle rate in Hz. */
  colorCycleHz: 6,
  /** Default depth-stack count (z-shadow copies). */
  depthStackCount: 3,

  /** Animation ease constants. */
  ease: {
    outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
    outBack: (t: number) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    smoothstep: (t: number) => t * t * (3 - 2 * t),
  },
} as const;

/** Devin Jatho-style vibrant palette for `colorCycle`. */
export const DEFAULT_ACCENT_PALETTE = [
  "#FFFFFF",
  "#FFD84C",
  "#39D7FF",
  "#FF4D8D",
  "#A4FF3B",
];
