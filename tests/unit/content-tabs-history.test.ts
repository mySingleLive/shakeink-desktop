import test from "node:test"
import assert from "node:assert/strict"
import { buildTabId, useTabsStore, type Tab } from "../../src/stores/tabs"
import { registerSceneLeaveGuard } from "../../src/stores/scene-ui"
import { WorkspaceDraftSource } from "../../src/lib/desktop/workspace-draft-source"

const tab = (id: string, novelId = "novel", type: Tab["type"] = "theme", refId?: string): Tab => ({ id, novelId, type, title: id, ...(refId ? { refId } : {}) })
function setup(ids = ["a", "b", "c"], activeTabId = "a") {
  useTabsStore.setState({
    tabs: ids.map(id => tab(id)), activeTabId, activationNonce: 0,
    previousTabIds: [], panelFocus: null, subTabs: {},
  })
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(r => { resolve = r })
  return { promise, resolve }
}
const state = () => useTabsStore.getState()
const history = () => state().previousTabIds
const settle = () => new Promise<void>(resolve => setImmediate(resolve))

test("TABS-history-01 closing follows recent browsing with deduplicated revisits and no nonce change", () => {
  setup(["a", "b", "c", "d"])
  useTabsStore.getState().activateTab("b")
  useTabsStore.getState().activateTab("c")
  useTabsStore.getState().activateTab("b")
  assert.deepEqual(history(), ["a", "c"])
  const nonce = state().activationNonce
  state().closeTab("b")
  assert.equal(state().activeTabId, "c"); assert.deepEqual(history(), ["a"]); assert.equal(state().activationNonce, nonce)
  state().closeTab("c")
  assert.equal(state().activeTabId, "a"); assert.deepEqual(history(), []); assert.equal(state().activationNonce, nonce)
  state().closeTab("a")
  assert.equal(state().activeTabId, "d", "without history, closing the first tab retains the right-neighbor fallback")
  assert.equal(state().activationNonce, nonce)
})

test("TABS-history-02 closing an inactive tab prunes it without changing activation", () => {
  setup(["a", "b", "c", "d"])
  state().activateTab("b"); state().activateTab("c"); state().activateTab("a")
  assert.deepEqual(history(), ["b", "c"])
  const nonce = state().activationNonce
  state().closeTab("b")
  assert.equal(state().activeTabId, "a"); assert.equal(state().activationNonce, nonce); assert.deepEqual(history(), ["c"])
  state().closeTab("a")
  assert.equal(state().activeTabId, "c"); assert.deepEqual(history(), []); assert.equal(state().activationNonce, nonce)
})

test("TABS-history-03 reopening a closed tab makes it the latest browsing entry", () => {
  setup()
  state().activateTab("b"); state().activateTab("c"); state().closeTab("b")
  state().openTab(tab("b"))
  assert.equal(state().activeTabId, "b"); assert.deepEqual(history(), ["a", "c"])
  state().closeTab("b")
  assert.equal(state().activeTabId, "c"); assert.deepEqual(history(), ["a"])
})

test("TABS-history-04 visual reorder does not change browsing history", () => {
  setup()
  state().activateTab("b"); state().activateTab("c")
  const nonce = state().activationNonce
  state().moveTab("c", 0)
  assert.deepEqual(state().tabs.map(item => item.id), ["c", "a", "b"])
  assert.deepEqual(history(), ["a", "b"]); assert.equal(state().activationNonce, nonce)
  state().closeTab("c")
  assert.equal(state().activeTabId, "b"); assert.deepEqual(history(), ["a"])
})

test("TABS-history-05 asynchronous open and activation participate in the same history", async () => {
  setup()
  assert.equal(await state().openTabForNavigation(tab("d"), new AbortController().signal), true)
  assert.deepEqual(history(), ["a"])
  assert.equal(await state().activateTabForNavigation("b", new AbortController().signal), true)
  assert.deepEqual(history(), ["a", "d"])
  state().closeTab("b"); assert.equal(state().activeTabId, "d"); assert.deepEqual(history(), ["a"])
  state().closeTab("d"); assert.equal(state().activeTabId, "a"); assert.deepEqual(history(), [])
})

