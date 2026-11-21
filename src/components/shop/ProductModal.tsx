"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { ProductGallery } from "@/components/shop/ProductGallery";
import { ProductPurchase } from "@/components/shop/ProductPurchase";
import { diyKind } from "@/components/shop/DiyIllustration";
import type { Product } from "@/lib/types";

type Props = {
  product: Product;
  open: boolean;
  onClose: () => void;
};

export function ProductModal({ product, open, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    if (!open && d.open) {
      d.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="prod-modal-dialog"
      dir="rtl"
      aria-label={product.name_ar}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="prod-modal-card">
        <button
          type="button"
          className="prod-modal-close"
          aria-label="إغلاق"
          onClick={onClose}
        >
          <Icon name="close" size={20} />
        </button>

        <div className="prod-modal-body">
          <div className="prod-modal-gallery">
            <ProductGallery
              images={product.images}
              diy={product.is_diy ? diyKind(product.category_slug) : null}
            />
          </div>

          <div className="prod-modal-purchase">
            <ProductPurchase product={product} onSuccess={onClose} />
          </div>
        </div>
      </div>
    </dialog>
  );
}
