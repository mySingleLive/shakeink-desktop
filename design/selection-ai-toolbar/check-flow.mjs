// 设计稿交互自检：真实鼠标拖选 → 工具栏 → 菜单 / 输入框 → 处理 → 停止/继续 → 替换 → 撤销；三种视图；截图。
import { chromium } from "playwright"
const out = new URL(".", import.meta.url).pathname
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 1000 } })
const errs = []; p.on("pageerror", e => errs.push(e.message))
await p.goto("file://" + out + "index.html")
const r = {}
const vis = sel => p.$(sel).then(el => !!el && el.isVisible())

async function drag(pane, idx = 1, from = 4, to = 30) {
  const el = await p.$(`.pane[data-pane="${pane}"] [data-s]:nth-of-type(1)`)
  const nodes = await p.$$(`.pane[data-pane="${pane}"] [data-s]`)
  const target = nodes[idx] ?? el
  await target.scrollIntoViewIfNeeded()
  const pts = await target.evaluate((node, [a, z]) => {
    // 按段内字符偏移定位（段落可能被 mark 拆成多个文本节点）
    const at = k => { const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode())) { if (k < t.length) return [t, k]; k -= t.length } }
    const rg = document.createRange()
    let [t1, o1] = at(a); rg.setStart(t1, o1); rg.setEnd(t1, o1 + 1); const s = rg.getBoundingClientRect()
    let [t2, o2] = at(z); rg.setStart(t2, o2); rg.setEnd(t2, o2 + 1); const e = rg.getBoundingClientRect()
    return { sx: s.left + 1, sy: s.top + s.height / 2, ex: e.right - 1, ey: e.top + e.height / 2 }
  }, [from, to])
  await p.mouse.move(pts.sx, pts.sy); await p.mouse.down(); await p.mouse.move(pts.ex, pts.ey, { steps: 8 }); await p.mouse.up()
  await p.waitForTimeout(80)
  return pts
}
async function toolbarBelow(pts) {
  const box = await p.$eval(".seltb", el => el.getBoundingClientRect().toJSON())
  return box.top > pts.ey && box.top - pts.ey < 40
}

