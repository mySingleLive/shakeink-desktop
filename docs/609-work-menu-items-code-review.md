# 609 · 作品菜单增加编辑、创建、导出项 代码审核

审核对象：工作区未提交改动（`git diff` + 未跟踪文件），对照 `docs/609-work-menu-items-plan.md` 与 `docs/609-work-menu-items-cases.md`。

## 0. 审核时执行的命令（Node v24.18.0）

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | 退出码 0（WM-06g 类型部分成立） |
| `node --import tsx --test tests/unit/work-menu-items.test.ts tests/unit/sidebar-help-menu.test.ts` | pass 5 / fail 0 |
| `SHAKEINK_TEST_CHROMIUM=… node --import tsx --test tests/browser/work-menu-items.test.ts tests/browser/file-export.test.ts` | fail 0 |
| `SHAKEINK_TEST_CHROMIUM=… node --import tsx --test tests/browser/works-loading.test.ts` | pass 33 / fail 0 |
| 临时探针（`/tmp/rv609/probe*.test.ts`，不在仓库内）：works-loading 夹具中右键健康作品，读菜单矩形 | 见下文中2 |

未发现“高”级问题。

## 1. 逐项核对结论（无问题项）

- **OutlineTreeMenu 导出抽取**（`src/components/layout/OutlineTreeMenu.tsx:32-33,158-191`）：与 `HEAD` 逐行比对，`exportCollection` 主体（读取、草稿替换、同章多草稿报错、动态 import、`downloadManuscript` 带 signal、成功/失败/取消三种 toast 处理、`finally` 中只有当前任务才复位）完全一致；`scope`/`prefix` 改为按参数计算，文案不变（EXB16-05b 已验证“正在导出本卷正文…”）。
  - 取消语义：`HEAD` 在 `novel.id/volume.id/kind` 变化时 cleanup 中 `abort` + 置空 ref，effect 主体 `setExporting(false)`；现在 cleanup 调 `cancel()`，依次 `abort`、置空、`setExporting(false)`，结果相同。卸载时 hook 自身的 cleanup（`:161`，声明在前，先执行）已置空 ref，随后 `:33` 的 `cancel()` 找不到任务，不会对已卸载组件 setState。
  - `cancel` 与 `exportCollection` 都是 `useCallback([])`，引用稳定。
- **`useLayoutEffect` 依赖加入 `cancelWorkExport`**（`SidebarTree.tsx:1488-1493`）：`cancel` 引用稳定，所以该 effect 仍只在挂载和 `scope` 变化时运行，触发时机与 `HEAD` 相同。挂载时调用 `cancel()` 没有任务，是空操作。
- **删除成功取消**（`SidebarTree.tsx:1547`）：只在 `onSuccess` 中按 `work.novelId` 取消；409 失败（WME-04c）与删除其他作品（WME-04b）不取消，用例覆盖。
- **场景创建**（`SidebarTree.tsx:1941-1946`）：`openTabForNavigation` 返回 `true` 后才 `requestAction(novel.id, null, "create")`；`false`/reject 不写请求。`SceneWorkspace.tsx:47` 只在自己是活动 tab 时消费，`sceneId: null` 传给 `startCreate(null)`，即“创建根场景”。WM-06a–f 覆盖。连续点两次：第二次导航因 `activeTabId` 已变返回 `false`，不会重复写请求。
- **伏笔创建**（`SidebarTree.tsx:1925-1940`）：`onSuccess` 是 async，TanStack Query v5 会等待 hook 级 `onSuccess`，所以守卫挂起期间该项保持禁用，这是合理的副作用。`requestPanelFocus` 只在导航返回 `true` 后调用，WM-10/10b 断言 `panelFocus()===null`。
- **菜单在右键菜单中渲染**：`ContextMenuContent` 与 `DropdownMenuSub` 都是 Base UI Menu 部件；WME-01b/WME-02 用真实右键和键盘进入子菜单并导出，通过。
- **`workRowOf` / `data-work-row`**（`:1949,:2070`）：计划写的是从触发点 `closest(".tree-row")` 取行，实现改为按作品 id 查询容器内第一个 `.tree-row`。作品行在子树之前渲染，第一个 `.tree-row` 就是作品行；`novelMenuItems` 只在“作品”视图使用，而 `data-work-row` 也只在该视图出现。`…` 与右键两种入口取到的是同一行，比 `closest` 更不依赖事件来源。可以接受，但这是与计划不同的地方，建议在计划或台账里注一句。

