import { describe, expect, it } from "vitest";
import { catalogSlug, slugWithSuffix } from "./slug";

describe("product slugs (generated from the name on create)", () => {
  it("transliterates Arabic to lowercase Latin with hyphens", () => {
    expect(catalogSlug("مريلة مطبخ", "product")).toBe("mryla-mtbkh");
    expect(catalogSlug("مريلة Chef  كلاسيك!", "product")).toBe("mryla-chef-klasyk");
    expect(catalogSlug("فوطة ٣ ألوان", "product")).toBe("fwta-3-alwan");
  });
  it("falls back to the kind when nothing usable is left", () => {
    expect(catalogSlug("!!!", "product")).toBe("product");
  });
  it("makes room for a uniqueness suffix (-2, -3…) within the length limit", () => {
    expect(slugWithSuffix("mryla-mtbkh", "product", "2")).toBe("mryla-mtbkh-2");
    const long = "a".repeat(80);
    expect(slugWithSuffix(long, "product", "3")).toHaveLength(80);
    expect(slugWithSuffix(long, "product", "3").endsWith("-3")).toBe(true);
  });
});
