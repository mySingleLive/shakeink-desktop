# 609 · 作品菜单增加编辑、创建、导出项 技术方案 独立审核

审核对象：`docs/609-work-menu-items-plan.md`（未提交）。只读审核，未改源码。

## 结论

方案大体可行。现状描述基本属实：`openSimpleTab`、`openTitleDialog`、`openScenario`、角色/物品/伏笔创建、整书导出流程都与代码一致。子菜单放在右键菜单里也能正常工作（见低-1）。下面几处需要在实现前补进方案。最重要的两处：导出任务移到 `SidebarTree` 顶层后不再随作品删除或切换数据目录而取消；新增 `<DropdownMenuSub>` 会让现有单元测试 SH-04 失败。

## 高

### 高-1 导出任务移到 SidebarTree 顶层后，删除作品或切换数据目录不会取消任务

- 证据：现在每个 `OutlineTreeMenu` 实例自己持有任务，作品行卸载时由 effect 的 cleanup 取消任务（`src/components/layout/OutlineTreeMenu.tsx:32-34`）。方案 3.3 把任务放到 `SidebarTree` 顶层，而 `SidebarTree` 在整个会话里不会卸载（`src/components/layout/DashboardShell.tsx:39`）。删除作品的 `removeWorkMutation.onSuccess` 只关闭 tab、移除查询（`src/components/layout/SidebarTree.tsx:1530-1547`）。切换数据目录的 `useLayoutEffect([scope])` 只重置视图和对话框状态（`SidebarTree.tsx:1476-1479`）。两处都不会取消顶层的导出任务。
- 后果：导出正在等待原生保存对话框时删除该作品，或者切换账号/数据目录，任务仍会继续，可能把已删除作品的内容写到磁盘，并弹出“导出文件已保存”。这与现状不一致：现状下这些情况都会取消。
- 修复：`useCollectionExport` 记住当前任务所属的 `novelId`，并提供 `cancel(novelId?)`。在 `removeWorkMutation.onSuccess` 中，如果任务属于被删作品，就调用 `cancel(work.novelId)`。在 `[scope]` 的 layout effect 中调用 `cancel()`。在 `file-export.test.ts` 中增加用例：`control.hold = true` 时删除作品或改变 scope，断言 `control.cancelled.length === 1`，并且目录为空（写法参照 EXB16-07，`tests/browser/file-export.test.ts:90-94`）。

## 中

### 中-1 新增 `<DropdownMenuSub>` 会使 SH-04 失败

- 证据：`tests/unit/sidebar-help-menu.test.ts:26-28` 用 `source.indexOf('<DropdownMenuSub>')` 找帮助子菜单，并断言它的位置在 `command("app.settings")`（`SidebarTree.tsx:2155`）之后。`novelMenuItems` 在 `SidebarTree.tsx:1883`，排在前面。只要新子菜单写成字面量 `<DropdownMenuSub>`，`sub > settings` 就不成立，后面的 `section` 切片也会错位。
- 修复：新子菜单照 `OutlineTreeMenu.tsx:141` 写成 `<DropdownMenuSub key={...}>`，这样字面量不再匹配。更稳妥的做法是同时把 SH-04 改为 `source.indexOf('<DropdownMenuSub>', settings)`。方案第 4 节应写明这一改动。

### 中-2 方案没有提到要更新现有用例 WN-56'

- 证据：`tests/browser/works-loading.test.ts:340-344` 断言作品菜单恰好是 `['重命名', '删除']`，并且分隔栏数量为 0。新菜单会使这两个断言都失败。
- 修复：在方案第 4 节明确改写 WN-56'。新期望为：`items` 依次是 重命名、编辑、创建角色…创建伏笔、导出大纲、导出正文、删除（子菜单触发器同样是 `menuitem`），分隔栏 3 个，右键菜单与 `…` 菜单逐项相同。同时在台账中注明 WN-56' 的期望已随 609 改变，不要把它算作新增通过的用例。

### 中-3 场景创建请求可能残留，之后在无关时机弹出对话框

