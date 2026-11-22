"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

export type CustomSelectOption = {
  value: string;
  label: string;
  group?: string;
  disabled?: boolean;
};

export function CustomDropdown({
  id,
  name,
  value,
  placeholder = "اختار...",
  options,
  onChange,
  hasError,
  describedBy,
}: {
  id: string;
  name: string;
  value: string;
  placeholder?: string;
  options: CustomSelectOption[];
  onChange: (val: string) => void;
  hasError?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleOutside);
    }
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  // Group options by group if present
  const grouped: { group?: string; items: CustomSelectOption[] }[] = [];
  for (const opt of options) {
    const last = grouped[grouped.length - 1];
    if (last && last.group === opt.group) {
      last.items.push(opt);
    } else {
      grouped.push({ group: opt.group, items: [opt] });
    }
  }

  return (
    <div
      ref={containerRef}
      className={`c-dropdown ${open ? "open" : ""}`}
      style={{ position: "relative", width: "100%" }}
    >
      <input type="hidden" name={name} value={value} />
      <button
        id={id}
        type="button"
        className="sel c-dropdown-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={hasError ? true : undefined}
        aria-describedby={describedBy}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          textAlign: "right",
          background: "#fff",
        }}
      >
        <span style={{ color: selectedOption ? "var(--ink)" : "var(--muted)" }}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.2s ease",
            display: "inline-flex",
            alignItems: "center",
            color: "var(--muted)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          tabIndex={-1}
          className="c-dropdown-menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: 280,
            overflowY: "auto",
            background: "#fff",
            border: "1px solid var(--line-strong)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
            zIndex: 100,
            padding: "6px 0",
          }}
        >
          {grouped.map((grp, gIdx) => (
            <div
              key={gIdx}
              className="c-dropdown-group"
              style={{
                borderTop: gIdx > 0 ? "1px solid #e2ddd5" : "none",
                marginTop: gIdx > 0 ? 4 : 0,
                paddingTop: gIdx > 0 ? 4 : 0,
              }}
            >
              {grp.group && (
                <div
                  style={{
                    padding: "10px 16px 6px",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--ink)",
                  }}
                >
                  {grp.group}
                </div>
              )}
              {grp.items.map((opt) => {
                const isSelected = opt.value === value;
                const isPlaceUnderGroup = !!opt.group && opt.value.includes("::");
                const isGov = !opt.group || !opt.value.includes("::");
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onClick={() => {
                      if (opt.disabled) return;
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "right",
                      padding: isPlaceUnderGroup ? "8px 28px 8px 16px" : "10px 16px",
                      background: isSelected ? "var(--accent-tint, #fff8eb)" : "transparent",
                      border: "none",
                      cursor: opt.disabled ? "not-allowed" : "pointer",
                      fontSize: 14,
                      color: opt.disabled ? "var(--muted)" : "var(--ink)",
                      fontWeight: isSelected ? 700 : isGov ? 700 : 400,
                      display: "block",
                      opacity: opt.disabled ? 0.6 : 1,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
