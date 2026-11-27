import { chromium } from "playwright"
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 1000 } })
const errs = []; p.on("pageerror", e => errs.push(e.message))
await p.goto("file://" + process.cwd() + "/design/chapter-reader/index.html")
const open = () => p.$eval(".reader-pop", el => el.classList.contains("open"))
const r = {}
const openPop = async () => { if (!(await open())) await p.click('[data-act="pop"]') }
await openPop(); r.opened = await open()
await p.click('[data-toggle="showWords"]'); r.insideToggleKeepsOpen = await open()
await p.click('.reader-pop button[data-set="size"][data-v="l"]'); r.insideSizeKeepsOpen = await open()
for (const [name, sel] of [["body", ".reader-body p"], ["chapterHead", ".chapter-head h1"], ["topbar", ".topbar .crumb"], ["toolbar", ".toolbar .left"], ["pageTitle", "h1.page"], ["desk", ".reader-scroll"]]) {
  await openPop(); await p.click(sel, { position: name === "desk" ? { x: 20, y: 200 } : undefined }); r[name + "Closes"] = !(await open())
}
await openPop(); await p.click('.controls button[data-set="theme"][data-v="ink"]'); r.themeClickCloses = !(await open()); r.themeApplied = await p.$eval(".panel", el => el.classList.contains("ink"))
await openPop(); await p.click('[data-act="pop"]'); r.triggerToggles = !(await open())
console.log(JSON.stringify({ errs, r }, null, 1)); await b.close()
