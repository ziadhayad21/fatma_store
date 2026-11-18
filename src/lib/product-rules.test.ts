import { describe, expect, it } from "vitest";
import { getItemCustomizationNote } from "./product-rules";

describe("getItemCustomizationNote", () => {
  it("returns the note for a single customized product", () => {
    const item = { name_snapshot: "مريلة الشيف", mode: "name" };
    const items = [item];
    const note = "Make the name smaller and place it in the center.";

    expect(getItemCustomizationNote(note, item, items)).toBe(
      "Make the name smaller and place it in the center.",
    );
  });

  it("strips redundant item name prefix if present on a single product", () => {
    const item = { name_snapshot: "مريلة الشيف", mode: "name" };
    const items = [item];
    const note = "مريلة الشيف: صغر الاسم واجعله في المنتصف";

    expect(getItemCustomizationNote(note, item, items)).toBe(
      "صغر الاسم واجعله في المنتصف",
    );
  });

  it("returns null for standard (non-customized) products", () => {
    const standardItem = { name_snapshot: "شنطة توت باج", mode: "standard" };
    const customizedItem = { name_snapshot: "مريلة الشيف", mode: "name" };
    const items = [standardItem, customizedItem];
    const note = "Make the name smaller";

    expect(getItemCustomizationNote(note, standardItem, items)).toBeNull();
  });

  it("correctly separates notes between multiple customized products", () => {
    const apron = { name_snapshot: "مريلة الشيف", mode: "name" };
    const towel = { name_snapshot: "فوطة قطنية", mode: "design" };
    const items = [apron, towel];
    const orderNotes = "مريلة الشيف: اكتب الاسم بخط رقعة صغير\n\nفوطة قطنية: اللوجو على الطرف اليمين";

    expect(getItemCustomizationNote(orderNotes, apron, items)).toBe(
      "اكتب الاسم بخط رقعة صغير",
    );
    expect(getItemCustomizationNote(orderNotes, towel, items)).toBe(
      "اللوجو على الطرف اليمين",
    );
  });

  it("matches by product slug when header contains the slug", () => {
    const apron = { name_snapshot: "مريلة", mode: "name" };
    const items = [apron];
    const note = "chef-apron: small font";

    expect(getItemCustomizationNote(note, apron, items, "chef-apron")).toBe(
      "small font",
    );
  });

  it("returns null when order has no customization notes or empty notes", () => {
    const item = { name_snapshot: "مريلة الشيف", mode: "name" };
    expect(getItemCustomizationNote(null, item, [item])).toBeNull();
    expect(getItemCustomizationNote("", item, [item])).toBeNull();
    expect(getItemCustomizationNote("   ", item, [item])).toBeNull();
  });
});
