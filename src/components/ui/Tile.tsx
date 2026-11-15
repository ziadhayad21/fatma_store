import Image from "next/image";
import Link from "next/link";
import { Icon } from "./Icon";

type Props = {
  href: string;
  src: string;
  alt: string;
  position?: string;
  title: string;
  cta?: string;
  sizes: string;
  className?: string;
  style?: React.CSSProperties;
  priority?: boolean;
  /** replaces the default title + CTA caption */
  custom?: React.ReactNode;
};

export function Tile({ href, src, alt, position = "center", title, cta = "تسوّق", sizes, className, style, priority, custom }: Props) {
  return (
    <Link className={`tile${className ? " " + className : ""}`} href={href} style={style}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} style={{ objectPosition: position }} />
      <div className="tile-cap">
        {custom ?? (
          <>
            <h3 style={{ fontSize: 28, fontWeight: 500 }}>{title}</h3>
            <span className="tile-go">
              {cta}
              <Icon name="arrow" size={18} nudge />
            </span>
          </>
        )}
      </div>
    </Link>
  );
}
