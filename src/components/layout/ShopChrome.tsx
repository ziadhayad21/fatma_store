import { getCategories } from "@/lib/catalog";
import { StoreHydrator } from "@/store/hydrate";
import { AnnouncementBar } from "./AnnouncementBar";
import { CartDrawer } from "./CartDrawer";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { MobileMenu } from "./MobileMenu";
import { buildNav } from "./nav";

/** Storefront frame: announcement bar, header, footer, drawers. Not used by the admin. */
export async function ShopChrome({ children }: { children: React.ReactNode }) {
  const nav = buildNav(await getCategories());
  return (
    <>
      <StoreHydrator />
      <a className="skip" href="#main">تخطّى للمحتوى</a>
      <div className="page">
        <AnnouncementBar />
        <Header nav={nav} />
        <main id="main">{children}</main>
        <Footer nav={nav} />
      </div>
      <MobileMenu nav={nav} />
      <CartDrawer />
    </>
  );
}
