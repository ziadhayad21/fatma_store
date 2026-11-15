// Band-by-band pixel diff of <name>-<w>-site.png vs -design.png. usage: node scripts/diff-shots.mjs <dir> <name> <w>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [dir, name, w] = process.argv.slice(2);
const read = (k) => "data:image/png;base64," + fs.readFileSync(path.join(dir, `${name}-${w}-${k}.png`)).toString("base64");
const browser = await chromium.launch();
const page = await browser.newPage();
const res = await page.evaluate(
  async ([a, b]) => {
    const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const [A, B] = await Promise.all([load(a), load(b)]);
    const W = Math.min(A.width, B.width), H = Math.min(A.height, B.height);
    const px = (img) => { const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, W, H).data; };
    const da = px(A), db = px(B);
    const bands = [];
    for (let y0 = 0; y0 < H; y0 += 100) {
      let diff = 0, n = 0;
      for (let y = y0; y < Math.min(y0 + 100, H); y++)
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 60) diff++;
          n++;
        }
      bands.push([y0, +(100 * diff / n).toFixed(1)]);
    }
    return { sizeA: [A.width, A.height], sizeB: [B.width, B.height], bands };
  },
  [read("site"), read("design")],
);
console.log(name, w, JSON.stringify(res.sizeA), JSON.stringify(res.sizeB));
console.log(res.bands.filter(([, p]) => p > 0.5).map(([y, p]) => `${y}:${p}%`).join("  ") || "no band over 0.5%");
await browser.close();
