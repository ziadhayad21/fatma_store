import type { Metadata } from "next";
import { nameFontVariables } from "@/lib/fonts";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "لوحة التحكم | فاطمة", template: "%s | لوحة التحكم" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return <div className={`adm ${nameFontVariables}`}>{children}</div>;
}