- 证据：`requestAction` 是同步写入的全局单槽（`src/stores/scene-ui.ts:28`）。`openAllScenes` 里的 `openTab` 要先经过 `afterSceneLeave`（`src/stores/tabs.ts:245-253, 296-300`）：如果当前活动 tab 是带离开守卫的场景编辑页，打开会等守卫完成；守卫失败时只提示“草稿尚未保存…”，tab 不会打开。这时 `action` 留在 store 里。之后用户无论从哪里打开该作品的“场景”tab，`SceneWorkspace` 都会消费这个残留请求，并弹出“创建根场景”（`src/components/content/scene/SceneWorkspace.tsx:46-49`）。
- 补充：现有 `GlobalSceneTree` 的“创建”也有同样问题（`SceneWorkspace.tsx:72`）。但作品菜单把入口暴露在任何上下文里，触发的机会更多。
- 其余时序没有问题，已逐一核对：
  - “场景”tab 已经是活动 tab：`requestAction` 触发 scene-ui 订阅，`handle` 立即消费。
  - 已打开但不活动：`TabPanelHost` 保留实例（`src/components/layout/ContentTabs.tsx:24-30`），`openTab` 触发 tabs 订阅后消费。
  - 尚未挂载：挂载时 `queueMicrotask(handle)` 消费。
  - 数据加载中：`create` 状态保留，加载完成后再渲染对话框（`SceneWorkspace.tsx:55, 69`）。
- 修复（任选一种）：
  - 在 `requestAction` 中记录 `activationNonce`，`handle` 只接受 nonce 之后的那次激活。
  - 菜单里先 `openAllScenes`，再订阅 `useTabsStore`：等 `activeTabId === buildTabId("scenes", id)` 后再 `requestAction`；如果守卫失败，就不写入请求。

  测试需要覆盖四种情况：“场景”tab 已活动、已打开但不活动、未打开、当前是带守卫的场景编辑页且守卫失败。最后一种要断言之后手动打开“场景”tab 时不会弹出对话框。
- 措辞问题：方案说这“与场景树‘创建根场景’相同”，但 `GlobalSceneTree` 的创建动作传的是 `row.id`（创建子场景）。“创建根场景”只存在于 `SceneWorkspace` 内部按钮 `startCreate(null)`（`SceneWorkspace.tsx:62`）。应改为“与场景工作区目录的‘创建根场景’相同”。

### 中-4 `useCollectionExport` 无法逐行搬移，`cancel()` 的语义需要写清楚

- 证据：`exportCollection` 引用了组件闭包里的 `prefix`、`scope`、`volume`、`novel`（`OutlineTreeMenu.tsx:37-38, 102-124`）。改成 `exportCollection(novel, format, kind, volume?)` 后，这些值都要在函数内部根据参数重新计算。现在的取消分两步：cleanup 中执行 `abort()` 并把 ref 置空，下一次 effect 执行时再 `setExporting(false)`。`finally` 只在 `exportJob.current === job` 时复位 `exporting`（`OutlineTreeMenu.tsx:123`）。如果 `cancel()` 只 abort 并置空 ref、不复位 `exporting`，作品菜单的格式项会一直保持禁用。
- 修复：规定 `cancel()` 依次执行 `abort`、把 ref 置空、`setExporting(false)`，并且卸载时只执行前两步，不调用 setState。`prefix` 和“整书/本卷”文案改由参数计算。保留 EXB16-05（`file-export.test.ts:84-86`）作为 `OutlineTreeMenu` 行为不变的回归用例。再增加一条：作品菜单导出被取消后，格式项重新可用。

## 低

### 低-1 右键菜单里的子菜单：可以工作，但要补测试

- 证据：`ContextMenuRoot` 先提供 `MenuRootContext = undefined`，再渲染 `Menu.Root`（`node_modules/@base-ui/react/context-menu/root/ContextMenuRoot.js:50-56`）。弹层内部的 `MenuPrimitive.SubmenuRoot`（`src/components/ui/dropdown-menu.tsx:111-113`）因此拿到父级 `type: 'menu'`（`menu/root/MenuRoot.js:60-66`）。Base UI 的 `ContextMenu.SubmenuRoot` 本身就是 `MenuSubmenuRoot`（`context-menu/index.parts.js`）。`ContextMenu.Positioner` 与 `MenuPositioner` 是同一个组件，并且检测到 context-menu 上下文后使用 `fixed` 定位（`menu/positioner/MenuPositioner.js:57, 103`）。`DropdownMenuSubContent` 底层走 `MenuPrimitive.Portal/Positioner/Popup`，挂在 `ContextMenuContent` 下面是合法嵌套。侧栏不在 `ContentDrawerInteractionContext` 内（`DashboardShell.tsx:39, 52`），所以使用普通分支。
- 风险：仓库里还没有“右键菜单 → 子菜单”的用例。另外 `NavigationContextMenu` 是受控的（`sidebar-navigation-state.tsx:31-36`），点击子菜单项后，整棵菜单能否关闭需要实测。
- 修复：在 works-loading 或 file-export 中增加用例：右键作品行，悬停“导出正文”，点击 “Markdown (.md)”，断言走原生保存通道，并且两级菜单都已关闭。键盘路径同样要测：在右键菜单中用 ArrowDown 移到“导出大纲”，按 ArrowRight 打开子菜单，按 Enter 选中。

