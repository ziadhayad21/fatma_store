import { Doodle } from "@/components/ui/Doodle";
import { avatarColor, avatarTextColor, firstLetter, MIN_REVIEWS } from "@/lib/reviews";
import type { Review } from "@/lib/types";

function Card({ r, index, dup }: { r: Review; index: number; dup?: boolean }) {
  const bg = avatarColor(r.avatar_color, index);
  return (
    <div className="rcard" data-dup={dup ? "" : undefined}>
      <span className="q" aria-hidden="true">
        &rdquo;
      </span>
      <div className="who">
        <span className="av" style={{ background: bg, color: avatarTextColor(bg) }}>
          {firstLetter(r.customer_name)}
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="who-name">{r.customer_name}</span>
          {r.product_name && <span className="who-buy">اشترت: {r.product_name}</span>}
        </div>
      </div>
      <p className="rtext">{r.text}</p>
    </div>
  );
}

/**
 * Real reviews only. Hidden until at least MIN_REVIEWS are published.
 * The moving rows are decorative (aria-hidden); the reviews are exposed once, as a visually hidden list.
 */
export function ReviewsSection({ reviews }: { reviews: Review[] }) {
  if (reviews.length < MIN_REVIEWS) return null;
  // the animation moves by exactly one half of a row: each half repeats the set until it is wider than any screen
  const copies = Math.max(1, Math.ceil(6 / reviews.length));
  const row = (list: Review[], cls: string) => (
    <div className={`rv-row ${cls}`}>
      {[0, 1].flatMap((half) =>
        Array.from({ length: copies }, (_, c) =>
          list.map((r) => <Card key={`${half}-${c}-${r.id}`} r={r} index={reviews.indexOf(r)} dup={half === 1 || c > 0} />),
        ),
      )}
    </div>
  );
  return (
    <section className="sec reviews" id="reviews" aria-labelledby="reviews-title">
      <div className="wrap">
        <div className="sh rv rv-head">
          <div>
            <span className="eyebrow">آراء الزباين</span>
            <h2 className="h2" id="reviews-title">
              <span className="mark">
                قالوا عن فاطمة
                <Doodle kind="heart" className="dl-heart" />
              </span>
            </h2>
          </div>
        </div>
      </div>
      <ul className="vh">
        {reviews.map((r) => (
          <li key={r.id}>
            {r.customer_name}
            {r.product_name ? ` — اشترت: ${r.product_name}` : ""}: {r.text}
          </li>
        ))}
      </ul>
      <div className="rv-rows" aria-hidden="true">
        {row(reviews, "")}
        {row([...reviews].reverse(), "rev")}
      </div>
    </section>
  );
}
