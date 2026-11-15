const messages = ["اطبع اسمك أو تصميمك على أي منتج", "اطلب زي ما هو، أو باسمك، أو بتصميمك", "خطوط عربي وإنجليزي للأسماء"];

export function AnnouncementBar() {
  return (
    <div className="ann" role="region" aria-label="إعلانات">
      {messages.map((m) => (
        <span key={m}>{m}</span>
      ))}
    </div>
  );
}
