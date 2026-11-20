import { describe, expect, it } from "vitest";
import { cleanSuggestion, relativeTime, SUGGESTION_MAX } from "./suggestions";

describe("cleanSuggestion", () => {
  it("trims and keeps the text", () => {
    expect(cleanSuggestion("  عايزين مريلة أطفال \n")).toEqual({ ok: true, text: "عايزين مريلة أطفال" });
  });
  it("rejects empty / blank, too short and over-long text", () => {
    for (const v of ["", "   \n\t", null, undefined, "اه", " ok "]) expect(cleanSuggestion(v).ok).toBe(false);
    expect(cleanSuggestion("حلو").ok).toBe(true);
    expect(cleanSuggestion("ا".repeat(SUGGESTION_MAX)).ok).toBe(true);
    expect(cleanSuggestion("ا".repeat(SUGGESTION_MAX + 1)).ok).toBe(false);
  });
  it("strips control characters but keeps line breaks", () => {
    expect(cleanSuggestion("a\u0000b\u0007\nc\n\n\n\nd")).toEqual({ ok: true, text: "ab\nc\n\nd" });
  });
  it("rejects links", () => {
    for (const v of ["شوفوا https://x.y", "زوروا www.shop", "عندي example.com", "كلموني wa.me/123", "bit.ly/abc", "موقعي fatma . com"]) {
      expect(cleanSuggestion(v)).toEqual({ ok: false, error: "من فضلك اكتب اقتراحك من غير لينكات." });
    }
  });
  it("rejects phone numbers (Latin or Arabic digits, with separators)", () => {
    for (const v of ["كلموني 01012345678", "رقمي ٠١٠١٢٣٤٥٦٧٨", "+20 100 123 4567", "010-1234-5678"]) {
      expect(cleanSuggestion(v)).toEqual({ ok: false, error: "من فضلك اكتب اقتراحك من غير أرقام تليفونات." });
    }
  });
  it("keeps ordinary numbers and dots", () => {
    for (const v of ["عايزين مريلة مقاس 2 و 3 سنين", "فوطة 50×70. وكمان لون أخضر", "سعر 150 كويس", "سنة 2026"]) {
      expect(cleanSuggestion(v).ok).toBe(true);
    }
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  const ago = (ms: number) => relativeTime(new Date(now - ms).toISOString(), now);
  const MIN = 60_000, H = 60 * MIN, D = 24 * H;
  it("speaks Egyptian Arabic", () => {
    expect(ago(10_000)).toBe("دلوقتي");
    expect(ago(MIN)).toBe("من دقيقة");
    expect(ago(2 * MIN)).toBe("من دقيقتين");
    expect(ago(5 * MIN)).toBe("من 5 دقايق");
    expect(ago(25 * MIN)).toBe("من 25 دقيقة");
    expect(ago(H)).toBe("من ساعة");
    expect(ago(3 * H)).toBe("من 3 ساعات");
    expect(ago(2 * D)).toBe("من يومين");
    expect(ago(12 * D)).toBe("من 12 يوم");
    expect(ago(65 * D)).toBe("من شهرين");
    expect(ago(400 * D)).toBe("من سنة");
    expect(relativeTime("not a date", now)).toBe("");
  });
});
