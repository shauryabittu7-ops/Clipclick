import type { YjsTimeline, ClipData } from "./YjsTimeline";

export const SNAP_PX = 8;

export function snapTime(
  t: number,
  zoom: number,
  candidates: number[],
  ignoreIds: Set<string> = new Set()
): number {
  const thresholdSec = SNAP_PX / zoom;
  let best = t;
  let bestDist = thresholdSec;
  for (const c of candidates) {
    const d = Math.abs(c - t);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  void ignoreIds;
  return Math.max(0, best);
}

export function snapCandidates(tl: YjsTimeline, playhead: number, exclude?: string): number[] {
  const out: number[] = [0, playhead];
  for (const c of tl.clips.values()) {
    if (c.id === exclude) continue;
    out.push(c.start, c.start + c.duration);
  }
  return out;
}

export function splitClipAt(tl: YjsTimeline, clipId: string, time: number) {
  const c = tl.clips.get(clipId);
  if (!c) return;
  const local = time - c.start;
  if (local <= 0.05 || local >= c.duration - 0.05) return;
  const newId = Math.random().toString(36).slice(2, 10);
  tl.doc.transact(() => {
    tl.clips.set(clipId, { ...c, duration: local, sourceOut: c.sourceIn + local });
    const right: ClipData = {
      ...c,
      id: newId,
      start: c.start + local,
      duration: c.duration - local,
      sourceIn: c.sourceIn + local,
    };
    tl.clips.set(newId, right);
  });
}

export function splitAtPlayhead(tl: YjsTimeline, playhead: number) {
  const targets = Array.from(tl.clips.values()).filter(
    (c) => playhead > c.start + 0.05 && playhead < c.start + c.duration - 0.05
  );
  for (const c of targets) splitClipAt(tl, c.id, playhead);
}

export function rippleDelete(tl: YjsTimeline, clipId: string) {
  const c = tl.clips.get(clipId);
  if (!c) return;
  const removed = c.duration;
  const rightEdge = c.start + c.duration;
  tl.doc.transact(() => {
    tl.clips.delete(clipId);
    for (const other of Array.from(tl.clips.values())) {
      if (other.trackId === c.trackId && other.start >= rightEdge - 0.001) {
        tl.clips.set(other.id, { ...other, start: other.start - removed });
      }
    }
  });
}

export function moveClip(tl: YjsTimeline, clipId: string, newStart: number) {
  const c = tl.clips.get(clipId);
  if (!c) return;
  tl.clips.set(clipId, { ...c, start: Math.max(0, newStart) });
}

export function trimLeft(tl: YjsTimeline, clipId: string, newStart: number) {
  const c = tl.clips.get(clipId);
  if (!c) return;
  const oldEnd = c.start + c.duration;
  const start = Math.max(0, Math.min(newStart, oldEnd - 0.1));
  const delta = start - c.start;
  tl.clips.set(clipId, {
    ...c,
    start,
    duration: c.duration - delta,
    sourceIn: Math.max(0, c.sourceIn + delta),
  });
}

export function trimRight(tl: YjsTimeline, clipId: string, newEnd: number) {
  const c = tl.clips.get(clipId);
  if (!c) return;
  const end = Math.max(c.start + 0.1, newEnd);
  const duration = end - c.start;
  tl.clips.set(clipId, {
    ...c,
    duration,
    sourceOut: c.sourceIn + duration,
  });
}
