"use client";

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { CaptionSegment, CaptionStyle, CaptionWord } from "./schema";
import { CRAFT, DEFAULT_ACCENT_PALETTE } from "./craft";

interface WordView {
  word: CaptionWord;
  text: Text;
  bg: Graphics;
  underline: Graphics;
  baseX: number;
  baseY: number;
  baseSize: number;
  baseColor: string;
  baseText: string;
  baseWidth: number;
  // Optional auxiliary display objects, created lazily for specific animations.
  chromaLeft: Text | null;
  chromaRight: Text | null;
  depthStack: Text[] | null;
}

/**
 * Renders word-timed captions into a Pixi container with animations applied per-word.
 * Animations are deterministic transforms driven by (currentTime, word.start/end).
 */
export class CaptionEngine {
  readonly layer: Container;
  private width: number;
  private height: number;
  private segments: CaptionSegment[] = [];
  private getStyle: (id: string) => CaptionStyle | null;
  private cache = new Map<string, { container: Container; words: WordView[] }>();

  constructor(
    opts: { width: number; height: number; getStyle: (id: string) => CaptionStyle | null }
  ) {
    this.layer = new Container();
    this.width = opts.width;
    this.height = opts.height;
    this.getStyle = opts.getStyle;
  }

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.cache.clear();
    this.layer.removeChildren();
  }

  setSegments(segs: CaptionSegment[]) {
    this.segments = segs;
    this.cache.clear();
    this.layer.removeChildren();
  }

  /** Called every frame/tick. Shows the active segment, animates words. */
  update(currentTime: number) {
    for (const entry of this.cache.values()) entry.container.visible = false;

    const active = this.segments.find(
      (s) => currentTime >= s.start && currentTime < s.end
    );
    if (!active) return;

    const style = this.getStyle(active.styleId);
    if (!style) return;

    let entry = this.cache.get(active.id);
    if (!entry) {
      entry = this.buildSegment(active, style);
      this.cache.set(active.id, entry);
      this.layer.addChild(entry.container);
    }
    entry.container.visible = true;

    for (const wv of entry.words) this.animateWord(wv, style, currentTime);
  }

  private buildSegment(seg: CaptionSegment, style: CaptionStyle) {
    const container = new Container();
    const words: WordView[] = [];

    const fontSize = style.size * this.height;
    const wrapWidth = style.wrapWidth * this.width;
    const spacing = fontSize * 0.2;
    const lineHeight = fontSize * style.lineHeight;

    // Craft: auto-tighten tracking on large caps headlines.
    const letterSpacing =
      fontSize >= CRAFT.negativeTrackingThresholdPx &&
      style.letterCasing === "uppercase"
        ? style.letterSpacing + CRAFT.negativeTrackingEm * fontSize
        : style.letterSpacing;

    // Craft: stroke width defaults to cap-height ratio when outline.width is 0.
    const strokeRatio = style.strokeRatio ?? CRAFT.strokeRatioByCap;
    const resolvedOutline = style.outline
      ? {
          color: style.outline.color,
          width: style.outline.width || fontSize * strokeRatio,
          join: "round" as const,
        }
      : undefined;

    const baseTextStyle = new TextStyle({
      fontFamily: style.font,
      fontSize,
      fontWeight: style.emphasis === "bold" ? "800" : "700",
      fontStyle:
        style.emphasis === "italic" || /italic/i.test(style.font)
          ? "italic"
          : "normal",
      fill: style.color,
      stroke: resolvedOutline,
      dropShadow: style.shadow
        ? {
            color: style.shadow.color,
            blur: style.shadow.blur,
            angle: Math.atan2(style.shadow.offsetY, style.shadow.offsetX || 0.0001),
            distance: Math.hypot(style.shadow.offsetX, style.shadow.offsetY),
            alpha: 1,
          }
        : undefined,
      letterSpacing,
    });

    // Layout words across lines constrained by wrapWidth.
    const lines: WordView[][] = [[]];
    let cursorX = 0;

    for (const w of seg.words) {
      const display = applyCasing(w.text, style.letterCasing);

      // Per-word TextStyle clone so weightMorph / chromaticSplit can mutate
      // individual words without affecting siblings.
      const perWordStyle = baseTextStyle.clone();
      const t = new Text({ text: display, style: perWordStyle });
      const bg = new Graphics();
      const underline = new Graphics();
      container.addChild(bg);
      container.addChild(underline);
      container.addChild(t);

      const ww: WordView = {
        word: w,
        text: t,
        bg,
        underline,
        baseX: 0,
        baseY: 0,
        baseSize: fontSize,
        baseColor: style.color,
        baseText: display,
        baseWidth: t.width,
        chromaLeft: null,
        chromaRight: null,
        depthStack: null,
      };

      // Pre-allocate auxiliary objects for animations that need them.
      if (style.animation === "chromaticSplit") {
        ww.chromaLeft = new Text({ text: display, style: perWordStyle.clone() });
        ww.chromaRight = new Text({ text: display, style: perWordStyle.clone() });
        ww.chromaLeft.anchor.set(0, 0.5);
        ww.chromaRight.anchor.set(0, 0.5);
        ww.chromaLeft.tint = 0xff3344;
        ww.chromaRight.tint = 0x33e0ff;
        ww.chromaLeft.alpha = 0.85;
        ww.chromaRight.alpha = 0.85;
        container.addChildAt(ww.chromaLeft, container.children.indexOf(t));
        container.addChildAt(ww.chromaRight, container.children.indexOf(t));
      } else if (style.animation === "depthStack") {
        const n = Math.max(1, Math.min(4, style.depthStackCount ?? CRAFT.depthStackCount));
        const shadowColor = style.secondaryColor ?? "#111111";
        const shadows: Text[] = [];
        for (let i = 0; i < n; i++) {
          const s = perWordStyle.clone();
          s.fill = shadowColor;
          s.stroke = { color: shadowColor, width: 0 };
          s.dropShadow = false;
          const st = new Text({ text: display, style: s });
          st.anchor.set(0, 0.5);
          st.alpha = 0.85 - i * 0.15;
          container.addChildAt(st, container.children.indexOf(t));
          shadows.push(st);
        }
        ww.depthStack = shadows;
      }

      const advance = t.width + spacing;
      if (cursorX + t.width > wrapWidth && lines[lines.length - 1].length > 0) {
        lines.push([]);
        cursorX = 0;
      }
      lines[lines.length - 1].push(ww);
      cursorX += advance;
      words.push(ww);
    }

    // Position lines centered around (style.x * width, style.y * height).
    const cx = style.x * this.width;
    const cyBase = style.y * this.height;
    const totalH = lines.length * lineHeight;
    let lineY = cyBase - totalH / 2 + lineHeight / 2;

    for (const line of lines) {
      const lineWidth =
        line.reduce((sum, w) => sum + w.text.width, 0) +
        Math.max(0, line.length - 1) * spacing;
      let lineX =
        style.align === "left"
          ? cx - lineWidth / 2
          : style.align === "right"
            ? cx + lineWidth / 2 - lineWidth
            : cx - lineWidth / 2;
      for (const wv of line) {
        wv.text.anchor.set(0, 0.5);
        wv.baseX = lineX;
        wv.baseY = lineY;
        wv.text.position.set(lineX, lineY);
        // Static rotation jitter for Beast-style energy.
        if (style.rotationJitterDeg && style.rotationJitterDeg > 0) {
          const seed = hashStr(wv.baseText + wv.word.start);
          const sign = seed % 2 === 0 ? 1 : -1;
          wv.text.rotation =
            (sign * (style.rotationJitterDeg * Math.PI)) / 180;
        }
        lineX += wv.text.width + spacing;
      }
      lineY += lineHeight;
    }

    // Segment-wide background block, if requested.
    if (style.background.type === "block") {
      drawBlockBg(container, words, style);
    }

    return { container, words };
  }

  private animateWord(wv: WordView, style: CaptionStyle, t: number) {
    const { word } = wv;
    const active = t >= word.start && t < word.end;
    const pct = active ? (t - word.start) / Math.max(0.001, word.end - word.start) : 1;
    const entered = t >= word.start;

    // Reset per-frame state.
    wv.text.scale.set(1);
    // Preserve any static rotation jitter set in buildSegment.
    const jitter =
      style.rotationJitterDeg && style.rotationJitterDeg > 0
        ? ((hashStr(wv.baseText + wv.word.start) % 2 === 0 ? 1 : -1) *
            (style.rotationJitterDeg * Math.PI)) /
          180
        : 0;
    wv.text.rotation = jitter;
    wv.text.alpha = entered ? 1 : 0;
    wv.text.position.set(wv.baseX, wv.baseY);
    wv.text.style.fill = style.color;
    wv.text.text = wv.baseText;
    wv.bg.clear();
    wv.underline.clear();

    // Hide auxiliaries by default; specific branches re-enable them.
    if (wv.chromaLeft) wv.chromaLeft.alpha = 0;
    if (wv.chromaRight) wv.chromaRight.alpha = 0;
    if (wv.depthStack) for (const s of wv.depthStack) s.alpha = 0;

    if (!entered) return;

    switch (style.animation) {
      case "highlight":
      case "colourHighlight":
        if (active) wv.text.style.fill = style.animationColor;
        break;
      case "boxHighlight":
        if (active) drawWordBox(wv, style.animationColor, style);
        break;
      case "karaoke":
        if (active) {
          drawWordBox(wv, style.animationColor + "33", style);
          wv.text.style.fill = style.animationColor;
        }
        break;
      case "scaleIn": {
        const e = CRAFT.ease.outBack(Math.min(1, (t - word.start) / 0.18));
        wv.text.scale.set(e);
        break;
      }
      case "impactPop":
      case "impact": {
        const e = CRAFT.ease.outBack(Math.min(1, (t - word.start) / 0.14));
        wv.text.scale.set(0.6 + 0.4 * e);
        if (active) wv.text.style.fill = style.animationColor;
        break;
      }
      case "dropIn": {
        const p = Math.min(1, (t - word.start) / 0.22);
        wv.text.position.y = wv.baseY - (1 - CRAFT.ease.outCubic(p)) * wv.baseSize * 0.8;
        break;
      }
      case "floatInUp": {
        const p = Math.min(1, (t - word.start) / 0.22);
        wv.text.position.y = wv.baseY + (1 - CRAFT.ease.outCubic(p)) * wv.baseSize * 0.6;
        wv.text.alpha = p;
        break;
      }
      case "floatInDown": {
        const p = Math.min(1, (t - word.start) / 0.22);
        wv.text.position.y = wv.baseY - (1 - CRAFT.ease.outCubic(p)) * wv.baseSize * 0.6;
        wv.text.alpha = p;
        break;
      }
      case "reveal": {
        const p = Math.min(1, (t - word.start) / 0.22);
        wv.text.alpha = p;
        wv.text.position.x = wv.baseX - (1 - CRAFT.ease.outCubic(p)) * 20;
        break;
      }
      case "stack": {
        const p = Math.min(1, (t - word.start) / 0.22);
        wv.text.scale.set(0.8 + 0.2 * CRAFT.ease.outCubic(p));
        break;
      }
      case "stomp": {
        const p = Math.min(1, (t - word.start) / 0.12);
        wv.text.scale.set(1.4 - 0.4 * CRAFT.ease.outCubic(p));
        break;
      }
      case "flipClock": {
        const p = Math.min(1, (t - word.start) / 0.18);
        wv.text.scale.y = CRAFT.ease.outCubic(p);
        break;
      }
      case "rotateFlip": {
        const p = Math.min(1, (t - word.start) / 0.2);
        wv.text.rotation = jitter + (1 - CRAFT.ease.outCubic(p)) * 0.25;
        break;
      }
      case "rotateHighlight":
        if (active) {
          wv.text.rotation = jitter + Math.sin((t - word.start) * 20) * 0.04;
          wv.text.style.fill = style.animationColor;
        }
        break;

      // — Phase 8 additions —

      case "underlineSweep": {
        if (active) {
          const p = CRAFT.ease.outCubic(pct);
          const color = style.underlineColor ?? style.animationColor;
          const uy = wv.baseY + wv.baseSize * 0.48;
          wv.underline
            .clear()
            .rect(wv.baseX, uy, wv.baseWidth * p, Math.max(2, wv.baseSize * 0.06))
            .fill(color);
        }
        break;
      }

      case "weightMorph": {
        const p = Math.min(1, (t - word.start) / 0.28);
        const fw = 400 + Math.round(500 * CRAFT.ease.outCubic(p));
        // Only mutate when value actually changes to avoid texture thrash.
        if (wv.text.style.fontWeight !== String(fw)) {
          wv.text.style.fontWeight = String(fw) as TextStyle["fontWeight"];
        }
        break;
      }

      case "typewriterChar": {
        const staggerMs = style.typewriterStaggerMs ?? CRAFT.typewriterStaggerMs;
        const charsRevealed = Math.floor(((t - word.start) * 1000) / staggerMs);
        const slice = wv.baseText.slice(0, Math.min(wv.baseText.length, charsRevealed));
        wv.text.text = slice + (charsRevealed < wv.baseText.length ? "▍" : "");
        break;
      }

      case "chromaticSplit": {
        const off = style.chromaticOffsetPx ?? CRAFT.chromaticOffsetPx;
        const wob = Math.sin((t - word.start) * 60) * 1;
        if (wv.chromaLeft) {
          wv.chromaLeft.position.set(wv.baseX - off + wob, wv.baseY);
          wv.chromaLeft.alpha = 0.85;
        }
        if (wv.chromaRight) {
          wv.chromaRight.position.set(wv.baseX + off - wob, wv.baseY);
          wv.chromaRight.alpha = 0.85;
        }
        break;
      }

      case "colorCycle": {
        if (active) {
          const palette = style.accentPalette ?? DEFAULT_ACCENT_PALETTE;
          const hz = style.colorCycleHz ?? CRAFT.colorCycleHz;
          const idx = Math.floor((t - word.start) * hz) % palette.length;
          wv.text.style.fill = palette[idx];
        }
        break;
      }

      case "glassPill": {
        // Glassy translucent pill behind every word (not just active).
        drawGlassPill(wv, style);
        if (active) {
          const e = CRAFT.ease.outBack(Math.min(1, (t - word.start) / 0.18));
          wv.text.scale.set(0.9 + 0.1 * e);
        }
        break;
      }

      case "depthStack": {
        if (wv.depthStack) {
          const n = wv.depthStack.length;
          for (let i = 0; i < n; i++) {
            const s = wv.depthStack[i];
            const off = (n - i) * Math.max(2, wv.baseSize * 0.03);
            s.position.set(wv.baseX + off, wv.baseY + off);
            s.alpha = 0.85 - i * 0.15;
          }
        }
        // Pop on active.
        if (active) {
          const e = CRAFT.ease.outBack(Math.min(1, (t - word.start) / 0.16));
          wv.text.scale.set(0.9 + 0.1 * e);
        }
        break;
      }

      case "liquidBlob": {
        // Wobbling rounded-pill bg behind active word.
        if (active) {
          const pad = style.background.innerPadding;
          const r = Math.max(16, wv.baseSize * 0.6);
          const wob = Math.sin((t - word.start) * 6) * 2;
          const w = wv.baseWidth + pad.left + pad.right + wob;
          const h = wv.baseSize * 1.3 + pad.top + pad.bottom;
          wv.bg
            .clear()
            .roundRect(wv.baseX - pad.left - wob / 2, wv.baseY - h / 2, w, h, r)
            .fill(style.animationColor);
        }
        break;
      }

      case "none":
      default:
        break;
    }

    // Auto-highlight on emphasis words (persistent color flag).
    if (
      style.autoHighlightEnabled &&
      word.emphasis &&
      !active &&
      style.animation !== "colorCycle"
    ) {
      wv.text.style.fill = style.autoHighlightStyles.color;
    }
  }
}

