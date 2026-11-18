import type { Product } from "./types";
import { roundMoney } from "./pricing/discount";

export const COLORS = ["black", "white", "pink"] as const;
export type ProductColor = (typeof COLORS)[number];
export const COLOR_LABEL: Record<ProductColor, string> = { black: "Black", white: "White", pink: "Pink" };
export const isProductColor = (v: unknown): v is ProductColor => COLORS.includes(v as ProductColor);
export function productRules(product: Pick<Product, "category_slug">) {
  const textile = ["aprons", "towels"].includes(product.category_slug);
  return { textile, customization: product.category_slug !== "bags", deposit: textile };
}
export const DEPOSIT_NUMBER = "01155907797";
export const depositAmount = (total: number) => roundMoney(total * 0.3);
export type DepositStatus = "pending" | "submitted" | "confirmed";
export const DEPOSIT_LABEL: Record<DepositStatus, string> = {
  pending: "Deposit Pending — في انتظار العربون",
  submitted: "Deposit Submitted — في انتظار مراجعة التحويل",
  confirmed: "Deposit Confirmed — تم تأكيد العربون",
};
export const PROOF_BUCKET = "payment-proofs";
export const isProofPath = (v: unknown): v is string => typeof v === "string" && /^proofs\/\d{4}-\d{2}\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(png|jpg|webp)$/i.test(v);

export function getItemCustomizationNote(
  orderNotes: string | null | undefined,
  item: { name_snapshot: string; mode: string; product_id?: string | null },
  allItems: Array<{ name_snapshot: string; mode: string }>,
  productSlug?: string,
): string | null {
  if (!orderNotes || !orderNotes.trim() || (item.mode !== "name" && item.mode !== "design")) {
    return null;
  }
  const rawNotes = orderNotes.trim();
  const customizedItems = allItems.filter((x) => x.mode === "name" || x.mode === "design");

  if (customizedItems.length <= 1) {
    const prefixMatch = rawNotes.match(/^([^:\n]+):\s*([\s\S]*)$/);
    if (prefixMatch) {
      const prefixHeader = prefixMatch[1].trim().toLowerCase();
      const itemName = item.name_snapshot.trim().toLowerCase();
      if (prefixHeader === itemName || (productSlug && prefixHeader === productSlug.toLowerCase())) {
        return prefixMatch[2].trim() || null;
      }
    }
    return rawNotes;
  }

  const blocks = rawNotes.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  for (const block of blocks) {
    const prefixMatch = block.match(/^([^:\n]+):\s*([\s\S]*)$/);
    if (prefixMatch) {
      const header = prefixMatch[1].trim().toLowerCase();
      const noteContent = prefixMatch[2].trim();
      const itemName = item.name_snapshot.trim().toLowerCase();
      const slug = productSlug?.trim().toLowerCase();

      if (
        header === itemName ||
        (slug && header === slug) ||
        itemName.includes(header) ||
        header.includes(itemName)
      ) {
        return noteContent || null;
      }
    }
  }

  if (blocks.length === customizedItems.length) {
    const idx = customizedItems.findIndex((x) => x === item || (x.name_snapshot === item.name_snapshot && x.mode === item.mode));
    if (idx !== -1) {
      const block = blocks[idx];
      const prefixMatch = block.match(/^([^:\n]+):\s*([\s\S]*)$/);
      return prefixMatch ? prefixMatch[2].trim() : block;
    }
  }

  return null;
}

