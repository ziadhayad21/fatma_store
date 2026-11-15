import type { Metadata, Viewport } from "next";
import { Readex_Pro } from "next/font/google";
import { publicEnv } from "@/lib/env";
import "./globals.css";
import "./pages.css";

const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
  variable: "--font-readex",
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: { default: "فاطمة — فوط ومريلات وشنط مطبوعة", template: "%s | فاطمة" },
  description: "فوط، مريلات وشنط مطبوعة — اطلبها زي ما هي، أو باسمك، أو بتصميمك.",
  applicationName: "فاطمة",
  openGraph: {
    siteName: "فاطمة",
    locale: "ar_EG",
    type: "website",
    images: [{ url: "/brand/hero-poster.jpg", alt: "فاطمة" }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={readex.variable}>
      <body>{children}</body>
    </html>
  );
}
