import type { Product } from "./types";
import { roundMoney } from "./pricing/discount";

/** A colour id as stored in public.colors / carts / order items (e.g. "black"). */
export type ProductColor = string;
export const isProductColor = (v: unknown): v is ProductColor =>
  typeof v === "string" && v.length <= 40 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v);

/** Names for order items saved before colour names were snapshotted. */
const LEGACY_COLOR_NAME: Record<string, string> = { black: "أسود", white: "أبيض", pink: "وردي" };
export const colorLabel = (item: { color?: string | null; color_name?: string | null }) =>
  item.color_name || (item.color ? LEGACY_COLOR_NAME[item.color] ?? item.color : null);

export function productRules(product: Pick<Product, "category_slug"> & { has_colors?: boolean; is_diy?: boolean; pieces_count?: number | null }) {
  const textile = ["aprons", "towels"].includes(product.category_slug);
  const colors = !!product.has_colors;
  const customization = product.category_slug !== "bags";
  const couples = (product.pieces_count ?? 1) > 1;
  // colour products print the name in the chosen colour: no font choice — except couples products,
  // where both names share ONE font the customer picks.
  // DIY ("اصنعها بنفسك") products are sold only with a name or a design: no "as is" option.
  return { colors, customization, standard: !(customization && product.is_diy), deposit: textile, font: !colors || couples, couples };
}
export const DEPOSIT_NUMBER = "01155907797";
export const depositAmount = (total: number) => roundMoney(total * 0.3);
export type DepositStatus = "pending" | "submitted" | "confirmed";
export const DEPOSIT_LABEL: Record<DepositStatus, string> = {
  pending: "في انتظار العربون",
  submitted: "مراجعة التحويل",
  confirmed: "العربون مؤكد",
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

