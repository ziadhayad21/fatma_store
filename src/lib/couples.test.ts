import { describe, expect, it } from "vitest";
import { couplesDetails, isCouples, lineDesignPaths, pieceLabels, pieceLine } from "./couples";
import { productRules } from "./product-rules";

describe("couples helpers", () => {
  it("detects couples products and their labels (with defaults)", () => {
    expect(isCouples({ pieces_count: 2 })).toBe(true);
    expect(isCouples({ pieces_count: 1 })).toBe(false);
    expect(isCouples({})).toBe(false);
    expect(pieceLabels({ pieces_count: 2, piece_labels: ["هو", "هي"] })).toEqual(["هو", "هي"]);
    expect(pieceLabels({ pieces_count: 2, piece_labels: null })).toEqual(["المريلة الأولى", "المريلة التانية"]);
    expect(pieceLabels({ pieces_count: 2, piece_labels: ["  ", 5] })).toEqual(["المريلة الأولى", "المريلة التانية"]);
  });

  it("writes one line per piece", () => {
    expect(pieceLine("المريلة الأولى", { colorName: "أسود", text: "Beso kitchen" }, "name")).toBe("المريلة الأولى: أسود — Beso kitchen");
    expect(pieceLine("المريلة التانية", { colorName: "وردي" }, "standard")).toBe("المريلة التانية: وردي");
    expect(pieceLine("المريلة الأولى", { colorName: "أبيض", designName: "logo.png" }, "design")).toBe("المريلة الأولى: أبيض — تصميم: logo.png");
    expect(couplesDetails(["أ", "ب"], "name", "kufi", [{ colorName: "أسود", text: "A" }, { colorName: "وردي", text: "B" }])).toEqual([
      "بأساميكم — خط كوفي",
      "أ: أسود — A",
      "ب: وردي — B",
    ]);
  });

  it("lists every design of a line", () => {
    expect(lineDesignPaths({ designPath: null, pieces: [{ color: null, text: null, designPath: "u/a.png", designName: null }, { color: null, text: null, designPath: "u/b.png", designName: null }] })).toEqual(["u/a.png", "u/b.png"]);
    expect(lineDesignPaths({ designPath: "u/c.png" })).toEqual(["u/c.png"]);
  });

  it("couples colour products get a (shared) font; normal colour products do not", () => {
    expect(productRules({ category_slug: "aprons", has_colors: true, pieces_count: 2 })).toMatchObject({ couples: true, font: true, colors: true });
    expect(productRules({ category_slug: "aprons", has_colors: true })).toMatchObject({ couples: false, font: false });
  });
});
