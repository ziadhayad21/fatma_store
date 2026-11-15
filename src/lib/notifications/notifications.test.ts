import { describe, expect, it, vi } from "vitest";
import { onOrderPlaced, runNotifiers, type Notifier, type PlacedOrder } from "./index";

const order: PlacedOrder = {
  id: "o1", number: 1001, customerName: "س", phone: "01012345678", governorate: "القاهرة", area: "م", address: "ش",
  notes: "", paymentMethod: "cod", subtotal: 100, shipping: 50, total: 150, items: [],
};

describe("order placed hook", () => {
  it("the default hook is a harmless no-op", async () => {
    await expect(onOrderPlaced(order)).resolves.toBeUndefined();
  });

  it("a throwing notifier never rejects and does not stop the others", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = vi.fn(async () => {});
    const list: Notifier[] = [{ name: "bad", send: async () => { throw new Error("boom"); } }, { name: "good", send: ok }];
    await expect(runNotifiers(list, order)).resolves.toBeUndefined();
    expect(ok).toHaveBeenCalledOnce();
  });

  it("a hanging notifier is cut off by the timeout", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const hang: Notifier = { name: "hang", send: () => new Promise(() => {}) };
    const t = Date.now();
    await runNotifiers([hang], order, 50);
    expect(Date.now() - t).toBeLessThan(1000);
  });
});
