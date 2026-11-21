import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { transformSync } from "esbuild"
import { ShortcutDispatcher } from "../../desktop/core/shortcut-dispatch"
import * as shortcutKeys from "../../desktop/core/shortcuts"
import { platformCommands } from "../../desktop/shared/command-registry"
import { CommandTargets, type CommandHandler } from "../../src/lib/desktop/command-targets"
import { commandScope } from "../../src/lib/desktop/command-scope"
import * as textShortcutsModule from "../../src/lib/desktop/text-shortcuts"

// Execute the real Controller's event listeners with bounded DOM/hooks and
// target ownership. This is not browser event ordering or native menu proof.
class ElementFixture extends EventTarget {
  isConnected = true
  inDialog = false
  constructor(readonly kind: "input" | "editor" | "button") { super() }
  closest(selector: string) {
    if (this.inDialog && selector.includes('role="dialog"')) return this
    if (this.kind === "editor" && (selector.includes(".monaco-editor") || selector.includes(".desktop-markdown-editor"))) return this
    if (this.kind === "input" && selector.includes('input,textarea,')) return this
    return null
  }
  matches(selector: string) { return this.kind === "input" && selector.split(',').some(part => part.trim() === "input") }
  getClientRects() { return [0] }
}
class DocumentFixture extends EventTarget {
  modal = false; recording = false
  querySelector(selector: string) {
    if (selector.includes("data-desktop-recording")) return this.recording ? {} : null
    if (selector.includes('role="dialog"')) return this.modal ? {} : null
    return null
  }
}