for (const mode of ["preview", "edit", "split"]) {
  await p.click(`#modes [data-mode="${mode}"]`)
  for (const pane of mode === "split" ? ["edit", "preview"] : [mode]) {
    const pts = await drag(pane)
    r[`${mode}-${pane}-toolbar`] = await vis(".seltb") && await toolbarBelow(pts)
    await p.mouse.click(5, 5) // 点外部关闭
    r[`${mode}-${pane}-dismiss`] = !(await vis(".seltb"))
  }
}
await p.click('#modes [data-mode="preview"]')
let pts = await drag("preview")
r.order = await p.$$eval(".seltb > button", bs => bs.map(x => x.textContent.trim() || x.title))
await p.waitForTimeout(260); await p.screenshot({ path: out + "preview-toolbar.png", clip: { x: 20, y: 150, width: 1040, height: 780 } })
await p.click("#moreBtn"); r.menuItems = await p.$$eval(".float.menu .mitem b", bs => bs.map(x => x.textContent))
await p.waitForTimeout(260); await p.screenshot({ path: out + "preview-menu.png", clip: { x: 20, y: 150, width: 1040, height: 780 } })
await p.keyboard.press("Escape"); r.menuEscKeepsToolbar = await vis(".seltb") && !(await vis(".float.menu"))
await p.click('.seltb [data-act="ask"]')
await p.waitForTimeout(60)
r.askReplacesToolbar = !(await vis(".seltb")) && await vis(".askbox")
r.askWidth = await p.$eval(".askbox", el => Math.round(el.getBoundingClientRect().width)) === 560
r.askInsidePanel = await p.$eval(".askbox", el => { const a = el.getBoundingClientRect(), b = document.querySelector("#panel").getBoundingClientRect(); return a.left >= b.left && a.right <= b.right })
r.askBelowSelection = await p.evaluate(() => { const r = rangeIn(selPane(), S.sel.start, S.sel.end).getClientRects(), last = r[r.length - 1], a = document.querySelector(".askbox").getBoundingClientRect(); return a.top >= last.bottom })
r.askFocused = await p.evaluate(() => document.activeElement?.matches(".askbox .edit"))
await p.keyboard.type("语气更冷 @示例")
r.mentionPopup = await vis(".float.mention")
await p.keyboard.press("Enter")
r.chipInserted = await p.$$eval(".askbox .edit .chip", c => c.length) === 1
// 方向键在输入框内移动光标，不切换功能高亮
await p.keyboard.press("Shift+Enter"); await p.keyboard.type("第二行")
const caret = () => p.evaluate(() => { const sel = getSelection(), ed = document.querySelector(".askbox .edit"); const r = document.createRange(); r.selectNodeContents(ed); r.setEnd(sel.focusNode, sel.focusOffset); return { at: r.toString().length, inEditor: ed.contains(sel.focusNode) && document.activeElement === ed } })
const c0 = await caret(); await p.keyboard.press("ArrowUp"); const c1 = await caret(); await p.keyboard.press("ArrowDown"); const c2 = await caret()
r.arrowUpMovesCaret = c1.inEditor && c1.at < c0.at
r.arrowDownMovesCaret = c2.inEditor && c2.at > c1.at
r.arrowsNoHighlight = await p.$$eval(".askbox .funcs .mitem.active", x => x.length) === 0 // ↑↓ 不移动高亮
const picked = () => p.$$eval(".askbox .funcs .mitem.picked", x => x.map(b => b.dataset.fn))
// ⌘↑↓（macOS）/ Alt+↑↓（Windows）选择功能，光标留在输入框且位置不变
const edCaret = () => p.evaluate(() => { const sel = getSelection(), ed = document.querySelector(".askbox .edit"); const r = document.createRange(); r.selectNodeContents(ed); r.setEnd(sel.focusNode, sel.focusOffset); return document.activeElement === ed ? r.toString().length : -1 })
const pk = () => p.$$eval(".askbox .funcs .mitem.picked", x => x.map(b => b.dataset.fn).join())
const setOs = os => p.evaluate(os => { S.os = os; press("os", os); document.querySelector(".askbox .hint").textContent = askHint() }, os)
await setOs("mac"); const k0 = await edCaret()
await p.keyboard.press("Meta+ArrowDown"); await p.keyboard.press("Meta+ArrowDown")
r.macCmdDownPicks = await pk() === "shrink" && await edCaret() === k0 && (await p.textContent(".askbox .hint")).includes("Enter 执行缩写") && (await p.textContent(".askbox .hint")).includes("⌘↑↓ 选择功能")
await p.keyboard.press("Meta+ArrowUp"); await p.keyboard.press("Meta+ArrowUp"); await p.keyboard.press("Meta+ArrowUp")
r.macCmdUpWraps = await pk() === "summary" && await edCaret() === k0
await p.keyboard.press("Alt+ArrowDown"); r.macAltDoesNotPick = await pk() === "summary"
await setOs("win")
await p.keyboard.press("Alt+ArrowDown"); r.winAltDownPicks = await pk() === "polish" && (await p.textContent(".askbox .hint")).includes("Alt+↑↓ 选择功能")
await p.keyboard.press("Alt+ArrowDown"); await p.keyboard.press("Alt+ArrowUp"); r.winAltUpPicks = await pk() === "polish"
await p.keyboard.press("Meta+ArrowDown"); r.winMetaDoesNotPick = await pk() === "polish"

