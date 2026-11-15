"use client";

import { useId, useState } from "react";
import { Icon } from "./Icon";

type Item = { title: string; body: string };

export function Accordion({ items, defaultOpen = 0 }: { items: Item[]; defaultOpen?: number | null }) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  const uid = useId();
  return (
    <div>
      {items.map((it, i) => {
        const on = open === i;
        return (
          <div className="acc" key={it.title}>
            <h2 style={{ fontSize: "inherit" }}>
              <button
                type="button"
                className="acc-b"
                aria-expanded={on}
                aria-controls={`${uid}-${i}`}
                id={`${uid}-h${i}`}
                onClick={() => setOpen(on ? null : i)}
              >
                {it.title}
                <Icon name="plus" size={16} />
              </button>
            </h2>
            <div
              className={`acc-p${on ? " on" : ""}`}
              id={`${uid}-${i}`}
              role="region"
              aria-labelledby={`${uid}-h${i}`}
              inert={!on}
            >
              <div>
                <p>{it.body}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
