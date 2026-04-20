"use client";

import type { CaptionSegment, CaptionWord } from "@/lib/captions/schema";
import type { YjsTimeline } from "@/lib/timeline/YjsTimeline";
import { applySilenceCut } from "./silence-cut";
import type { SilenceRegion } from "./silence";

export const FILLERS = new Set([
  "um", "umm", "uh", "uhh", "erm", "er", "ah", "eh", "hm", "hmm",
  "like", "literally", "basically", "actually", "sorta", "kinda",
  "you", "know", "i", "mean", "right", "okay",
]);

// Bigrams that together feel like filler ("you know", "i mean")
const FILLER_PHRASES = [
  ["you", "know"],
  ["i", "mean"],
  ["sort", "of"],
  ["kind", "of"],
];

function normalize(w: string) {
  return w.toLowerCase().replace(/[^a-z']/g, "");
}

export interface FillerHit {
  start: number;
  end: number;
  text: string;
}

export function findFillers(segments: CaptionSegment[]): FillerHit[] {
  const flat: CaptionWord[] = segments.flatMap((s) => s.words);
  const hits: FillerHit[] = [];

  for (let i = 0; i < flat.length; i++) {
    const w = normalize(flat[i].text);
    if (!w) continue;

    // Phrase match first (2-word)
    if (i + 1 < flat.length) {
      const next = normalize(flat[i + 1].text);
      const match = FILLER_PHRASES.find(([a, b]) => a === w && b === next);
      if (match) {
        hits.push({
          start: flat[i].start,
          end: flat[i + 1].end,
          text: `${flat[i].text} ${flat[i + 1].text}`,
        });
        i++;
        continue;
      }
    }
    if (FILLERS.has(w)) {
      hits.push({ start: flat[i].start, end: flat[i].end, text: flat[i].text });
    }
  }
  return hits;
}

/**
 * Remove filler words from:
 *   1. The caption track (so they stop rendering)
 *   2. The video/audio timeline (via silence-cut helper)
 */
export function removeFillers(
  tl: YjsTimeline,
  segments: CaptionSegment[],
  assetId: string
): { count: number; seconds: number } {
  const hits = findFillers(segments);
  if (hits.length === 0) return { count: 0, seconds: 0 };

  // 1) filter caption words
  const cleaned = segments
    .map((seg) => {
      const words = seg.words.filter(
        (w) => !hits.some((h) => Math.abs(h.start - w.start) < 0.01 && Math.abs(h.end - w.end) < 0.01)
      );
      if (words.length === 0) return null;
      return {
        ...seg,
        start: words[0].start,
        end: words[words.length - 1].end,
        words,
      };
    })
    .filter((s): s is CaptionSegment => s !== null);
  tl.setCaptions(cleaned);

  // 2) cut media
  const regions: SilenceRegion[] = hits.map((h) => ({
    start: Math.max(0, h.start - 0.02),
    end: h.end + 0.02,
  }));
  const res = applySilenceCut(tl, assetId, regions);
  return { count: hits.length, seconds: res.totalSec };
}
