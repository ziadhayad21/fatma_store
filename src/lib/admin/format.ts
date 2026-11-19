const adminTimeZone = "Africa/Cairo";
// One digit style across the admin: Latin digits, like prices, phone numbers and order numbers.
// Arabic month names stay ("19 نوفمبر 2026"). To switch the whole admin to ١٩ use "ar-EG" without -u-nu-latn.
const ADMIN_LOCALE = "ar-EG-u-nu-latn";
const fmt = new Intl.DateTimeFormat(ADMIN_LOCALE, {
  timeZone: adminTimeZone,
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat(ADMIN_LOCALE, {
  timeZone: adminTimeZone,
  day: "numeric",
  month: "long",
  year: "numeric",
});
/** "19 نوفمبر 2026، 4:30 م" (order details header) */
export const formatDate = (iso: string) => fmt.format(new Date(iso));
/** "19 نوفمبر 2026": tables and the invoice, date only */
export const formatDay = (iso: string) => dayFmt.format(new Date(iso));

const dayFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: adminTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const adminDateKey = (date: Date) => dayFormat.format(date);
const DAY_MS = 86_400_000;

// Return the first instant of the Cairo calendar day, including days that start
// with a daylight-saving clock change. For inclusive end dates, use the next day.
export function orderDateBoundary(date: string, nextDay = false): string | null {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date)) return null;
  const utc = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== date) return null;
  const target = utc.getTime() + (nextDay ? DAY_MS : 0);
  const targetDay = Number(dayFormat.format(target + DAY_MS / 2).replaceAll("-", ""));

  let start = target - DAY_MS;
  let end = target + DAY_MS;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    const middleDay = Number(dayFormat.format(middle).replaceAll("-", ""));
    if (middleDay < targetDay) start = middle + 1;
    else end = middle;
  }
  return new Date(start).toISOString();
}

/** 01012345678 -> https://wa.me/201012345678 */
export const whatsappUrl = (phone: string) => `https://wa.me/20${phone.replace(/^0/, "")}`;
