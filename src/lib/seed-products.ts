import type { ProductRow } from "./types";

/**
 * Seed data — mirrors supabase/seed.sql (public.products).
 * PRICES ARE PLACEHOLDERS (not decided yet) and are editable in the admin.
 * details/care text is placeholder copy as well.
 */
export const seedProducts: ProductRow[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "chef-apron",
    name_ar: "مريلة مطبخ Chef",
    category_id: "10000000-0000-4000-8000-000000000002",
    description_ar:
      "مريلة مطبخ قماش بجيب قدّام وأربطة طويلة بتتربط على الوسط. اطلبها زي ما هي، أو اكتب اسمك عليها، أو ارفع تصميمك.",
    details_ar: "هنا هتتضاف تفاصيل الخامة والمقاسات ومساحة الطباعة.",
    care_ar: "هنا هتتضاف طريقة الغسيل والكي المناسبة.",
    base_price: 100,
    personalization_fee: 25,
    images: [
      { src: "/products/apron-chef.jpg", alt: "بنت لابسة مريلة بيج مطبوع عليها Chef Fatma", position: "center 40%" },
      { src: "/products/apron-pink.jpg", alt: "بنت لابسة مريلة Chef وماسكة مريلة بينك", position: "center 30%" },
    ],
    is_active: true,
    sort: 1,
    created_at: "2026-03-01T10:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    slug: "printed-kitchen-towel",
    name_ar: "فوطة مطبخ مطبوعة",
    category_id: "10000000-0000-4000-8000-000000000001",
    description_ar:
      "فوطة مطبخ برسمة وجملة مصرية خفيفة وشرايط على الطرفين. اطلبها زي ما هي، أو اكتب اسمك عليها، أو ارفع تصميمك.",
    details_ar: "هنا هتتضاف تفاصيل الخامة والمقاسات ومساحة الطباعة.",
    care_ar: "هنا هتتضاف طريقة الغسيل والكي المناسبة.",
    base_price: 100,
    personalization_fee: 25,
    images: [
      { src: "/products/towel-black.jpg", alt: "فوطة مطبخ سودا عليها رسمة بنت بتغسل المواعين وجملة مصرية", position: "center 45%" },
      { src: "/products/towel-cream.jpg", alt: "فوطة بيج عليها رسمة وجملة تعبان مش تعبان", position: "center 45%" },
    ],
    is_active: true,
    sort: 2,
    created_at: "2026-03-02T10:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    slug: "polka-dot-bag",
    name_ar: "شنطة Polka Dot صفرا",
    category_id: "10000000-0000-4000-8000-000000000003",
    description_ar:
      "شنطة قماش صفرا بنقط بني، واسعة وخفيفة بيد طويلة على الكتف. اطلبها زي ما هي، أو اكتب اسمك عليها، أو ارفع تصميمك.",
    details_ar: "هنا هتتضاف تفاصيل الخامة والمقاسات ومساحة الطباعة.",
    care_ar: "هنا هتتضاف طريقة الغسيل والكي المناسبة.",
    base_price: 100,
    personalization_fee: 25,
    images: [
      { src: "/products/bag-close.jpg", alt: "شنطة قماش صفرا بنقط بني", position: "center 50%" },
      { src: "/products/bag-polka.jpg", alt: "بنت شايلة شنطة صفرا بنقط بني", position: "center 55%" },
    ],
    is_active: true,
    sort: 3,
    created_at: "2026-03-03T10:00:00.000Z",
  },
];
