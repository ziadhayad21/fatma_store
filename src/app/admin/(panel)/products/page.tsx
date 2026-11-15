import Image from "next/image";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { formatPrice } from "@/lib/format";
import type { ProductImage } from "@/lib/types";

export const metadata = { title: "المنتجات" };

export default async function ProductsAdmin() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("products")
    .select("id, slug, name_ar, base_price, personalization_fee, images, is_active, sort, category:categories(name_ar)")
    .order("sort", { ascending: true });
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>المنتجات</h1>
          <p className="adm-sub">{data?.length ?? 0} منتج</p>
        </div>
        <Link className="adm-btn" href="/admin/products/new">+ منتج جديد</Link>
      </div>
      <div className="adm-table-wrap">
        <table>
          <thead>
            <tr><th></th><th>المنتج</th><th>القسم</th><th>السعر</th><th>تكلفة الطباعة</th><th>الترتيب</th><th>الحالة</th><th></th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((p) => {
              const img = (p.images as ProductImage[])?.[0];
              const cat = p.category as unknown as { name_ar: string } | null;
              return (
                <tr key={p.id}>
                  <td style={{ width: 56 }}>
                    {img ? <Image src={img.src} alt="" width={40} height={52} style={{ objectFit: "cover", objectPosition: img.position }} /> : null}
                  </td>
                  <td><Link href={`/admin/products/${p.id}`}><b>{p.name_ar}</b></Link><div className="adm-hint" dir="ltr" style={{ textAlign: "right" }}>/{p.slug}</div></td>
                  <td>{cat?.name_ar}</td>
                  <td>{formatPrice(Number(p.base_price))}</td>
                  <td>{formatPrice(Number(p.personalization_fee))}</td>
                  <td>{p.sort}</td>
                  <td>{p.is_active ? "ظاهر" : <span className="adm-badge" data-s="cancelled">مخفي</span>}</td>
                  <td><Link className="adm-btn ghost sm" href={`/admin/products/${p.id}`}>تعديل</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
