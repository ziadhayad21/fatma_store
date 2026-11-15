import type { Metadata } from "next";
import { ShopChrome } from "@/components/layout/ShopChrome";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "الصفحة مش موجودة" };

export default function NotFound() {
  return (
    <ShopChrome>
    <div className="wrap" style={{ paddingBlock: "96px 112px" }}>
      <div className="empty" data-testid="not-found">
        <span className="eyebrow">404</span>
        <h1 style={{ fontSize: 34 }}>الصفحة دي مش موجودة</h1>
        <p className="muted" style={{ margin: 0 }}>ممكن تكون اتنقلت أو اللينك فيه غلط.</p>
        <Button href="/">ارجع للرئيسية</Button>
      </div>
    </div>
    </ShopChrome>
  );
}
