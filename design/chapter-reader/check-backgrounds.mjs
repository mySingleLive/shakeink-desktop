// 检查两个主题各自的背景色板：切换、分别记忆、选中态。
import { chromium } from "playwright"
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 1000 } })
const errs = []; p.on("pageerror", e => errs.push(e.message))
await p.goto("file://" + process.cwd() + "/design/chapter-reader/index.html")
const openPop = async () => { if (!(await p.$eval(".reader-pop", el => el.classList.contains("open")))) await p.click('[data-act="pop"]') }
const pageBg = () => p.$eval(".reader-page", el => getComputedStyle(el).backgroundColor)
const swatches = () => p.$$eval(".reader-pop .swatch", els => els.map(e => e.getAttribute("aria-label") + (e.getAttribute("aria-pressed") === "true" ? "*" : "")))
const r = {}
await openPop(); r.paperSwatches = await swatches()
await p.click('.reader-pop [data-set="bgPaper"][data-v="green"]'); r.paperGreen = await pageBg()
await p.click('.controls [data-set="theme"][data-v="ink"]'); await openPop(); r.inkSwatches = await swatches(); r.inkDefault = await pageBg()
await p.screenshot({ path: "design/chapter-reader/preview-ink-settings.png" })
for (const v of ["ink-green", "ink-blue", "ink-black"]) {
  await p.click(`.reader-pop [data-set="bgInk"][data-v="${v}"]`); r[v] = await pageBg()
  await p.screenshot({ path: `design/chapter-reader/preview-${v}.png` })
}
await p.click('.reader-pop [data-set="bgInk"][data-v="ink-blue"]')
await p.click('.controls [data-set="theme"][data-v="paper"]'); r.paperRemembered = await pageBg()
await p.click('.controls [data-set="theme"][data-v="ink"]'); r.inkRemembered = await pageBg()
console.log(JSON.stringify({ errs, r }, null, 1)); await b.close()