// docs/598: the keyboard text source is stubbed; text-shortcut-source is covered in the browser.
const sourceStub = { capture: (): unknown => null, spanning: (_id: string) => false }
function fixture(overrides: Record<string, string[]> = {}, platform: "darwin" | "win32" = "darwin") {
  const document = new DocumentFixture(), window = new EventTarget()
  const target = new ElementFixture("input"), editor = new ElementFixture("editor")
  const bus = new CommandTargets<ElementFixture | null>(), calls: string[] = [], cleanup: Array<() => void> = []
  let remembered: ElementFixture | null = target
  const bootstrap = { platform, settings: { shortcuts: { darwin: platform === "darwin" ? overrides : {}, win32: platform === "win32" ? overrides : {} } } }
  const stateStore = Object.assign(() => { throw Error("Unexpected selector") }, { getState: () => ({ bootstrap }) })
  const dependencies: Record<string, unknown> = {
    react: { useEffect(effect: () => () => void) { cleanup.push(effect()) } },
    sonner: { toast: { info() {}, error() {} } },
    "@/stores/desktop": { useDesktopStore: stateStore, updateDesktopSettings: async () => {} },
    "@/stores/tabs": { useTabsStore: { getState: () => ({ activeTabId: null }), subscribe: () => () => {} } },
    "@/stores/chat": { useChatStore: { getState: () => ({ accountId: "local", conversationId: null, draftId: "shortcut-fixture", draftNovelId: null, recoveryStatus: "ready", creatingNovel: false, requestedConversationId: null, newConversationRequested: false }), subscribe: () => () => {} } },
    "@desktop/core/shortcut-dispatch": { ShortcutDispatcher },
    "@desktop/core/shortcuts": shortcutKeys,
    "@/lib/desktop/input-commands": { installInputCommands: () => () => {}, installInputContextMenu: () => () => {}, isAPIKeyControl: () => false },
    "@/lib/desktop/text-context-menu": { installTextContextMenu: () => () => {} },
    "@/lib/desktop/text-shortcuts":textShortcutsModule,"@/lib/desktop/text-shortcut-source":{captureTextShortcut:()=>sourceStub.capture(),copySpanningSelection:(_d:unknown,id:string)=>sourceStub.spanning(id)},
    "@/lib/desktop/native-text-edits": { nativeTextEdits: () => ({ run() {}, dispose() {} }) },
    "@/lib/desktop/composer-text-commands": { installComposerTextCommands: () => () => {} },
    "@/lib/desktop/command-scope": { commandScope },
    "@/lib/desktop/command-runtime": {
      desktopCommandCatalog: () => platformCommands(platform), desktopCommandTargets: bus,
      desktopCommandTarget: () => remembered, desktopEditorTarget: () => editor,
      rememberDesktopCommandTarget: (next: ElementFixture) => { remembered = next },
    },
    "@/lib/desktop/use-command-target": {
      useDesktopCommands(commands: Record<string, CommandHandler>) {
        cleanup.push(bus.register({ owner: {}, accepts: () => true, commands }))
      },
    },
  }
  const original = ["window", "document", "HTMLElement"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
  Object.defineProperty(globalThis, "window", { configurable: true, value: window })
  Object.defineProperty(globalThis, "document", { configurable: true, value: document })
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: ElementFixture })
  const module = { exports: {} as { DesktopCommandController: () => null } }
  const source = transformSync(readFileSync(new URL("../../src/components/desktop/DesktopCommandController.tsx", import.meta.url), "utf8"), { loader: "tsx", format: "cjs", jsx: "automatic" }).code
  new Function("module", "exports", "require", source)(module, module.exports, (name: string) => {
    if (name in dependencies) return dependencies[name]
    throw Error(`Unexpected dependency: ${name}`)
  })
  module.exports.DesktopCommandController()
  const textOwner = { enabled: true }
  cleanup.push(bus.register({ owner: target, accepts: next => next === target, commands: { "input.confirm": () => { calls.push("confirm") }, "text.copy": () => { calls.push("copy") }, "text.paste": { enabled: () => textOwner.enabled, run: () => { calls.push("paste") } } } }))
  cleanup.push(bus.register({ owner: editor, accepts: next => next === editor, commands: { "file.save": () => { calls.push("save") } } }))
  function key(key: string, code: string, properties: Record<string, unknown> = {}) {
    const event = new Event("keydown", { cancelable: true })
    Object.defineProperties(event, Object.fromEntries(Object.entries({ target, key, code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, repeat: false, keyCode: 0, ...properties }).map(([name, value]) => [name, { value }])))
    window.dispatchEvent(event)
    return event
  }
  function menu(id: string) {
    const event = new Event("desktop:command")
    Object.defineProperty(event, "detail", { value: id }); window.dispatchEvent(event)
  }
  return {
    document, target, editor, calls, key, menu, textOwner, setTarget(next: ElementFixture) { remembered = next },
    async settle() { for (let n = 0; n < 8; n++) await Promise.resolve() },
    dispose() {
      while (cleanup.length) cleanup.pop()!()
      for (const [name, descriptor] of original) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else Reflect.deleteProperty(globalThis, name)
      }
    },
  }
}

test("CTRL46-01: an IME event invalidates an unfinished custom chord before composition ends", async () => {
  const f = fixture({ "input.confirm": ["Cmd+K C"] })
  try {
    assert.equal(f.key("k", "KeyK", { metaKey: true }).defaultPrevented, true)
    f.key("Process", "KeyX", { isComposing: true, keyCode: 229 })
    f.key("c", "KeyC"); await f.settle()
    assert.deepEqual(f.calls, [])
  } finally { f.dispose() }
})

test("CTRL46-02: an intervening untouched native key cancels an unfinished chord", async () => {
  const f = fixture({ "input.confirm": ["Cmd+K C"] })
  try {
    f.key("k", "KeyK", { metaKey: true })
    assert.equal(f.key("x", "KeyX").defaultPrevented, false, "untouched input still receives its native key")
    f.key("c", "KeyC"); await f.settle()
    assert.deepEqual(f.calls, [])
  } finally { f.dispose() }
})

