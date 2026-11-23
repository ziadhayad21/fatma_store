-- Add requires_deposit flag to categories.
-- When true, all products in this category require a deposit at checkout.
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS requires_deposit boolean NOT NULL DEFAULT false;
