const fmt = new Intl.DateTimeFormat("ar-EG", {
  timeZone: "Africa/Cairo",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
export const formatDate = (iso: string) => fmt.format(new Date(iso));

/** 01012345678 -> https://wa.me/201012345678 */
export const whatsappUrl = (phone: string) => `https://wa.me/20${phone.replace(/^0/, "")}`;
