export type OrderMode = "standard" | "name" | "design";
export type FontId = "ruqaa" | "kufi" | "naskh" | "bold" | "modern";

/** Row shape of public.categories (+ presentation columns image_alt/image_position/promo_title_ar). */
export type Category = {
  id: string;
  slug: string;
  name_ar: string;
  description_ar: string;
  image: string;
  image_alt: string;
  /** CSS object-position for `image` */
  image_position: string;
  /** headline used on the collection promo tile */
  promo_title_ar: string;
  sort: number;
  is_active: boolean;
};

export type ProductImage = {
  src: string;
  alt: string;
  /** CSS object-position, e.g. "center 40%" */
  position: string;
};

/** Row shape of public.products. */
export type ProductRow = {
  id: string;
  slug: string;
  name_ar: string;
  category_id: string;
  description_ar: string;
  details_ar: string;
  care_ar: string;
  base_price: number;
  personalization_fee: number;
  images: ProductImage[];
  is_active: boolean;
  sort: number;
  created_at: string; // ISO
};

/** What the read layer returns: the row plus the joined category slug/name. */
export type Product = ProductRow & {
  category_slug: string;
  category_name: string;
};

export type ProductSort = "new" | "low" | "high";

export type ProductPage = {
  items: Product[];
  total: number;
  page: number;
  pageCount: number;
};
