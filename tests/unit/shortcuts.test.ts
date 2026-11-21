import assert from "node:assert/strict"
import { test } from "node:test"
import { capturedKey, canonicalKey, validShortcut, bindingConflicts, bindingsFor, editBinding, restoreDefaultShortcuts, shortcutNamespace, type ShortcutCommand } from "../../desktop/core/shortcuts"
import { defaultState, settingsSchema } from "../../desktop/core/settings"
const commands: ShortcutCommand[] = [
  { id: "file.save", label: "保存", scope: "global", locked: false, defaults: ["Cmd+S"] },
  { id: "md.bold", label: "粗体", scope: "markdown", locked: false, defaults: ["Cmd+B"] },
  { id: "ai.send", label: "发送", scope: "composer", locked: false, defaults: ["Enter"] },
  { id: "md.enter", label: "换行", scope: "markdown", locked: false, defaults: ["Enter"] },
  { id: "app.quit", label: "退出", scope: "global", locked: true, defaults: ["Cmd+Q"] },
]
const key = (value: Partial<KeyboardEvent>, platform: "darwin" | "win32" | "linux" = "darwin") => capturedKey({ key: "a", code: "KeyA", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, repeat: false, keyCode: 0, ...value }, platform)
test("DESK-K02: recording uses physical combinations and ignores modifiers, composition and repeat", () => {
  assert.equal(key({ key: "å", metaKey: true, altKey: true }), "Cmd+Alt+A")
  assert.equal(key({ key: "+", code: "Equal", metaKey: true, shiftKey: true }), "Cmd+Shift+Equal")
  assert.equal(key({ key: "Enter", code: "NumpadEnter" }), "NumpadEnter")
  for (const event of [{ key: "Control" }, { isComposing: true }, { keyCode: 229 }, { repeat: true }, { key: "Dead" }]) assert.equal(key(event), null)
  assert.equal(canonicalKey("Command+Plus"), canonicalKey("Shift+Meta+Equal"))
  assert.notEqual(canonicalKey("Cmd+Plus"), canonicalKey("Cmd+NumpadAdd"))
  for (const invalid of ["", "Ctrl", "Ctrl+Ctrl+A", "Cmd+Shift", "Ctrl+K garbage"]) assert.equal(validShortcut(invalid), false)
  assert.equal(validShortcut("Cmd+K Cmd+C"), true)
})
test("DESK-K03: conflicts include every binding and chord prefix only in overlapping scopes", () => {
  const bindings = { "file.save": ["Cmd+S", "Cmd+K"], "md.bold": ["Cmd+B", "Cmd+Shift+B"] }
  assert.deepEqual(bindingConflicts(commands, bindings, "md.bold", "Cmd+K Cmd+C").map(row => [row.command.id, row.index]), [["file.save", 1]])
  assert.deepEqual(bindingConflicts(commands, bindings, "ai.send", "Enter"), [{ command: commands[2], index: 0, binding: "Enter" }])
  assert.deepEqual(bindingConflicts(commands, bindings, "ai.send", "Enter", 0), [])
  assert.equal(bindingConflicts(commands, bindings, "md.bold", "Cmd+B", 1)[0].index, 0)
})
test("DESK-K04: transfer removes only conflicting bindings atomically; empty stays unbound; locked and duplicate reject", () => {
  const before = { "file.save": ["Cmd+S", "Cmd+K"], "md.bold": ["Cmd+B"] }
  assert.throws(() => editBinding(commands, before, "md.bold", "Cmd+K Cmd+C"), /冲突/)
  const next = editBinding(commands, before, "md.bold", "Cmd+K Cmd+C", undefined, true)
  assert.deepEqual(next, { "file.save": ["Cmd+S"], "md.bold": ["Cmd+B", "Cmd+K Cmd+C"] })
  assert.deepEqual(before["file.save"], ["Cmd+S", "Cmd+K"])
  assert.throws(() => editBinding(commands, before, "md.bold", "Cmd+Q", undefined, true), /系统保留/)
  assert.throws(() => editBinding(commands, before, "md.bold", "Cmd+B", undefined, true), /重复/)
  assert.deepEqual(bindingsFor(commands[0], { "file.save": [] }), [])
  assert.throws(() => editBinding(commands, before, "md.bold", "Cmd+Tab"), /系统保留/)
  assert.throws(() => editBinding(commands, before, "md.bold", "Cmd+K Cmd+Q"), /系统保留/)
  assert.throws(() => editBinding(commands, before, "md.bold", "Cmd+K Cmd+C Cmd+Q"), /系统保留/)
})
test("DESK-K05: Linux reuses the win32 shortcut namespace and Ctrl-based capture", () => {
  assert.equal(shortcutNamespace("darwin"), "darwin")
  assert.equal(shortcutNamespace("win32"), "win32")
  assert.equal(shortcutNamespace("linux"), "win32")
  const win = key({ key: "s", code: "KeyS", ctrlKey: true }, "win32")
  const linux = key({ key: "s", code: "KeyS", ctrlKey: true }, "linux")
  assert.equal(linux, win)
  assert.equal(linux, "Ctrl+S")
  const meta = key({ key: "a", code: "KeyA", metaKey: true }, "linux")
  assert.equal(meta, "Win+A")
})
test("DESK-K06: restore-default clears the live win32 namespace on Linux (add → restore → re-read)", () => {
  const platform = "linux"
  const namespace = shortcutNamespace(platform)
  assert.equal(namespace, "win32")
  let settings = structuredClone(defaultState.settings)
  // 新增绑定：设置对话框保存流程写入命名空间的同一产物
  const added = editBinding(commands, settings.shortcuts[namespace], "file.save", "Ctrl+S")
  settings = { ...settings, shortcuts: { ...settings.shortcuts, [namespace]: added } }
  assert.deepEqual(settings.shortcuts[namespace]["file.save"], ["Cmd+S", "Ctrl+S"])
  // 恢复默认：对话框现在调用的同一 updater（历史 bug 是清 [platform]="linux"，
  // 导致 win32 下的自定义绑定继续生效）
  settings = restoreDefaultShortcuts(settings, shortcutNamespace(platform))
  // 重新读取：渲染器按命名空间读取——自定义绑定已清除，回落到目录默认
  assert.deepEqual(settings.shortcuts[namespace], {})
  assert.deepEqual(bindingsFor(commands[0], settings.shortcuts[namespace]), ["Cmd+S"])
  assert.deepEqual(settings.shortcuts.linux, {})
  // macOS/Windows 行为保持：各自只清自己的命名空间
  const mac = { ...structuredClone(defaultState.settings), shortcuts: { ...defaultState.settings.shortcuts, darwin: { "file.save": ["Cmd+K"] } } }
  assert.deepEqual(restoreDefaultShortcuts(mac, shortcutNamespace("darwin")).shortcuts.darwin, {})
  const win = { ...structuredClone(defaultState.settings), shortcuts: { ...defaultState.settings.shortcuts, win32: { "file.save": ["Ctrl+K"] } } }
  assert.deepEqual(restoreDefaultShortcuts(win, shortcutNamespace("win32")).shortcuts.win32, {})
  // 恢复后的状态通过生产 schema 校验（重启重新加载 state.json 时）
  assert.deepEqual(settingsSchema.parse(settings).shortcuts[namespace], {})
})
