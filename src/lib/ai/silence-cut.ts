"use client";

import type { YjsTimeline, ClipData } from "@/lib/timeline/YjsTimeline";
import type { SilenceRegion } from "./silence";
import { splitClipAt } from "@/lib/timeline/ops";

function nanoid() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Apply silence regions to the timeline:
 *  1. For every clip intersecting a silence region, split at each silence edge
 *  2. Delete the sub-clips that fall entirely inside a silence region
 *  3. Ripple-shift remaining clips left to close the gap (per track)
 *
 * Silence regions are expressed in *source* seconds of the original media.
 * They are translated into timeline seconds via each clip's sourceIn mapping.
 */
export function applySilenceCut(
  tl: YjsTimeline,
  assetId: string,
  regions: SilenceRegion[]
): { removed: number; totalSec: number } {
  if (regions.length === 0) return { removed: 0, totalSec: 0 };

  let removed = 0;
  let totalSec = 0;

  tl.doc.transact(() => {
    // 1. Split clips at region edges
    const sourceClips = Array.from(tl.clips.values()).filter(
      (c) => c.assetId === assetId
    );

    for (const r of regions) {
      for (const c of sourceClips) {
        const edgeStart = c.start + (r.start - c.sourceIn);
        const edgeEnd = c.start + (r.end - c.sourceIn);
        if (edgeStart > c.start + 0.05 && edgeStart < c.start + c.duration - 0.05) {
          splitClipAt(tl, c.id, edgeStart);
        }
      }
    }

    for (const r of regions) {
      for (const c of Array.from(tl.clips.values()).filter((x) => x.assetId === assetId)) {
        const edgeEnd = c.start + (r.end - c.sourceIn);
        if (edgeEnd > c.start + 0.05 && edgeEnd < c.start + c.duration - 0.05) {
          splitClipAt(tl, c.id, edgeEnd);
        }
      }
    }

    // 2. Delete clips whose *source* range lies inside any silence region
    const toRemove: ClipData[] = [];
    for (const c of Array.from(tl.clips.values())) {
      if (c.assetId !== assetId) continue;
      const srcStart = c.sourceIn;
      const srcEnd = c.sourceIn + c.duration;
      const inside = regions.some(
        (r) => srcStart >= r.start - 0.01 && srcEnd <= r.end + 0.01
      );
      if (inside) toRemove.push(c);
    }
    // remove in place — no ripple yet, we do a full re-pack below
    for (const c of toRemove) {
      tl.clips.delete(c.id);
      totalSec += c.duration;
      removed++;
    }

    // 3. Re-pack each track: preserve relative order, close gaps
    const trackIds = new Set(Array.from(tl.tracks.values()).map((t) => t.id));
    for (const trackId of trackIds) {
      const onTrack = Array.from(tl.clips.values())
        .filter((c) => c.trackId === trackId)
        .sort((a, b) => a.start - b.start);
      let cursor = 0;
      for (const c of onTrack) {
        if (c.start !== cursor) {
          tl.clips.set(c.id, { ...c, start: cursor });
        }
        cursor += c.duration;
      }
    }
  });

  void nanoid;
  return { removed, totalSec };
}