await setOs("mac")
r.noEnterBadge = !(await p.$(".askbox kbd"))
r.defaultPickPolish = JSON.stringify(await picked()) === '["polish"]' && (await p.textContent(".askbox .hint")).startsWith("Enter 执行润色")
r.arrowsKeepPick = r.arrowsNoHighlight && JSON.stringify(await picked()) === '["polish"]'
await p.keyboard.press("Tab"); r.tabEntersList = await p.evaluate(() => document.activeElement?.dataset.fn === "polish")
await p.keyboard.press("ArrowDown"); r.listArrowMoves = await p.evaluate(() => document.activeElement?.dataset.fn === "expand") && JSON.stringify(await picked()) === '["expand"]' && (await p.textContent(".askbox .hint")).startsWith("Enter 执行扩写")
await p.keyboard.press("ArrowUp"); await p.keyboard.press("ArrowUp"); r.listUpReturnsToEditor = await p.evaluate(() => document.activeElement?.matches(".askbox .edit")) && JSON.stringify(await picked()) === '["polish"]'

r.noProjectPicker = !(await p.$(".askbox [title*='作品']")) && !(await p.$(".askbox [aria-label='发送']"))
r.askFuncs = await p.$$eval(".askbox .funcs .mitem b", bs => bs.map(x => x.textContent))
await p.waitForTimeout(260); await p.screenshot({ path: out + "preview-ask.png", clip: { x: 20, y: 150, width: 1040, height: 780 } })
await p.click('.askbox .funcs [data-fn="rewrite"]')
await p.waitForTimeout(300)
r.procRunning = await vis(".proc") && (await p.textContent(".proc .state")).includes("重写中")
r.procBottom = await p.$eval(".proc", el => { const a = el.getBoundingClientRect(), b = document.querySelector("#panel").getBoundingClientRect(); return b.bottom - a.bottom < 80 })
await p.waitForTimeout(260); await p.screenshot({ path: out + "preview-running.png", clip: { x: 20, y: 150, width: 1040, height: 780 } })
await p.click('[data-act="stop"]'); r.stopped = (await p.textContent(".proc .state")).includes("已停止")
r.stoppedNoReplace = !(await p.$('[data-act="replace"]'))
await p.click('[data-act="resume"]'); await p.waitForFunction(() => document.querySelector(".proc.done"), null, { timeout: 15000 })
r.doneState = (await p.textContent(".proc .state")).includes("重写完成")
r.doneTaller = await p.$eval(".proc .stream", el => el.getBoundingClientRect().height) > 200
r.doneButtons = await p.$$eval(".proc .foot .btn", bs => bs.map(x => x.textContent))
await p.waitForTimeout(260); await p.screenshot({ path: out + "preview-done.png", clip: { x: 20, y: 150, width: 1040, height: 780 } })
// 重试：放弃 / 重试 / 替换 顺序；重试重新进入「重写中 · 第 2 次」，完成后出现另一稿，正文与历史不变
const firstOut = await p.textContent(".proc .stream")
const histLen0 = await p.evaluate(() => S.history.length), page0 = await p.textContent(".pane.preview .page")
await p.click('.proc [data-act="retry"]'); await p.waitForTimeout(120)
r.retryRunning = (await p.textContent(".proc .state")).includes("重写中") && (await p.textContent(".proc .state")).includes("第 2 次")
await p.waitForFunction(() => document.querySelector(".proc.done"), null, { timeout: 15000 })
r.retryNewDraft = (await p.textContent(".proc .stream")) !== firstOut && (await p.textContent(".proc .state")).includes("第 2 次")
r.retryNoSideEffects = await p.evaluate(() => S.history.length) === histLen0 && (await p.textContent(".pane.preview .page")) === page0
r.doneButtonsAfterRetry = await p.$$eval(".proc .foot .btn", bs => bs.map(x => x.textContent))
await p.waitForTimeout(260); await (await p.$(".proc")).screenshot({ path: out + "done-retry-buttons.png" })
const before = await p.textContent(".pane.preview .page")
await p.click('[data-act="replace"]')
r.replaced = (await p.textContent(".pane.preview .page")) !== before
await p.waitForTimeout(260); await p.screenshot({ path: out + "preview-undo.png", clip: { x: 20, y: 150, width: 1040, height: 780 } })
await p.click('[data-act="undo"]'); await p.waitForTimeout(50)
r.undone = (await p.textContent(".pane.preview .page")) === before
// 版本历史：⋯ → 版本历史，列表含 AI 版本；查看「AI 重写前」= 替换前全文；「AI 重写」= 替换后全文
const reasons = () => p.$$eval(".hrow .reason", rs => rs.map(x => x.textContent.trim()))
await p.click("#moreMenu"); await p.click('[data-act="hopen"]')
r.historyAfterUndo = (await reasons()).slice(0, 3)
const rowFor = async name => (await p.$$(".hrow")).find(async () => true) && p.$(`.hrow:has(.reason:text-is("${name}"))`)
await (await rowFor("AI 重写前")).click()
r.beforeSnapshotIsOriginal = (await p.$$eval(".hdetail .page p", ps => ps.map(x => x.textContent).join("\n\n"))) === await p.evaluate(() => S.history.find(h => h.reason === "AI 重写前").text)
r.beforeHasRestore = await vis('[data-act="hrestore"]') && await p.$eval(".hdetail details", d => d.open)
await p.waitForTimeout(260); await p.screenshot({ path: out + "history-before-detail.png", clip: { x: 20, y: 150, width: 1040, height: 780 } })
await p.click('[data-act="hback"]'); await (await rowFor("AI 重写")).click()
r.afterSnapshotDiffers = await p.evaluate(() => { const h = S.history; return h.find(x => x.reason === "AI 重写").text !== h.find(x => x.reason === "AI 重写前").text })
await p.click('[data-act="hback"]'); await p.click('[data-act="hclose"]')
r.historyCloses = !(await p.$eval("#panel", el => el.classList.contains("show-history")))
// 放弃
pts = await drag("preview", 2); await p.click('.seltb [data-fn="polish"]')
await p.waitForFunction(() => document.querySelector(".proc.done"), null, { timeout: 15000 })
const b2 = await p.textContent(".pane.preview .page"); await p.click('.proc [data-act="discard"]')
r.discardKeeps = (await p.textContent(".pane.preview .page")) === b2 && !(await vis(".proc"))
await p.click('[data-jump="history"]'); await p.waitForTimeout(400)
r.historyJump = (await reasons()).slice(0, 2).join("|").includes("AI 润色")
await p.screenshot({ path: out + "history-list.png", clip: { x: 20, y: 150, width: 1040, height: 780 } })
await p.click('[data-theme="ink"]'); await p.waitForTimeout(300); await p.screenshot({ path: out + "ink-history-list.png", clip: { x: 20, y: 150, width: 1040, height: 780 } }); await p.click('[data-theme="paper"]')
await p.click('[data-act="hclose"]')
// 添加评论：工具栏最左侧按钮 → 沿用的评论框（挂在选区段落之后）→ 发表后锚点高亮 + 评论卡片
await p.evaluate(() => { S.flash = null; render() })
for (const [mode, para, text] of [["preview", 3, "这里的情绪转折有点快"], ["edit", 4, "日期可以再具体一点"]]) {
  await p.click(`#modes [data-mode="${mode}"]`)
  pts = await drag(mode, para, 2, 12)
  r[`cmt-${mode}-first`] = await p.$eval(".seltb > button", b => b.dataset.act === "comment" && b.title === "添加评论")
  const quote = await p.evaluate(() => S.source.slice(S.sel.start, S.sel.end))
  await p.click('.seltb [data-act="comment"]'); await p.waitForTimeout(60)
  r[`cmt-${mode}-composer`] = !(await vis(".seltb")) && await vis("[data-comment-composer] textarea") && await p.evaluate(() => document.activeElement?.matches("[data-comment-composer] textarea"))
  r[`cmt-${mode}-anchorQuote`] = (await p.$$eval("mark.c-anchor", ms => ms.map(m => m.textContent))).includes(quote)
  await p.keyboard.type(text)
  if (mode === "edit") { await p.waitForTimeout(200); await p.screenshot({ path: out + "comment-composer-edit.png", clip: { x: 20, y: 150, width: 1040, height: 780 } }) }
  else { await p.waitForTimeout(200); await p.screenshot({ path: out + "comment-composer.png", clip: { x: 20, y: 150, width: 1040, height: 780 } }) }
  await p.keyboard.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter"); await p.waitForTimeout(60)
  r[`cmt-${mode}-posted`] = !(await vis("[data-comment-composer]")) && (await p.$$eval(".c-card .who", x => x.length)) >= 1 && (await p.$$eval(".c-card", cs => cs.map(c => c.textContent).join())).includes(text)
}
await p.waitForTimeout(200); await p.screenshot({ path: out + "comment-posted.png", clip: { x: 20, y: 150, width: 1040, height: 780 } })
// 评论框打开期间拖选不弹 AI 工具栏；收起后恢复
await p.click('#modes [data-mode="preview"]'); await drag("preview", 4); await p.click('.seltb [data-act="comment"]'); await drag("preview", 1)
r.noToolbarWhileComposing = !(await vis(".seltb"))
await p.click('[data-act="c-cancel"]'); await drag("preview", 1); r.toolbarAfterComposerClosed = await vis(".seltb")
await p.mouse.click(5, 5)
await p.evaluate(() => { S.comments = []; render() })
// 续写 / 冲突 / 无模型 / 玄墨 / 窄面板
await p.click('[data-jump="continue"]'); await p.waitForTimeout(260); await p.screenshot({ path: out + "preview-continue.png", clip: { x: 20, y: 150, width: 1040, height: 780 } })
await p.click('[data-jump="conflict"]'); await p.click('[data-act="replace"]'); r.conflict = (await p.textContent(".proc .state")).includes("无法替换")
await p.click('[data-model="no"]'); pts = await drag("preview")
r.noModelDisabled = await p.$$eval(".seltb [data-fn]", bs => bs.every(x => x.disabled))
await p.click('[data-model="yes"]')
await p.click('[data-theme="ink"]'); await p.click('#modes [data-mode="edit"]'); await drag("edit"); await p.waitForTimeout(260); await p.screenshot({ path: out + "ink-edit-toolbar.png", clip: { x: 20, y: 150, width: 1040, height: 780 } })
await p.click('[data-jump="done"]'); await p.waitForTimeout(260); await p.screenshot({ path: out + "ink-done.png", clip: { x: 20, y: 150, width: 1040, height: 780 } })
await p.click('#modes [data-mode="split"]'); await p.click('[data-jump="ask"]'); await p.waitForTimeout(260); await p.screenshot({ path: out + "ink-split-ask.png", clip: { x: 20, y: 150, width: 1040, height: 780 } })
await p.click('[data-theme="paper"]'); await p.click('[data-width="narrow"]'); await p.click('#modes [data-mode="preview"]'); await drag("preview")
await p.evaluate(() => { document.querySelector('.seltb [data-act="ask"]')?.click() }); await p.waitForTimeout(80)
r.narrowAskFits = await p.$eval(".askbox", el => { const a = el.getBoundingClientRect(), b = document.querySelector("#body").getBoundingClientRect(); return a.left >= b.left && a.right <= b.right && Math.round(a.width) === Math.round(b.width - 32) })
await p.mouse.click(5, 5); await drag("preview")
r.narrowFits = await p.$eval(".seltb", el => { const a = el.getBoundingClientRect(), b = document.querySelector("#panel").getBoundingClientRect(); return a.left >= b.left && a.right <= b.right })
await p.waitForTimeout(260); await p.screenshot({ path: out + "narrow-toolbar.png", clip: { x: 20, y: 150, width: 520, height: 780 } })
console.log(JSON.stringify({ errs, r }, null, 1)); await b.close()
