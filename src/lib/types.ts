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
  /** hover colour of the category tile on the home page (#RRGGBB) */
  accent_color: string;
  /** products in this category are sold per colour (price per colour in product_colors) */
  has_colors?: boolean;
};

/** A colour a product is sold in (public.colors joined with its price in public.product_colors). */
export type ColorOption = {
  id: string;
  name_ar: string;
  /** #RRGGBB */
  hex: string;
  price: number;
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
  discount_percent?: number | null;
  images: ProductImage[];
  is_active: boolean;
  /** "اصنعها بنفسك": sold only with the customer's name or design (no "as is" option) */
  is_diy?: boolean;
  /** "كابلز": 2 = one product made of two pieces, each configured separately, one fixed price */
  pieces_count?: number;
  /** labels of the pieces (e.g. ["المريلة الأولى", "المريلة التانية"]); null = the defaults */
  piece_labels?: string[] | null;
  sort: number;
  created_at: string; // ISO
};

/** What the read layer returns: the row plus the joined category slug/name. */
export type Product = ProductRow & {
  category_slug: string;
  category_name: string;
  /** the category sells this product per colour */
  has_colors: boolean;
  /** available colours, in display order (empty when has_colors is false) */
  colors: ColorOption[];
};

export type ProductSort = "new" | "low" | "high";

export type ProductPage = {
  items: Product[];
  total: number;
  page: number;
  pageCount: number;
};

/** A published customer review (real ones only, entered in the admin). */
export type Review = {
  id: string;
  customer_name: string;
  text: string;
  /** name of the product the review is about, when it is set and still visible */
  product_name: string | null;
  avatar_color: string | null;
};

/** A suggestion as the public sees it (every suggestion is public; never its id or order). */
export type PublicSuggestion = {
  text: string;
  created_at: string;
};
