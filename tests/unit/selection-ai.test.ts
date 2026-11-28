import test from "node:test"
import assert from "node:assert/strict"

// docs/612 §1 (SAU). Pure helpers for the selection AI toolbar.
import {
  SELECTION_AI_ACTIONS, TOOLBAR_ACTIONS, DEFAULT_PICK, SELECTION_LIMIT, CONTEXT_LIMITS,
  stepPick, resultText, applyReplacement, selectionStillMatches,
  historyReason, isSelectionAiReason, overLimit, toolbarPlacement, clampSection,
  type SelectionAiAction,
} from "../../src/lib/selection-ai"

test("SAU-01: action table, toolbar subset and default pick", () => {
  assert.deepEqual(SELECTION_AI_ACTIONS.map(a => a.key), ["polish", "expand", "shrink", "continue", "rewrite", "summary"])
  assert.deepEqual(SELECTION_AI_ACTIONS.map(a => a.name), ["润色", "扩写", "缩写", "续写", "重写", "总结"])
  assert.deepEqual(SELECTION_AI_ACTIONS.map(a => a.desc), [
    "优化措辞与节奏，不改情节", "补充细节，篇幅约增加一半", "精简冗余，保留关键情节",
    "接着选中内容往下写", "换一种写法重新表达", "概括为一段简述",
  ])
  for (const action of SELECTION_AI_ACTIONS) {
    assert.ok(action.instruction.length > 10, action.key)
    assert.equal(action.usage, `selection.${action.key}`)
  }
  assert.deepEqual(TOOLBAR_ACTIONS, ["polish", "expand", "continue"])
  assert.equal(DEFAULT_PICK, "polish")
})

test("SAU-02: stepPick wraps at both ends", () => {
  assert.equal(stepPick("polish", -1), "summary")
  assert.equal(stepPick("summary", 1), "polish")
  assert.equal(stepPick("expand", 1), "shrink")
  assert.equal(stepPick("rewrite", -1), "continue")
  assert.equal(stepPick("unknown" as SelectionAiAction, 1), "polish")
})

test("SAU-03: resultText appends continuation after the original", () => {
  assert.equal(resultText("continue", "甲。", "乙。"), "甲。\n\n乙。")
  assert.equal(resultText("continue", "甲。\n", "乙。"), "甲。\n\n乙。")
  assert.equal(resultText("continue", "甲。\n\n", "乙。"), "甲。\n\n乙。")
  assert.equal(resultText("continue", "甲。\r\n", "乙。"), "甲。\r\n\r\n乙。")
  for (const key of ["polish", "expand", "shrink", "rewrite", "summary"] as const) assert.equal(resultText(key, "甲。", "乙。"), "乙。")
})

test("SAU-04: applyReplacement and selectionStillMatches use UTF-16 offsets", () => {
  const source = "前文🖋️中间\r\n后文"
  const start = source.indexOf("中间"), end = start + "中间".length
  assert.equal(applyReplacement(source, start, end, "替换"), "前文🖋️替换\r\n后文")
  assert.equal(selectionStillMatches(source, start, end, "中间"), true)
  assert.equal(selectionStillMatches(source, start, end, "中"), false)
  assert.equal(selectionStillMatches(source, -1, end, "中间"), false)
  assert.equal(selectionStillMatches(source, start, source.length + 1, "中间"), false)
  assert.equal(selectionStillMatches(source, end, start, ""), false)
  assert.throws(() => applyReplacement(source, end, start, "x"))
})

test("SAU-05: history reasons", () => {
  const names = ["润色", "扩写", "缩写", "续写", "重写", "总结"]
  SELECTION_AI_ACTIONS.forEach((action, i) => {
    assert.equal(historyReason(action.key, "before"), `AI ${names[i]}前`)
    assert.equal(historyReason(action.key, "after"), `AI ${names[i]}`)
    assert.equal(historyReason(action.key, "undo"), `撤销 AI ${names[i]}`)
    for (const phase of ["before", "after", "undo"] as const) assert.equal(isSelectionAiReason(historyReason(action.key, phase)), true)
  })
  for (const other of ["正文更新", "AI 生成正文", "恢复正文版本 3（x）", "修改前稿件", "AI 润色前稿", "", null, undefined]) assert.equal(isSelectionAiReason(other), false, String(other))
})

