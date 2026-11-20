/// <reference lib="webworker" />
// Compresses one image off the main thread (OffscreenCanvas). Message in: { id, file, plan }; out: { id, blob } | { id, error }.
import { encodeWithPlan, type CompressionPlan } from "./image-compress-core";

type In = { id: number; file: Blob; plan: CompressionPlan };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<In>) => void) | null;
  postMessage(message: unknown): void;
};

scope.onmessage = async (e) => {
  const { id, file, plan } = e.data;
  try {
    const blob = await encodeWithPlan(file, plan, (w, h) => {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      return {
        draw(bitmap, width, height) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(bitmap, 0, 0, width, height);
        },
        toBlob: (type, quality) => canvas.convertToBlob({ type, quality }),
      };
    });
    scope.postMessage({ id, blob });
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
