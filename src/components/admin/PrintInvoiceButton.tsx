"use client";

import { Icon } from "@/components/ui/Icon";

export function PrintInvoiceButton({ className }: { className?: string }) {
  return (
    <button
      className={`adm-btn adm-print-invoice-btn${className ? " " + className : ""}`}
      type="button"
      onClick={() => window.print()}
      aria-label="طباعة الفاتورة"
    >
      <Icon name="printer" size={17} />
      <span>طباعة الفاتورة</span>
    </button>
  );
}