## 2. 中

### 中1 跨作品并发创建时，前一个作品的“进行中禁用”会丢失，可重复 POST

- 证据：`SidebarTree.tsx:1947` `pendingFor` 读的是 `mutation.isPending && mutation.variables?.novelId === novelId`。`useMutation` 的结果只反映**最近一次** `mutate`：在 v5 中 `MutationObserver.mutate` 每次都新建 mutation 并解除对上一个的观察（`node_modules/@tanstack/query-core/build/modern/mutationObserver.js:126-130`）。
- 复现：作品甲“创建角色”挂起 → 作品乙“创建角色” → 再开作品甲菜单，`isPending` 和 `variables` 已经属于作品乙，所以作品甲的“创建角色”可点，再点就会给作品甲发第二个 POST。hook 级 `onSuccess` 存在 mutation 本身上，两次都会执行，于是作品甲出现两个“新角色”。
- 与计划不符：计划 3.2 写的是“每个创建 mutation 进行中时，该作品菜单中对应项禁用”（审核低4）。WM-05 只检查“甲挂起时乙可用”，没有覆盖“甲挂起时乙也发起”，所以测不出来。
- 修复：给三个 mutation 加 `mutationKey: ["work-menu-create", "character" | "item" | "foreshadow"]`，用 `useMutationState({ filters: { mutationKey, status: "pending" }, select: m => (m.state.variables as { novelId: string }).novelId })` 得到进行中作品 id 的集合，`disabled={pendingIds.includes(novel.id)}`。补一个用例：甲、乙先后挂起，两者菜单同项都禁用；放行甲后甲恢复、乙仍禁用；每个作品各只有 1 次 POST。

### 中2 `openHealthyDelete` 改用 `dispatchEvent('click')`：产品本身没有问题，但应修夹具，不应绕开真实点击；WMR-01 也没按用例检查窗口底部的行

- 探针结果（works-loading 夹具，视口 1280×720）：
  - 原夹具：document `scrollHeight` 为 1464（`SidebarTree` 下方还渲染了 `ContentTabs` 等内容，且没有 `.dashboard-shell`，`globals.css:399-402` 的 `html:has(.dashboard-shell){overflow:hidden}` 不生效）。作品行 y=454，右键菜单高 343px，矩形 top 463 / bottom 806，越出视口 86px，“删除”项 y=774。这就是 `.click()` 失败的原因：定位库把可滚动的文档当成裁剪边界，不再向上翻转。
  - 只给夹具加 `html,body{height:100%;overflow:hidden}`、让 `#app` 自己滚动（与真实应用 `DashboardShell.tsx:29` 的 `h-dvh overflow-hidden` 一致）：同一行的菜单移到 top 372 / bottom 715，完整在视口内。视口缩到 400px 高时菜单为 52–395，也在视口内。
  - 结论：越界来自夹具页面可滚动，真实窗口中菜单会被移进窗口，没有隐藏产品问题。主窗口 `minHeight: 580`（`desktop/main/index.ts:924`）大于菜单高度 343px，最小窗口下也放得下；`ContextMenuContent` 还有 `max-h-(--available-height) overflow-y-auto` 兜底。
