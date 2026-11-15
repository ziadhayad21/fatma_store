import { describe, expect, it } from "vitest";
import { DESIGN_MAX_BYTES, normalizeName, validateDesignFile, validateName } from "./personalization";

describe("validateName", () => {
  it("accepts Arabic, Latin, digits and spaces", () => {
    for (const n of ["فاطمة", "Fatma", "Chef 2", "ام يوسف", "A-B"]) expect(validateName(n).ok).toBe(true);
  });
  it("rejects empty / whitespace only", () => {
    expect(validateName("").ok).toBe(false);
    expect(validateName("   ").ok).toBe(false);
  });
  it("enforces 18 characters (counting letters, not UTF-16 units)", () => {
    expect(validateName("ا".repeat(18)).ok).toBe(true);
    expect(validateName("ا".repeat(19)).ok).toBe(false);
  });
  it("rejects markup and control characters", () => {
    for (const n of ["<b>x</b>", "a\u0000b", "x;drop", "a/b"]) expect(validateName(n).ok).toBe(false);
  });
  it("normalizes whitespace", () => {
    expect(normalizeName("  Fa   tma ")).toBe("Fa tma");
  });
});

describe("validateDesignFile", () => {
  it("accepts png/jpg/webp up to 10MB", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(validateDesignFile({ type, size: DESIGN_MAX_BYTES }).ok).toBe(true);
    }
  });
  it("rejects other types, empty and oversized files with Arabic messages", () => {
    const gif = validateDesignFile({ type: "image/gif", size: 10 });
    const big = validateDesignFile({ type: "image/png", size: DESIGN_MAX_BYTES + 1 });
    expect(gif.ok).toBe(false);
    expect(big.ok).toBe(false);
    if (!gif.ok) expect(gif.error).toMatch(/PNG/);
    if (!big.ok) expect(big.error).toMatch(/10/);
    expect(validateDesignFile({ type: "image/png", size: 0 }).ok).toBe(false);
  });
});
