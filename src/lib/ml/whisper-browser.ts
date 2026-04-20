"use client";

/**
 * Whisper-Turbo (or Whisper-tiny fallback) in the browser via Transformers.js.
 * Runs on WebGPU when available, falls back to WASM. Model is cached after first download.
 */

import type { CaptionSegment, CaptionWord } from "@/lib/captions/schema";

type PipelineFn = (
  audio: Float32Array | AudioBuffer,
  opts: Record<string, unknown>
) => Promise<WhisperOutput>;

type WhisperOutput = {
  text?: string;
  chunks?: Array<{ text: string; timestamp: [number | null, number | null] }>;
};

export interface TranscribeOptions {
  model?: string;
  language?: string;
  onProgress?: (status: string, pct?: number) => void;
  signal?: AbortSignal;
}

let pipelinePromise: Promise<PipelineFn> | null = null;

async function getPipeline(model: string, onProgress?: TranscribeOptions["onProgress"]) {
  if (pipelinePromise) return pipelinePromise;
  pipelinePromise = (async () => {
    const mod = await import("@huggingface/transformers");
    const { pipeline, env } = mod as unknown as {
      pipeline: (
        task: string,
        model: string,
        opts: Record<string, unknown>
      ) => Promise<PipelineFn>;
      env: { allowLocalModels: boolean; backends: { onnx: { wasm: { proxy: boolean } } } };
    };
    env.allowLocalModels = false;
    env.backends.onnx.wasm.proxy = true;

    const device = (await hasWebGPU()) ? "webgpu" : "wasm";
    onProgress?.(`loading model (${device})`, 0);

    return pipeline("automatic-speech-recognition", model, {
      dtype: device === "webgpu" ? "fp16" : "q8",
      device,
      progress_callback: (p: { status: string; progress?: number }) => {
        onProgress?.(p.status, p.progress);
      },
    });
  })();
  return pipelinePromise;
}

async function hasWebGPU(): Promise<boolean> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

/** Decode any media file to 16kHz mono Float32Array, which is what Whisper wants. */
export async function decodeTo16kMono(file: Blob | string): Promise<Float32Array> {
  const arrayBuf =
    typeof file === "string"
      ? await fetch(file).then((r) => r.arrayBuffer())
      : await file.arrayBuffer();

  const ctx = new OfflineAudioContext(1, 16000, 16000);
  // Use a temporary AudioContext to decode (some browsers don't decode on OfflineAudioContext)
  const tmp = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const decoded = await tmp.decodeAudioData(arrayBuf.slice(0));
  tmp.close();

  const src = ctx.createBufferSource();
  src.buffer = decoded;
  src.connect(ctx.destination);
  src.start();
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice();
}

export async function transcribe(
  source: Blob | string,
  opts: TranscribeOptions = {}
): Promise<CaptionSegment[]> {
  const model = opts.model ?? "onnx-community/whisper-base_timestamped";
  const { onProgress } = opts;
  onProgress?.("decoding audio");
  const audio = await decodeTo16kMono(source);

  onProgress?.("loading model");
  const asr = await getPipeline(model, onProgress);

  onProgress?.("transcribing");
  const result = await asr(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: "word",
    language: opts.language,
  });

  const chunks = result.chunks ?? [];
  return groupIntoSegments(chunks);
}

function groupIntoSegments(
  chunks: Array<{ text: string; timestamp: [number | null, number | null] }>
): CaptionSegment[] {
  const words: CaptionWord[] = chunks
    .filter((c) => c.timestamp[0] != null && c.timestamp[1] != null && c.text.trim())
    .map((c) => ({
      text: c.text.trim(),
      start: c.timestamp[0]!,
      end: c.timestamp[1]!,
      emphasis: isEmphasis(c.text),
    }));

  const segments: CaptionSegment[] = [];
  let cur: CaptionWord[] = [];
  let segStart = 0;
  const MAX_SEG = 3.5; // seconds per on-screen line
  const MAX_WORDS = 7;

  for (const w of words) {
    if (cur.length === 0) segStart = w.start;
    cur.push(w);
    const tooLong = w.end - segStart > MAX_SEG;
    const tooMany = cur.length >= MAX_WORDS;
    const endsClause = /[.!?,]$/.test(w.text);
    if (tooLong || tooMany || endsClause) {
      segments.push({
        id: Math.random().toString(36).slice(2, 10),
        start: segStart,
        end: w.end,
        words: cur,
        styleId: "ca-hormozi",
      });
      cur = [];
    }
  }
  if (cur.length) {
    segments.push({
      id: Math.random().toString(36).slice(2, 10),
      start: segStart,
      end: cur[cur.length - 1].end,
      words: cur,
      styleId: "ca-hormozi",
    });
  }
  return segments;
}

const EMPHASIS_RE = /^(never|always|must|don't|dont|first|new|free|now|stop|why|how|proof|secret|key|biggest|best|worst|love|hate)$/i;
function isEmphasis(text: string): boolean {
  return EMPHASIS_RE.test(text.replace(/[^a-zA-Z']/g, ""));
}
