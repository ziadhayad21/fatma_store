import { fontLabel } from "./name-fonts";
import type { FontId, OrderMode } from "./types";

/**
 * "كابلز" (couples) products: one product = several pieces (2 today), each with its own colour and
 * name / design, sold at ONE fixed price for the set (base_price). Shared by the product page, the
 * cart, checkout (authority) and the order views.
 */
export const COUPLE_PIECES = 2;
export const DEFAULT_PIECE_LABELS = ["المريلة الأولى", "المريلة التانية"] as const;
export const PIECE_LABEL_MAX = 40;

/** One piece of a cart / order line. */
export type LinePiece = {
  color: string | null;
  text: string | null;
  designPath: string | null;
  /** original file name, display only */
  designName: string | null;
};

/** What order_items.pieces stores per piece (a snapshot, like name_snapshot). */
export type StoredPiece = {
  label: string;
  color: string | null;
  color_name: string | null;
  text: string | null;
  font: FontId | null;
  design_path: string | null;
  design_name: string | null;
};

type CouplesFields = { pieces_count?: number | null; piece_labels?: unknown };

export const isCouples = (p: CouplesFields | null | undefined): boolean => (p?.pieces_count ?? 1) > 1;

/** The piece labels to show: the product's own, or the defaults. */
export function pieceLabels(p: CouplesFields): string[] {
  const n = Math.max(1, p.pieces_count ?? 1);
  const own = Array.isArray(p.piece_labels) ? p.piece_labels : [];
  return Array.from({ length: n }, (_, i) => {
    const v = own[i];
    return typeof v === "string" && v.trim() ? v.trim() : (DEFAULT_PIECE_LABELS[i] ?? `القطعة ${i + 1}`);
  });
}

/** The ordering options, worded for two. */
export const COUPLE_MODE_LABEL: Record<OrderMode, string> = { standard: "زي ما هم", name: "بأساميكم", design: "بتصميمكم" };

/** "المريلة الأولى: أسود — Beso kitchen" (one line per piece). */
export function pieceLine(label: string, piece: { colorName?: string | null; text?: string | null; designName?: string | null }, mode: OrderMode): string {
  const parts = [piece.colorName || null];
  if (mode === "name" && piece.text) parts.push(piece.text);
  if (mode === "design") parts.push(piece.designName ? `تصميم: ${piece.designName}` : "تصميم مرفوع");
  const rest = parts.filter(Boolean).join(" — ");
  return rest ? `${label}: ${rest}` : label;
}

/** Lines under a couples cart / order line: the option (+ font), then one line per piece. */
export function couplesDetails(
  labels: string[],
  mode: OrderMode,
  font: FontId | null,
  pieces: { colorName?: string | null; text?: string | null; designName?: string | null }[],
): string[] {
  const head = mode === "name" && font ? `${COUPLE_MODE_LABEL[mode]} — خط ${fontLabel(font)}` : COUPLE_MODE_LABEL[mode];
  return [head, ...pieces.map((p, i) => pieceLine(labels[i] ?? `القطعة ${i + 1}`, p, mode))];
}

/** Every stored design path of a line (its own, and its pieces'). */
export function lineDesignPaths(l: { designPath?: string | null; pieces?: LinePiece[] | null }): string[] {
  return [l.designPath, ...(l.pieces ?? []).map((p) => p.designPath)].filter((p): p is string => !!p);
}
