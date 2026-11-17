import { catalogSlug, type CatalogSlugKind } from "@/lib/admin/slug";

export function CatalogSlugField({ name, savedSlug, kind }: { name: string; savedSlug: string; kind: CatalogSlugKind }) {
  const slug = savedSlug || (name.trim() ? catalogSlug(name, kind) : "");
  return (
    <div className="adm-f">
      <label htmlFor="slug">الرابط (إنجليزي)</label>
      <input id="slug" type="text" value={slug} readOnly dir="ltr" aria-describedby="slug-hint" />
      <span id="slug-hint" className="adm-hint">
        {savedSlug ? "الرابط ثابت بعد الإنشاء." : "الرابط بيتولّد من الاسم، ولو مستخدم هنضيف له رقم عند الحفظ."}
      </span>
    </div>
  );
}