test("CTRL46-03: native menu events cannot execute a background editor command through an active dialog or recording", async () => {
  const f = fixture()
  try {
    f.document.modal = true; f.menu("file.save"); await f.settle()
    assert.deepEqual(f.calls, [])
    f.document.modal = false; f.document.recording = true; f.menu("file.save"); await f.settle()
    assert.deepEqual(f.calls, [])
    f.document.recording = false; f.menu("file.save"); await f.settle()
    assert.deepEqual(f.calls, ["save"], "the same visible owner works when no modal barrier exists")
  } finally { f.dispose() }
})

test("CTRL46-04: pressing a modifier before the next chord stroke preserves the valid sequence", async () => {
  const f = fixture({ "input.confirm": ["Cmd+K Cmd+C"] })
  try {
    f.key("k", "KeyK", { metaKey: true })
    assert.equal(f.key("Meta", "MetaLeft", { metaKey: true }).defaultPrevented, false)
    f.key("c", "KeyC", { metaKey: true }); await f.settle()
    assert.deepEqual(f.calls, ["confirm"])
  } finally { f.dispose() }
})

test("CTRL46-05: another component consuming a key invalidates an unfinished chord", async () => {
  const f = fixture({ "input.confirm": ["Cmd+K C"] })
  try {
    f.key("k", "KeyK", { metaKey: true })
    f.key("Escape", "Escape", { defaultPrevented: true })
    f.key("c", "KeyC"); await f.settle()
    assert.deepEqual(f.calls, [])
  } finally { f.dispose() }
})

test("CTRL46-06: a dialog's own input keeps menu copy while recording still blocks it", async () => {
  const f = fixture()
  try {
    f.document.modal = true; f.target.inDialog = true
    f.menu("text.copy"); await f.settle(); assert.deepEqual(f.calls, ["copy"])
    f.document.recording = true
    f.menu("text.copy"); await f.settle(); assert.deepEqual(f.calls, ["copy"])
  } finally { f.dispose() }
})

