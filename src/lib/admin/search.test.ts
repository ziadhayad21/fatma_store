import { describe, expect, it } from "vitest";
import { orderSearchFilter } from "./search";

describe("orderSearchFilter", () => {
  it("returns null for empty input", () => expect(orderSearchFilter("   ")).toBeNull());
  it("matches an order number with or without #", () => {
    expect(orderSearchFilter("1005")).toContain("number.eq.1005");
    expect(orderSearchFilter("#1005")).toContain("number.eq.1005");
  });
  it("matches phones, including Arabic digits and +20", () => {
    expect(orderSearchFilter("01012345678")).toContain("phone.ilike.%01012345678%");
    expect(orderSearchFilter("٠١٠١٢٣٤٥")).toContain("phone.ilike.%0101234");
    expect(orderSearchFilter("+201012345678")).toContain("phone.ilike.%01012345678%");
  });
  it("matches customer names", () => expect(orderSearchFilter("فاطمة")).toBe("customer_name.ilike.%فاطمة%"));
  it("cannot inject extra filter clauses", () => {
    const f = orderSearchFilter("x%,status.eq.new),(phone.like.*")!;
    // one clause only (all commas were removed from the user text) and no filter syntax characters survive
    expect(f.split(",")).toHaveLength(1);
    expect(f.split(",").every((c) => /^(number|phone|customer_name)./.test(c))).toBe(true);
    expect(f).not.toMatch(/[()*"]/);
  });
});