function applyCasing(s: string, c: CaptionStyle["letterCasing"]) {
  switch (c) {
    case "uppercase":
      return s.toUpperCase();
    case "lowercase":
      return s.toLowerCase();
    case "capitalize":
      return s.replace(/\b\w/g, (m) => m.toUpperCase());
    default:
      return s;
  }
}

function drawWordBox(wv: WordView, color: string, style: CaptionStyle) {
  const pad = style.background.innerPadding;
  const r = style.background.cornerRadius.topLeft || 8;
  const w = wv.text.width + pad.left + pad.right;
  const h = wv.baseSize * 1.2 + pad.top + pad.bottom;
  wv.bg
    .clear()
    .roundRect(wv.baseX - pad.left, wv.baseY - h / 2, w, h, r)
    .fill(color);
}

function drawGlassPill(wv: WordView, style: CaptionStyle) {
  const pad = style.background.innerPadding;
  const r = style.background.cornerRadius.topLeft || 14;
  const w = wv.baseWidth + pad.left + pad.right;
  const h = wv.baseSize * 1.2 + pad.top + pad.bottom;
  wv.bg
    .clear()
    .roundRect(wv.baseX - pad.left, wv.baseY - h / 2, w, h, r)
    .fill({ color: 0xffffff, alpha: 0.08 })
    .roundRect(wv.baseX - pad.left, wv.baseY - h / 2, w, h, r)
    .stroke({ color: 0xffffff, width: 1, alpha: 0.35 });
}

function drawBlockBg(container: Container, words: WordView[], style: CaptionStyle) {
  if (words.length === 0) return;
  const pad = style.background.innerPadding;
  const r = style.background.cornerRadius.topLeft || 8;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const wv of words) {
    minX = Math.min(minX, wv.baseX);
    maxX = Math.max(maxX, wv.baseX + wv.text.width);
    minY = Math.min(minY, wv.baseY - wv.baseSize * 0.6);
    maxY = Math.max(maxY, wv.baseY + wv.baseSize * 0.6);
  }
  const bg = new Graphics();
  bg.roundRect(
    minX - pad.left,
    minY - pad.top,
    maxX - minX + pad.left + pad.right,
    maxY - minY + pad.top + pad.bottom,
    r
  ).fill(style.background.color);
  container.addChildAt(bg, 0);
}

function hashStr(s: string | number) {
  const str = String(s);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
