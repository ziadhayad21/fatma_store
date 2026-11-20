import { afterEach, describe, expect, it, vi } from "vitest";
import { compressionPlan, encodeWithPlan, fitWithin, formatBytes, renameForType, type Surface } from "./image-compress-core";

describe("compression rules per upload type", () => {
  it("designs: never re-encoded unless the long side is over 4000px", () => {
    expect(compressionPlan("design", { width: 3999, height: 2000, type: "image/png" })).toEqual({ action: "keep" });
    expect(compressionPlan("design", { width: 4000, height: 4000, type: "image/jpeg" })).toEqual({ action: "keep" });
  });
  it("designs over 4000px are scaled down in their own format, lossless for PNG", () => {
    expect(compressionPlan("design", { width: 8000, height: 6000, type: "image/png" })).toEqual({
      action: "encode", width: 4000, height: 3000, targets: [{ type: "image/png" }], keepSmallerOriginal: false,
    });
    expect(compressionPlan("design", { width: 3000, height: 6000, type: "image/jpeg" })).toMatchObject({ width: 2000, height: 4000, targets: [{ type: "image/jpeg", quality: 0.95 }] });
    expect(compressionPlan("design", { width: 5000, height: 5000, type: "image/webp" })).toMatchObject({ targets: [{ type: "image/webp", quality: 1 }] });
    // a design is never turned into another (lossy) format
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      const plan = compressionPlan("design", { width: 9000, height: 9000, type });
      expect(plan.action === "encode" && plan.targets.map((t) => t.type)).toEqual([type]);
    }
  });
  it("deposit proofs: max 1280px, WebP 0.7 with a JPEG fallback, retried down towards 200 KB", () => {
    expect(compressionPlan("proof", { width: 4032, height: 3024, type: "image/jpeg" })).toEqual({
      action: "encode", width: 1280, height: 960,
      targets: [{ type: "image/webp", quality: 0.7 }, { type: "image/jpeg", quality: 0.7 }],
      targetBytes: 200 * 1024, retryQualities: [0.55, 0.4], keepSmallerOriginal: false,
    });
    expect(compressionPlan("proof", { width: 900, height: 1600, type: "image/png" })).toMatchObject({ width: 720, height: 1280 });
  });
  it("product photos: max 2000px, WebP 0.82 (JPEG 0.85 fallback), aspect ratio kept", () => {
    expect(compressionPlan("product", { width: 3000, height: 4000, type: "image/jpeg" })).toEqual({
      action: "encode", width: 1500, height: 2000,
      targets: [{ type: "image/webp", quality: 0.82 }, { type: "image/jpeg", quality: 0.85 }],
      keepSmallerOriginal: false,
    });
    // already small enough: re-encoded, but the original wins if it is smaller
    expect(compressionPlan("product", { width: 1200, height: 1600, type: "image/webp" })).toMatchObject({ width: 1200, height: 1600, keepSmallerOriginal: true });
  });
  it("fits inside the long side without upscaling", () => {
    expect(fitWithin(500, 300, 1280)).toEqual({ width: 500, height: 300, resized: false });
    expect(fitWithin(2561, 1440, 1280)).toEqual({ width: 1280, height: 720, resized: true });
  });
  it("names and sizes", () => {
    expect(renameForType("IMG_2041.JPG", "image/webp")).toBe("IMG_2041.webp");
    expect(renameForType("logo", "image/png")).toBe("logo.png");
    expect(formatBytes(180 * 1024)).toBe("180 KB");
    expect(formatBytes(1.4 * 1024 * 1024)).toBe("1.4 MB");
  });
});

describe("encodeWithPlan", () => {
  const bitmap = { width: 10, height: 10, close: vi.fn() };
  afterEach(() => vi.unstubAllGlobals());
  /** a fake canvas: `sizes[type]` gives the output size per quality; unsupported types come back as PNG */
  const surface = (supported: string[], size: (type: string, q?: number) => number) => {
    const calls: string[] = [];
    const make = (): Surface => ({
      draw: () => {},
      toBlob: async (type, q) => {
        calls.push(`${type}@${q ?? "-"}`);
        const t = supported.includes(type) ? type : "image/png";
        return new Blob([new Uint8Array(size(t, q))], { type: t });
      },
    });
    return { make, calls };
  };
  const src = (bytes: number, type = "image/jpeg") => new Blob([new Uint8Array(bytes)], { type });

  it("keeps lowering a proof's quality until it is under the target", async () => {
    vi.stubGlobal("createImageBitmap", async () => bitmap);
    const plan = compressionPlan("proof", { width: 4000, height: 3000, type: "image/jpeg" });
    const s = surface(["image/webp", "image/jpeg"], (_t, q) => (q === 0.7 ? 400_000 : q === 0.55 ? 260_000 : 150_000));
    const out = await encodeWithPlan(src(3_000_000), plan, s.make);
    expect(out?.type).toBe("image/webp");
    expect(out?.size).toBe(150_000);
    expect(s.calls).toEqual(["image/webp@0.7", "image/webp@0.55", "image/webp@0.4"]);
  });
  it("falls back to JPEG where WebP cannot be encoded", async () => {
    vi.stubGlobal("createImageBitmap", async () => bitmap);
    const plan = compressionPlan("product", { width: 4000, height: 3000, type: "image/jpeg" });
    const s = surface(["image/jpeg"], () => 300_000);
    const out = await encodeWithPlan(src(4_000_000), plan, s.make);
    expect(out?.type).toBe("image/jpeg");
    expect(s.calls).toEqual(["image/webp@0.82", "image/jpeg@0.85"]);
  });
  it("keeps the original product photo when re-encoding would make it bigger", async () => {
    vi.stubGlobal("createImageBitmap", async () => bitmap);
    const plan = compressionPlan("product", { width: 1200, height: 900, type: "image/webp" });
    const s = surface(["image/webp"], () => 90_000);
    expect(await encodeWithPlan(src(60_000, "image/webp"), plan, s.make)).toBeNull();
  });
  it("a design under 4000px is never decoded at all", async () => {
    const spy = vi.fn();
    vi.stubGlobal("createImageBitmap", spy);
    expect(await encodeWithPlan(src(9_000_000, "image/png"), compressionPlan("design", { width: 3000, height: 3000, type: "image/png" }), surface([], () => 0).make)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
