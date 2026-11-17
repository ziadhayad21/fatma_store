import { createClient } from "@supabase/supabase-js";
import { seedProducts } from "../src/lib/seed-products";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  console.log(`Starting upsert of ${seedProducts.length} products...`);

  const { data, error } = await supabase
    .from("products")
    .upsert(seedProducts, { onConflict: "slug" })
    .select("id, slug, name_ar, category_id");

  if (error) {
    console.error("Upsert failed:", error);
    process.exit(1);
  }

  console.log(`Successfully upserted ${data.length} products!`);

  // Count per category
  const counts: Record<string, number> = {};
  data.forEach((p) => {
    counts[p.category_id] = (counts[p.category_id] || 0) + 1;
  });
  console.log("Products per category:", counts);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
