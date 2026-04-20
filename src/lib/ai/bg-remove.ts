"use client";

/**
 * Browser background removal via BiRefNet (Transformers.js `image-segmentation`).
 * Lazy-loaded; WebGPU-first. One image at a time to keep memory sane.
 */

let pipePromise: Promise<BgPipeline> | null = null;

type BgPipeline = (
  input: string | Blob | HTMLCanvasElement,
  opts?: Record<string, unknown>
) => Promise<Array<{ mask: { data: Uint8ClampedArray; width: number; height: number } }>>;

async function getPipeline(onProgress?: (s: string, p?: number) => void) {
  if (pipePromise) return pipePromise;
  pipePromise = (async () => {
    const mod = await import("@huggingface/transformers");
    const { pipeline, env } = mod as unknown as {
      pipeline: (task: string, model: string, opts: Record<string, unknown>) => Promise<BgPipeline>;
      env: { allowLocalModels: boolean };
    };
    env.allowLocalModels = false;
    const hasGpu = !!(navigator as unknown as { gpu?: unknown }).gpu;
    onProgress?.(`loading BiRefNet (${hasGpu ? "webgpu" : "wasm"})`, 0);
    return pipeline("image-segmentation", "briaai/RMBG-1.4", {
      device: hasGpu ? "webgpu" : "wasm",
      progress_callback: (p: { status: string; progress?: number }) =>
        onProgress?.(p.status, p.progress),
    });
  })();
  return pipePromise;
}

/** Returns a new Blob (PNG with alpha) where the background is removed. */
export async function removeBackground(
  src: Blob | HTMLImageElement | HTMLCanvasElement,
  onProgress?: (s: string, p?: number) => void
): Promise<Blob> {
  const pipe = await getPipeline(onProgress);
  onProgress?.("segmenting");

  // Prepare a canvas for the source so we can apply the mask
  const { canvas, imageData } = await toCanvas(src);

  const input: Blob | HTMLCanvasElement = src instanceof Blob ? src : canvas;
  const result = await pipe(input);
  const mask = result[0]?.mask;
  if (!mask) throw new Error("Segmentation returned no mask");

  // Resample mask to canvas dims if shape differs
  const masked = applyMask(imageData, mask, canvas.width, canvas.height);
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(masked, 0, 0);

  onProgress?.("encoding");
  return new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/png")
  );
}

async function toCanvas(
  src: Blob | HTMLImageElement | HTMLCanvasElement
): Promise<{ canvas: HTMLCanvasElement; imageData: ImageData }> {
  let img: HTMLImageElement;
  if (src instanceof HTMLCanvasElement) {
    const ctx = src.getContext("2d")!;
    return { canvas: src, imageData: ctx.getImageData(0, 0, src.width, src.height) };
  }
  if (src instanceof Blob) {
    img = await blobToImage(src);
  } else {
    img = src;
  }
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return { canvas, imageData: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

function blobToImage(b: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(b);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      res(img);
    };
    img.onerror = () => rej(new Error("image load failed"));
    img.src = url;
  });
}

function applyMask(
  imageData: ImageData,
  mask: { data: Uint8ClampedArray; width: number; height: number },
  w: number,
  h: number
): ImageData {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), w, h);
  const mw = mask.width;
  const mh = mask.height;
  const sameSize = mw === w && mh === h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mx = sameSize ? x : Math.floor((x * mw) / w);
      const my = sameSize ? y : Math.floor((y * mh) / h);
      const m = mask.data[my * mw + mx];
      const i = (y * w + x) * 4;
      out.data[i + 3] = m; // alpha from mask
    }
  }
  return out;
}
