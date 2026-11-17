import { seedProducts } from "../src/lib/seed-products";
import fs from "fs";

const lines = seedProducts
  .map((p) => {
    const imagesJson = JSON.stringify(p.images).replace(/'/g, "''");
    const desc = p.description_ar.replace(/'/g, "''");
    const details = p.details_ar.replace(/'/g, "''");
    const care = p.care_ar.replace(/'/g, "''");
    const name = p.name_ar.replace(/'/g, "''");
    return `  ('${p.id}', '${p.slug}', '${name}', '${p.category_id}', '${desc}', '${details}', '${care}', ${p.base_price}, ${p.personalization_fee}, '${imagesJson}'::jsonb, ${p.sort}, '${p.created_at}')`;
  })
  .join(",\n");

const migrationHeader = `-- Reference data. Idempotent: safe to re-run, never overwrites edits made in the admin.
-- PRICES ARE PLACEHOLDERS (editable in the admin). Shipping fees are intentionally NULL (not decided).

insert into public.categories (id, slug, name_ar, description_ar, image, image_alt, image_position, promo_title_ar, sort)
values
  ('10000000-0000-4000-8000-000000000001', 'towels', 'الفوط',
   'فوط مطبخ برسومات وجُمل مصرية خفيفة. اطلبها زي ما هي، أو باسمك، أو بتصميمك.',
   '/products/towel-cream.jpg', 'فوطة مطبخ بيج عليها رسمة', 'center 42%', 'اكتب اسمك على أي فوطة', 1),
  ('10000000-0000-4000-8000-000000000002', 'aprons', 'المريلات',
   'مريلات مطبخ قماش بجيب وأربطة طويلة. اطلبها زي ما هي، أو باسمك، أو بتصميمك.',
   '/products/apron-pink.jpg', 'بنت لابسة مريلة Chef وماسكة مريلة بينك', 'center 22%', 'مريلة باسمك… زي Chef Fatma', 2),
  ('10000000-0000-4000-8000-000000000003', 'bags', 'الشنط',
   'شنط قماش واسعة وخفيفة للخروجة والجامعة. اطلبها زي ما هي، أو باسمك، أو بتصميمك.',
   '/products/bag-polka.jpg', 'بنت شايلة شنطة صفرا بنقط بني', 'center 30%', 'شنطتك، باسمك أنت', 3)
on conflict (slug) do nothing;

insert into public.products
  (id, slug, name_ar, category_id, description_ar, details_ar, care_ar, base_price, personalization_fee, images, sort, created_at)
values
${lines}
on conflict (slug) do nothing;

-- The 27 governorates. fee stays NULL until set in the admin.
insert into public.shipping_rates (governorate) values
  ('القاهرة'), ('الجيزة'), ('الإسكندرية'), ('الدقهلية'), ('البحر الأحمر'), ('البحيرة'),
  ('الفيوم'), ('الغربية'), ('الإسماعيلية'), ('المنوفية'), ('المنيا'), ('القليوبية'),
  ('الوادي الجديد'), ('السويس'), ('الشرقية'), ('دمياط'), ('بورسعيد'), ('جنوب سيناء'),
  ('كفر الشيخ'), ('مطروح'), ('الأقصر'), ('قنا'), ('شمال سيناء'), ('سوهاج'),
  ('بني سويف'), ('أسيوط'), ('أسوان')
on conflict (governorate) do nothing;
`;

fs.writeFileSync("supabase/migrations/20260101000300_seed.sql", migrationHeader);
console.log("Migration updated successfully with 30 products!");
