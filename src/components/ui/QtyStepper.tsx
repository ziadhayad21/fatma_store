"use client";

import { Icon } from "./Icon";

type Props = {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  large?: boolean;
};

export function QtyStepper({ value, onChange, min = 1, max = 50, large }: Props) {
  return (
    <div className={`qty${large ? " qty-l" : ""}`} role="group" aria-label="الكمية">
      <button type="button" aria-label="زوّد" onClick={() => onChange(Math.min(value + 1, max))} disabled={value >= max}>
        <Icon name="plus" size={14} />
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" aria-label="قلّل" onClick={() => onChange(Math.max(value - 1, min))} disabled={value <= min}>
        <Icon name="minus" size={14} />
      </button>
    </div>
  );
}
