import { governorates } from "./governorates";

/** Customer-details rules shared by the checkout form (UX) and the server action (authority). */

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXT_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** "٠١٠ 1234-5678", "+20 10 1234 5678" → "01012345678" */
export function normalizePhone(raw: string): string {
  let s = raw.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d))).replace(/[۰-۹]/g, (d) => String(EXT_INDIC.indexOf(d)));
  s = s.replace(/[\s\-().]/g, "");
  if (s.startsWith("+20")) s = "0" + s.slice(3);
  else if (s.startsWith("0020")) s = "0" + s.slice(4);
  return s;
}

export const PHONE_RE = /^01[0125]\d{8}$/;

export type CustomerInput = {
  name: string;
  phone: string;
  governorate: string;
  area: string;
  address: string;
  notes: string;
};

export type CustomerErrors = Partial<Record<keyof CustomerInput, string>>;

const clean = (v: unknown) => String(v ?? "").normalize("NFC").replace(/\s+/g, " ").trim();

export function cleanCustomer(raw: Partial<Record<keyof CustomerInput, unknown>>): CustomerInput {
  return {
    name: clean(raw.name),
    phone: normalizePhone(String(raw.phone ?? "")),
    governorate: clean(raw.governorate),
    area: clean(raw.area),
    address: clean(raw.address),
    notes: String(raw.notes ?? "").normalize("NFC").trim(),
  };
}

export function validateCustomer(c: CustomerInput): CustomerErrors {
  const e: CustomerErrors = {};
  if (c.name.length < 2) e.name = "اكتب اسمك بالكامل.";
  else if (c.name.length > 120) e.name = "الاسم طويل جدًا.";
  if (!PHONE_RE.test(c.phone)) e.phone = "اكتب رقم موبايل مصري صحيح (مثال: 01012345678).";
  if (!(governorates as readonly string[]).includes(c.governorate)) e.governorate = "اختار المحافظة.";
  if (c.area.length < 1) e.area = "اكتب المنطقة.";
  else if (c.area.length > 120) e.area = "المنطقة طويلة جدًا.";
  if (c.address.length < 3) e.address = "اكتب العنوان بالتفصيل.";
  else if (c.address.length > 500) e.address = "العنوان طويل جدًا.";
  if (c.notes.length > 1000) e.notes = "الملاحظات طويلة جدًا.";
  return e;
}
