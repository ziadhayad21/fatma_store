import "server-only";

/**
 * Notification hook. Intentionally a no-op today: order notifications (email / WhatsApp / SMS) are a
 * paid add-on that is not part of the site yet.
 *
 * To add one later, implement a `Notifier` below and add it to `notifiers`. Each notifier runs after
 * the order is already saved, in isolation, with a time limit — a slow or throwing notifier can never
 * fail or delay the customer's checkout (see `onOrderPlaced`).
 */
export type PlacedOrder = {
  id: string;
  number: number;
  customerName: string;
  phone: string;
  governorate: string;
  area: string;
  address: string;
  notes: string;
  paymentMethod: string;
  subtotal: number;
  shipping: number;
  total: number;
  items: {
    productName: string;
    mode: "standard" | "name" | "design";
    text: string | null;
    font: string | null;
    qty: number;
    unitPrice: number;
  }[];
};

export type Notifier = { name: string; send: (order: PlacedOrder) => Promise<void> };

/** Register email / WhatsApp / SMS notifiers here. */
const notifiers: Notifier[] = [];

const TIMEOUT_MS = 3000;

/** Runs every notifier in isolation; exported so the guarantees can be tested with fake notifiers. */
export async function runNotifiers(list: Notifier[], order: PlacedOrder, timeoutMs = TIMEOUT_MS): Promise<void> {
  await Promise.all(
    list.map(async (n) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          n.send(order),
          new Promise<never>((_, rej) => {
            timer = setTimeout(() => rej(new Error("timeout")), timeoutMs);
          }),
        ]);
      } catch (e) {
        console.error(`notifier "${n.name}" failed for order #${order.number}`, e instanceof Error ? e.message : e);
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}

/** Called once by `placeOrder` after the order has been written. Never throws. */
export async function onOrderPlaced(order: PlacedOrder): Promise<void> {
  await runNotifiers(notifiers, order);
}