### 低-2 `fetchQuery` 做不到“缓存可用即用”

- 证据：全局 QueryClient 没有设置 `staleTime`（`src/app/providers.tsx:13-16`），所以 `fetchQuery` 每次都会重新请求。
- 修复：如果要用缓存，写 `queryClient.ensureQueryData({ queryKey: ["foreshadows", id], queryFn })`。为了让取名准确，也可以有意每次都 fetch，但要把方案里的措辞改掉。queryFn 应与 `ForeshadowPanel.tsx:474-481` 保持一致，返回形状为 `{ foreshadows }`，避免写入与面板不同形状的缓存。

### 低-3 伏笔选中请求会替换面板当前的详情，未保存的编辑会丢失

- 证据：`usePanelFocusRequest` 在挂载时读取请求，挂载后通过订阅消费请求（`src/components/foreshadow/use-panel-focus.ts:6-21`），所以两种时序都能选中新伏笔，时序本身没问题。但 `ForeshadowDetail` 以 `key={selected.id}` 渲染，并持有本地的 `dirty` 状态（`ForeshadowPanel.tsx:285, 587`），切换选中会直接丢弃未保存的修改。面板自带的 `+` 按钮也是这样（`ForeshadowPanel.tsx:502-505`），所以与现状一致。区别在于从作品菜单触发时，用户可能看不到这个面板。另外，`openTab` 被场景离开守卫拦下时，`requestPanelFocus` 已经写入并被后台面板消费。
- 修复：至少在方案中注明这是与面板 `+` 相同的已知行为。如果要避免，先 `openTab`，等 `activeTabId` 确实变成伏笔 tab 后再 `requestPanelFocus`。方案还新增了“已创建伏笔…”提示，面板的 `+` 没有这条提示。这一差异应写进 3.2，避免与“与面板一致”自相矛盾。

### 低-4 创建项可以重复点击

- 证据：面板按钮在 `isPending` 时禁用（`src/components/content/CharactersPanel.tsx:102`、`ForeshadowPanel.tsx:534`）。菜单项点击后菜单立即关闭，用户重新打开菜单后还能再点，会创建多个“新角色”，或者两个请求算出同一个“未命名伏笔 n”。
- 修复：在 `SidebarTree` 的 mutation 处于 pending 状态时禁用对应菜单项（`disabled={mutation.isPending && mutation.variables?.novelId === novel.id}`）。测试用一个暂停的接口验证第二次打开菜单时该项已禁用。

### 低-5 “创建情景”关闭后焦点回到“作品”视图标签，不回到作品行

- 证据：`launcher` 为 `null` 时，`finalFocus` 会回退到 `fallbackFocus()`，也就是 `tabRefs.current[view]`（`ScenarioLibraryDialog.tsx:22, 140`；`SidebarTree.tsx:2326`）。
- 修复：传入作品行的 `.tree-row` 作为 launcher（参照 `FaultedWorkMenu` 的 `returnFocus` 写法，`SidebarTree.tsx:376`），关闭后焦点回到用户启动操作的那一行。

### 低-6 导出禁用的范围与现状不同

- 证据：现在每个 `OutlineTreeMenu` 只禁用自己的格式项。作品菜单共用一个 `exporting`，作品 A 导出期间，所有作品的导出格式项都会禁用。而正文视图的 `OutlineTreeMenu` 仍然可以同时导出。所以方案里的“同一时间只有一个导出任务，与现状一致”并不准确。
- 修复：把措辞改为“作品菜单同时只允许一个整书导出任务，与正文树菜单的任务互不影响”，或者按 `novelId` 分别记录导出状态。

## 测试用例缺口（汇总）

1. 右键菜单的子菜单导出，鼠标和键盘两条路径都要测（低-1）。
2. 导出进行中删除作品或切换 scope 时任务被取消，不写出文件（高-1）。
3. 取消后格式项重新可用；EXB16-05 不回归（中-4）。
4. 场景创建的四种时序，包括守卫失败后不残留请求（中-3）。
5. 伏笔 tab 已打开并选中其他条目时，新伏笔被选中；名称取未占用的最小 n（与面板共用 `nextForeshadowTitle` 的单元测试）。
6. 各创建项接口失败时提示服务端文案，并且不打开 tab。
7. 重复点击时创建项被禁用（低-4）。
8. SH-04 与 WN-56' 的修改（中-1、中-2）；不可用作品菜单仍是 `['重新加载作品', '删除']`（`works-loading.test.ts:336-337` 已覆盖，需保留）。
9. 真实目标验证中，右键菜单与 `…` 菜单各点一遍导出，并截图。
