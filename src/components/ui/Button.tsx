import Link from "next/link";
import type { ComponentProps } from "react";
import { Icon } from "./Icon";

type Variant = "d" | "l" | "w";

type BaseProps = {
  variant?: Variant;
  arrow?: boolean;
  block?: boolean;
  className?: string;
  children: React.ReactNode;
};

type AsLink = BaseProps & { href: string } & Omit<ComponentProps<typeof Link>, "href" | "className" | "children">;
type AsButton = BaseProps & { href?: undefined } & Omit<ComponentProps<"button">, "className" | "children">;

export function Button(props: AsLink | AsButton) {
  const { variant = "d", arrow, block, className, children, ...rest } = props;
  const cls = ["btn", `btn-${variant}`, block ? "btn-block" : "", className ?? ""].filter(Boolean).join(" ");
  const inner = (
    <>
      {children}
      {arrow && <Icon name="arrow" size={18} nudge />}
    </>
  );
  if ("href" in rest && rest.href !== undefined) {
    return (
      <Link className={cls} {...(rest as ComponentProps<typeof Link>)}>
        {inner}
      </Link>
    );
  }
  const { type = "button", ...btn } = rest as ComponentProps<"button">;
  return (
    <button className={cls} type={type} {...btn}>
      {inner}
    </button>
  );
}
