"use client";

import { Application, Container, Sprite, Texture, Text, TextStyle } from "pixi.js";
import type { ClipData } from "@/lib/timeline/YjsTimeline";
import { CaptionEngine } from "@/lib/captions/CaptionEngine";
import type { CaptionSegment, CaptionStyle } from "@/lib/captions/schema";

export interface CompositorOptions {
  width: number;
  height: number;
  background?: string;
}

export class PixiRenderer {
  app!: Application;
  stage!: Container;
  captions!: CaptionEngine;
  private videoEls = new Map<string, HTMLVideoElement>();
  private sprites = new Map<string, Sprite>();
  private texts = new Map<string, Text>();
  private getCaptionStyle: (id: string) => CaptionStyle | null = () => null;
  ready = false;

  setCaptionStyleResolver(fn: (id: string) => CaptionStyle | null) {
    this.getCaptionStyle = fn;
    if (this.captions) this.captions = new CaptionEngine({
      width: this.app.renderer.width,
      height: this.app.renderer.height,
      getStyle: fn,
    });
  }

  setCaptionSegments(segs: CaptionSegment[]) {
    this.captions?.setSegments(segs);
  }

  async init(canvas: HTMLCanvasElement, opts: CompositorOptions) {
    this.app = new Application();
    await this.app.init({
      canvas,
      width: opts.width,
      height: opts.height,
      background: opts.background ?? "#000000",
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      preference: "webgpu",
    });
    this.stage = this.app.stage;
    this.captions = new CaptionEngine({
      width: opts.width,
      height: opts.height,
      getStyle: (id) => this.getCaptionStyle(id),
    });
    this.stage.addChild(this.captions.layer);
    this.ready = true;
  }

  resize(width: number, height: number) {
    if (!this.ready) return;
    this.app.renderer.resize(width, height);
    this.captions?.resize(width, height);
  }

  attachVideo(clipId: string, video: HTMLVideoElement) {
    // Guard: Pixi stage must be ready before we can add display objects
    if (!this.ready) return;
    this.videoEls.set(clipId, video);
    const tex = Texture.from(video);
    let sprite = this.sprites.get(clipId);
    if (!sprite) {
      sprite = new Sprite(tex);
      sprite.anchor.set(0.5);
      this.sprites.set(clipId, sprite);
      // Insert at index 0 so video sprites always render beneath captions layer
      this.stage.addChildAt(sprite, 0);
    } else {
      sprite.texture = tex;
    }
    this.fitSprite(sprite, video.videoWidth || 1920, video.videoHeight || 1080);
  }

  private fitSprite(sprite: Sprite, srcW: number, srcH: number) {
    const rw = this.app.renderer.width;
    const rh = this.app.renderer.height;
    const scale = Math.min(rw / srcW, rh / srcH);
    sprite.scale.set(scale);
    sprite.x = rw / 2;
    sprite.y = rh / 2;
  }

  renderText(clipId: string, text: string, size = 64, color = "#ffffff") {
    let t = this.texts.get(clipId);
    const style = new TextStyle({
      fontFamily: "Epilogue, system-ui, sans-serif",
      fontSize: size,
      fontWeight: "800",
      fill: color,
      stroke: { color: "#000000", width: 6, join: "round" },
      align: "center",
    });
    if (!t) {
      t = new Text({ text, style });
      t.anchor.set(0.5);
      this.texts.set(clipId, t);
      this.stage.addChild(t);
    } else {
      t.text = text;
      t.style = style;
    }
    t.x = this.app.renderer.width / 2;
    t.y = this.app.renderer.height * 0.82;
  }

  setVisible(clipId: string, visible: boolean) {
    const s = this.sprites.get(clipId) ?? this.texts.get(clipId);
    if (s) s.visible = visible;
  }

  updateFromTimeline(clips: ClipData[], playhead: number) {
    for (const clip of clips) {
      const active = playhead >= clip.start && playhead < clip.start + clip.duration;
      if (clip.kind === "video") {
        const v = this.videoEls.get(clip.id);
        if (v) {
          const targetT = clip.sourceIn + (playhead - clip.start);
          if (active) {
            if (Math.abs(v.currentTime - targetT) > 0.15) v.currentTime = targetT;
          }
        }
      }
      this.setVisible(clip.id, active);
      if (active) this.applyKenBurns(clip, playhead);
    }
    this.captions?.update(playhead);
  }

  private applyKenBurns(clip: ClipData, playhead: number) {
    if (!clip.kenBurns || clip.kenBurns.axis === "none") return;
    const sprite = this.sprites.get(clip.id);
    if (!sprite) return;
    const t = Math.min(1, Math.max(0, (playhead - clip.start) / Math.max(0.01, clip.duration)));
    const eased = t * t * (3 - 2 * t); // smoothstep
    const { from, to, axis } = clip.kenBurns;
    const scale = from + (to - from) * eased;
    const rw = this.app.renderer.width;
    const rh = this.app.renderer.height;
    const baseScale = Math.min(rw / (sprite.texture.width || 1), rh / (sprite.texture.height || 1));
    sprite.scale.set(baseScale * scale);
    if (axis === "x") sprite.x = rw / 2 + (eased - 0.5) * 0.1 * rw;
    else if (axis === "y") sprite.y = rh / 2 + (eased - 0.5) * 0.1 * rh;
  }

  destroy() {
    this.videoEls.clear();
    this.sprites.clear();
    this.texts.clear();
    if (this.ready) this.app.destroy(true, { children: true, texture: true });
    this.ready = false;
  }
}
