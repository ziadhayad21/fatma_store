"use client";

import { useRef } from "react";
import { useFocusTrap } from "./useFocusTrap";

type Props = {
  open: boolean;
  onClose: () => void;
  /** "left" = cart drawer, "right" = mobile menu */
  side: "left" | "right";
  label: string;
  children: React.ReactNode;
};

export function Drawer({ open, onClose, side, label, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open, onClose);
  return (
    <>
      <div className={`scrim${open ? " on" : ""}`} onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className={`${side === "left" ? "drawer" : "mmenu"}${open ? " on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        inert={!open}
        tabIndex={-1}
      >
        {children}
      </div>
    </>
  );
}
