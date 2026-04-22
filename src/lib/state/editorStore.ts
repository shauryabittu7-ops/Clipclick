"use client";

import { create } from "zustand";
import { YjsTimeline, type ClipData } from "@/lib/timeline/YjsTimeline";

interface EditorState {
  timeline: YjsTimeline | null;
  playhead: number;
  playing: boolean;
  zoom: number; // pixels per second
  selectedClipId: string | null;
  tick: number; // bumped on Yjs change to force re-render
  exportOpen: boolean;
  /** Audio peak data keyed by assetId — NOT stored in Yjs (too large). */
  waveforms: Map<string, Float32Array>;
  openExport: () => void;
  closeExport: () => void;
  init: (projectId: string, opts?: { readOnly?: boolean }) => void;
  setPlayhead: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setZoom: (z: number) => void;
  select: (id: string | null) => void;
  addClip: (clip: ClipData) => void;
  setWaveform: (assetId: string, peaks: Float32Array) => void;
}

export const useEditor = create<EditorState>((set, get) => ({
  timeline: null,
  playhead: 0,
  playing: false,
  zoom: 80,
  selectedClipId: null,
  tick: 0,
  exportOpen: false,
  waveforms: new Map(),
  openExport: () => set({ exportOpen: true }),
  closeExport: () => set({ exportOpen: false }),
  init: (projectId, opts) => {
    if (get().timeline) return;
    const tl = new YjsTimeline(projectId, { readOnly: opts?.readOnly });
    const bump = () => set((s) => ({ tick: s.tick + 1 }));
    tl.clips.observe(bump);
    tl.tracks.observe(bump);
    tl.assets.observe(bump);
    tl.meta.observe(bump);
    tl.captions.observe(bump);
    set({ timeline: tl });
  },
  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (p) => set({ playing: p }),
  setZoom: (z) => set({ zoom: Math.max(10, Math.min(400, z)) }),
  select: (id) => set({ selectedClipId: id }),
  addClip: (clip) => get().timeline?.addClip(clip),
  setWaveform: (assetId, peaks) =>
    set((s) => {
      const next = new Map(s.waveforms);
      next.set(assetId, peaks);
      return { waveforms: next };
    }),
}));