test("TABS-history-06 repeated activation through every entry point preserves history", async () => {
  const actions: Array<(signal: AbortSignal) => void | Promise<unknown>> = [
    () => state().activateTab("a"),
    () => state().openTab(tab("a")),
    signal => state().openTabForNavigation(tab("a"), signal),
    signal => state().activateTabForNavigation("a", signal),
  ]
  for (const action of actions) {
    setup(["a", "b"])
    useTabsStore.setState({ previousTabIds: ["b"] })
    await action(new AbortController().signal)
    assert.equal(state().activeTabId, "a"); assert.deepEqual(history(), ["b"]); assert.equal(state().activationNonce, 1)
  }
})

test("TABS-history-07 workspace restore resets session history without persisting it", () => {
  const tabs = (["theme", "worldline", "outline"] as const).map(type => {
    const id = buildTabId(type, "restored-novel")
    return tab(id, "restored-novel", type)
  })
  useTabsStore.setState({ tabs, activeTabId: tabs[2].id, previousTabIds: [tabs[1].id], activationNonce: 4, subTabs: {}, panelFocus: null })
  const source = new WorkspaceDraftSource(), saved = source.read()
  assert.equal("previousTabIds" in saved, false)
  assert.equal(JSON.stringify(saved).includes("previousTabIds"), false)
  source.restore({ version: 1, tabs, activeTabId: tabs[0].id, subTabs: {}, layout: null })
  assert.deepEqual(history(), [])
  state().activateTab(tabs[2].id)
  assert.deepEqual(history(), [tabs[0].id])
  state().closeTab(tabs[2].id)
  assert.equal(state().activeTabId, tabs[0].id); assert.deepEqual(history(), [])
})

test("TABS-history-08 delayed close uses the latest visual order only for the no-history fallback", async () => {
  setup()
  useTabsStore.setState({ activeTabId: "b", previousTabIds: [] })
  const gate = deferred(), release = registerSceneLeaveGuard("b", () => gate.promise)
  try {
    state().closeTab("b")
    assert.equal(state().tabs.length, 3); assert.equal(state().activeTabId, "b"); assert.deepEqual(history(), [])
    state().moveTab("b", 2)
    gate.resolve(); await settle()
    assert.equal(state().activeTabId, "c"); assert.deepEqual(state().tabs.map(item => item.id), ["a", "c"])
  } finally { release() }
})

test("TABS-history-09 a stale delayed close cannot remove a tab or rewrite newer history", async () => {
  setup(); state().activateTab("b")
  const gate = deferred(), release = registerSceneLeaveGuard("b", () => gate.promise)
  try {
    state().closeTab("b")
    release()
    state().activateTab("a")
    assert.equal(state().activeTabId, "a"); assert.deepEqual(history(), ["b"])
    gate.resolve(); await settle()
    assert.equal(state().activeTabId, "a"); assert.deepEqual(history(), ["b"]); assert.equal(state().tabs.length, 3)
  } finally { release() }
})

test("TABS-history-10 a failed close guard leaves tabs, active tab, history and nonce unchanged", async () => {
  setup(); state().activateTab("b")
  const before = state(), release = registerSceneLeaveGuard("b", async () => { throw new Error("isolated unsaved draft") })
  try {
    state().closeTab("b"); await settle()
    assert.equal(state().tabs, before.tabs); assert.equal(state().activeTabId, before.activeTabId)
    assert.deepEqual(history(), before.previousTabIds); assert.equal(state().activationNonce, before.activationNonce)
  } finally { release() }
})

test("TABS-history-11 closing the final tab clears active and browsing history", () => {
  setup(["a"])
  state().closeTab("a")
  assert.equal(state().activeTabId, null); assert.deepEqual(state().tabs, []); assert.deepEqual(history(), [])
})

