// Side-by-side crop (site | design). usage: node scripts/crop-shots.mjs <dir> <name> <w> <y0> <y1>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [dir, name, w, y0s, y1s] = process.argv.slice(2);
const y0 = +y0s, y1 = +y1s;
const read = (k) => "data:image/png;base64," + fs.readFileSync(path.join(dir, `${name}-${w}-${k}.png`)).toString("base64");
const browser = await chromium.launch();
const page = await browser.newPage();
const data = await page.evaluate(
  async ([a, b, y0, y1]) => {
    const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const [A, B] = await Promise.all([load(a), load(b)]);
    const h = y1 - y0;
    const c = document.createElement("canvas");
    c.width = A.width * 2 + 20; c.height = h;
    const x = c.getContext("2d");
    x.fillStyle = "#f0f"; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(A, 0, y0, A.width, h, 0, 0, A.width, h);
    x.drawImage(B, 0, y0, B.width, h, A.width + 20, 0, B.width, h);
    return c.toDataURL("image/png");
  },
  [read("site"), read("design"), y0, y1],
);
const out = path.join(dir, `crop-${name}-${w}-${y0}.png`);
fs.writeFileSync(out, Buffer.from(data.split(",")[1], "base64"));
console.log(out);
await browser.close();
