# docs/602 世界线事件表缩放档位（卡片尺寸、两端停止、全部展开）：代码审核

审核范围：docs/602 在 docs/601 工作区（`052627a` 之上未提交的 601 改动）之上的改动：`worldline-layout.ts` 新段 “docs/602: event-table zoom stops”（`tableCardScale`、`stretchPairs`、`tableZoomModel`、`tableZoomLevelAt`、`tableZoomView`、`minBlock`、`tableZoomSignature`、`tableZoomStep`）、`tableLayout` 的 `slack`、删除 `tableAutoOpenFits` / `decideAutoOpen`；`PlanningWorkspace.tsx` 的 `wTableModel`、`drawnTableLevel`、`tableView`、`stepTable`、工具栏 `onZoom`、EventTable 新 props；`EventTable.tsx` 的 `zoomLevel` / `cardScale` / `allOpen`、`openAll` / `shownOpen` / `keepCards`、单一布局、`zoomKey` 视图恢复、包层条件、`data-card-scale`、`onScrollTop` 去重；以及 §10 列出的单元和浏览器用例。依据是方案 §1–§8、§9 修订 1、§11 修订 2（冲突处以后者为准）。行号按审核时的工作区文件。本次只读，没有改源码、测试和其他文档；探测脚本放在 `/tmp/rv602/`，不在仓库内。

## 结论

有 P1。“每一步都有可见变化”的签名不知道折叠：等距模式下，拉伸对包含被自动折叠（级别 ≥ 3）或用户折叠的父事件里的子事件对，这些子事件画不出来，签名却随它们的拉伸变化，留下无变化的步。探测中一棵常见形状的树缩小全程 24 步里有 13 步画面不变（P1-1）。同一原因在对齐模式下也会留下死步，只是少一些（P2-1）。反方向的错误也存在：被选中、搜索命中或展开而强制画出的隐藏事件不在拉伸对里，它们之间的间距变化会被跳过（P2-2）。

状态与 effect 顺序、视图恢复键、`onScrollTop` 去重、全部展开集合、包层 CSS 都核对过，没有发现问题（见文末）。性能足够：F885 上 `tableZoomModel` 7 ms，`canIn + canOut` 两次步进最坏 0.7 ms。

## 运行结果

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 通过 |
| `node --import tsx --test tests/unit/worldline-table-card-scale.test.ts tests/unit/worldline-table-zoom.test.ts tests/unit/worldline-table-equal-gaps.test.ts` | 36/36 通过 |
| `node --import tsx --test --test-concurrency=1 tests/browser/planning-worldline-table-card-scale.test.ts` | 20/20 通过（TSB-01 … TSB-18，含 04b、15b） |
| 探测 `/tmp/rv602/fold2.test.ts`：60 个根相隔 1 h，加一个父事件（6 个子事件相隔 30 h），用真实 `zoomPlan` + `tableLayout`（自动折叠、点、隐藏、`tableGapFor`）比较每个停留位置的卡片 top（0.5px）与 `railLevel` | 等距缩小 24 步中 13 步布局与上一步完全相同（级别 3、4，s = 1）；对齐 8 步，0 死步 |
| 探测 `/tmp/rv602/kids.test.ts`：根为重要 / 关键，一般事件只作为子事件，对齐缩小 | 级别 3 → 4 一步画面不变 |
| 探测 `/tmp/rv602/keep.test.ts`：40 个一般根，关键根 `k0`(100 h)、`k1`(300 h) 之间一个一般根 `s`(250 h)，`s` 在 keepCards 中（选中） | 级别 4 下有两次跳步越过了真实变化（一次跳 4 步，一次跳 2 步），中间位置的布局与起点不同 |
| 探测 `/tmp/rv602/gen.test.ts`：zoomView(24)、zoomView(24, leavesOnly)、F885，两种模式双向全程，比较停留位置和被跳过位置的真实布局（展开卡实测高 120） | 跳过真实变化：0；死步：zoomView(24) 等距 3、leavesOnly 等距 1（都在全部展开之后，见 P3-1）；F885 两种模式 0；F885 单个方向全程 33–57 ms |
| 探测 `kids.test.ts` 第二条：F885 在 [lo, hi] 每 0.05 取点做 `canIn + canOut` | 最坏 0.7 ms；`tableZoomModel` 7.0 ms，拉伸对 833 / 255 / 106 |

## P1

### P1-1 等距签名统计了画不出来的子事件对，自动折叠和用户折叠后留下大量死步