test("SAU-06: overLimit counts non-blank characters", () => {
  assert.equal(SELECTION_LIMIT, 10000)
  assert.equal(overLimit("字".repeat(10000)), false)
  assert.equal(overLimit("字".repeat(10001)), true)
  assert.equal(overLimit("字".repeat(10000) + " \n\t"), false)
})

const view = { top: 100, bottom: 700, left: 0, right: 1000 }
const rect = (left: number, top: number, width: number, height = 20) => ({ left, top, right: left + width, bottom: top + height, width, height })

test("SAU-07: placement below the last line, centred on it", () => {
  const p = toolbarPlacement([rect(100, 200, 600), rect(100, 230, 300)], view, { width: 200, height: 34 })
  assert.equal(p.hidden, false)
  assert.equal(p.top, 230 + 20 + 8)
  assert.equal(p.left, 100 + 150 - 100)
  assert.equal(p.scrollBy, 0)
})

test("SAU-08: flips above, clamps to edges, scrolls once for tall boxes", () => {
  const flipped = toolbarPlacement([rect(100, 400, 300), rect(100, 650, 300)], view, { width: 200, height: 34 })
  assert.equal(flipped.top, 400 - 8 - 34)
  const left = toolbarPlacement([rect(0, 200, 40)], view, { width: 200, height: 34 })
  assert.equal(left.left, view.left + 8)
  const right = toolbarPlacement([rect(960, 200, 40)], view, { width: 200, height: 34 })
  assert.equal(right.left, view.right - 8 - 200)
  // A 400px box cannot fit below (650+20+8+400 > 692) nor above (500-8-400 < 100): scroll so it fits below,
  // as long as the first line stays in view (need 386 <= room 500-100-8).
  const tall = toolbarPlacement([rect(100, 500, 300), rect(100, 650, 300)], view, { width: 560, height: 400 }, { allowScroll: true })
  assert.equal(tall.scrollBy, 650 + 20 + 8 + 400 - (700 - 8))
  assert.ok(tall.scrollBy <= 500 - 100 - 8)
  assert.equal(tall.top, 650 + 20 + 8 - tall.scrollBy)
  // A selection taller than the room: no scroll, pinned to the bottom of the view.
  const huge = toolbarPlacement([rect(100, 110, 300), rect(100, 650, 300)], view, { width: 560, height: 400 }, { allowScroll: true })
  assert.equal(huge.scrollBy, 0)
  assert.equal(huge.top, 700 - 8 - 400)
})

test("SAU-09: hidden when the selection is out of view", () => {
  assert.equal(toolbarPlacement([rect(100, 20, 300)], view, { width: 200, height: 34 }).hidden, true)
  assert.equal(toolbarPlacement([rect(100, 720, 300)], view, { width: 200, height: 34 }).hidden, true)
  assert.equal(toolbarPlacement([], view, { width: 200, height: 34 }).hidden, true)
})

test("SAU-10: context sections are clamped with a marker", () => {
  assert.equal(clampSection("短", 10), "短")
  const long = "字".repeat(25)
  const clamped = clampSection(long, 10)
  assert.ok(clamped.endsWith("（已截断）"))
  assert.equal(Array.from(clamped.replace("（已截断）", "")).length, 10)
  assert.deepEqual(Object.keys(CONTEXT_LIMITS).sort(), ["characters", "narrative", "other", "settings"])
  assert.equal(CONTEXT_LIMITS.settings, 12000)
})

// ---- shortcuts (SAU-11..15) ----
import { platformCommands } from "../../desktop/shared/command-registry"
import { bindingConflicts, editBinding } from "../../desktop/core/shortcuts"
import { commandContextsOverlap } from "../../desktop/core/shortcut-context"
import { registerSelectionAiEscape, selectionAiEscapeOwner } from "../../src/lib/desktop/selection-ai-escape"
import { execFileSync } from "node:child_process"

