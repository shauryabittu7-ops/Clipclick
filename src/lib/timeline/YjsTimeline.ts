"use client";

import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import type { CaptionSegment } from "@/lib/captions/schema";

export type ClipKind = "video" | "audio" | "text" | "image";

export interface ClipData {
  id: string;
  kind: ClipKind;
  trackId: string;
  start: number; // timeline seconds
  duration: number;
  sourceIn: number; // seconds into source
  sourceOut: number;
  assetId?: string;
  text?: string;
  styleId?: string;
  volume?: number;
  muted?: boolean;
  kenBurns?: { from: number; to: number; axis: "x" | "y" | "none" } | null;
}

export interface TrackData {
  id: string;
  kind: ClipKind;
  label: string;
  height: number;
  locked: boolean;
  hidden: boolean;
}

export interface AssetData {
  id: string;
  kind: ClipKind;
  name: string;
  url?: string;
  proxyUrl?: string;
  duration: number;
  width?: number;
  height?: number;
}

export class YjsTimeline {
  readonly doc: Y.Doc;
  readonly tracks: Y.Map<TrackData>;
  readonly clips: Y.Map<ClipData>;
  readonly assets: Y.Map<AssetData>;
  readonly meta: Y.Map<unknown>;
  readonly captions: Y.Array<CaptionSegment>;
  readonly undoManager: Y.UndoManager;
  readonly projectId: string;
  private persistence?: IndexeddbPersistence;
  private wsProvider?: WebsocketProvider;
  readonly readOnly: boolean;

  constructor(projectId: string, opts: { readOnly?: boolean; wsUrl?: string } = {}) {
    this.projectId = projectId;
    this.readOnly = !!opts.readOnly;
    this.doc = new Y.Doc();
    this.tracks = this.doc.getMap("tracks");
    this.clips = this.doc.getMap("clips");
    this.assets = this.doc.getMap("assets");
    this.meta = this.doc.getMap("meta");
    this.captions = this.doc.getArray<CaptionSegment>("captions");

    this.undoManager = new Y.UndoManager(
      [this.clips, this.tracks, this.meta, this.captions],
      { captureTimeout: 400 }
    );

    if (typeof window !== "undefined") {
      this.persistence = new IndexeddbPersistence(`reel:${projectId}`, this.doc);
      const url = opts.wsUrl ?? process.env.NEXT_PUBLIC_YJS_WS_URL;
      if (url) {
        try {
          this.wsProvider = new WebsocketProvider(url, `reel-${projectId}`, this.doc, {
            connect: true,
          });
        } catch (e) {
          console.warn("Yjs websocket init failed", e);
        }
      }
    }

    if (this.readOnly) {
      // Prevent local writes from propagating by intercepting undoManager.
      this.doc.on("beforeTransaction", (tr) => {
        if (tr.origin !== "remote") tr.doc.gc = true;
      });
    }

    if (this.tracks.size === 0) this.seedDefaultTracks();
    if (!this.meta.has("aspect")) {
      this.doc.transact(() => {
        this.meta.set("aspect", "16:9");
        this.meta.set("width", 1920);
        this.meta.set("height", 1080);
        this.meta.set("fps", 30);
        this.meta.set("duration", 0);
      });
    }
  }

  private seedDefaultTracks() {
    this.doc.transact(() => {
      const defs: TrackData[] = [
        { id: "t-text", kind: "text", label: "Subtitles", height: 48, locked: false, hidden: false },
        { id: "t-video", kind: "video", label: "Video", height: 64, locked: false, hidden: false },
        { id: "t-audio", kind: "audio", label: "Audio", height: 56, locked: false, hidden: false },
      ];
      for (const t of defs) this.tracks.set(t.id, t);
    });
  }

  addClip(clip: ClipData) {
    this.clips.set(clip.id, clip);
  }

  updateClip(id: string, patch: Partial<ClipData>) {
    const prev = this.clips.get(id);
    if (!prev) return;
    this.clips.set(id, { ...prev, ...patch });
  }

  removeClip(id: string) {
    this.clips.delete(id);
  }

  addAsset(a: AssetData) {
    this.assets.set(a.id, a);
  }

  setCaptions(segs: CaptionSegment[]) {
    this.doc.transact(() => {
      this.captions.delete(0, this.captions.length);
      this.captions.push(segs);
    });
  }

  updateCaptionsStyle(styleId: string) {
    this.doc.transact(() => {
      const arr = this.captions.toArray().map((s) => ({ ...s, styleId }));
      this.captions.delete(0, this.captions.length);
      this.captions.push(arr);
    });
  }

  snapshot() {
    return {
      tracks: Array.from(this.tracks.values()),
      clips: Array.from(this.clips.values()),
      assets: Array.from(this.assets.values()),
      meta: Object.fromEntries(this.meta.entries()),
    };
  }

  get awareness() {
    return this.wsProvider?.awareness ?? null;
  }

  get connected() {
    return !!this.wsProvider?.wsconnected;
  }

  destroy() {
    this.wsProvider?.destroy();
    this.persistence?.destroy();
    this.doc.destroy();
  }
}
