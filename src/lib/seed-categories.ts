import type { Category } from "./types";

/** Seed data — mirrors supabase/seed.sql (public.categories). */
export const seedCategories: Category[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    slug: "towels",
    name_ar: "الفوط",
    description_ar: "فوط مطبخ برسومات وجُمل مصرية خفيفة. اطلبها زي ما هي، أو باسمك، أو بتصميمك.",
    image: "/products/towel-cream.jpg",
    image_alt: "فوطة مطبخ بيج عليها رسمة",
    image_position: "center 42%",
    promo_title_ar: "اكتب اسمك على أي فوطة",
    sort: 1,
    is_active: true,
    accent_color: "#EFE6D6",
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    slug: "aprons",
    name_ar: "المريلات",
    description_ar: "مريلات مطبخ قماش بجيب وأربطة طويلة. اطلبها زي ما هي، أو باسمك، أو بتصميمك.",
    image: "/products/apron-pink.jpg",
    image_alt: "بنت لابسة مريلة Chef وماسكة مريلة بينك",
    image_position: "center 22%",
    promo_title_ar: "مريلة باسمك… زي Chef Fatma",
    sort: 2,
    is_active: true,
    accent_color: "#F6D6DC",
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    slug: "bags",
    name_ar: "الشنط",
    description_ar: "شنط قماش واسعة وخفيفة للخروجة والجامعة. اطلبها زي ما هي، أو باسمك، أو بتصميمك.",
    image: "/products/bag-polka.jpg",
    image_alt: "بنت شايلة شنطة صفرا بنقط بني",
    image_position: "center 30%",
    promo_title_ar: "شنطتك، باسمك أنت",
    sort: 3,
    is_active: true,
    accent_color: "#F2C94C",
  },
];
