"use client";

import { fontCss, nameFonts } from "@/lib/name-fonts";
import { NAME_MAX } from "@/lib/personalization";
import type { FontId } from "@/lib/types";

type Props = {
  name: string;
  font: FontId;
  onName: (v: string) => void;
  onFont: (f: FontId) => void;
  hideFont?: boolean;
};

export function NamePanel({ name, font, onName, onFont, hideFont }: Props) {
  const len = [...name].length;
  const sample = name.trim() || "فاطمة";
  return (
    <div className="panel">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label htmlFor="nm" className="lbl">
          <span>الاسم أو الكلمة</span>
          <span className="muted" aria-live="polite">{len}/{NAME_MAX}</span>
        </label>
        <input
          id="nm"
          className="inp"
          type="text"
          autoComplete="off"
          placeholder="مثلاً: Fatma أو فاطمة"
          value={name}
          onChange={(e) => onName([...e.target.value].slice(0, NAME_MAX).join(""))}
          style={{ width: "100%", flex: "none" }}
        />
      </div>
      {!hideFont && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="lbl" id="font-l">الخط</span>
        <div className="fonts" role="group" aria-labelledby="font-l">
          {nameFonts.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`fo${f.id === font ? " on" : ""}`}
              aria-pressed={f.id === font}
              aria-label={`خط ${f.label}`}
              onClick={() => onFont(f.id)}
            >
              <span className="s" style={{ fontFamily: fontCss(f.id) }}>{sample}</span>
              <span className="n">{f.label}</span>
            </button>
          ))}
        </div>
      </div>}
    </div>
  );
}
