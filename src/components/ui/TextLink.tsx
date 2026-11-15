import Link from "next/link";
import type { ComponentProps } from "react";
import { Icon } from "./Icon";

type Props = Omit<ComponentProps<typeof Link>, "className"> & {
  light?: boolean;
  arrow?: boolean;
  className?: string;
};

/** Underlined text link; the underline retracts and the arrow nudges on hover. */
export function TextLink({ light, arrow = true, className, children, ...rest }: Props) {
  return (
    <Link className={["lnk", light ? "light" : "", className ?? ""].filter(Boolean).join(" ")} {...rest}>
      {children}
      {arrow && <Icon name="arrow" size={18} nudge />}
    </Link>
  );
}