test("TABS-history-12 novel cleanup skips removed history and preserves its last-item fallback", () => {
  const keepA = tab("keep-a", "keep"), keepB = tab("keep-b", "keep"), goneA = tab("gone-a", "gone"), goneB = tab("gone-b", "gone")
  useTabsStore.setState({
    tabs: [keepB, goneA, keepA, goneB], activeTabId: goneB.id, previousTabIds: [keepA.id, keepB.id, goneA.id],
    activationNonce: 9, subTabs: { [keepA.id]: "a", [keepB.id]: "b", [goneA.id]: "gone-a", [goneB.id]: "gone-b" }, panelFocus: null,
  })
  state().closeAllTabsOfNovel("gone")
  assert.equal(state().activeTabId, keepB.id); assert.deepEqual(history(), [keepA.id]); assert.equal(state().activationNonce, 9)
  assert.deepEqual(state().subTabs, { [keepA.id]: "a", [keepB.id]: "b" })

  useTabsStore.setState({ tabs: [keepB, goneA, keepA, goneB], activeTabId: goneB.id, previousTabIds: [], activationNonce: 11, subTabs: {} })
  state().closeAllTabsOfNovel("gone")
  assert.equal(state().activeTabId, keepA.id); assert.deepEqual(history(), []); assert.equal(state().activationNonce, 11)

  useTabsStore.setState({ tabs: [keepA, keepB, goneA, goneB], activeTabId: keepA.id, previousTabIds: [goneA.id, keepB.id, goneB.id], activationNonce: 12, subTabs: {} })
  state().closeAllTabsOfNovel("gone")
  assert.equal(state().activeTabId, keepA.id); assert.deepEqual(history(), [keepB.id]); assert.equal(state().activationNonce, 12)

  for (const activeTabId of [null, "missing"]) {
    useTabsStore.setState({ tabs: [keepB, goneA, keepA, goneB], activeTabId, previousTabIds: [], activationNonce: 13, subTabs: {} })
    state().closeAllTabsOfNovel("gone")
    assert.equal(state().activeTabId, keepA.id); assert.deepEqual(history(), []); assert.equal(state().activationNonce, 13)
  }
})

test("TABS-history-13 scene cleanup skips removed history, prunes subviews and retains last-item fallback", () => {
  const keepA = tab("keep-a"), keepB = tab("keep-b"), scene = tab("scene:s1", "novel", "scene", "s1"), image = tab("scene-image:exterior:s1", "novel", "scene-image", "s1")
  useTabsStore.setState({
    tabs: [keepB, scene, keepA, image], activeTabId: image.id, previousTabIds: [keepA.id, keepB.id, scene.id], activationNonce: 3,
    subTabs: { [keepA.id]: "a", [keepB.id]: "b", [scene.id]: "scene", [image.id]: "image" }, panelFocus: null,
  })
  state().closeSceneTabs("novel", "s1")
  assert.equal(state().activeTabId, keepB.id); assert.deepEqual(history(), [keepA.id]); assert.equal(state().activationNonce, 3)
  assert.deepEqual(state().subTabs, { [keepA.id]: "a", [keepB.id]: "b" })

  useTabsStore.setState({ tabs: [keepB, scene, keepA, image], activeTabId: image.id, previousTabIds: [], activationNonce: 5, subTabs: {} })
  state().closeSceneTabs("novel", "s1")
  assert.equal(state().activeTabId, keepA.id); assert.deepEqual(history(), []); assert.equal(state().activationNonce, 5)
})

test("TABS-history-14 world cleanup uses recent history then neighbor fallback without changing subview cleanup", () => {
  const a = tab("a"), b = tab("b"), world = tab("world:w1", "novel", "world", "w1")
  useTabsStore.setState({
    tabs: [a, b, world], activeTabId: world.id, previousTabIds: [a.id], activationNonce: 6,
    subTabs: { [a.id]: "a", [world.id]: "world" }, panelFocus: null,
  })
  state().closeWorldTab("w1")
  assert.equal(state().activeTabId, a.id); assert.deepEqual(history(), []); assert.equal(state().activationNonce, 6)
  assert.deepEqual(state().subTabs, { [a.id]: "a", [world.id]: "world" })

  useTabsStore.setState({ tabs: [a, world, b], activeTabId: world.id, previousTabIds: [], activationNonce: 8, subTabs: {} })
  state().closeWorldTab("w1")
  assert.equal(state().activeTabId, a.id); assert.deepEqual(history(), []); assert.equal(state().activationNonce, 8)
})
