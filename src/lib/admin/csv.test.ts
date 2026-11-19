import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

describe("csvCell", () => {
  it("quotes and escapes", () => {
    expect(csvCell('عايزين "مريلة"')).toBe('"عايزين ""مريلة"""');
  });
  it("neutralises spreadsheet formulas", () => {
    for (const v of ["=HYPERLINK(\"x\")", "+1", "-1+2", "@SUM(A1)", "\t=1", "\r=1"]) {
      expect(csvCell(v).startsWith(`"'`)).toBe(true);
    }
    expect(csvCell("مريلة أطفال")).toBe('"مريلة أطفال"');
  });
});