- 问题在于 `dispatchEvent('click')`（`tests/browser/works-loading.test.ts:220`）跳过了可见性、命中和禁用检查。以后若真有菜单越界或被遮挡，这 6 个删除用例都发现不了。
- 修复：撤回 `dispatchEvent`，恢复 `.click()`。在 works-loading 夹具的 `addStyleTag` 中加 `html,body{height:100%;overflow:hidden;margin:0} #app{height:100vh;overflow:auto}`，或把挂载的根节点包在 `h-dvh overflow-hidden` 容器里，与真实外壳一致。另外可在 WN-56' 中加一条断言：右键菜单的 `getBoundingClientRect()` 位于 `innerHeight` 之内。
- 真实目标核对：`scripts/verify-work-menu-items.mjs:23,47-57` 只创建一个作品（`:32`），它的行在侧栏顶部。`inWindow()` 只检查这一行的菜单，不满足用例 WMR-01 的“含窗口底部的作品行”。检查方法：`setBounds` 把高度设为 580（最小高度）；再经真实 `POST /api/novels` 多建几部作品，或把侧栏滚动容器滚到底，让目标行位于窗口最下方；然后分别用 `…` 和右键（`row.click({button:'right', position:{x:20,y:row高度-2}})`）打开菜单，断言菜单矩形在 `innerWidth/innerHeight` 内，并用真实 `click()` 点“删除”，确认删除对话框出现后取消。截图保存为 `wmr-01-context-menu-bottom.png`。

## 3. 低

### 低1 场景导航被拒时，仍然清掉了场景工作区的筛选

- 证据：`SidebarTree.tsx:1942-1943` 在 `navigateTo` 之前就执行了 `setPref(…workspace, {scope:null, search:""})`。WM-06d/06f（守卫拒绝或被用户抢先）中没有发生任何导航，但后台已打开的场景 tab 的范围和搜索被重置了。`openAllScenes` 无条件写这个 pref，是因为它一定会打开 tab，这里不是。
- 修复：放到 `if (await navigateTo(tab)) { setPref(…); requestAction(…) }` 中。场景面板随后就弹出“创建根场景”对话框，即使先用旧筛选渲染一帧也看不出差别。补断言：WM-06d 中预先设置 `scope:'s1'`，失败后 pref 不变。

### 低2 OutlineTreeMenu“变化即取消”没有用例

- 计划 3.3 要求保留“`novel.id`、`volume.id`、`kind` 变化时取消”，并把 EXB16-05 当作不回归用例。但 EXB16-05 只做一次普通导出，新增的 EXB16-05c 只测卸载。这次重写了该 effect（`OutlineTreeMenu.tsx:33`），却没有用例检查它在重新渲染时的行为。
- 修复：在 `volume` 模式夹具中暴露 `setVolume(id)`；导出挂起时把卷 id 从 `v1` 换成 `v2`（组件不卸载），按 0.2 的取消写法断言 `cancelled.length===1`、不写文件、loading 提示消失，并且格式项重新可用（`exporting` 已复位）。

### 低3 WM-07 的焦点断言分不清“作品行”和“…按钮”

- 证据：`tests/browser/work-menu-items.test.ts:235` 用 `document.activeElement?.closest('.tree-row')` 判断焦点。`…` 按钮在 `.tree-row` 内部，所以焦点停在按钮上也能通过，计划要求的是“回到该行”。
- 修复：断言 `document.activeElement?.classList.contains('tree-row')`，并要求它就是 `[data-work-row="work-a"] .tree-row`。

### 低4 伏笔命名依赖缓存，缓存可能已过期

- `SidebarTree.tsx:1927` `ensureQueryData` 有缓存时直接返回缓存，不管是否过期（生产 `QueryClient` 未设 `staleTime`，见 `src/app/providers.tsx:13-16`）。如果 AI 或其他窗口在此期间新建了“未命名伏笔 2”，菜单会再建一个同名伏笔。伏笔标题没有唯一约束，只是重名。面板的 `+` 用的也是缓存中的 `items`，行为相同，不算回归。
- 可选：改为 `fetchQuery({ queryKey, queryFn, staleTime: 0 })`，代价是每次多一次本地 IPC 读取；若采用，需同步修改 WM-09c 的期望。

