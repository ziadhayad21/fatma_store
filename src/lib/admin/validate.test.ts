import { describe, expect, it } from "vitest";
import { isAllowedImageSrc, parseImages, parseMoney, SLUG_RE } from "./validate";

const ORIGIN = "https://abc.supabase.co";

describe("parseMoney", () => {
  it("parses numbers, Arabic digits and blanks", () => {
    expect(parseMoney("125")).toBe(125);
    expect(parseMoney("12.5")).toBe(12.5);
    expect(parseMoney("١٢٥")).toBe(125);
    expect(parseMoney("  ")).toBe("blank");
  });
  it("rejects negatives, junk, too many decimals and absurd values", () => {
    for (const v of ["-1", "abc", "1.234", "1e3", "100001", "1,5"]) expect(parseMoney(v)).toBeNull();
  });
});

describe("slug", () => {
  it("accepts lowercase-kebab only", () => {
    for (const s of ["chef-apron", "bag2", "a"]) expect(SLUG_RE.test(s)).toBe(true);
    for (const s of ["Chef", "a b", "-a", "a-", "a--b", "فوطة", ""]) expect(SLUG_RE.test(s)).toBe(false);
  });
});

describe("image sources", () => {
  it("allows bundled product photos and this project's public bucket only", () => {
    expect(isAllowedImageSrc("/products/apron-chef.jpg", ORIGIN)).toBe(true);
    expect(isAllowedImageSrc(`${ORIGIN}/storage/v1/object/public/product-images/products/x.webp`, ORIGIN)).toBe(true);
    for (const bad of [
      "https://evil.com/x.jpg",
      `${ORIGIN}/storage/v1/object/public/designs/uploads/x.png`,
      `${ORIGIN}/storage/v1/object/public/product-images/../designs/x.png`,
      "/products/../secret.jpg",
      "javascript:alert(1)",
      "/products/x.svg",
    ]) expect(isAllowedImageSrc(bad, ORIGIN)).toBe(false);
  });
  it("validates the images JSON", () => {
    const ok = parseImages(JSON.stringify([{ src: "/products/a.jpg", alt: "x", position: "center 40%" }]), ORIGIN);
    expect(ok.ok).toBe(true);
    expect(parseImages("not json", ORIGIN).ok).toBe(false);
    expect(parseImages(JSON.stringify([{ src: "/products/a.jpg", alt: "", position: "url(x)" }]), ORIGIN).ok).toBe(false);
    expect(parseImages(JSON.stringify(Array(9).fill({ src: "/products/a.jpg" })), ORIGIN).ok).toBe(false);
  });
});
