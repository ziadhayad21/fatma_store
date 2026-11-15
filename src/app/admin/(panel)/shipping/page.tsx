import { ShippingForm } from "@/components/admin/ShippingForm";
import { requireAdmin } from "@/lib/admin/auth";
import { governorates } from "@/lib/governorates";

export const metadata = { title: "الشحن" };

export default async function ShippingPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("shipping_rates").select("governorate, fee");
  const byName = new Map((data ?? []).map((r) => [r.governorate as string, r.fee === null ? null : Number(r.fee)]));
  const rates = governorates.map((g) => ({ governorate: g, fee: byName.get(g) ?? null }));
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>أسعار الشحن</h1>
          <p className="adm-sub">سعر الشحن لكل محافظة بالجنيه. سيب الخانة فاضية لو الشحن مش متاح للمحافظة دي — العميل مش هيقدر يختارها.</p>
        </div>
      </div>
      <ShippingForm rates={rates} />
    </>
  );
}