### 低5 场景、伏笔导航用的 signal 永不取消

- `SidebarTree.tsx:1922` 每次 `new AbortController().signal`，数据目录切换或删除作品时，挂起中的导航不会被取消。目前 `openTabForNavigation`（`src/stores/tabs.ts:308`）在活动 tab 或目标 tab 变化时会返回 `false`，删除作品会关闭其 tab，因此实际影响很小。如果以后要更严格，可以用一个随 `scope` 重建的 controller，在 `:1491` 一并 `abort()`。

### 低6 台账与真实目标证据尚未落地（流程项）

- `docs/requirements-traceability.json` 中还没有 `WM-609`（`grep -c` 为 0），`docs/609-work-menu-items-evidence/` 不存在，`scripts/verify-work-menu-items.mjs` 尚未运行。按 AGENTS.md，在这些完成之前不能标为真实通过；WMR-01 需按中2补“底部行”检查后再运行。

## 4. 测试有效性小结

- 正向和反向都有断言、不会空过的用例：WN-56'（11 项、3 个分隔栏位置、只有两个子菜单）、WM-05（甲禁用且乙可用）、WME-03（两作品都禁用，正文树走单任务保存锁）、WME-04/04b/04c、WME-05、WM-06d/e/f、WM-09c/d、WM-10/10b。
- 会在功能有缺陷时仍然通过的地方：中1（跨作品并发禁用）、低2（变化即取消）、低3（焦点落点），以及 works-loading 删除用例的 `dispatchEvent`（中2）。

## 修复与复验（主代理，2026-11-26）

- **中1 已修复。** 三个创建 mutation 加 `mutationKey: ["work-menu-create", kind]`，菜单用 `useMutationState` 读取全部进行中的创建，按“类型:作品 id”禁用（`SidebarTree.tsx` `creating()`）。新增 WM-05b：先在旧逻辑下运行，失败；改后通过。
- **中2 已修复。** works-loading 夹具与真实外壳一致：页面本身不滚动（`html,body{height:100%;overflow:hidden}`，`#app` 内部滚动）；`openHealthyDelete` 恢复真实 `.click()`；WN-56' 增加“右键菜单位于窗口内”断言。真实目标新增 WMR-01b：窗口缩到最小高度 580，第二部作品经真实 `POST /api/novels` 创建，作品行位于窗口底部（行底 496/580），`…` 与右键菜单都完整位于窗口内，右键菜单中真实点击“删除”打开删除对话框后取消（`docs/609-work-menu-items-evidence/wmr-01-context-menu-bottom.png`，菜单向上展开）。
- **低1 已修复。** 场景筛选只在导航成功后重置；WM-06d 断言守卫拒绝时 `scope`/`search` 不变。
- **低2 已修复。** 新增 EXB16-05d：卷 id 变化时取消挂起的导出、不写文件、格式项恢复可用。
- **低3 已修复。** WM-07a/b 改为断言焦点就是 `[data-work-row="work-a"] .tree-row` 本身。
- **低4 接受，不改。** 与面板 `+` 行为相同（都用缓存列表取名），已写入台账限制。
- **低5 接受，不改。** `openTabForNavigation` 在活动 tab 或目标 tab 变化时已返回 `false`，删除作品会关闭其 tab；已写入台账限制。
- **低6 已完成。** 台账 WM-609、证据目录与真实目标报告见下。

复验（Node v24.18.0，构建后运行，运行期间未构建）：
- 浏览器：work-menu-items 21/21、file-export 18/18、works-loading 33/33、sidebar-navigation 全部通过；单元 WMU-01、SH-04 通过。
- 真实目标：`scripts/verify-work-menu-items.mjs` WMR-00..05 与 01b 共 7 项通过；`scripts/verify-faulted-work-nodes.mjs` ALL PASS（证据写入临时目录，未覆盖已提交的 docs/faulted-work-node/evidence）。