- `stretchPairs`（`worldline-layout.ts:2241-2252`）的 `walk` 对每个父事件都取相邻已定位子事件，只按 `hide` 过滤，不看折叠。`tableZoomSignature`（`:2324-2329`）对每一对都比较 `min(cap, Δt·k)`。
- 但 `tableLayout` 在父事件折叠时不画子事件：级别 ≥ 3 的自动折叠（`zoomPlan` `:2149`，经 `viewFolded` 进入布局）和用户折叠（`folded`，`tableLayout:921`）都画成一张层叠卡，子事件之间的拉伸不影响任何位置。`zoomBars` / 签名里的 `hasParents && level >= 3`（`:2318`）只记录“开始折叠”这一次变化，没有去掉折叠后的子事件对。
- 失败场景：根事件密集（中位间距小，等距根拉伸都在最小块高以内），家族内子事件间距大，这是常见形状（主线事件密集、某个长事件内有几个分段）。等距模式缩小到级别 3 以后，每一步只有被折叠的子事件对在变，签名不同所以停下，画面完全不动。探测 `fold2`：24 步中 13 步不动，违反 S3，也正是 docs/602 要消除的现象。用户折叠父事件后，任何级别都有同样问题。
- 现有用例查不到：TS-04 / TS-07 / TSB-04 用 zoomView(24)，家族只有 3 个子事件、48 h 间距，根拉伸本身就一直在变；单元 TS-04 的 `look` 是签名的复写，只能证明“签名变了”，不能证明“布局变了”。
- 处理：拉伸对记录所属父事件 id；签名对子事件对，在 `level >= 3`（且该父事件不在 `unfolded`、也不是 kept 的祖先）或父事件在用户 `folded` 中时记 0。用户折叠集合和 `unfolded` 不在模型里，需要把 `folded` / `unfolded` 作为 `tableZoomModel` 或 `tableZoomStep` 的输入（PlanningWorkspace 有 `foldedEvents`；`unfolded` 是 EventTable 内部状态，可以保守地只按 `folded` 与 `level >= 3` 判断，`unfolded` 时多停一步属于允许的方向）。补单元：`fold2` 形状的树，等距缩小全程，每一步用真实 `zoomPlan` + `tableLayout` 的卡片 top 对比（不要用签名自身），断言无相同；同一棵树用户折叠父事件后再跑一遍。

## P2

### P2-1 对齐模式：分级类别不看折叠，只存在于折叠子树里的重要度会留下死步

- `tableZoomModel` 的 `importances`（`:2264-2269`）取所有已定位事件，包括子事件。签名的类别串（`:2318`）对每个重要度标记隐藏 / 时间点 / 卡片。
- 级别 ≥ 3 时父事件自动折叠，子事件不画。如果某个重要度只出现在子事件中（例如一般事件全是阶段子事件，根都是重要 / 关键），级别 3 → 4 只把这些已经看不见的子事件改为隐藏，签名变化，画面不变。探测 `kids`：对齐缩小停在级别 4，布局与级别 3 相同。
- 同理，所有父事件都被用户折叠时，`hasParents && level >= 3` 这一项也只改变看不见的东西（级别 2 → 3 死步）。
- 处理：类别串只统计“在级别 < 3 时会画出的事件”已不够；可以按两份统计：根及未折叠路径上的事件（级别 < 3 用）、只含根和用户展开父事件的子树（级别 ≥ 3 用）。`hasParents` 改为“存在未被用户折叠的父事件”。补单元：`kids` 形状的树，对齐缩小全程用真实布局比较。

### P2-2 被强制画出的隐藏事件不在拉伸对里，等距模式会跳过它们周围的真实变化

- §11.1 取消了 §9.1 的“与未过滤对取并集”，`stretchPairs(tree, adapter, hide)` 只保留 `importance >= hide` 的事件（`:2228-2238`）。但 `zoomPlan` 的 `isShown`（`:2132`）还画出 `keep.cards` 中的事件及其祖先：选中事件、搜索命中、`open` 中的展开卡（`EventTable.tsx:121`）。这些事件参与 `tableLayout` 的根拉伸（`:972` 按 `segs` 内相邻根），也会让 `railSegments` 的分段与模型不同。
- 失败场景：等距模式选中一张一般事件卡（或搜索命中它），缩小到级别 4。它两侧的关键事件在模型里是一对（200 h），实际布局里是两对（150 h、50 h）。模型认为“200 h 这对已到上限”时，实际的 150 h / 50 h 仍在变化，于是一步跳过多个有变化的位置。探测 `keep`：两次跳步越过了真实变化（4 步、2 步）。用户正在看的就是被选中的卡，跳过的恰好是它周围的变化。
- 这是方案 §11.1 为消除死步做的取舍，但 S3 和 §2 要求“只会少跳，不会把有变化的步跳过”，现在反过来了。
- 处理：把 `keepCards` 作为签名输入：对含 kept 事件的段（或简单地：有 kept 隐藏事件时）额外比较“kept 事件与其可见邻居”的对。keepCards 每次选中都变，模型不必重算，只需在 `tableZoomStep` 里加一份小的附加对（kept 事件数通常为 1–2）。或者接受这一点并写入 §5 已知限制。补单元：`keep` 形状。

