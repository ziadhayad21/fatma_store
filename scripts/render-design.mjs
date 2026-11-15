// Renders the template-syntax design files (fatma-site-kit/design/*.html) into plain static HTML
// so they can be screenshotted and compared with the real site. Dev tool only.
import fs from "node:fs";
import path from "node:path";

const KIT = path.resolve("fatma-site-kit/fatma-site-kit");
const OUT = path.join(KIT, "design-render");
fs.mkdirSync(OUT, { recursive: true });

const FONTS = [
  { label: "رقعة", css: "'Aref Ruqaa', serif" },
  { label: "كوفي", css: "'Reem Kufi', sans-serif" },
  { label: "نسخ", css: "'Amiri', serif" },
  { label: "عريض", css: "'Lalezar', sans-serif" },
  { label: "حديث", css: "'Readex Pro', sans-serif" },
];
const WAYS = [
  { title: "زي ما هو", sub: "المنتج بتصميمه الأصلي", extra: "", cls: "on", pressed: "true" },
  { title: "اكتب اسمك عليه", sub: "اسم أو كلمة بالخط اللي يعجبك", extra: "+ طباعة", cls: "", pressed: "false" },
  { title: "ارفع تصميمك", sub: "لوجو، رسمة أو صورة", extra: "+ طباعة", cls: "", pressed: "false" },
];

function lookup(scope, expr) {
  const parts = expr.trim().split(".");
  let v = scope;
  for (const p of parts) {
    if (v == null) return "";
    v = v[p];
  }
  return v == null || typeof v === "function" ? "" : String(v);
}

function render(html, scope, ifs) {
  // sc-for (non-nested in these files)
  html = html.replace(/<sc-for list="\{\{ ([\w.]+) \}\}" as="(\w+)"([^>]*)>([\s\S]*?)<\/sc-for>/g, (_, list, as, rest, inner) => {
    const arr = scope[list] ?? Array.from({ length: Number(/count="(\d+)"/.exec(rest)?.[1] ?? 1) }, () => ({}));
    return arr.map((item) => render(inner, { ...scope, [as]: item }, ifs)).join("");
  });
  // innermost-first so nested sc-if blocks resolve correctly
  const re = /<sc-if value="\{\{ ([\w.]+) \}\}" hint-placeholder-val="\{\{ (true|false) \}\}">((?:(?!<sc-if)[\s\S])*?)<\/sc-if>/;
  while (re.test(html)) {
    html = html.replace(re, (_, v, hint, inner) => {
      const on = v in ifs ? ifs[v] : hint === "true";
      return on ? inner : "";
    });
  }
  html = html.replace(/\{\{ ([^}]+) \}\}/g, (_, e) => lookup(scope, e));
  return html;
}

function extractJSON(src, name) {
  const m = new RegExp(`var ${name} = (\\{[\\s\\S]*?\\});\\n`).exec(src);
  return m ? JSON.parse(m[1]) : null;
}

const fix = (p) => ({ ...p, wishCls: "", wished: "false" });

for (const file of fs.readdirSync(path.join(KIT, "design")).filter((f) => f.endsWith(".html"))) {
  let src = fs.readFileSync(path.join(KIT, "design", file), "utf8");
  const P = extractJSON(src, "P");
  const style = /<helmet>([\s\S]*?)<\/helmet>/.exec(src)?.[1] ?? "";
  let body = /<x-dc>([\s\S]*?)<\/x-dc>/.exec(src)[1].replace(/<helmet>[\s\S]*?<\/helmet>/, "");

  const scope = {
    cartCount: "", countLine: "", scrimCls: "", menuCls: "", drawerCls: "", menuExpanded: "false",
    cartItems: [], sort: "new", sample: "فاطمة", name: "", nameCount: 0, qty: 1, counter: "1 / 2",
    ways: WAYS, fontOpts: FONTS, code: "",
  };
  const ifs = { hasCount: false, cartEmpty: true, cartHas: false, subbed: false, custom: false, modeName: false, modeImg: false, cantAdd: false, hasErr: false, hasUpload: false, noUpload: true, hasCodeMsg: false };

  if (file === "home.html") {
    scope.cats = [
      { name: "الفوط", href: "#", img: "../assets/towel-cream.jpg", pos: "center 40%", alt: "" },
      { name: "المريلات", href: "#", img: "../assets/apron-pink.jpg", pos: "center 30%", alt: "" },
      { name: "الشنط", href: "#", img: "../assets/bag-polka.jpg", pos: "center 62%", alt: "" },
    ];
    scope.products = [P.apron, P.towel, P.bag].map(fix);
  } else if (file.startsWith("collection-")) {
    const key = file.includes("aprons") ? "apron" : file.includes("towels") ? "towel" : "bag";
    scope.products = [fix(P[key])];
    scope.countLine = "منتج واحد";
  } else if (file.startsWith("product-")) {
    const key = file.includes("apron") ? "apron" : file.includes("towel") ? "towel" : "bag";
    const cfg = extractJSON(src, "CFG");
    scope.slides = cfg.photos.map((ph, i) => ({ ...ph, label: ph.alt, cls: i === 0 ? "on" : "" }));
    scope.cur = scope.slides[0];
    scope.related = Object.keys(P).filter((k) => k !== key).map((k) => fix(P[k]));
  } else if (file === "cart.html") {
    const items = [
      { name: "مريلة مطبخ Chef", img: "../assets/apron-chef.jpg", pos: "center 40%", variant: "باسم «Fatma» — خط رقعة", qty: 1, href: "#" },
      { name: "فوطة مطبخ مطبوعة", img: "../assets/towel-black.jpg", pos: "center 45%", variant: "زي ما هو", qty: 2, href: "#" },
    ];
    scope.cartItems = items;
    scope.cartCount = 3;
    scope.countLine = "3 منتجات";
    Object.assign(ifs, { cartEmpty: false, cartHas: true, hasCount: true });
  }

  body = render(body, scope, ifs).replace(/ disabled="false"/g, "").replace(/ disabled=""/g, "");
  const out = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${file}</title>${style}</head><body>${body}</body></html>`;
  fs.writeFileSync(path.join(OUT, file), out);
  console.log("rendered", file);
}
