import { describe, expect, it } from "vitest";
import { cleanSuggestion, SUGGESTION_MAX } from "./suggestions";

describe("cleanSuggestion", () => {
  it("trims and keeps the text", () => {
    expect(cleanSuggestion("  عايزين مريلة أطفال \n")).toEqual({ ok: true, text: "عايزين مريلة أطفال" });
  });
  it("rejects empty / blank and over-long text", () => {
    for (const v of ["", "   \n\t", null, undefined]) expect(cleanSuggestion(v).ok).toBe(false);
    expect(cleanSuggestion("ا".repeat(SUGGESTION_MAX)).ok).toBe(true);
    expect(cleanSuggestion("ا".repeat(SUGGESTION_MAX + 1)).ok).toBe(false);
  });
  it("strips control characters but keeps line breaks", () => {
    expect(cleanSuggestion("a\u0000b\u0007\nc\n\n\n\nd")).toEqual({ ok: true, text: "ab\nc\n\nd" });
  });
});
