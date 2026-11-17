import { chromium } from "playwright";

const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await b.newPage();
await p.goto("http://localhost:3000/admin/orders");
console.log("Current URL:", p.url());
console.log("Title:", await p.title());
await b.close();
