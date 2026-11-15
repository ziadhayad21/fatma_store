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
): Promise<{ rows: T[]; error?: string; code?: string; affected?: number }> {
  await db.exec("begin");
  try {
    if (who !== "postgres") await db.exec(`set local role ${who}`);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [sub ? JSON.stringify({ sub, role: who }) : ""]);
    const res = await db.query<T>(sql, params);
    return { rows: res.rows, affected: res.affectedRows };
  } catch (e) {
    const err = e as { message: string; code?: string };
    return { rows: [], error: err.message, code: err.code };
  } finally {
    await db.exec("rollback");
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
  font: "ruqaa",
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
  await setup(`update public.shipping_rates set fee = 40 where governorate = 'القاهرة'`);
});

afterAll(async () => {
  await db.close();
});

describe("seed + constraints", () => {
  it("seeds categories, products and all 27 governorates (fees unset)", async () => {
    const c = await as("postgres", null, "select count(*)::int n from public.categories");
    const p = await as("postgres", null, "select count(*)::int n from public.products");
    const g = await as<{ governorate: string; fee: string | null }>("postgres", null, "select * from public.shipping_rates");
    expect(c.rows[0]).toMatchObject({ n: 3 });
    expect(p.rows[0]).toMatchObject({ n: 3 });
    expect(g.rows).toHaveLength(27);
    expect(g.rows.map((r) => r.governorate).sort()).toEqual([...governorates].sort());
    expect(g.rows.filter((r) => r.fee !== null).map((r) => r.governorate)).toEqual(["القاهرة"]); // set in this test file only
  });

  it("is idempotent when the seed runs twice", async () => {
    const sql = readFileSync(path.resolve("supabase/migrations/20260101000300_seed.sql"), "utf8");
    await db.exec(sql);
    const p = await as("postgres", null, "select count(*)::int n from public.products");
    expect(p.rows[0]).toMatchObject({ n: 3 });
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
    expect((await as("anon", null, "select * from public.products")).rows).toHaveLength(3);
    expect((await as("anon", null, "select * from public.categories")).rows).toHaveLength(3);
    expect((await as("anon", null, "select * from public.shipping_rates")).rows).toHaveLength(27);
  });

  it("do not see inactive products or products in inactive categories", async () => {
    await setup("update public.products set is_active = false where slug = 'chef-apron'");
    await setup("update public.categories set is_active = false where slug = 'bags'");
    const r = await as<{ slug: string }>("anon", null, "select slug from public.products");
    expect(r.rows.map((x) => x.slug)).toEqual(["printed-kitchen-towel"]);
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
    const ok = await as("authenticated", ADMIN, "update public.orders set status = 'confirmed'");
    expect(ok.affected).toBeGreaterThan(0);
    const bad = await as("authenticated", ADMIN, "update public.orders set status = 'lost'");
    expect(bad.code).toBe("23514");
    expect((await as("authenticated", ADMIN, "delete from public.orders")).code).toBe("42501");
    expect(
      (await as("authenticated", ADMIN, `insert into public.orders (customer_name, phone, governorate, area, address, subtotal, shipping, total)
       values ('x y', '01012345678', 'القاهرة', 'a', 'abc', 1, 1, 2)`)).code,
    ).toBe("42501");
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
    expect((await as("authenticated", ADMIN, "select * from public.products")).rows).toHaveLength(3);
    expect((await as("authenticated", CUSTOMER, "select * from public.products")).rows).toHaveLength(2);
    await setup("update public.products set is_active = true where slug = 'chef-apron'");
  });
});

describe("create_order (service role)", () => {
  it("creates the order and its items atomically and numbers orders from 1001", async () => {
    const r = await as<{ r: { id: string; number: number } }>(
      "service_role",
      null,
      "select public.create_order($1::jsonb, $2::jsonb) as r",
      [JSON.stringify(order()), JSON.stringify([item(), item({ mode: "standard", text: "", font: "", unit_price: 100, qty: 1 }), item({ mode: "design", text: "", font: "", design_path: "uploads/x/y.png" })])],
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
