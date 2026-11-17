"use client";

import { createContext, useContext, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { deleteCategory, deleteProduct } from "@/app/actions/admin-catalog";
import { Icon } from "@/components/ui/Icon";

const DeletionNotice = createContext<(message: string) => void>(() => {});

export function CatalogDeletionArea({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState("");
  return (
    <DeletionNotice.Provider value={setNotice}>
      {notice && <p className="adm-ok" role="status">{notice}</p>}
      {children}
    </DeletionNotice.Provider>
  );
}

type Props = { id: string; name: string } & (
  | { kind: "product"; hasProducts?: never }
  | { kind: "category"; hasProducts: boolean }
);

export function DeleteCatalogItem({ id, name, kind, hasProducts }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const notify = useContext(DeletionNotice);
  const titleId = useId();
  const descriptionId = useId();
  const label = kind === "product" ? "المنتج" : "القسم";

  function confirm() {
    if (inFlight.current || hasProducts) return;
    inFlight.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await (kind === "product" ? deleteProduct(id) : deleteCategory(id));
        if (!result.ok) {
          setError(result.message);
          return;
        }
        dialog.current?.close();
        notify(result.message);
      } catch {
        setError("الحذف ما تمش. جرّب تاني.");
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <>
      <button className="adm-btn ghost sm adm-delete-btn" type="button" aria-label={`حذف ${name}`} onClick={() => {
        setError("");
        notify("");
        dialog.current?.showModal();
      }}>
        <Icon name="trash" size={15} />
        حذف
      </button>
      <dialog ref={dialog} className="adm-delete-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={(event) => {
        if (inFlight.current) event.preventDefault();
      }}>
        <form className="adm-form" onSubmit={(event) => {
          event.preventDefault();
          confirm();
        }}>
          <h2 id={titleId}>حذف {label}</h2>
          <p id={descriptionId}>
            {hasProducts
              ? <>قسم «<bdi>{name}</bdi>» لسه فيه منتجات. انقلهم لقسم تاني قبل الحذف.</>
              : <>هل تريد حذف {label} «<bdi>{name}</bdi>»؟ {kind === "product" && "لو مرتبط بطلبات سابقة، هيتخفى من المتجر وهتفضل الطلبات محفوظة."}</>}
          </p>
          {error && <p className="adm-err" role="alert">{error}</p>}
          <div className="adm-return-actions">
            <button type="button" className="adm-btn ghost" disabled={pending} onClick={() => dialog.current?.close()}>
              {hasProducts ? "إغلاق" : "إلغاء"}
            </button>
            {!hasProducts && <button type="submit" className="adm-btn adm-delete-btn" disabled={pending}>{pending ? "جاري الحذف…" : "تأكيد الحذف"}</button>}
          </div>
        </form>
      </dialog>
    </>
  );
}
