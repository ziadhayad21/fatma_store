"use client";

import { useActionState, useState, useTransition } from "react";
import { saveShipping, addShippingPlace, updateShippingPlace, deleteShippingPlace, type ShippingState, type PlaceActionState } from "@/app/actions/admin-shipping";
import { Icon } from "@/components/ui/Icon";
import type { ShippingRate, ShippingPlace } from "@/lib/data/types";

export function ShippingForm({ rates }: { rates: ShippingRate[] }) {
  const [state, action, pending] = useActionState<ShippingState, FormData>(saveShipping, { ok: false, message: "" });

  // Place dialog/modal states
  const [addPlaceModalOpen, setAddPlaceModalOpen] = useState(false);
  const [placeGov, setPlaceGov] = useState<string>("");
  const [placeName, setPlaceName] = useState("");
  const [placeFee, setPlaceFee] = useState("");
  const [placeError, setPlaceError] = useState("");
  const [placePending, startPlaceTransition] = useTransition();

  // Edit place states
  const [editingPlace, setEditingPlace] = useState<ShippingPlace | null>(null);

  function openAddPlace(gov: string) {
    setPlaceGov(gov);
    setPlaceName("");
    setPlaceFee("");
    setPlaceError("");
    setAddPlaceModalOpen(true);
  }

  function handleAddPlaceSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPlaceError("");
    const fd = new FormData();
    fd.set("governorate", placeGov);
    fd.set("name", placeName);
    fd.set("fee", placeFee);

    startPlaceTransition(async () => {
      const res = await addShippingPlace({ ok: false, message: "" }, fd);
      if (res.ok) {
        setAddPlaceModalOpen(false);
      } else {
        setPlaceError(res.message);
      }
    });
  }

  function handleEditPlaceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPlace) return;
    setPlaceError("");
    const fd = new FormData();
    fd.set("id", editingPlace.id);
    fd.set("name", placeName);
    fd.set("fee", placeFee);

    startPlaceTransition(async () => {
      const res = await updateShippingPlace({ ok: false, message: "" }, fd);
      if (res.ok) {
        setEditingPlace(null);
      } else {
        setPlaceError(res.message);
      }
    });
  }

  function handleDeletePlace(id: string) {
    if (!confirm("هل أنت متأكد من حذف هذا المكان؟")) return;
    const fd = new FormData();
    fd.set("id", id);
    startPlaceTransition(async () => {
      await deleteShippingPlace({ ok: false, message: "" }, fd);
    });
  }

  return (
    <>
      <form action={action}>
        <div className="adm-ship-grid">
          {rates.map((r) => {
            const hasPlaces = (r.places?.length ?? 0) > 0;
            const isUnset = r.fee === null && !hasPlaces;
            return (
              <div key={r.governorate} className={`adm-ship-card${isUnset ? " unset" : ""}`}>
                <div className="adm-ship-card-head">
                  <div className="adm-ship-card-title">
                    <span className="adm-ship-card-gov">{r.governorate}</span>
                    {hasPlaces && (
                      <span className="adm-ship-badge" title={`${r.places!.length} أماكن مخصصة`}>
                        {r.places!.length} {r.places!.length === 1 ? "مكان مخصص" : "أماكن"}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    className="adm-ship-btn-add"
                    title={`إضافة مكان مخصص في ${r.governorate}`}
                    onClick={() => openAddPlace(r.governorate)}
                  >
                    <Icon name="plus" size={13} /> مكان
                  </button>
                </div>

                <div className="adm-ship-card-input-row">
                  <label htmlFor={`fee-${r.governorate}`} className="adm-ship-label">
                    <span>السعر العام للمحافظة:</span>
                  </label>
                  <div className="adm-ship-input-wrap">
                    <input
                      id={`fee-${r.governorate}`}
                      type="text"
                      inputMode="decimal"
                      name={`fee:${r.governorate}`}
                      defaultValue={r.fee === null ? "" : String(r.fee)}
                      placeholder="غير متاح"
                      aria-label={`السعر العام لشحن ${r.governorate}`}
                      aria-invalid={state.errors?.[r.governorate] ? true : undefined}
                      dir="ltr"
                    />
                    <small>ج.م</small>
                  </div>
                </div>

                {hasPlaces && (
                  <div className="adm-ship-places-list">
                    <div className="adm-ship-places-title">الأماكن المخصصة ({r.places!.length}):</div>
                    <ul>
                      {r.places!.map((p) => (
                        <li key={p.id} className="adm-ship-place-item">
                          <span className="adm-ship-place-name">{p.name}</span>
                          <span className="adm-ship-place-fee" dir="ltr">{p.fee} ج.م</span>
                          <div className="adm-ship-place-actions">
                            <button
                              type="button"
                              className="adm-ship-action-btn"
                              title="تعديل"
                              onClick={() => {
                                setEditingPlace(p);
                                setPlaceName(p.name);
                                setPlaceFee(String(p.fee));
                                setPlaceError("");
                              }}
                            >
                              <Icon name="arrow" size={12} />
                            </button>
                            <button
                              type="button"
                              className="adm-ship-action-btn delete"
                              title="حذف"
                              onClick={() => handleDeletePlace(p.id)}
                            >
                              <Icon name="close" size={12} />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 24, flexWrap: "wrap" }}>
          <button className="adm-btn primary" type="submit" disabled={pending}>
            {pending ? "جاري الحفظ…" : "حفظ الأسعار العامة"}
          </button>
          {state.message && (
            <span className={state.ok ? "adm-ok" : "adm-err"} role="status">
              {state.message}
            </span>
          )}
        </div>
      </form>

      {/* Add Place Dialog */}
      {addPlaceModalOpen && (
        <div className="adm-ship-modal-overlay" onClick={() => setAddPlaceModalOpen(false)}>
          <div className="adm-ship-modal" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="adm-ship-modal-head">
              <h3>إضافة مكان مخصص في محافظة {placeGov}</h3>
              <button
                type="button"
                className="adm-ship-modal-close"
                onClick={() => setAddPlaceModalOpen(false)}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <form onSubmit={handleAddPlaceSubmit}>
              <div className="adm-ship-modal-body">
                <div className="adm-f">
                  <label htmlFor="place-name">اسم المكان / المنطقة</label>
                  <input
                    id="place-name"
                    type="text"
                    value={placeName}
                    onChange={(e) => setPlaceName(e.target.value)}
                    placeholder="مثال: مدينة نصر، مصر الجديدة، التجمع..."
                    required
                    maxLength={120}
                    autoFocus
                  />
                </div>
                <div className="adm-f">
                  <label htmlFor="place-fee">سعر الشحن (ج.م)</label>
                  <input
                    id="place-fee"
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    value={placeFee}
                    onChange={(e) => setPlaceFee(e.target.value)}
                    placeholder="40"
                    required
                  />
                </div>
                {placeError && <span className="adm-err">{placeError}</span>}
              </div>
              <div className="adm-ship-modal-actions">
                <button
                  type="button"
                  className="adm-btn ghost"
                  onClick={() => setAddPlaceModalOpen(false)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="adm-btn primary"
                  disabled={placePending}
                >
                  {placePending ? "جاري الإضافة…" : "إضافة المكان"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Place Dialog */}
      {editingPlace && (
        <div className="adm-ship-modal-overlay" onClick={() => setEditingPlace(null)}>
          <div className="adm-ship-modal" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="adm-ship-modal-head">
              <h3>تعديل المكان في محافظة {editingPlace.governorate}</h3>
              <button
                type="button"
                className="adm-ship-modal-close"
                onClick={() => setEditingPlace(null)}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <form onSubmit={handleEditPlaceSubmit}>
              <div className="adm-ship-modal-body">
                <div className="adm-f">
                  <label htmlFor="edit-place-name">اسم المكان / المنطقة</label>
                  <input
                    id="edit-place-name"
                    type="text"
                    value={placeName}
                    onChange={(e) => setPlaceName(e.target.value)}
                    placeholder="اسم المكان"
                    required
                    maxLength={120}
                    autoFocus
                  />
                </div>
                <div className="adm-f">
                  <label htmlFor="edit-place-fee">سعر الشحن (ج.م)</label>
                  <input
                    id="edit-place-fee"
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    value={placeFee}
                    onChange={(e) => setPlaceFee(e.target.value)}
                    placeholder="0"
                    required
                  />
                </div>
                {placeError && <span className="adm-err">{placeError}</span>}
              </div>
              <div className="adm-ship-modal-actions">
                <button
                  type="button"
                  className="adm-btn ghost"
                  onClick={() => setEditingPlace(null)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="adm-btn primary"
                  disabled={placePending}
                >
                  {placePending ? "جاري الحفظ…" : "حفظ التعديل"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
