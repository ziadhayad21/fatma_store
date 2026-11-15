export const ORDER_STATUSES = ["new", "confirmed", "printing", "shipped", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_AR: Record<OrderStatus, string> = {
  new: "جديد",
  confirmed: "اتأكد",
  printing: "تحت الطباعة",
  shipped: "اتشحن",
  delivered: "اتسلّم",
  cancelled: "اتلغى",
};

export const isOrderStatus = (v: unknown): v is OrderStatus =>
  typeof v === "string" && (ORDER_STATUSES as readonly string[]).includes(v);
