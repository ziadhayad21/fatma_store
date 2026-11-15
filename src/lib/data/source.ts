import { hasSupabase } from "@/lib/env";
import { seedSource } from "./seed-source";
import { supabaseSource } from "./supabase-source";
import type { CatalogSource } from "./types";

/**
 * Supabase when configured. Without Supabase env vars (fresh clone, CI) the built-in seed data is
 * used so the storefront still renders; checkout, uploads and the admin need the real backend.
 */
export const source: CatalogSource = hasSupabase ? supabaseSource : seedSource;
export const usingSeedData = !hasSupabase;