// docs/598 §3.3/§4: text shortcuts that no other binding claims.
function source(kind: "input" | "preview" | "editor", commands: Record<string, boolean>, executed: string[]) {
  return { kind, commands, root: {}, text: "", isCurrent: () => true, restore() {}, execute: async (id: string) => { executed.push(id) } }
}
test("CTRL598-01: an enabled input owner runs Cmd+V and the key is consumed", async () => {
  const f = fixture()
  try {
    const event = f.key("v", "KeyV", { metaKey: true }); await f.settle()
    assert.equal(event.defaultPrevented, true); assert.deepEqual(f.calls, ["paste"])
  } finally { f.dispose() }
})
test("CTRL598-02: an owner that refuses the command blocks every fallback", async () => {
  const f = fixture(), executed: string[] = []
  sourceStub.capture = () => source("input", { "text.paste": true }, executed)
  try {
    f.textOwner.enabled = false
    const event = f.key("v", "KeyV", { metaKey: true }); await f.settle()
    assert.equal(event.defaultPrevented, true); assert.deepEqual(f.calls, []); assert.deepEqual(executed, [])
  } finally { sourceStub.capture = () => null; f.dispose() }
})
test("CTRL598-03: a read-only source only copies; other text keys are consumed without effect", async () => {
  const f = fixture(), executed: string[] = []
  const plain = new (f.target.constructor as new (kind: string) => typeof f.target)("button")
  f.setTarget(plain)
  sourceStub.capture = () => source("preview", { "text.copy": true, "text.selectAll": true }, executed)
  try {
    const keys = [["c", "KeyC", {}], ["v", "KeyV", {}], ["a", "KeyA", {}], ["z", "KeyZ", {}], ["z", "KeyZ", { shiftKey: true }]] as const
    for (const [key, code, extra] of keys) {
      const event = new Event("keydown", { cancelable: true })
      Object.defineProperties(event, Object.fromEntries(Object.entries({ target: plain, key, code, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, repeat: false, keyCode: 0, ...extra }).map(([name, value]) => [name, { value }])))
      ;(globalThis as unknown as { window: EventTarget }).window.dispatchEvent(event)
      assert.equal(event.defaultPrevented, true, `${key} is consumed`)
    }
    await f.settle(); assert.deepEqual(executed, ["text.copy"])
  } finally { sourceStub.capture = () => null; f.dispose() }
})
test("CTRL598-04: with no source, only a spanning selection copies", async () => {
  const f = fixture(), spanning: string[] = []
  const plain = new (f.target.constructor as new (kind: string) => typeof f.target)("button")
  f.setTarget(plain)
  sourceStub.spanning = id => { spanning.push(id); return id === "text.copy" }
  try {
    const event = new Event("keydown", { cancelable: true })
    Object.defineProperties(event, Object.fromEntries(Object.entries({ target: plain, key: "c", code: "KeyC", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, repeat: false, keyCode: 0 }).map(([name, value]) => [name, { value }])))
    ;(globalThis as unknown as { window: EventTarget }).window.dispatchEvent(event)
    assert.equal(event.defaultPrevented, true); assert.deepEqual(spanning, ["text.copy"])
  } finally { sourceStub.spanning = () => false; f.dispose() }
})
test("CTRL598-05: recording, IME composition and keyCode 229 never reach the text path", async () => {
  const f = fixture()
  try {
    f.document.recording = true
    assert.equal(f.key("v", "KeyV", { metaKey: true }).defaultPrevented, false)
    f.document.recording = false
    assert.equal(f.key("v", "KeyV", { metaKey: true, isComposing: true }).defaultPrevented, false)
    assert.equal(f.key("v", "KeyV", { metaKey: true, keyCode: 229 }).defaultPrevented, false)
    await f.settle(); assert.deepEqual(f.calls, [])
  } finally { f.dispose() }
})
for (const platform of ["darwin", "win32"] as const) test(`CTRL598-06 (${platform}): a removed copy key is blocked on read-only text; a rebound key copies`, async () => {
  const mod = platform === "darwin" ? { metaKey: true } : { ctrlKey: true }
  const executed: string[] = []
  sourceStub.capture = () => source("preview", { "text.copy": true }, executed)
  const fire = (f: ReturnType<typeof fixture>, extra: Record<string, unknown>) => {
    const plain = new (f.target.constructor as new (kind: string) => typeof f.target)("button"); f.setTarget(plain)
    const event = new Event("keydown", { cancelable: true })
    Object.defineProperties(event, Object.fromEntries(Object.entries({ target: plain, key: "c", code: "KeyC", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false, repeat: false, keyCode: 0, ...extra }).map(([name, value]) => [name, { value }])))
    ;(globalThis as unknown as { window: EventTarget }).window.dispatchEvent(event); return event
  }
  try {
    let f = fixture({ "text.copy": [] }, platform)
    try { assert.equal(fire(f, mod).defaultPrevented, true); await f.settle(); assert.deepEqual(executed, []) } finally { f.dispose() }
    f = fixture({ "text.copy": [platform === "darwin" ? "Cmd+Alt+C" : "Ctrl+Alt+C"] }, platform)
    try { assert.equal(fire(f, { ...mod, altKey: true }).defaultPrevented, true); await f.settle(); assert.deepEqual(executed, ["text.copy"]) } finally { f.dispose() }
  } finally { sourceStub.capture = () => null }
})
test("CTRL598-07: an input inside a menu still edits text", async () => {
  const f = fixture()
  try {
    const closest = f.target.closest.bind(f.target)
    f.target.closest = (selector: string) => selector.includes('[role="menu"]') ? f.target : closest(selector)
    const event = f.key("v", "KeyV", { metaKey: true }); await f.settle()
    assert.equal(event.defaultPrevented, true); assert.deepEqual(f.calls, ["paste"])
  } finally { f.dispose() }
})
test("CTRL598-08: an auto-repeated Cmd+V is consumed but does not paste again", async () => {
  const f = fixture()
  try {
    const event = f.key("v", "KeyV", { metaKey: true, repeat: true }); await f.settle()
    assert.equal(event.defaultPrevented, true); assert.deepEqual(f.calls, [])
  } finally { f.dispose() }
})
