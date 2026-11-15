// Inserts the 8 SAMPLE reviews (published, is_sample = true) so the home reviews section is visible.
//   node --env-file=.env.local scripts/seed-sample-reviews.mjs
// Idempotent: does nothing when sample reviews already exist. Remove them from the admin (الآراء > "حذف كل الآراء التجريبية").
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ""), process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SAMPLES = [
  ["منة", "مريلة مطبخ Chef", "#F6D6DC", "المريلة جت أحلى من الصور بكتير، والاسم مطبوع بخط الرقعة شكله تحفة. ماما فرحت بيها جدًا."],
  ["ندى", "شنطة Polka Dot صفرا", "#F6E3A6", "الشنطة الصفرا خامتها تقيلة ومريحة على الكتف، بقيت بنزل بيها كل يوم تقريبًا."],
  ["هبة", "مريلة مطبخ Chef", "#141414", "رفعت لوجو الكافيه بتاعي على المريلات، والطباعة طلعت نضيفة جدًا ومظبوطة."],
  ["سارة", "فوطة مطبخ مطبوعة", "#E9E1D3", "جبت الفوطة السودا هدية لصاحبتي، فضلت تضحك على الجملة اللي عليها وتصوّرها."],
  ["ياسمين", "فوطة مطبخ مطبوعة", "#F6D6DC", "التعامل محترم والتغليف شيك، وحسيت إن الحاجة معمولة مخصوص ليا أنا."],
  ["مريم", "فوطة مطبخ مطبوعة", "#141414", "عملت فوطتين باسمي واسم أختي، والخط العربي طالع حلو جدًا على القماش."],
  ["رنا", "مريلة مطبخ Chef", "#F6E3A6", "أحلى هدية جواز ممكن تجيبيها: مريلتين بأسامي العريس والعروسة."],
  ["دينا", "شنطة Polka Dot صفرا", "#E9E1D3", "الألوان زي الصور بالظبط والقماش ناعم، وأكيد هطلب تاني."],
];

const { count } = await sb.from("reviews").select("id", { count: "exact", head: true }).eq("is_sample", true);
if (count) {
  console.log(`${count} sample reviews already exist: nothing to do.`);
  process.exit(0);
}

const { data: products, error: pe } = await sb.from("products").select("id, name_ar");
if (pe) throw pe;
const byName = new Map(products.map((p) => [p.name_ar, p.id]));

const rows = SAMPLES.map(([customer_name, product, avatar_color, text], i) => {
  const product_id = byName.get(product);
  if (!product_id) console.warn(`product not found for "${customer_name}": "${product}" (the card will have no "اشترت:" line)`);
  return { customer_name, text, product_id: product_id ?? null, avatar_color, is_published: true, is_sample: true, sort: (i + 1) * 10 };
});
const { error } = await sb.from("reviews").insert(rows);
if (error) throw error;
console.log(`inserted ${rows.length} published sample reviews`);
