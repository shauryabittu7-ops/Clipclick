/**
 * VEED-compatible caption style schema.
 * Positions/sizes are normalized 0..1 relative to video dimensions.
 */

export type CaptionAnimation =
  | "none"
  | "boxHighlight"
  | "flipClock"
  | "highlight"
  | "karaoke"
  | "impact"
  | "reveal"
  | "floatInDown"
  | "floatInUp"
  | "scaleIn"
  | "dropIn"
  | "impactPop"
  | "colourHighlight"
  | "rotateFlip"
  | "rotateHighlight"
  | "stack"
  | "stomp"
  // — Phase 8 additions —
  | "underlineSweep"
  | "weightMorph"
  | "typewriterChar"
  | "chromaticSplit"
  | "colorCycle"
  | "glassPill"
  | "depthStack"
  | "liquidBlob";

export type CaptionCategory =
  | "contentAware"
  | "dynamic"
  | "social"
  | "business"
  | "retro"
  | "creator"
  | "premium";

export interface CornerRadius {
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
}
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ShadowConfig {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface OutlineConfig {
  color: string;
  width: number;
}

export interface CaptionBackground {
  type: "block" | "word" | "none";
  color: string;
  cornerRadius: CornerRadius;
  innerPadding: Padding;
}

export interface AutoHighlightStyles {
  bold: boolean;
  color: string;
  italic: boolean;
  spacing: number;
}

export interface CaptionStyle {
  id: string;
  name: string;
  category: CaptionCategory;

  animation: CaptionAnimation;
  animationColor: string;

  font: string;
  size: number;           // 0..1 of video height
  color: string;
  x: number;              // 0..1
  y: number;              // 0..1
  wrapWidth: number;      // 0..1

  letterSpacing: number;
  letterSpacingEm: number;
  letterCasing: "uppercase" | "lowercase" | "capitalize" | "normal";
  lineHeight: number;

  emphasis: "bold" | "italic" | "underline" | "none";
  emphasisPreset: string;
  emphasisPresetEnabled: boolean;

  autoHighlightEnabled: boolean;
  autoHighlightStyles: AutoHighlightStyles;

  background: CaptionBackground;
  shadow: ShadowConfig | null;
  outline: OutlineConfig | null;

  emoji: { enabled: boolean; position: "top" | "bottom"; size: "sm" | "md" | "lg" };
  align: "left" | "center" | "right";
  rotationRandomEnabled: boolean;

  // — Phase 8 optional premium-typography fields —
  /** Colors cycled on the active word (Devin Jatho look). */
  accentPalette?: string[];
  /** Stroke width as a ratio of cap height. Default = 1/12. Beast = 1/10. */
  strokeRatio?: number;
  /** Underline color for `underlineSweep`. Defaults to `animationColor`. */
  underlineColor?: string;
  /** Per-character stagger for `typewriterChar` in ms. Default 30. */
  typewriterStaggerMs?: number;
  /** Horizontal RGB split offset in px for `chromaticSplit`. Default 2. */
  chromaticOffsetPx?: number;
  /** Rotation jitter (deg) applied to every word on render. Default 0. */
  rotationJitterDeg?: number;
  /** Hertz at which `colorCycle` advances through `accentPalette`. Default 6. */
  colorCycleHz?: number;
  /** Depth-stack copies behind the front word (1–4). Default 3. */
  depthStackCount?: number;
  /** Secondary (shadow) color for `depthStack` and `chromaticSplit` fallbacks. */
  secondaryColor?: string;
}

export interface CaptionWord {
  text: string;
  start: number; // seconds (timeline time, not clip-local)
  end: number;
  emphasis?: boolean;
}

export interface CaptionSegment {
  id: string;
  start: number;
  end: number;
  words: CaptionWord[];
  styleId: string;
}

export interface CaptionTrackState {
  segments: CaptionSegment[];
  defaultStyleId: string;
  language?: string;
}

export const DEFAULT_CAPTION_STYLE: Omit<CaptionStyle, "id" | "name" | "category"> = {
  animation: "none",
  animationColor: "#FFD400",
  font: "Epilogue",
  size: 0.07,
  color: "#ffffff",
  x: 0.5,
  y: 0.82,
  wrapWidth: 0.82,
  letterSpacing: 0,
  letterSpacingEm: 0,
  letterCasing: "normal",
  lineHeight: 1.15,
  emphasis: "bold",
  emphasisPreset: "emphasisOne",
  emphasisPresetEnabled: false,
  autoHighlightEnabled: true,
  autoHighlightStyles: { bold: true, color: "#FFD400", italic: false, spacing: 0 },
  background: {
    type: "none",
    color: "#000000B3",
    cornerRadius: { topLeft: 12, topRight: 12, bottomLeft: 12, bottomRight: 12 },
    innerPadding: { top: 10, right: 18, bottom: 10, left: 18 },
  },
  shadow: { color: "#000000CC", blur: 12, offsetX: 0, offsetY: 4 },
  outline: { color: "#000000", width: 6 },
  emoji: { enabled: false, position: "top", size: "md" },
  align: "center",
  rotationRandomEnabled: false,
};
