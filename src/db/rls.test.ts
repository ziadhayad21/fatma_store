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

  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text
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
    const p = await as("postgres", null, "select count(*)::int n from public.products");
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
    const p = await as("postgres", null, "select count(*)::int n from public.products");
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

  it("update order status (valid values only) but cannot insert or delete orders", async () => {
    await setup("select public.create_order($1::jsonb, $2::jsonb)", [JSON.stringify(order()), JSON.stringify([item({ product_id: "", mode: "standard", text: "", font: "" })])]);
    const ok = await as("authenticated", ADMIN, "update public.orders set status = 'prepared' where deposit_status is null");
    expect(ok.affected).toBeGreaterThan(0);
    const bad = await as("authenticated", ADMIN, "update public.orders set status = 'lost'");
    expect(bad.code).toBe("23514");
    expect((await as("authenticated", ADMIN, "delete from public.orders")).code).toBe("42501");
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
    expect((await as("authenticated", ADMIN, "select * from public.products")).rows).toHaveLength(30);
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
      left join public.product_colors pc on pc.product_id = p.id group by c.slug order by c.slug`);
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
