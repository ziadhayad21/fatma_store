import { ShopChrome } from "@/components/layout/ShopChrome";

export default function ShopLayout({ children }: LayoutProps<"/">) {
  return <ShopChrome>{children}</ShopChrome>;
}
