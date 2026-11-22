import { ShippingForm } from "@/components/admin/ShippingForm";
import { requireAdmin } from "@/lib/admin/auth";
import { governorates } from "@/lib/governorates";

export const metadata = { title: "الشحن" };

export default async function ShippingPage() {
  const { supabase } = await requireAdmin();
  const [{ data: rateRows }, { data: placeRows }] = await Promise.all([
    supabase.from("shipping_rates").select("governorate, fee"),
    supabase.from("shipping_places").select("id, governorate, name, fee").order("name"),
  ]);
  const byName = new Map((rateRows ?? []).map((r) => [r.governorate as string, r.fee === null ? null : Number(r.fee)]));
  const placesByGov = new Map<string, { id: string; governorate: string; name: string; fee: number }[]>();
  for (const p of placeRows ?? []) {
    const g = p.governorate as string;
    const list = placesByGov.get(g) ?? [];
    list.push({ id: p.id as string, governorate: g, name: p.name as string, fee: Number(p.fee) });
    placesByGov.set(g, list);
  }
  const rates = governorates.map((g) => ({
    governorate: g,
    fee: byName.get(g) ?? null,
    places: placesByGov.get(g) ?? [],
  }));
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>أسعار الشحن</h1>
          <p className="adm-sub">سعر الشحن العام لكل محافظة، مع إمكانية إضافة أماكن محددة بأسعار مختلفة داخل كل محافظة.</p>
        </div>
      </div>
      <ShippingForm rates={rates} />
    </>
  );
}
