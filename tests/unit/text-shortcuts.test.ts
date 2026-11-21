import assert from "node:assert/strict"
import { test } from "node:test"
import { platformCommands } from "../../desktop/shared/command-registry"
import { textShortcutFor, textShortcutAllowed } from "../../src/lib/desktop/text-shortcuts"
import { CommandTargets } from "../../src/lib/desktop/command-targets"
import { emptyTextContextCapabilities } from "../../desktop/shared/text-context-menu"

// docs/598 §3.6. Bindings come from the merged catalog shape; Monaco adds a
// secondary win32 redo (Ctrl+Shift+Z) that must still resolve to text.redo.
const darwin = platformCommands("darwin")
const win32 = platformCommands("win32").map(command => command.id === "text.redo" ? { ...command, defaults: [...command.defaults, "Ctrl+Shift+Z"] } : command)

test("TS-01: default text bindings resolve on both platforms; other keys do not", () => {
  const mac: Record<string, string> = { "Cmd+C": "text.copy", "Cmd+X": "text.cut", "Cmd+V": "text.paste", "Cmd+Shift+V": "text.pastePlain", "Cmd+A": "text.selectAll", "Cmd+Z": "text.undo", "Cmd+Shift+Z": "text.redo" }
  for (const [key, id] of Object.entries(mac)) assert.deepEqual(textShortcutFor(key, darwin, {}), { id }, key)
  const win: Record<string, string> = { "Ctrl+C": "text.copy", "Ctrl+X": "text.cut", "Ctrl+V": "text.paste", "Ctrl+Shift+V": "text.pastePlain", "Ctrl+A": "text.selectAll", "Ctrl+Z": "text.undo", "Ctrl+Y": "text.redo", "Ctrl+Shift+Z": "text.redo" }
  for (const [key, id] of Object.entries(win)) assert.deepEqual(textShortcutFor(key, win32, {}), { id }, key)
  for (const key of ["Cmd+K", "Cmd+F", "C", "Shift+C"]) assert.equal(textShortcutFor(key, darwin, {}), null, key)
})

test("TS-02: rebound and removed bindings follow the user's overrides", () => {
  assert.deepEqual(textShortcutFor("Cmd+Alt+C", darwin, { "text.copy": ["Cmd+Alt+C"] }), { id: "text.copy" })
  assert.deepEqual(textShortcutFor("Cmd+C", darwin, { "text.copy": ["Cmd+Alt+C"] }), { removed: true, id: "text.copy" })
  assert.deepEqual(textShortcutFor("Cmd+C", darwin, { "text.copy": [] }), { removed: true, id: "text.copy" })
  assert.deepEqual(textShortcutFor("Ctrl+C", win32, { "text.copy": [] }), { removed: true, id: "text.copy" })
  // A default key transferred to another command belongs to that command.
  assert.equal(textShortcutFor("Cmd+C", darwin, { "text.copy": [], "chat.search": ["Cmd+C"] }), null)
  // Chords are not resolved here (docs/598 §3.5).
  assert.deepEqual(textShortcutFor("Cmd+C", darwin, { "text.copy": ["Cmd+K Cmd+C"] }), { removed: true, id: "text.copy" })
})

test("TS-03: read-only sources only copy; inputs follow their captured capabilities", () => {
  const commands = { ...emptyTextContextCapabilities(), "text.copy": true, "text.paste": true, "text.selectAll": true, "text.undo": true }
  const preview = { kind: "preview" as const, commands }
  assert.equal(textShortcutAllowed(preview, "text.copy"), true)
  for (const id of ["text.paste", "text.cut", "text.selectAll", "text.undo", "text.redo", "text.pastePlain"] as const) assert.equal(textShortcutAllowed(preview, id), false, id)
  const input = { kind: "input" as const, commands }
  assert.equal(textShortcutAllowed(input, "text.paste"), true)
  assert.equal(textShortcutAllowed(input, "text.cut"), false)
  const editor = { kind: "editor" as const, commands: { ...emptyTextContextCapabilities(), "text.copy": true } }
  assert.equal(textShortcutAllowed(editor, "text.copy"), true)
  assert.equal(textShortcutAllowed(editor, "text.paste"), false)
})

test("TS-04: CommandTargets.owner separates no owner, an enabled owner and a refusing owner", () => {
  const targets = new CommandTargets<string>()
  assert.equal(targets.owner("text.copy", "a"), "none")
  let enabled = true
  const remove = targets.register({ owner: {}, accepts: target => target === "a", commands: { "text.copy": { enabled: () => enabled, run() {} } } })
  assert.equal(targets.owner("text.copy", "a"), "enabled")
  assert.equal(targets.owner("text.copy", "b"), "none")
  enabled = false
  assert.equal(targets.owner("text.copy", "a"), "disabled")
  enabled = true
  const second = targets.register({ owner: {}, accepts: () => true, commands: { "text.copy": () => {} } })
  assert.equal(targets.owner("text.copy", "a"), "disabled", "an ambiguous focus never falls back to a generic DOM edit")
  second(); remove()
})

test("TS-05: a Monaco-only command on the same key (suggestWidgetCopy) does not hide text.copy outside the editor", () => {
  // The installed catalog binds monaco.suggestWidgetCopy (scope markdown) to Cmd+C (docs/598 real-target finding).
  const merged = [...darwin, { id: "monaco.suggestWidgetCopy", label: "copy", group: "Monaco 编辑器", scope: "markdown" as const, locked: false, defaults: ["Cmd+C"] }]
  for (const scope of ["none", "input", "composer", "worldline-search"] as const) assert.deepEqual(textShortcutFor("Cmd+C", merged, {}, scope), { id: "text.copy" }, scope)
  // Markdown commands are active in the editor and its preview body; there the
  // existing previewMatch / Monaco paths own the key and the text path stays out.
  for (const scope of ["markdown", "preview"] as const) assert.equal(textShortcutFor("Cmd+C", merged, {}, scope), null, scope)
  // A global command the user bound to Cmd+C still wins everywhere.
  assert.equal(textShortcutFor("Cmd+C", merged, { "text.copy": [], "chat.search": ["Cmd+C"] }, "none"), null)
})