test("SAU-11: catalog commands for both platforms", () => {
  const find = (p: "darwin" | "win32", id: string) => platformCommands(p).find(c => c.id === id)!
  const expect = { "selectionAi.run": ["Enter", "Enter"], "selectionAi.newline": ["Shift+Enter", "Shift+Enter"], "selectionAi.pickPrev": ["Cmd+ArrowUp", "Alt+ArrowUp"], "selectionAi.pickNext": ["Cmd+ArrowDown", "Alt+ArrowDown"], "selectionAi.escape": ["Escape", "Escape"] } as const
  for (const [id, [mac, win]] of Object.entries(expect)) {
    assert.deepEqual(find("darwin", id).defaults, [mac], id); assert.deepEqual(find("win32", id).defaults, [win], id)
    assert.equal(find("darwin", id).group, "AI 修改要求")
  }
  assert.equal(find("darwin", "selectionAi.escape").scope, "global")
  assert.equal(find("darwin", "selectionAi.pickNext").scope, "composer")
})

test("SAU-12: default bindings do not conflict across the two composer surfaces", () => {
  for (const platform of ["darwin", "win32"] as const) {
    const commands = platformCommands(platform)
    const c = (id: string) => commands.find(x => x.id === id)!
    assert.equal(commandContextsOverlap(c("selectionAi.run"), c("ai.send")), false)
    assert.equal(commandContextsOverlap(c("selectionAi.newline"), c("ai.newline")), false)
    assert.equal(commandContextsOverlap(c("selectionAi.pickPrev"), c("ai.historyPrev")), false)
    assert.equal(commandContextsOverlap(c("selectionAi.escape"), c("ai.stop")), false)
    assert.equal(commandContextsOverlap(c("selectionAi.escape"), c("worldline.escape")), false)
    for (const id of ["selectionAi.run", "selectionAi.newline", "selectionAi.pickPrev", "selectionAi.pickNext"]) {
      for (const binding of c(id).defaults) assert.deepEqual(bindingConflicts(commands, {}, id, binding, 0).map(x => x.command.id), [], `${platform} ${id} ${binding}`)
    }
    // Escape keeps ai.stop's existing global-vs-local overlaps; the one addition is ai.mentionClose (plan §4.7, review N2:
    // the request box registers it too, and the mention state makes the two mutually exclusive at run time).
    const stop = bindingConflicts(commands, {}, "ai.stop", "Escape", 0).map(x => x.command.id).sort()
    assert.deepEqual(bindingConflicts(commands, {}, "selectionAi.escape", "Escape", 0).map(x => x.command.id).sort(), [...stop, "ai.mentionClose"].sort())
  }
})

test("SAU-13: rebinding transfers conflicts atomically", () => {
  const commands = platformCommands("darwin")
  const taken = commands.find(c => c.scope === "global" && c.defaults.includes("Cmd+L"))!
  assert.throws(() => editBinding(commands, {}, "selectionAi.pickNext", "Cmd+L"), /冲突/)
  const next = editBinding(commands, {}, "selectionAi.pickNext", "Cmd+L", undefined, true)
  assert.deepEqual(next["selectionAi.pickNext"], ["Cmd+ArrowDown", "Cmd+L"])
  assert.equal(next[taken.id].includes("Cmd+L"), false)
})

test("SAU-14: Escape owner registry", () => {
  const root = { contains: (t: unknown) => t === "inside" } as unknown as HTMLElement
  assert.equal(selectionAiEscapeOwner("inside" as unknown as HTMLElement), null)
  let ran = 0
  const off = registerSelectionAiEscape({ root: () => root, wants: () => true, run: () => { ran++ } })
  const hit = selectionAiEscapeOwner("inside" as unknown as HTMLElement)
  assert.ok(hit); hit!.owner.run(hit!.target); assert.equal(ran, 1)
  assert.equal(selectionAiEscapeOwner("outside" as unknown as HTMLElement), null, "focus elsewhere does not own Escape")
  const off2 = registerSelectionAiEscape({ root: () => root, wants: () => false, run: () => {} })
  assert.ok(selectionAiEscapeOwner("inside" as unknown as HTMLElement), "an owner that does not want Escape is ignored")
  off(); off2()
  assert.equal(selectionAiEscapeOwner("inside" as unknown as HTMLElement), null)
})

test("SAU-15: generated command catalog is current", () => {
  execFileSync(process.execPath, ["scripts/verify-command-catalogs.mjs"], { stdio: "pipe" })
})
