import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { governorates } from "@/lib/governorates";

/**
 * Runs the REAL migration files against an in-process Postgres (PGlite) with a minimal stand-in
 * for Supabase's roles / auth.uid() / storage schema, then exercises the RLS policies.
 * This proves the SQL and the policies behave as designed; it does not replace a first run
 * against the hosted project.
 */

const ADMIN = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "22222222-2222-4222-8222-222222222222";

let db: PGlite;

const BOOTSTRAP = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'sub', '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create function auth.role() returns text language sql stable as $$
    select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'role', '')
  $$;
  grant execute on function auth.role() to anon, authenticated, service_role;

  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text,
    metadata jsonb
  );
  alter table storage.objects enable row level security;
  grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
`;

type Who = "anon" | "authenticated" | "service_role" | "postgres";

async function as<T = Record<string, unknown>>(
  who: Who,
  sub: string | null,
  sql: string,
  params: unknown[] = [],
  persist = false,
): Promise<{ rows: T[]; error?: string; code?: string; affected?: number }> {
  await db.exec("begin");
  let committed = false;
  try {
    if (who !== "postgres") await db.exec(`set local role ${who}`);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [sub ? JSON.stringify({ sub, role: who }) : ""]);
    const res = await db.query<T>(sql, params);
    if (persist) {
      await db.exec("commit");
      committed = true;
    }
    return { rows: res.rows, affected: res.affectedRows };
  } catch (e) {
    const err = e as { message: string; code?: string };
    return { rows: [], error: err.message, code: err.code };
  } finally {
    if (!committed) await db.exec("rollback");
  }
}

/** like `as`, but commits (used to set up data as the superuser) */
async function setup(sql: string, params: unknown[] = []) {
  await db.query(sql, params);
}

const order = (over: Record<string, unknown> = {}) => ({
  customer_name: "Test Customer",
  phone: "01012345678",
  governorate: "القاهرة",
  area: "مدينة نصر",
  address: "12 شارع التسعين",
  notes: "",
  payment_method: "cod",
  deposit_method: "instapay",
  payment_proof_path: "proofs/2026-11/11111111-1111-4111-8111-111111111111.png",
  subtotal: 250,
  shipping: 40,
  total: 290,
  ...over,
});
const item = (over: Record<string, unknown> = {}) => ({
  product_id: "00000000-0000-4000-8000-000000000001",
  name_snapshot: "مريلة مطبخ Chef",
  mode: "name",
  text: "Fatma",
  font: null,
  color: "black",
  design_path: "",
  unit_price: 125,
  qty: 2,
  ...over,
});

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BOOTSTRAP);
  const dir = path.resolve("supabase/migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(dir, f), "utf8"));
  }
  await setup(`insert into auth.users (id, email) values ($1, 'admin@example.com'), ($2, 'customer@example.com')`, [ADMIN, CUSTOMER]);
  await setup(`select public.grant_admin('Admin@Example.com')`);
  await setup(`insert into storage.objects (bucket_id, name) values ('designs', 'uploads/a/b.png'), ('product-images', 'p.png')`);
  await setup(`insert into storage.objects (bucket_id, name) values ('payment-proofs', 'proofs/2026-11/11111111-1111-4111-8111-111111111111.png'), ('payment-proofs', 'proofs/2026-11/22222222-2222-4222-8222-222222222222.png')`);
  await setup(`update public.shipping_rates set fee = 40 where governorate = 'القاهرة'`);
});

afterAll(async () => {
  await db.close();
});

describe("seed + constraints", () => {
  it("migrates legacy statuses without removing orders or their contents", async () => {
    const legacy = new PGlite();
    try {
      await legacy.exec(BOOTSTRAP);
      await legacy.exec(readFileSync("supabase/migrations/20260101000100_schema.sql", "utf8"));
      await legacy.exec(`
        insert into public.shipping_rates (governorate, fee) values ('القاهرة', 40);
        insert into public.orders (status, customer_name, phone, governorate, area, address, subtotal, shipping, total)
        select status, status, '01012345678', 'القاهرة', 'مدينة نصر', '12 شارع التسعين', 250, 40, 290
        from unnest(array['new', 'confirmed', 'printing', 'shipped', 'delivered', 'cancelled']) as status
      `);
      const before = await legacy.query<{ status: string }>("select id, number, customer_name, total, status from public.orders order by number");
      await legacy.exec(readFileSync("supabase/migrations/20260101000700_order_statuses.sql", "utf8"));
      const after = await legacy.query("select id, number, customer_name, total, status, return_reason from public.orders order by number");
      expect(after.rows).toEqual(before.rows.map((row) => ({
        ...row,
        status: row.status === "confirmed" || row.status === "printing" ? "prepared" : row.status,
        return_reason: null,
      })));
    } finally {
      await legacy.close();
    }
  });

  it("seeds categories, products and all 27 governorates (fees unset)", async () => {
    const c = await as("postgres", null, "select count(*)::int n from public.categories");
    // the seed migration's products (migrations …1400 / …1600 add hidden DIY and couples products)
    const p = await as("postgres", null, "select count(*)::int n from public.products where not is_diy and pieces_count = 1");
    const g = await as<{ governorate: string; fee: string | null }>("postgres", null, "select * from public.shipping_rates");
    expect(c.rows[0]).toMatchObject({ n: 3 });
    expect(p.rows[0]).toMatchObject({ n: 30 });
    expect(g.rows).toHaveLength(27);
    expect(g.rows.map((r) => r.governorate).sort()).toEqual([...governorates].sort());
    expect(g.rows.filter((r) => r.fee !== null).map((r) => r.governorate)).toEqual(["القاهرة"]); // set in this test file only
  });

  it("is idempotent when the seed runs twice", async () => {
    const sql = readFileSync(path.resolve("supabase/migrations/20260101000300_seed.sql"), "utf8");
    await db.exec(sql);
    // the seed migration's products (migrations …1400 / …1600 add hidden DIY and couples products)
    const p = await as("postgres", null, "select count(*)::int n from public.products where not is_diy and pieces_count = 1");
    expect(p.rows[0]).toMatchObject({ n: 30 });
  });

  it("has the required indexes", async () => {
    const r = await as<{ indexname: string }>("postgres", null, "select indexname from pg_indexes where schemaname = 'public'");
    const names = r.rows.map((x) => x.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        "products_slug_key",
        "products_category_active_sort_idx",
        "orders_status_created_idx",
        "orders_phone_idx",
      ]),
    );
  });
});

describe("anonymous visitors", () => {
  it("read active products, categories and shipping rates", async () => {
    expect((await as("anon", null, "select * from public.products")).rows).toHaveLength(30);
    expect((await as("anon", null, "select * from public.categories")).rows).toHaveLength(3);
    expect((await as("anon", null, "select * from public.shipping_rates")).rows).toHaveLength(27);
  });

  it("do not see inactive products or products in inactive categories", async () => {
    await setup("update public.products set is_active = false where slug = 'chef-apron'");
    await setup("update public.categories set is_active = false where slug = 'bags'");
    const r = await as<{ slug: string }>("anon", null, "select slug from public.products");
    expect(r.rows.map((x) => x.slug)).toContain("printed-kitchen-towel");
    expect(r.rows).toHaveLength(19);
    expect((await as("anon", null, "select * from public.categories")).rows).toHaveLength(2);
    await setup("update public.products set is_active = true where slug = 'chef-apron'");
    await setup("update public.categories set is_active = true where slug = 'bags'");
  });

  it("cannot touch orders, order items, newsletter or admins", async () => {
    for (const t of ["orders", "order_items", "newsletter_subscribers", "admins"]) {
      expect((await as("anon", null, `select * from public.${t}`)).code).toBe("42501");
    }
    const ins = await as(
      "anon",
      null,
      `insert into public.orders (customer_name, phone, governorate, area, address, subtotal, shipping, total)
       values ('x y', '01012345678', 'القاهرة', 'a', 'abc', 1, 1, 2)`,
    );
    expect(ins.code).toBe("42501");
    expect((await as("anon", null, "insert into public.newsletter_subscribers (email) values ('a@b.co')")).code).toBe("42501");
  });

  it("cannot write the catalog or call create_order / grant_admin", async () => {
    expect((await as("anon", null, "update public.products set base_price = 1")).code).toBe("42501");
    expect((await as("anon", null, "delete from public.categories")).code).toBe("42501");
    const rpc = await as("anon", null, "select public.create_order($1::jsonb, $2::jsonb)", [JSON.stringify(order()), JSON.stringify([item()])]);
    expect(rpc.code).toBe("42501");
    expect((await as("anon", null, "select public.grant_admin('customer@example.com')")).code).toBe("42501");
  });

  it("cannot read customer uploads", async () => {
    expect((await as("anon", null, "select * from storage.objects where bucket_id = 'designs'")).rows).toHaveLength(0);
    expect((await as("anon", null, "insert into storage.objects (bucket_id, name) values ('designs', 'x.png')")).code).toBe("42501");
  });
});

describe("signed-in customers who are not admins", () => {
  it("see no orders / items / subscribers / uploads and cannot write anything", async () => {
    await setup(`select public.create_order($1::jsonb, $2::jsonb)`, [JSON.stringify(order()), JSON.stringify([item()])]);
    await setup(`insert into public.newsletter_subscribers (email) values ('n@example.com')`);

    for (const t of ["orders", "order_items", "newsletter_subscribers", "admins"]) {
      expect((await as("authenticated", CUSTOMER, `select * from public.${t}`)).rows).toHaveLength(0);
    }
    expect((await as("authenticated", CUSTOMER, "select * from storage.objects where bucket_id = 'designs'")).rows).toHaveLength(0);
    expect((await as("authenticated", CUSTOMER, "update public.orders set status = 'cancelled'")).affected).toBe(0);
    expect((await as("authenticated", CUSTOMER, "insert into public.products (slug, name_ar, category_id, base_price) select 'x', 'x', id, 1 from public.categories limit 1")).code).toBe("42501");
    expect((await as("authenticated", CUSTOMER, "update public.products set base_price = 1")).affected).toBe(0);
    expect((await as("authenticated", CUSTOMER, "insert into storage.objects (bucket_id, name) values ('product-images', 'evil.png')")).code).toBe("42501");
    expect((await as("authenticated", CUSTOMER, "select public.create_order('{}'::jsonb, '[]'::jsonb)")).code).toBe("42501");
    expect((await as("authenticated", CUSTOMER, "select public.is_admin() as a")).rows[0]).toMatchObject({ a: false });
  });
});

describe("admins", () => {
  it("are recognised by is_admin()", async () => {
    expect((await as("authenticated", ADMIN, "select public.is_admin() as a")).rows[0]).toMatchObject({ a: true });
  });

  it("read orders, items, subscribers and customer uploads", async () => {
    expect((await as("authenticated", ADMIN, "select * from public.orders")).rows.length).toBeGreaterThan(0);
    expect((await as("authenticated", ADMIN, "select * from public.order_items")).rows.length).toBeGreaterThan(0);
    expect((await as("authenticated", ADMIN, "select * from public.newsletter_subscribers")).rows.length).toBeGreaterThan(0);
    expect((await as("authenticated", ADMIN, "select * from storage.objects where bucket_id = 'designs'")).rows).toHaveLength(1);
  });

  it("update order status (valid values only) but cannot insert orders (deleting: migration …1800)", async () => {
    await setup("select public.create_order($1::jsonb, $2::jsonb)", [JSON.stringify(order()), JSON.stringify([item({ product_id: "", mode: "standard", text: "", font: "" })])]);
    const ok = await as("authenticated", ADMIN, "update public.orders set status = 'prepared' where deposit_status is null");
    expect(ok.affected).toBeGreaterThan(0);
    const bad = await as("authenticated", ADMIN, "update public.orders set status = 'lost'");
    expect(bad.code).toBe("23514");
    expect(
      (await as("authenticated", ADMIN, `insert into public.orders (customer_name, phone, governorate, area, address, subtotal, shipping, total)
       values ('x y', '01012345678', 'القاهرة', 'a', 'abc', 1, 1, 2)`)).code,
    ).toBe("42501");
  });

  it("requires a return reason, persists it across reads and clears it on a later status change", async () => {
    const { rows: [{ id }] } = await db.query<{ id: string }>(
      "select public.create_order($1::jsonb, $2::jsonb) ->> 'id' as id",
      [JSON.stringify(order()), JSON.stringify([item({ product_id: "", mode: "standard", text: "", font: "" })])],
    );
    const read = "select status, return_reason from public.orders where id = $1";
    expect((await as("authenticated", ADMIN, read, [id])).rows[0]).toEqual({ status: "new", return_reason: null });
    const setReturn = "update public.orders set status = 'returned', return_reason = $2 where id = $1";
    for (const invalid of [null, "", " \t\n", "x".repeat(1001)]) {
      const result = await as("authenticated", ADMIN, setReturn, [id, invalid]);
      expect(result.code).toBe("23514");
    }
    const reason = "المقاس غير مناسب";
    expect((await as("authenticated", CUSTOMER, setReturn, [id, reason])).affected).toBe(0);
    expect((await as("authenticated", ADMIN, setReturn, [id, reason], true)).affected).toBe(1);

    expect((await as("authenticated", ADMIN, read, [id])).rows[0]).toEqual({ status: "returned", return_reason: reason });
    expect((await as("authenticated", CUSTOMER, read, [id])).rows).toHaveLength(0);
    expect((await as("authenticated", ADMIN, "update public.orders set status = 'delivered' where id = $1", [id])).code).toBe("23514");
    expect((await as("authenticated", ADMIN, "update public.orders set status = 'delivered', return_reason = null where id = $1", [id], true)).affected).toBe(1);
    expect((await as("authenticated", ADMIN, read, [id])).rows[0]).toEqual({ status: "delivered", return_reason: null });
  });

  it("manage catalog, shipping rates and product images", async () => {
    expect((await as("authenticated", ADMIN, "update public.products set base_price = 150 where slug = 'chef-apron'")).affected).toBe(1);
    expect((await as("authenticated", ADMIN, "update public.shipping_rates set fee = 55 where governorate = 'الجيزة'")).affected).toBe(1);
    expect(
      (await as("authenticated", ADMIN, "insert into public.categories (slug, name_ar) values ('mugs', 'الأكواب')")).error,
    ).toBeUndefined();
    expect((await as("authenticated", ADMIN, "insert into storage.objects (bucket_id, name) values ('product-images', 'new.png')")).error).toBeUndefined();
    expect((await as("authenticated", ADMIN, "delete from storage.objects where bucket_id = 'designs'")).affected).toBe(1);
  });

  it("can see inactive products too", async () => {
    await setup("update public.products set is_active = false where slug = 'chef-apron'");
    expect((await as("authenticated", ADMIN, "select * from public.products")).rows).toHaveLength(34); // + the 2 hidden DIY and 2 hidden couples products
    expect((await as("authenticated", CUSTOMER, "select * from public.products")).rows).toHaveLength(29);
    await setup("update public.products set is_active = true where slug = 'chef-apron'");
  });
});

describe("create_order (service role)", () => {
  it("keeps each ordered product's original image after the product changes or is deleted", async () => {
    await db.transaction(async (tx) => {
      const { rows: products } = await tx.query<{ id: string; images: unknown[] }>(
        "select id, images from public.products where jsonb_array_length(images) > 0 order by id limit 2",
      );
      expect(products).toHaveLength(2);
      await tx.exec("set local role service_role");
      const { rows: [{ id }] } = await tx.query<{ id: string }>(
        "select public.create_order($1::jsonb, $2::jsonb) ->> 'id' as id",
        [JSON.stringify(order({ payment_proof_path: "proofs/2026-11/22222222-2222-4222-8222-222222222222.png" })), JSON.stringify(products.map((p) => item({ product_id: p.id })))],
      );
      await tx.exec("reset role");
      await tx.query("update public.products set images = '[]' where id = $1", [products[0].id]);
      await tx.query("delete from public.products where id = $1", [products[1].id]);
      const { rows } = await tx.query(
        "select product_id, product_image_snapshot from public.order_items where order_id = $1",
        [id],
      );
      expect(rows).toEqual(expect.arrayContaining([
        { product_id: products[0].id, product_image_snapshot: products[0].images[0] },
        { product_id: null, product_image_snapshot: products[1].images[0] },
      ]));
      await tx.rollback();
    });
  });

  it("creates the order and its items atomically and numbers orders from 1001", async () => {
    const r = await as<{ r: { id: string; number: number } }>(
      "service_role",
      null,
      "select public.create_order($1::jsonb, $2::jsonb) as r",
      [JSON.stringify(order({ payment_proof_path: "proofs/2026-11/22222222-2222-4222-8222-222222222222.png" })), JSON.stringify([item(), item({ mode: "standard", text: "", font: "", unit_price: 100, qty: 1 }), item({ mode: "design", text: "", font: "", design_path: "uploads/x/y.png" })])],
    );
    expect(r.error).toBeUndefined();
    expect(r.rows[0].r.number).toBeGreaterThanOrEqual(1001);
  });

  it("rolls everything back when an item is invalid", async () => {
    // committed (not rolled back by the helper) so a leftover row would be visible
    const count = async () => ((await db.query<{ n: number }>("select count(*)::int n from public.orders")).rows[0].n);
    const before = await count();
    const bad = JSON.stringify([item(), item({ mode: "name", text: "", font: "ruqaa" })]);
    await expect(db.query("select public.create_order($1::jsonb, $2::jsonb)", [JSON.stringify(order()), bad])).rejects.toThrow();
    expect(await count()).toBe(before);
  });

  it("enforces data rules in the database", async () => {
    const bad = async (o: Record<string, unknown>, i = [item()]) =>
      (await as("service_role", null, "select public.create_order($1::jsonb, $2::jsonb)", [JSON.stringify(order(o)), JSON.stringify(i)])).error;
    expect(await bad({ phone: "0123" })).toBeDefined();
    expect(await bad({ phone: "01312345678" })).toBeDefined();
    expect(await bad({ governorate: "Atlantis" })).toBeDefined();
    expect(await bad({ payment_method: "card" })).toBeDefined();
    expect(await bad({}, [item({ qty: 51 })])).toBeDefined();
    expect(await bad({}, [item({ text: "ا".repeat(19) })])).toBeDefined();
    expect(await bad({}, [item({ mode: "standard", text: "x" })])).toBeDefined();
    expect(await bad({}, [])).toBeDefined();
  });
});

describe("grant_admin", () => {
  it("fails for an unknown email and cannot be run by signed-in users", async () => {
    expect((await as("service_role", null, "select public.grant_admin('nobody@example.com')")).error).toMatch(/No auth user/);
    expect((await as("authenticated", CUSTOMER, "select public.grant_admin('customer@example.com')")).code).toBe("42501");
  });
});

describe("reviews + category accent colour", () => {
  beforeAll(async () => {
    await setup(
      `insert into public.reviews (customer_name, text, is_published, sort) values ('منى', 'حلوة جدا', true, 1), ('سارة', 'مخفية', false, 2)`,
    );
  });

  it("anon sees published reviews only and cannot write", async () => {
    const r = await as<{ customer_name: string }>("anon", null, "select customer_name from public.reviews");
    expect(r.rows.map((x) => x.customer_name)).toEqual(["منى"]);
    expect((await as("anon", null, "insert into public.reviews (customer_name, text) values ('x','y')")).code).toBe("42501");
    expect((await as("anon", null, "update public.reviews set is_published = true")).code).toBe("42501");
    expect((await as("anon", null, "delete from public.reviews")).code).toBe("42501");
  });

  it("a signed-in customer (not admin) sees published only and cannot write", async () => {
    const r = await as("authenticated", CUSTOMER, "select id from public.reviews");
    expect(r.rows).toHaveLength(1);
    const ins = await as("authenticated", CUSTOMER, "insert into public.reviews (customer_name, text) values ('x','y')");
    expect(ins.error).toBeDefined();
    const upd = await as("authenticated", CUSTOMER, "update public.reviews set is_published = true");
    expect(upd.affected ?? 0).toBe(0);
  });

  it("an admin sees everything and can add, edit and delete", async () => {
    expect((await as("authenticated", ADMIN, "select id from public.reviews")).rows).toHaveLength(2);
    const ins = await as("authenticated", ADMIN, "insert into public.reviews (customer_name, text, avatar_color) values ('نور','تمام','#F6D6DC') returning id");
    expect(ins.error).toBeUndefined();
    expect((await as("authenticated", ADMIN, "update public.reviews set is_published = true where customer_name = 'سارة'")).affected).toBe(1);
    expect((await as("authenticated", ADMIN, "delete from public.reviews where customer_name = 'سارة'")).affected).toBe(1);
  });

  it("validates review fields and colours in the database", async () => {
    const bad = async (sql: string) => (await as("authenticated", ADMIN, sql)).error;
    expect(await bad("insert into public.reviews (customer_name, text) values ('', 'x')")).toBeDefined();
    expect(await bad("insert into public.reviews (customer_name, text) values ('x', '')")).toBeDefined();
    expect(await bad("insert into public.reviews (customer_name, text, avatar_color) values ('x','y','red')")).toBeDefined();
    expect(await bad("update public.categories set accent_color = 'blue'")).toBeDefined();
  });

  it("seeds a hover colour per category and lets only admins change it", async () => {
    const c = await as<{ slug: string; accent_color: string }>("postgres", null, "select slug, accent_color from public.categories order by sort");
    expect(Object.fromEntries(c.rows.map((r) => [r.slug, r.accent_color]))).toEqual({ towels: "#EFE6D6", aprons: "#F6D6DC", bags: "#F2C94C" });
    expect((await as("authenticated", ADMIN, "update public.categories set accent_color = '#112233' where slug = 'bags'")).affected).toBe(1);
    expect((await as("anon", null, "update public.categories set accent_color = '#112233'")).code).toBe("42501");
  });
});


describe("deposit payment gate", () => {
  it("keeps receipts private and requires admin verification before fulfillment", async () => {
    const { rows: [order] } = await db.query<{ id: string }>("select id from public.orders where deposit_status = 'submitted' limit 1");
    expect(order).toBeDefined();
    expect((await as("anon", null, "select * from storage.objects where bucket_id = 'payment-proofs'")).rows).toHaveLength(0);
    expect((await as("authenticated", CUSTOMER, "select * from storage.objects where bucket_id = 'payment-proofs'")).rows).toHaveLength(0);
    expect((await as("authenticated", ADMIN, "select * from storage.objects where bucket_id = 'payment-proofs'")).rows.length).toBeGreaterThan(0);
    expect((await as("authenticated", ADMIN, "update public.orders set status = 'prepared' where id = $1", [order.id])).error).toMatch(/verify deposit/);
    expect((await as("service_role", null, "update public.orders set deposit_status = 'confirmed' where id = $1", [order.id])).error).toMatch(/only an admin/);
    expect((await as("authenticated", ADMIN, "update public.orders set deposit_status = null, deposit_amount = 0 where id = $1", [order.id])).error).toBeDefined();
    const verified = await as("authenticated", ADMIN, "update public.orders set deposit_status = 'confirmed' where id = $1 returning deposit_status, deposit_confirmed_by, deposit_confirmed_at", [order.id]);
    expect(verified.error).toBeUndefined();
    expect(verified.rows[0]).toMatchObject({ deposit_status: "confirmed", deposit_confirmed_by: ADMIN });
    expect(verified.rows[0].deposit_confirmed_at).toBeTruthy();
    // The helper rolls the update back, so a receipt alone still remains unverified.
    const { rows } = await db.query<{ deposit_status: string; deposit_amount: string; total: string }>("select deposit_status, deposit_amount, total from public.orders where id = $1", [order.id]);
    expect(rows[0].deposit_status).toBe("submitted");
    expect(Number(rows[0].deposit_amount)).toBe(Number(rows[0].total) * 0.3);
  });

  it("rejects receipt reuse and missing proofs in the atomic order RPC", async () => {
    const before = (await db.query<{ n: number }>("select count(*)::int n from public.orders")).rows[0].n;
    for (const payment_proof_path of [null, "proofs/2026-11/33333333-3333-4333-8333-333333333333.png", order().payment_proof_path]) {
      const result = await as("service_role", null, "select public.create_order($1::jsonb, $2::jsonb)", [JSON.stringify(order({ payment_proof_path })), JSON.stringify([item()])]);
      expect(result.error).toBeDefined();
    }
    expect((await db.query<{ n: number }>("select count(*)::int n from public.orders")).rows[0].n).toBe(before);
  });
});

describe("colours + one price per colour (migration …1200)", () => {
  const APRON = "00000000-0000-4000-8000-000000000001"; // chef-apron (aprons: has_colors)
  const bagId = async () => (await db.query<{ id: string }>("select p.id from public.products p join public.categories c on c.id = p.category_id where c.slug = 'bags' limit 1")).rows[0].id;
  const proof = (n: number) => `proofs/2026-11/${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}.png`;

  it("is additive: keeps personalization_fee (old code reads it) and seeds three colours for towels and aprons only", async () => {
    const fee = await db.query<{ n: number }>("select count(*)::int n from information_schema.columns where table_name = 'products' and column_name = 'personalization_fee'");
    expect(fee.rows[0].n).toBe(1);
    const colors = await as<{ id: string; name_ar: string }>("anon", null, "select id, name_ar from public.colors order by sort");
    expect(colors.rows).toEqual([{ id: "black", name_ar: "أسود" }, { id: "white", name_ar: "أبيض" }, { id: "pink", name_ar: "وردي" }]);
    const cats = await as<{ slug: string; has_colors: boolean }>("postgres", null, "select slug, has_colors from public.categories order by sort");
    expect(Object.fromEntries(cats.rows.map((c) => [c.slug, c.has_colors]))).toEqual({ towels: true, aprons: true, bags: false });
    const rows = await as<{ slug: string; n: number; same: boolean }>("postgres", null, `
      select c.slug, count(pc.*)::int n, bool_and(pc.price = p.base_price) same
      from public.products p join public.categories c on c.id = p.category_id
      left join public.product_colors pc on pc.product_id = p.id where not p.is_diy and p.pieces_count = 1 group by c.slug order by c.slug`);
    expect(rows.rows).toEqual([
      { slug: "aprons", n: 30, same: true },
      { slug: "bags", n: 0, same: null },
      { slug: "towels", n: 30, same: true },
    ]);
  });

  it("anon reads only available colours of visible products and cannot write", async () => {
    await setup("update public.product_colors set is_available = false where product_id = $1 and color_id = 'white'", [APRON]);
    const visible = await as<{ color_id: string }>("anon", null, "select color_id from public.product_colors where product_id = $1 order by color_id", [APRON]);
    expect(visible.rows.map((r) => r.color_id)).toEqual(["black", "pink"]);
    await setup("update public.product_colors set is_available = true where product_id = $1", [APRON]);
    for (const sql of [
      "update public.product_colors set price = 1",
      "insert into public.colors (id, name_ar, hex) values ('red', 'أحمر', '#FF0000')",
      "delete from public.product_colors",
    ]) expect((await as("anon", null, sql)).code).toBe("42501");
    expect((await as("authenticated", CUSTOMER, "update public.product_colors set price = 1")).affected).toBe(0);
    expect((await as("authenticated", CUSTOMER, "select public.admin_save_product_colors($1, '[]'::jsonb)", [APRON])).error).toMatch(/Admin access required/);
  });

  it("admin_save_product_colors replaces the colour set and keeps base_price at the lowest available price", async () => {
    const r = await as<{ base_price: string }>("authenticated", ADMIN, `
      select public.admin_save_product_colors($1, $2::jsonb);
      `, [APRON, JSON.stringify([{ color_id: "black", price: 150, is_available: true }, { color_id: "pink", price: 120, is_available: true }, { color_id: "white", price: 90, is_available: false }])]);
    expect(r.error).toBeUndefined();
    // the helper rolls back; run it for real to check the result
    await db.exec("begin");
    await db.exec("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ADMIN, role: "authenticated" })]);
    await db.query("select public.admin_save_product_colors($1, $2::jsonb)", [APRON, JSON.stringify([{ color_id: "black", price: 150, is_available: true }, { color_id: "pink", price: 120, is_available: true }, { color_id: "white", price: 90, is_available: false }])]);
    const saved = await db.query<{ color_id: string; price: string; is_available: boolean }>("select color_id, price, is_available from public.product_colors where product_id = $1 order by color_id", [APRON]);
    const base = await db.query<{ base_price: string }>("select base_price from public.products where id = $1", [APRON]);
    await db.query("select public.admin_save_product_colors($1, $2::jsonb)", [APRON, JSON.stringify([{ color_id: "black", price: 150, is_available: true }])]);
    const pruned = await db.query<{ color_id: string }>("select color_id from public.product_colors where product_id = $1", [APRON]);
    await db.exec("rollback");
    expect(saved.rows.map((x) => [x.color_id, Number(x.price), x.is_available])).toEqual([["black", 150, true], ["pink", 120, true], ["white", 90, false]]);
    expect(Number(base.rows[0].base_price)).toBe(120); // the unavailable white (90) does not count
    expect(pruned.rows.map((x) => x.color_id)).toEqual(["black"]);
  });

  it("create_order snapshots the colour name and only accepts colours the product is sold in", async () => {
    await setup(`insert into storage.objects (bucket_id, name) values ('payment-proofs', $1), ('payment-proofs', $2), ('payment-proofs', $3)`, [proof(4), proof(5), proof(6)]);
    const ok = await as<{ create_order: { id: string } }>("service_role", null, "select public.create_order($1::jsonb, $2::jsonb)", [
      JSON.stringify(order({ payment_proof_path: proof(4) })), JSON.stringify([item({ color: "pink" })]),
    ], true);
    expect(ok.error).toBeUndefined();
    const saved = await db.query<{ color: string; color_name: string }>("select color, color_name from public.order_items where order_id = $1", [ok.rows[0].create_order.id]);
    expect(saved.rows).toEqual([{ color: "pink", color_name: "وردي" }]);

    await setup("update public.product_colors set is_available = false where product_id = $1 and color_id = 'white'", [APRON]);
    const bag = await bagId();
    for (const [p, items] of [
      [proof(5), [item({ color: "white" })]], // not available for this product
      [proof(5), [item({ color: "red" })]], // not a colour at all
      [proof(5), [item({ color: null, font: "kufi" })]], // colour products need a colour
      [proof(6), [item({ product_id: bag, mode: "standard", text: null, color: "black" })]], // bags have no colours
    ] as const) {
      const r = await as("service_role", null, "select public.create_order($1::jsonb, $2::jsonb)", [JSON.stringify(order({ payment_proof_path: p })), JSON.stringify(items)]);
      expect(r.error).toBeDefined();
    }
    await setup("update public.product_colors set is_available = true where product_id = $1", [APRON]);
    const plainBag = await as("service_role", null, "select public.create_order($1::jsonb, $2::jsonb)", [
      JSON.stringify(order({ deposit_method: null, payment_proof_path: null })), JSON.stringify([item({ product_id: bag, mode: "standard", text: null, color: null })]),
    ]);
    expect(plainBag.error).toBeUndefined();
  });
});

describe("migration …1200 on existing data", () => {
  it("keeps stored order prices and the old fee values, and backfills colour names", async () => {
    const legacy = new PGlite();
    try {
      await legacy.exec(BOOTSTRAP);
      const dir = path.resolve("supabase/migrations");
      const files = readdirSync(dir).filter((x) => x.endsWith(".sql")).sort();
      for (const f of files.filter((x) => x < "20260101001200")) await legacy.exec(readFileSync(path.join(dir, f), "utf8"));
      await legacy.exec(`
        update public.shipping_rates set fee = 40 where governorate = 'القاهرة';
        update public.products set personalization_fee = 25, base_price = 110 where slug = 'chef-apron';
        insert into public.orders (id, customer_name, phone, governorate, area, address, subtotal, shipping, total)
        values ('99999999-9999-4999-8999-999999999999', 'Old Order', '01012345678', 'القاهرة', 'x', 'abc', 270, 40, 310);
        insert into public.order_items (order_id, product_id, name_snapshot, mode, text, font, color, unit_price, qty)
        values ('99999999-9999-4999-8999-999999999999', '00000000-0000-4000-8000-000000000001', 'مريلة', 'name', 'Fatma', null, 'pink', 135, 2);
      `);
      await legacy.exec(readFileSync(path.join(dir, "20260101001200_colors_single_price.sql"), "utf8"));
      const o = await legacy.query<{ subtotal: string; total: string; unit_price: string; color_name: string }>(`
        select o.subtotal, o.total, i.unit_price, i.color_name from public.orders o join public.order_items i on i.order_id = o.id`);
      expect(o.rows[0]).toMatchObject({ color_name: "وردي" });
      expect([Number(o.rows[0].subtotal), Number(o.rows[0].total), Number(o.rows[0].unit_price)]).toEqual([270, 310, 135]);
      const p = await legacy.query<{ fee: string; prices: string[] }>(`
        select p.personalization_fee fee, array_agg(pc.price::text order by pc.color_id) prices
        from public.products p join public.product_colors pc on pc.product_id = p.id where p.slug = 'chef-apron' group by p.personalization_fee`);
      expect(Number(p.rows[0].fee)).toBe(25); // untouched: the code deployed before the migration still reads it
      expect(p.rows[0].prices.map(Number)).toEqual([110, 110, 110]);
    } finally {
      await legacy.close();
    }
  });
});

describe("old admin after migration …1200 (base_price only)", () => {
  const TOWELS = "10000000-0000-4000-8000-000000000001";
  const BAGS = "10000000-0000-4000-8000-000000000003";
  const colorsOf = async (id: string) =>
    Object.fromEntries((await db.query<{ color_id: string; price: string }>("select color_id, price from public.product_colors where product_id = $1", [id])).rows.map((r) => [r.color_id, Number(r.price)]));

  it("a towel added the old way gets every colour at its price (stays orderable)", async () => {
    const { rows: [p] } = await db.query<{ id: string }>("insert into public.products (slug, name_ar, category_id, base_price, personalization_fee) values ('old-admin-towel', 'فوطة', $1, 95, 20) returning id", [TOWELS]);
    expect(await colorsOf(p.id)).toEqual({ black: 95, white: 95, pink: 95 });
    const { rows: [bag] } = await db.query<{ id: string }>("insert into public.products (slug, name_ar, category_id, base_price) values ('old-admin-bag', 'شنطة', $1, 80) returning id", [BAGS]);
    expect(await colorsOf(bag.id)).toEqual({});
  });

  it("an old-admin price change moves uniform colour prices, never individually set ones", async () => {
    const { rows: [p] } = await db.query<{ id: string }>("select id from public.products where slug = 'old-admin-towel'");
    await db.query("update public.products set base_price = 110 where id = $1", [p.id]);
    expect(await colorsOf(p.id)).toEqual({ black: 110, white: 110, pink: 110 });
    await db.query("update public.product_colors set price = 150 where product_id = $1 and color_id = 'pink'", [p.id]);
    await db.query("update public.products set base_price = 120 where id = $1", [p.id]);
    expect(await colorsOf(p.id)).toEqual({ black: 110, white: 110, pink: 150 });
  });

  it("a colour removed by the new admin does not come back on a price change", async () => {
    const { rows: [p] } = await db.query<{ id: string }>("select id from public.products where slug = 'old-admin-towel'");
    await db.query("delete from public.product_colors where product_id = $1 and color_id = 'white'", [p.id]);
    await db.query("update public.products set base_price = 125 where id = $1", [p.id]);
    expect(Object.keys(await colorsOf(p.id)).sort()).toEqual(["black", "pink"]);
  });
});

describe("suggestions (migration …1300)", () => {
  const anyOrder = async () => (await db.query<{ id: string }>("select id from public.orders limit 1")).rows[0].id;

  it("nobody but the server (service role) can insert; anon and customers cannot read", async () => {
    expect((await as("anon", null, "insert into public.suggestions (text) values ('x')")).code).toBe("42501");
    expect((await as("authenticated", CUSTOMER, "insert into public.suggestions (text) values ('x')")).code).toBe("42501");
    expect((await as("authenticated", ADMIN, "insert into public.suggestions (text) values ('x')")).code).toBe("42501");
    const ok = await as("service_role", null, "insert into public.suggestions (text, order_id) values ('عايزين مريلة أطفال', $1)", [await anyOrder()], true);
    expect(ok.error).toBeUndefined();
    expect((await as("anon", null, "select * from public.suggestions")).code).toBe("42501");
    expect((await as("authenticated", CUSTOMER, "select * from public.suggestions")).rows).toHaveLength(0);
    expect((await as("authenticated", CUSTOMER, "update public.suggestions set is_read = true")).affected).toBe(0);
  });

  it("validates text in the database", async () => {
    for (const text of ["", "   ", "x".repeat(501)]) {
      expect((await as("service_role", null, "insert into public.suggestions (text) values ($1)", [text])).error).toBeDefined();
    }
  });

  it("admins read and mark as read, but cannot edit or delete what customers sent", async () => {
    // (migration …1400 adds one sample suggestion; this test looks at the customer's one)
    const mine = "where text = 'عايزين مريلة أطفال'";
    const r = await as<{ text: string; is_read: boolean }>("authenticated", ADMIN, `select text, is_read from public.suggestions ${mine}`);
    expect(r.rows).toEqual([{ text: "عايزين مريلة أطفال", is_read: false }]);
    expect((await as("authenticated", ADMIN, `update public.suggestions set is_read = true ${mine}`)).affected).toBe(1);
    expect((await as("authenticated", ADMIN, "update public.suggestions set text = 'changed'")).error).toMatch(/only is_read/);
    expect((await as("authenticated", ADMIN, `update public.suggestions set order_id = null ${mine}`)).affected).toBe(1); // unlinking is allowed (FK set null path)
  });

  it("keeps the suggestion when its order is deleted", async () => {
    const order = await anyOrder();
    await setup("insert into public.suggestions (text, order_id) values ('tied to an order', $1)", [order]);
    await db.exec("begin");
    await db.query("delete from public.orders where id = $1", [order]);
    const left = await db.query<{ order_id: string | null }>("select order_id from public.suggestions where text = 'tied to an order'");
    await db.exec("rollback");
    expect(left.rows).toEqual([{ order_id: null }]);
  });
});

describe("public suggestions + DIY products (migration …1400)", () => {
  it("the sample suggestion is public, under review, with a reply", async () => {
    const { rows } = await db.query<{ status: string; admin_reply: string; is_public: boolean }>(
      "select status, admin_reply, is_public from public.suggestions where text = 'عايزين تضيفوا مريلة أطفال بأسامي الولاد'",
    );
    expect(rows).toEqual([{ status: "reviewing", admin_reply: "فكرة حلوة! بندرسها دلوقتي.", is_public: true }]);
  });

  it("(…1500) every suggestion is public; anon reads text + created_at only, never the order", async () => {
    await setup("insert into public.suggestions (text) values ('private one')");
    const { rows: [fresh] } = await db.query<{ is_public: boolean }>("select is_public from public.suggestions where text = 'private one'");
    expect(fresh.is_public).toBe(true);
    expect((await db.query("select 1 from public.suggestions where not is_public")).rows).toHaveLength(0);
    const r = await as<{ text: string }>("anon", null, "select text, created_at from public.suggestions order by created_at");
    expect(r.error).toBeUndefined();
    expect(r.rows.map((x) => x.text)).toContain("private one");
    expect(r.rows.map((x) => x.text)).toContain("عايزين مريلة أطفال"); // sent with an order, still public
    for (const col of ["order_id", "id", "is_read", "*"]) {
      expect((await as("anon", null, `select ${col} from public.suggestions`)).code).toBe("42501");
    }
    for (const sql of ["update public.suggestions set text = 'x'", "delete from public.suggestions", "insert into public.suggestions (text) values ('spam')"]) {
      expect((await as("anon", null, sql)).code).toBe("42501");
    }
    // logged-in non-admins still see nothing and cannot delete
    expect((await as("authenticated", CUSTOMER, "select text from public.suggestions")).rows).toHaveLength(0);
    expect((await as("authenticated", CUSTOMER, "delete from public.suggestions")).affected).toBe(0);
  });

  it("(…1500) admins can delete a suggestion", async () => {
    const del = await as("authenticated", ADMIN, "delete from public.suggestions where text = 'private one'", [], true);
    expect(del.affected).toBe(1);
    expect((await db.query("select 1 from public.suggestions where text = 'private one'")).rows).toHaveLength(0);
  });

  it("creates the two DIY products hidden, in every colour, and hides them from the public", async () => {
    const { rows } = await db.query<{ slug: string; is_active: boolean; is_diy: boolean; cat: string; colors: number }>(
      `select p.slug, p.is_active, p.is_diy, c.slug as cat,
              (select count(*)::int from public.product_colors pc where pc.product_id = p.id) as colors
       from public.products p join public.categories c on c.id = p.category_id where p.is_diy order by p.slug`,
    );
    expect(rows).toEqual([
      { slug: "diy-apron", is_active: false, is_diy: true, cat: "aprons", colors: 3 },
      { slug: "diy-towel", is_active: false, is_diy: true, cat: "towels", colors: 3 },
    ]);
    expect((await as("anon", null, "select slug from public.products where is_diy")).rows).toHaveLength(0);
    // existing products are not DIY
    expect((await db.query("select 1 from public.products where not is_diy")).rows.length).toBeGreaterThan(0);
  });
});

describe("couples products (migration …1600)", () => {
  // every order needs its own transfer proof (orders.payment_proof_path is unique)
  const proofs = [1, 2, 3, 4, 5, 6].map((n) => `proofs/2026-11/7777777${n}-7777-4777-8777-777777777777.png`);
  let next = 0;
  const couplesId = async (slug = "couples-apron-chef-mouse") =>
    (await db.query<{ id: string }>("select id from public.products where slug = $1", [slug])).rows[0].id;
  const pieces = (mode: "name" | "design" | "standard") => [
    { label: "المريلة الأولى", color: "black", color_name: "أسود", text: mode === "name" ? "Beso kitchen" : null, font: mode === "name" ? "kufi" : null, design_path: mode === "design" ? "uploads/2026-11/aaaa.png" : null, design_name: null },
    { label: "المريلة التانية", color: "pink", color_name: "وردي", text: mode === "name" ? "فاطمة" : null, font: mode === "name" ? "kufi" : null, design_path: mode === "design" ? "uploads/2026-11/bbbb.png" : null, design_name: null },
  ];
  const place = (items: unknown[], persist = false) =>
    as<{ create_order: { id: string } }>("service_role", null, "select public.create_order($1::jsonb, $2::jsonb)", [JSON.stringify(order({ payment_proof_path: proofs[next++], subtotal: 650, total: 690 })), JSON.stringify(items)], persist);

  it("creates the two couples aprons hidden, 650 for the pair, in all three colours", async () => {
    const { rows } = await db.query<{ slug: string; name_ar: string; is_active: boolean; base_price: string; pieces_count: number; piece_labels: string[]; cat: string; colors: string[] }>(
      `select p.slug, p.name_ar, p.is_active, p.base_price, p.pieces_count, p.piece_labels, c.slug as cat,
              array(select pc.color_id from public.product_colors pc where pc.product_id = p.id and pc.is_available order by pc.color_id) as colors
       from public.products p join public.categories c on c.id = p.category_id where p.pieces_count = 2 order by p.slug`,
    );
    expect(rows.map((r) => ({ ...r, base_price: Number(r.base_price) }))).toEqual([
      { slug: "couples-apron-chef-mouse", name_ar: "مريلة كابلز الفار الطباخ", is_active: false, base_price: 650, pieces_count: 2, piece_labels: ["المريلة الأولى", "المريلة التانية"], cat: "aprons", colors: ["black", "pink", "white"] },
      { slug: "couples-apron-teddy", name_ar: "مريلة كابلز دبدوب", is_active: false, base_price: 650, pieces_count: 2, piece_labels: ["المريلة الأولى", "المريلة التانية"], cat: "aprons", colors: ["black", "pink", "white"] },
    ]);
    expect((await as("anon", null, "select slug from public.products where pieces_count = 2")).rows).toHaveLength(0);
    expect((await db.query("select 1 from public.products where pieces_count not between 1 and 2")).rows).toHaveLength(0);
  });

  it("create_order stores the pieces snapshot (piece 1 in the item's own columns)", async () => {
    for (const p of proofs) await setup("insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)", [p]);
    const id = await couplesId();
    const ok = await place([item({ product_id: id, name_snapshot: "مريلة كابلز الفار الطباخ", mode: "name", text: "Beso kitchen", font: null, color: "black", unit_price: 650, qty: 1, pieces: pieces("name") })], true);
    expect(ok.error).toBeUndefined();
    const saved = await db.query<{ text: string; font: string | null; color: string; pieces: { text: string; color: string; font: string }[] }>(
      "select text, font, color, pieces from public.order_items where order_id = $1", [ok.rows[0].create_order.id]);
    expect(saved.rows[0]).toMatchObject({ text: "Beso kitchen", font: null, color: "black" });
    expect(saved.rows[0].pieces.map((p) => [p.text, p.color, p.font])).toEqual([["Beso kitchen", "black", "kufi"], ["فاطمة", "pink", "kufi"]]);

    // normal orders are unchanged: no pieces sent -> null
    const plain = await place([item({ unit_price: 125, qty: 1 })], true);
    expect(plain.error).toBeUndefined();
    const p2 = await db.query<{ pieces: unknown }>("select pieces from public.order_items where order_id = $1", [plain.rows[0].create_order.id]);
    expect(p2.rows[0].pieces).toBeNull();
  });

  it("create_order rejects a couples item without its pieces, and pieces on a normal product", async () => {
    const id = await couplesId();
    for (const items of [
      [item({ product_id: id, mode: "standard", text: null, color: "black" })], // couples without pieces
      [item({ product_id: id, mode: "standard", text: null, color: "black", pieces: pieces("standard").slice(0, 1) })], // only one piece
      [item({ pieces: pieces("standard") })], // pieces on a normal product
    ]) {
      expect((await place(items)).error).toBeDefined();
    }
    // the table itself refuses a malformed snapshot
    const anyItem = (await db.query<{ id: string }>("select id from public.order_items limit 1")).rows[0].id;
    expect((await as("postgres", null, "update public.order_items set pieces = '{}'::jsonb where id = $1", [anyItem])).error).toBeDefined();
    expect((await as("postgres", null, "update public.order_items set pieces = '[1]'::jsonb where id = $1", [anyItem])).error).toBeDefined();
  });

  it("design_paths_in_use sees designs inside pieces; only the server may call it", async () => {
    const id = await couplesId("couples-apron-teddy");
    const ok = await place([item({ product_id: id, name_snapshot: "مريلة كابلز دبدوب", mode: "design", text: null, font: null, design_path: "uploads/2026-11/aaaa.png", color: "black", unit_price: 650, qty: 1, pieces: pieces("design") })], true);
    expect(ok.error).toBeUndefined();
    const used = await as<{ p: string }>("service_role", null, "select public.design_paths_in_use($1) as p", [["uploads/2026-11/aaaa.png", "uploads/2026-11/bbbb.png", "uploads/2026-11/unused.png"]]);
    expect(used.rows.map((r) => r.p).sort()).toEqual(["uploads/2026-11/aaaa.png", "uploads/2026-11/bbbb.png"]);
    expect((await as("anon", null, "select public.design_paths_in_use($1)", [["x"]])).code).toBe("42501");
    expect((await as("authenticated", CUSTOMER, "select public.design_paths_in_use($1)", [["x"]])).code).toBe("42501");
  });
});

describe("storage management (migration …1800)", () => {
  // a plain bag order (no deposit) through create_order, then shaped directly as the owner
  const bag = async () => (await db.query<{ id: string }>("select p.id from public.products p join public.categories c on c.id = p.category_id where c.slug = 'bags' limit 1")).rows[0].id;
  async function mkOrder(opts: { status?: string; monthsAgo?: number; proof?: string; designs?: string[]; pieces?: string[] } = {}) {
    const r = await as<{ create_order: { id: string; number: number } }>("service_role", null, "select public.create_order($1::jsonb, $2::jsonb)", [
      JSON.stringify(order({ deposit_method: null, payment_proof_path: null, subtotal: 100, total: 140 })),
      JSON.stringify([item({ product_id: await bag(), mode: "standard", text: null, color: null, unit_price: 100, qty: 1 })]),
    ], true);
    if (r.error) throw new Error(r.error);
    const { id, number } = r.rows[0].create_order;
    await setup(
      `update public.orders set status = $2, created_at = now() - make_interval(months => $3::int)
         ${opts.proof ? ", deposit_status = 'confirmed', deposit_amount = round(total * 0.3, 2), deposit_method = 'instapay', payment_proof_path = $4, deposit_confirmed_at = now(), deposit_confirmed_by = '" + ADMIN + "'" : ""}
       where id = $1`,
      opts.proof ? [id, opts.status ?? "new", opts.monthsAgo ?? 0, opts.proof] : [id, opts.status ?? "new", opts.monthsAgo ?? 0],
    );
    for (const d of opts.designs ?? []) {
      await setup("insert into public.order_items (order_id, name_snapshot, mode, design_path, unit_price, qty) values ($1, 'تصميم', 'design', $2, 100, 1)", [id, d]);
    }
    if (opts.pieces?.length) {
      await setup(
        "insert into public.order_items (order_id, name_snapshot, mode, design_path, unit_price, qty, pieces) values ($1, 'كابلز', 'design', $2, 650, 1, $3::jsonb)",
        [id, opts.pieces[0], JSON.stringify(opts.pieces.map((p, i) => ({ label: `قطعة ${i + 1}`, design_path: p })))],
      );
    }
    for (const [bucket, path] of [...(opts.proof ? [["payment-proofs", opts.proof]] : []), ...[...(opts.designs ?? []), ...(opts.pieces ?? [])].map((p) => ["designs", p])]) {
      await setup("insert into storage.objects (bucket_id, name, metadata) values ($1, $2, jsonb_build_object('size', 150000)) on conflict do nothing", [bucket, path]);
    }
    return { id, number };
  }
  const P = (n: number) => `proofs/2026-01/8888888${n}-8888-4888-8888-888888888888.png`;
  const D = (n: string) => `uploads/2026-01/${n}.png`;

  it("only admins can delete orders; items go with them, suggestions stay unlinked, numbers are not reused", async () => {
    const a = await mkOrder({ designs: [D("del-a")] });
    await setup("insert into public.suggestions (text, order_id) values ('linked to a deleted order', $1)", [a.id]);
    expect((await as("anon", null, "delete from public.orders where id = $1", [a.id])).code).toBe("42501");
    expect((await as("authenticated", CUSTOMER, "delete from public.orders where id = $1", [a.id])).affected).toBe(0);
    expect((await db.query("select 1 from public.orders where id = $1", [a.id])).rows).toHaveLength(1);

    const del = await as("authenticated", ADMIN, "delete from public.orders where id = $1", [a.id], true);
    expect(del.affected).toBe(1);
    expect((await db.query("select 1 from public.order_items where order_id = $1", [a.id])).rows).toHaveLength(0);
    expect((await db.query<{ order_id: string | null }>("select order_id from public.suggestions where text = 'linked to a deleted order'")).rows).toEqual([{ order_id: null }]);

    const b = await mkOrder();
    expect(Number(b.number)).toBeGreaterThan(Number(a.number)); // the deleted number is never handed out again
  });

  it("cleanup lists files of old delivered / cancelled orders only, and never a design another order still uses", async () => {
    await mkOrder({ status: "delivered", monthsAgo: 8, proof: P(1), designs: [D("old-delivered")], pieces: [D("old-piece-1"), D("old-piece-2")] });
    await mkOrder({ status: "cancelled", monthsAgo: 13, designs: [D("old-cancelled")] });
    await mkOrder({ status: "delivered", monthsAgo: 2, proof: P(2), designs: [D("recent-delivered")] }); // too recent
    await mkOrder({ status: "shipped", monthsAgo: 9, designs: [D("old-shipped")] }); // wrong status
    await mkOrder({ status: "delivered", monthsAgo: 9, designs: [D("shared")] }); // shared with …
    await mkOrder({ status: "new", monthsAgo: 0, designs: [D("shared")] }); // … a current order
    const list = async (months: number) =>
      (await as<{ path: string; bytes: string }>("authenticated", ADMIN, "select path, bytes from public.admin_file_cleanup_candidates($1) order by path", [months])).rows;

    const six = await list(6);
    expect(six.map((r) => r.path)).toEqual([D("old-cancelled"), D("old-delivered"), D("old-piece-1"), D("old-piece-2"), P(1)].sort());
    expect(six.every((r) => Number(r.bytes) === 150000)).toBe(true);
    expect((await list(12)).map((r) => r.path)).toEqual([D("old-cancelled")]);
    expect((await list(3)).map((r) => r.path)).not.toContain(D("recent-delivered"));
    for (const months of [3, 6, 12]) expect((await list(months)).map((r) => r.path)).not.toContain(D("shared"));

    // a file that is already gone is not listed again
    await setup("delete from storage.objects where name = $1", [D("old-cancelled")]);
    expect((await list(12)).map((r) => r.path)).toEqual([]);
  });

  it("cleanup and usage are closed to everyone else", async () => {
    expect((await as("anon", null, "select * from public.admin_file_cleanup_candidates(6)")).code).toBe("42501");
    expect((await as("authenticated", CUSTOMER, "select * from public.admin_file_cleanup_candidates(6)")).code).toBe("42501");
    expect((await as("authenticated", ADMIN, "select * from public.admin_file_cleanup_candidates(0)")).error).toBeDefined();
    expect((await as("authenticated", ADMIN, "select public.admin_storage_usage()")).code).toBe("42501");
    expect((await as("anon", null, "select public.admin_storage_usage()")).code).toBe("42501");
    const usage = await as<{ u: { db_bytes: number; storage_bytes: number } }>("service_role", null, "select public.admin_storage_usage() as u");
    expect(usage.error).toBeUndefined();
    expect(Number(usage.rows[0].u.db_bytes)).toBeGreaterThan(0);
    expect(Number(usage.rows[0].u.storage_bytes)).toBeGreaterThan(0);
  });

  it("admins can mark an order's files as cleaned without touching its deposit details", async () => {
    const o = await mkOrder({ status: "delivered", monthsAgo: 7, proof: P(3) });
    const r = await as("authenticated", ADMIN, "update public.orders set files_purged_at = now() where id = $1", [o.id]);
    expect(r.error).toBeUndefined();
    expect(r.affected).toBe(1);
  });
});
