-- Reference data. Idempotent: safe to re-run, never overwrites edits made in the admin.
-- PRICES ARE PLACEHOLDERS (editable in the admin). Shipping fees are intentionally NULL (not decided).

insert into public.categories (id, slug, name_ar, description_ar, image, image_alt, image_position, promo_title_ar, sort)
values
  ('10000000-0000-4000-8000-000000000001', 'towels', 'الفوط',
   'فوط مطبخ برسومات وجُمل مصرية خفيفة. اطلبها زي ما هي، أو باسمك، أو بتصميمك.',
   '/products/towel-cream.jpg', 'فوطة مطبخ بيج عليها رسمة', 'center 40%', 'اكتب اسمك على أي فوطة', 1),
  ('10000000-0000-4000-8000-000000000002', 'aprons', 'المريلات',
   'مريلات مطبخ قماش بجيب وأربطة طويلة. اطلبها زي ما هي، أو باسمك، أو بتصميمك.',
   '/products/apron-pink.jpg', 'بنت لابسة مريلة Chef وماسكة مريلة بينك', 'center 30%', 'مريلة باسمك… زي Chef Fatma', 2),
  ('10000000-0000-4000-8000-000000000003', 'bags', 'الشنط',
   'شنط قماش واسعة وخفيفة للخروجة والجامعة. اطلبها زي ما هي، أو باسمك، أو بتصميمك.',
   '/products/bag-polka.jpg', 'بنت شايلة شنطة صفرا بنقط بني', 'center 62%', 'شنطتك، باسمك أنت', 3)
on conflict (slug) do nothing;

insert into public.products
  (id, slug, name_ar, category_id, description_ar, details_ar, care_ar, base_price, personalization_fee, images, sort, created_at)
values
  ('00000000-0000-4000-8000-000000000001', 'chef-apron', 'مريلة مطبخ Chef',
   '10000000-0000-4000-8000-000000000002',
   'مريلة مطبخ قماش بجيب قدّام وأربطة طويلة بتتربط على الوسط. اطلبها زي ما هي، أو اكتب اسمك عليها، أو ارفع تصميمك.',
   'هنا هتتضاف تفاصيل الخامة والمقاسات ومساحة الطباعة.',
   'هنا هتتضاف طريقة الغسيل والكي المناسبة.',
   100, 25,
   '[{"src":"/products/apron-chef.jpg","alt":"بنت لابسة مريلة بيج مطبوع عليها Chef Fatma","position":"center 40%"},{"src":"/products/apron-pink.jpg","alt":"بنت لابسة مريلة Chef وماسكة مريلة بينك","position":"center 30%"}]'::jsonb,
   1, '2026-03-01T10:00:00Z'),
  ('00000000-0000-4000-8000-000000000002', 'printed-kitchen-towel', 'فوطة مطبخ مطبوعة',
   '10000000-0000-4000-8000-000000000001',
   'فوطة مطبخ برسمة وجملة مصرية خفيفة وشرايط على الطرفين. اطلبها زي ما هي، أو اكتب اسمك عليها، أو ارفع تصميمك.',
   'هنا هتتضاف تفاصيل الخامة والمقاسات ومساحة الطباعة.',
   'هنا هتتضاف طريقة الغسيل والكي المناسبة.',
   100, 25,
   '[{"src":"/products/towel-black.jpg","alt":"فوطة مطبخ سودا عليها رسمة بنت بتغسل المواعين وجملة مصرية","position":"center 45%"},{"src":"/products/towel-cream.jpg","alt":"فوطة بيج عليها رسمة وجملة تعبان مش تعبان","position":"center 45%"}]'::jsonb,
   2, '2026-03-02T10:00:00Z'),
  ('00000000-0000-4000-8000-000000000003', 'polka-dot-bag', 'شنطة Polka Dot صفرا',
   '10000000-0000-4000-8000-000000000003',
   'شنطة قماش صفرا بنقط بني، واسعة وخفيفة بيد طويلة على الكتف. اطلبها زي ما هي، أو اكتب اسمك عليها، أو ارفع تصميمك.',
   'هنا هتتضاف تفاصيل الخامة والمقاسات ومساحة الطباعة.',
   'هنا هتتضاف طريقة الغسيل والكي المناسبة.',
   100, 25,
   '[{"src":"/products/bag-close.jpg","alt":"شنطة قماش صفرا بنقط بني","position":"center 50%"},{"src":"/products/bag-polka.jpg","alt":"بنت شايلة شنطة صفرا بنقط بني","position":"center 55%"}]'::jsonb,
   3, '2026-03-03T10:00:00Z')
on conflict (slug) do nothing;

-- The 27 governorates. fee stays NULL until set in the admin.
insert into public.shipping_rates (governorate) values
  ('القاهرة'), ('الجيزة'), ('الإسكندرية'), ('الدقهلية'), ('البحر الأحمر'), ('البحيرة'),
  ('الفيوم'), ('الغربية'), ('الإسماعيلية'), ('المنوفية'), ('المنيا'), ('القليوبية'),
  ('الوادي الجديد'), ('السويس'), ('الشرقية'), ('دمياط'), ('بورسعيد'), ('جنوب سيناء'),
  ('كفر الشيخ'), ('مطروح'), ('الأقصر'), ('قنا'), ('شمال سيناء'), ('سوهاج'),
  ('بني سويف'), ('أسيوط'), ('أسوان')
on conflict (governorate) do nothing;