### P2-3 用例的“有无变化”判定主要来自签名自身，缺少按真实布局比较的单元用例

- 单元 TS-04（`tests/unit/worldline-table-card-scale.test.ts:84-105`）的 `look`（`:34-37`）与 `tableZoomSignature` 的类别串逐字相同；对齐模式下它等于“签名变了”，不能发现签名本身漏算或多算（P1-1、P2-1、P2-2 都会照常通过）。等距只有 TS-07 计数，没有逐步断言。
- 浏览器 TSB-02/03/04 的 `look`（`tests/browser/planning-worldline-table-card-scale.test.ts` `look`）比较 DOM，是真实判定，但只取前 40 张卡的 top 和前 12 个刻度，夹具也没有大间距家族、强制显示的隐藏事件，查不到上面的情况。
- 处理：加一个单元工具，对每个停留位置和被跳过的位置用 `zoomPlan` + `tableLayout`（含 `viewFolded`、`keep.cards`、`gapMax`、`stretchChildren`、对齐时 `equalGaps` / `layoutK = 0`）算卡片 top / point / stacked / expanded 加 `railLevel`，断言“停留位置之间不同、被跳过位置与起点相同”；夹具至少包括 zoomView(24)、F885、`fold2`、`kids`、`keep` 形状。`/tmp/rv602/gen.test.ts` 可直接参考。

## P3

- **P3-1** 全部展开后的等距死步：`minBlock` 对展开卡取 `max(34, 估计 × 0.75)`（`worldline-layout.ts:2307`），实测高于估计时，拉伸在 (估计 × 0.75 + 6, 实测 + 6) 之间变化的步画面不动。探测（展开卡实测 120，空事实估计 78）zoomView(24) 等距有 3 步死步，都在全部展开之后。这是 §11.1 有意选的误差方向；可以在 EventTable 把已测高度传进模型（全部展开时 `heights` 已有窗口内卡片的实测值），对已测卡用实测值，未测卡用 0.75 × 估计。
- **P3-2** `tableZoomModel` 在时间线视图和分级关时也计算（`PlanningWorkspace.tsx:339`），每次 `wViewTree` 变化（筛选、编辑保存）在 F885 上 7 ms，其中 `labelClass` 对 5 个刻度级别各做一次全部事件的 `railText` 拼串（`worldline-layout.ts:2285-2289`）。可在 `!table || !zoomLevelsOn` 时返回轻量模型，或把 `labelClass` 延后到等距模式才算。
- **P3-3** 收起卡包层的 `zoom` 也作用于卡片菜单（`.menu` 绝对定位在卡内，`worldline.module.css:172`）：s = 1.2 时菜单字号和尺寸一起放大 20%，而展开卡上的同一菜单是原尺寸。方案 §11.4 P2-3 把 RM-B8 的菜单位置交给真实目标截图，没有提到菜单本身被放大；请在截图里确认这是可以接受的外观，或把菜单移出包层。
- **P3-4** 过时注释：`EventTable.tsx:217` 仍写 “Ctrl + wheel and auto-open switches”；`:241-243` 的 `auto` ref 只剩 `written`，可改名 `restore` 一类，免得读者以为还有自动展开状态。
- **P3-5** `onScrollTop` 去重（`EventTable.tsx:497-498`）只在滚动事件里比较 id。筛选或折叠让第一行消失而 `scrollTop` 不变时，左侧树的当前行仍指向旧行，直到下一次滚动。这一点 601 之前就是这样，不是本次引入的；去重本身不会让它更差（重挂时 `lastRow` 重置为 `undefined`，首次滚动必报）。如要修，在恢复 effect 末尾（`:437` `sync.current()` 之后）用新布局算一次 `firstVisible` 并走同一个去重分支。
- **P3-6** TS-13 只在 e = 0 和上限两处计时。最坏位置在跳步最长处（级别 ≥ 4 的长跳），本次探测最坏 0.7 ms，远低于阈值，但用例没有覆盖最坏情况；可以在 [lo, hi] 网格上取最大值。

