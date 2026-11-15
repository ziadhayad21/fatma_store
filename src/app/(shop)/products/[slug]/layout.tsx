import { nameFontVariables } from "@/lib/fonts";

export default function ProductLayout({ children }: LayoutProps<"/products/[slug]">) {
  return (
    <div className={nameFontVariables} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
