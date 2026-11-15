import { describe, expect, it } from "vitest";
import { cleanCustomer, normalizePhone, validateCustomer } from "./checkout";
import { governorates } from "./governorates";

describe("normalizePhone", () => {
  it("handles Arabic digits, spaces, +20 and 0020", () => {
    expect(normalizePhone("٠١٠١٢٣٤٥٦٧٨")).toBe("01012345678");
    expect(normalizePhone("010 1234-5678")).toBe("01012345678");
    expect(normalizePhone("+20 10 1234 5678")).toBe("01012345678");
    expect(normalizePhone("0020 10 1234 5678")).toBe("01012345678");
  });
});

describe("validateCustomer", () => {
  const ok = cleanCustomer({ name: "فاطمة أحمد", phone: "01112345678", governorate: "القاهرة", area: "مدينة نصر", address: "12 شارع التسعين", notes: "" });
  it("accepts a valid customer", () => expect(validateCustomer(ok)).toEqual({}));
  it("accepts the four mobile prefixes only", () => {
    for (const p of ["010", "011", "012", "015"]) expect(validateCustomer({ ...ok, phone: `${p}12345678` }).phone).toBeUndefined();
    for (const p of ["013", "014", "016", "020"]) expect(validateCustomer({ ...ok, phone: `${p}12345678` }).phone).toBeDefined();
    expect(validateCustomer({ ...ok, phone: "0101234567" }).phone).toBeDefined();
  });
  it("requires a known governorate and the other fields", () => {
    const bad = validateCustomer({ ...ok, governorate: "Atlantis", name: "", area: "", address: "ab" });
    expect(Object.keys(bad).sort()).toEqual(["address", "area", "governorate", "name"]);
  });
  it("has exactly 27 governorates", () => expect(new Set(governorates).size).toBe(27));
});