## 已核对、无问题

- **级别回差与 ref 顺序**：`tableView` 的 memo（`PlanningWorkspace.tsx:341-352`）读 `drawnTableLevel.current`，依赖不含它；该 ref 只在 `tableView.zoomLevel` 改变后的 layout effect（`:353`）里改写，下一次 memo 重算（e、模型、模式变化）读到的正是上次画出的级别，与原 EventTable `prevLevel` 语义相同。memo 不重算时级别也不会变，所以不会出现 ref 与画面不一致。StrictMode 下 memo 和函数式 updater 都被调用两次，二者都是纯函数，结果相同。
- **连发滚轮**：`stepTable` 的 updater（`:357-362`）从上一个 updater 的 `prev` 出发，级别用 `drawnTableLevel.current`。两次 wheel 之间没有提交时，渲染也用同一个 drawn 级别求值，结果一致。固定起点级别逐个求候选位置的级别，与逐步链式求值结果相同（上行时 `at(1.15)` 单调，`max(down, min(p, at115))` 与 `p` 取起点或中间值无关）；TS-11 证明了幂等。
- **`tableZoomStep` 边界**：`levels` 关时与 docs/601 相同（TS-09、TSB-12）；`fit = 0` 时 lo = hi = 0，两个方向立即 null，按钮置灰、滚轮被 `live.current.canZoomIn/Out` 忽略；单根树 `gap = null`，d = ∞，级别恒 0，只有卡片尺寸变化，到 1 / 1.2 后停止；无月历法 `railLevel` 为 null，签名里该项为空串，不会产生假变化。待定位事件不进入拉伸对，也不进入 `openAll`（`EventTable.tsx:113-118`，TSB-07）。
- **全部展开集合**：`openAll` = 已定位事件 − `autoClosed` ∪ `open`，含组头和用户折叠的父事件；`keepCards` 并入 `shownOpen`，所以上限处仍在级别 2 以上时也全部画成展开卡（TSB-16）。离开全部展开时 `autoClosed` 清空（`:245-247`）。删除的 `decide` / `latch` / `timer` / `lastScale` / `flipAnchor` 没有残留读者；`AUTO_OPEN_GAP` / `AUTO_OPEN_KEEP` 只剩时间线使用，正确保留。
- **视图恢复键**：`zoomKey` 只含 `zScale` 和 `on`，二者变化必然改变 `layoutPlan.scale` 或 `shownOpen`，所以 `[layout]` 恢复 effect 一定运行；无依赖的 `lastZoomKey` 回写 effect（`:441`）声明在恢复 effect 之后，同一次提交内先比较后回写，布局未变的提交也会刷新键，不会被之后不相关的提交误用（TSB-11）。优先级 `anchor.current ?? modeSwitch ?? zoomed`：滚轮锚点优先，工具栏 / 复位用 `modeAnchor`。`onScroll` 中 `anchor.current = null`（`:506`）同时修好了 docs/601 代码审核 P1-1。
- **包层**：分级开时所有收起卡都有包层（含 s = 1），跨过 1 不重挂（TSB-17）；展开卡和编辑中的卡（`open` 含 `editing`，`EventTable.tsx:95`）没有包层。`.slot:not(.slotOpen) > .tableZoom > .card`、组头和层叠卡的 `:is(…, … > .tableZoom)` 选择器覆盖了宽度、阴影、悬停、选中、命中样式；`.slot:not(.slotOpen) > .card` 的 `fit-content` 在分级开时不再命中，宽度由包层的 `c.width` 决定，`cardsWidth` 在首次 layout effect 中测得，第一帧绘制前已有宽度。时间线视图不使用 EventTable 包层，没有变化。
- **`slack`**：只在有 `plan` 时 +3（`worldline-layout.ts:826`），不给 `plan` 时 TZ-02 快照不变（单元通过）。
- **性能**：`tableView` 每次重算调用两次 `tableZoomStep`，F885 网格最坏合计 0.7 ms；签名串的拼接在 833 对 × 最多约 100 次试探下仍在毫秒以内。TSB-15 / 15b（每步提交 p95、每步只渲染一次）在本机通过。

修改后通过
