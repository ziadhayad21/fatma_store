export const ORDER_STATUSES = ["new", "prepared", "shipped", "delivered", "cancelled", "returned"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const RETURN_REASON_MAX = 1000;

export const STATUS_AR: Record<OrderStatus, string> = {
  new: "جديد",
  prepared: "اتجهز",
  shipped: "اتشحن",
  delivered: "وصل",
  cancelled: "اتكنسل",
  returned: "رجع",
};

export const isOrderStatus = (v: unknown): v is OrderStatus =>
  typeof v === "string" && (ORDER_STATUSES as readonly string[]).includes(v);
