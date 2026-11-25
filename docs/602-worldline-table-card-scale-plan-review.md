# 602 · 世界线事件表缩放档位 技术方案 独立审核

审核对象：`docs/602-worldline-table-card-scale-plan.md`。依据：`docs/602-worldline-table-card-scale-research.md` §6（修订 1）、设计稿 `design/worldline-table-card-scale/index.html`（`step()` 100–117 行）、源码 `src/lib/planning/worldline-layout.ts`（tableLayout 789–993、railLevel 751、tableZoomBounds 768–785、zoomLevel/zoomBars/zoomPlan 2053–2158、tableAutoOpenFits/decideAutoOpen 2176–2224）、`EventTable.tsx`（全文件）、`PlanningWorkspace.tsx`（197、307、336–344、2417–2422、2625–2645）、`worldline.module.css`（224–254、401–403），以及既有用例。工作区（`052627a` 加未提交的 601 改动）作为基线。只读审核，未改源码和用例。

## 结论

整体结构可行：用“外观签名”在纯函数里判断有效步，`zoomLevel` 回差在单调前进时与逐步求值一致，工具栏步长与滚轮步长判断结果一致，对齐模式在 eOpen 后自然停止。下面 P1-1 是签名的正确性缺陷（会跳过有可见变化的步，与方案“不会漏掉真实变化”的说法相反），必须先改方案。P2 集中在状态迁移、边界与既有用例清单。

已核对、成立的部分：

- `zoomLevel` 幂等，且单调前进时“从起点级别一次求值”与“逐步链式求值”结果相同。审核时用脚本按 `ZOOM_STEPS`、`ZOOM_HYSTERESIS` 对 7 个起点级别各取 4000 组随机 d 验证，两项均 0 例不一致。§2 的说法成立。
- 签名的各分量（s、open、按起点级别求得的分级类别、`railLevel(k)`、每对 `min(tableGapFor(d), Δt·k)`）沿一个方向都是单调的，变了就不会再回到起点值。所以只要候选序列最后一项是边界本身（方案写了“夹在 [lo, hi]”），步长 ln 1.25 与 ln 1.15 对“这个方向有没有有效步”的判断一致，`canIn` / `canOut` 只用滚轮步计算不会让工具栏按钮误灰或误亮。
- 分级类别（每个重要度的隐藏 / 时间点 / 卡片，加 `hasParents && level ≥ 3`）完整覆盖了 `zoomPlan` 对级别的依赖：`zoomPlan` 只经 `hide`、`bar`、`level >= 3` 读级别（`worldline-layout.ts:2100-2101`、`:2146`），状态行的 `pointClass` 也只由 `hide`、`bar`、`maxImportance` 决定（`:2067-2070`）。
- 对齐模式 `layoutK = 0`（`EventTable.tsx:129`），`alignedRailMarks` 不读 `level`（`:189-191`），签名去掉第 3 项正确；eOpen 之后级别 1 → 0 类别相同，签名不再变，所以无需单独的 `hiAligned`。
- 下限不取到网格上也满足“反向第一步立即变化”：缩小时停在第一个进入级别 6 的位置，放大第一步由跳步找到 6 → 5。research §6.1 的“floor 落在网格上”可以不做，但方案应写明这条要求由跳步替代。

## P1（必须修改）

### P1-1 等距模式的拉伸签名用未隐藏树的相邻对，隐藏事件后会跳过真实变化的步

- 方案 §2 第 3 项与“拉伸对”一段：`pairs` 取 `railSegments(tree.roots)` 段内相邻根和父事件内相邻子事件，并说明“不考虑隐藏（偏保守：只会少跳，不会把有变化的步跳过）”。
- 布局实际拉伸的是隐藏后的相邻对。`tableLayout` 先过滤隐藏根再分段：`railSegments(hidden.size ? tree.roots.filter(...) : tree.roots, adapter)`（`worldline-layout.ts:942`），根块按过滤后段内的前一根拉伸（`:969`）。子事件用 `visibleKids`（`:820`、`:931-934`）。所以级别 ≥ 4 时，真实的拉伸对是“隔过隐藏事件的 a–c”，它的 Δt 是 a–b、b–c 之和。
- 反例：a–b、b–c 的 Δt·k 都 ≤ 24（eff 为 0，签名不变），a–c 的 Δt·k 在 (24, cap) 内，随 k 增大而变。布局里 a–c 的间距在变，签名判断为“无变化”而跳过。这与“不会漏掉真实变化”相反，跳过的位置不能停留，用户会看到间距一下跳很多。
- 分段也会变：`railSegments` 的断档阈值取可见根间隔的中位数 × 20（`:579`）。隐藏一般事件后中位数变大，原来的两段可能合并，产生一个跨原断档的新相邻对（Δt 很大，拉伸到 cap，cap 随 d 变）。这个对不在 `pairs` 里。
- 建议：按 `hide` 的不同取值（`zoomBars` 的 `hide` 只有 0、2、3，再受 `maxImportance` 限制，`:2068`）各预算一份相邻对。根按 `zoomPlan` 的 `isShown` 规则过滤（重要度 ≥ hide 或有可见后代），过滤后重新 `railSegments`；子事件同理。候选位置用它所在分级类别的那一份，再与未过滤的一份取并集（保留方案的保守性：被保留卡片 `keep.cards` 让隐藏事件仍显示时，并集仍覆盖）。分级类别不同时签名已经不同，所以只需在同一类别内比较同一份对，单调性不变。单元用例要覆盖：级别 4 下“相邻对都 eff 0、跨隐藏对在变”的步不被跳过；隐藏后两段合并的情况。

## P2（应修改）

### P2-1 级别状态只在步进时写入，渲染级别不回写，回差记忆会过期；`cur(z)` 未定义

- 原来 EventTable 每次提交都把当前级别写回 `prevLevel`（`EventTable.tsx:130-131`），所以回差总以“上一次画出来的级别”为准。方案 §3 只在滚轮、工具栏、复位时写 `tableZoom.level`，渲染时 `level = zoomLevel(d, tableZoom.level)`。
- 树变化时 d 会变（编辑时间、增删事件、图例筛选改变 `wViewTree`，`PlanningWorkspace.tsx:289-290`、`:307`）。例：存的是级别 2，筛选后 d 变小，画出级别 4；取消筛选后渲染又按存的 2 求值，回到 2。原实现会按回差停在 4，直到放大越过阈值 × 1.15。这是行为变化，方案 §6 只写了“切换视图后保留回差”。
- §3 的 `setTableZoom(z => tableZoomStep(m, mode, cur(z), ...))` 没定义 `cur(z)`。必须是 `{ e: clamp(z.e), level: zoomLevel(gap·fit·e^e, z.level) }`（即渲染级别），否则签名起点与画面不一致：起点用存的级别，可能把“回到存的级别”误判为一次变化，或反过来。
- 建议：写明 `cur(z)`；并在 PlanningWorkspace 的 layout effect 里，渲染级别与存的不同时回写（或用 ref 记“上次画出的级别”作为 `prev`，与原 `prevLevel` 语义一致）。TZB-02 的回差断言在这个口径下仍成立。

### P2-2 eOpen 可能超过 hi，密集作品永远到不了全部展开

- `hi = ln(max/fit)`，有月日历法时 `max = max(TABLE_SCALE_MAX / u.hour, fit)`（`worldline-layout.ts:782-784`，`TABLE_SCALE_MAX = 60`）。中位根间隔 gap 很小时（例如以小时计），`d(hi) = gap × 60 / u.hour` 可能 < 46 × 1.15，eL1 + 一步 > hi；`fit ≥ 60/u.hour` 时 hi = 0，复位以上根本不能放大。
- 这时 S5 / S7“卡片最大后再放大一步全部展开”不成立，方案没有说明。
- 建议二选一并写进 §1：(a) `eOpen = min(max(E, eL1) + 一步, hi)`，到 hi 即全部展开（级别可能仍是 2，时间点照样画成展开卡需要再定义）；(b) 写进 §5 已知限制，并给出 hi 处的外观。另外 `fit = 0`（无主段且无 `railUnits`，`:779-780`）时 lo = hi = 0，卡片固定 1.1×、两个按钮都灰，也应写进限制。

### P2-3 `zoomKey` 只在布局变化时比较，可能在之后不相关的提交里误触发视图恢复

- 方案 §4 视图保持：恢复 effect 记录上次的 `zoomKey = scale|cardScale|on`，变化且没有滚轮锚点时按 `viewAnchor` 恢复。恢复 effect 的依赖是 `[layout, scrollerRef]`（`EventTable.tsx:483-504`）。
- 对齐模式下有些有效步不改变布局：§5 承认的 `showAll` 下只改变状态行的步，以及 P2-2 (a) 若采用后的边界情况。此时 `zoomKey` 已变但 effect 不运行，旧值留着。之后用户展开一张卡、布局提交，effect 看到 `zoomKey` 不同，按 `viewAnchor` 恢复，画面跳回第一张可见卡片的位置。这与 docs/601 code review P1-1（残留滚轮锚点被后来的提交消费）属于同一类问题。
- 建议：`zoomKey` 的比较放在每次提交都运行的 layout effect 里（无依赖），或者在 PlanningWorkspace 步进时把“需要按视图锚点恢复”作为一次性标记传入并在 effect 里消费，不依赖布局是否变化。

### P2-4 删除 `scheduleDecide` 时，定位事件的清理逻辑不能一起删

- `worldline-locate` 监听（`EventTable.tsx:316-322`）除了 `scheduleDecide(true)`，还清空 `zoomAnchor` 和 `auto.written`。方案 §4 把 `scheduleDecide` 列入删除，没说这个监听保留什么。
- 如果整段删掉，滚轮后 400 ms 内定位一张卡，测高回调（`:461-462`）仍用旧的滚轮锚点修正，把视图拉回滚轮位置。
- 建议：§4 写明保留监听，只去掉 `scheduleDecide`；同理，`onScroll` 里的 `isProgrammaticScroll`、清 `zoomAnchor`、清 `anchor.current`（`:559-566`）保留，只去掉 `scheduleDecide(true)`。`auto` ref 拆成只剩 `written`。

### P2-5 全部展开包含用户折叠的父事件与分组头，方案应写明外观，并说明与旧规则的差别

- 原 `openAll` 跳过用户折叠的父事件和所有分组头（`EventTable.tsx:172-173`，docs/600 §9.2）。方案的 `openAll = 所有 start !== null 的事件 − autoClosed` 把两者都加入。
- 用户折叠的父事件展开后走分组分支（`worldline-layout.ts:918` 条件因 `expanded` 不成立），画成展开的组头加一个无子事件、无内边距的组框（`:923-938`），不再是层叠外观。research §6.2 写的是“仍为层叠卡（只展开它自己）”，两者不同。
- 建议：§4 写明折叠父事件在全部展开中的外观（沿用手动展开折叠父事件的现有外观即可，但要在真实目标截图里让用户确认），并加浏览器用例：全部展开下折叠父事件的子事件不出现、组头展开、下方块间距 6。

### P2-6 缩放后卡片宽度固定，标题估宽误差会变成截断

- 收起卡在 z = 1 时没有包层，CSS `width: fit-content; min-width: 220px`（`worldline.module.css:227`），真实文字比估宽宽几 px 时卡片自己变宽。z ≠ 1 时包层宽度固定为 `c.width = min(slot/z, max(220, own))`（`EventTable.tsx:423`、`worldline-layout.ts:828`），内层卡 `width: 100%`（`worldline.module.css:231`）。`own` 由 `titleWidth` 估算加 `TITLE_SLACK` 4px（`:1398` 注释：真实字体最多宽 2px）。
- 601 之后事件表收起卡都没有包层，这条路径只在 docs/600 的 z < 1 时跑过。602 起复位就是 1.1×，所有收起卡都走固定宽度。14.3px / 15.6px 下字形微调不严格按比例放大，估宽误差可能超过 4px。单行标题 `nowrap; overflow: hidden`（`worldline.module.css:130`），结果是本来放得下的标题末尾被截。
- 建议：浏览器与真实目标各加一项：s = 1.1、1.2 时，凡 z = 1 下不截断的单行标题，`scrollWidth ≤ clientWidth`（LOTM 全量）。若失败，`own` 按 z 增加余量（如 `TITLE_SLACK × z + 2`），而不是改 CSS。

### P2-7 既有用例与台账的影响清单缺失

§9 推迟到方案审核后写用例，这符合 AGENTS 顺序。但方案 §1 C2、§4 删除的行为已有用例和台账条目，方案应先列出“删除 / 改写 / 保留”，否则测试用例阶段容易漏改，或把旧断言放宽。

| 用例 / 条目 | 位置 | 影响 |
|---|---|---|
| TZ-07/10、TZ-14 | `tests/unit/worldline-table-zoom.test.ts:94-119`、`:152-158` | `tableAutoOpenFits`、`decideAutoOpen` 删除，用例删除 |
| EG-08 | `tests/unit/worldline-table-equal-gaps.test.ts:108-111` | 同上 |
| TZB-06/06b/06c/06d/06e、TZB-07、TZB-13、TZB-13e、TZB-17b | `tests/browser/planning-worldline-table-zoom.test.ts:159-201`、`:233-258`、`:362-391`、`:425-441`、`:490-530` | 都按“放得下才展开 / 锁存 / 160 ms 空闲”写，`settle` 等待 160 ms 决策（`:52`）。TZB-07、TZB-13、TZB-13e 的同时刻不展开、锁存后重新进入在新规则下不再存在，应删除；TZB-06b/06d/17b 的单击本地收起、待定位不展开改写到全部展开下 |
| TZB-12 | 同文件 `:214-224` | 等距放大到 d ≥ 400，断言无 `data-auto-open`；新规则在 eOpen（真实数据 +7 步）就全部展开，断言失败，且测量的是展开布局 |
| TZB-01、TZB-11、EGB-02 | 同文件 `:55-85`、`:305-331`；`planning-worldline-table-equal-gaps.test.ts:92-109` | 断言无 `[data-card-zoom]`、卡高 34、组头 36；改为包层 zoom = s、卡高 34 × s |
| TZB-08、EGB-07 | `planning-worldline-table-zoom.test.ts:393`、`planning-worldline-table-equal-gaps.test.ts:161` | 圆点对卡头，z > 1 需重新验证（应保留并加 s = 1.2） |
| EGB-04 | `planning-worldline-table-equal-gaps.test.ts:140-149` | “对齐模式不自动展开”与 S7 相反，改写 |
| EGB-08 | 同文件 `:181-195` | 对齐放大到“最细”（80 步）现在落在全部展开，量的是展开卡间距，含义变了 |
| TZB-02 | `planning-worldline-table-zoom.test.ts:87-108` | 回差逐步断言在跳步下仍可能成立，但最后“退一步回到 [40, 46)”会被跳步越过，`if` 分支变成空检查 |
| 台账 WL-600 T6、WL-601 Q6 | `docs/requirements-traceability.json:5702`、`:5747`、`:5761` | 记录的“只在有空间时展开”“对齐模式不自动展开”被 602 取代。应在 WL-602 写明替代关系，并在原条目上注明被取代，不改写历史证据（台账常有未提交条目，只能追加修改，不能 checkout） |

## P3（建议）

- **P3-1** `canIn` / `canOut` 在 PlanningWorkspace 每次渲染都算，在边界时两个方向都要扫完整个范围（真实数据约 70–100 个候选 × 约 1000 对），时间线视图下也算。单次约 1 ms，可以接受，但建议放进 `tableView` 的 `useMemo`，依赖 `(model, tableRail, tableZoom)`，并且只在 `table` 为真时计算。
- **P3-2** `z !== 1` 才包层（§4）。s 在 −E 处到 1.000，越过这个位置时所有已渲染收起卡在“有包层 / 无包层”之间切换，React 会卸载重挂 EventCard（父元素类型变了），卡内状态（打开的 ⋯ 菜单、悬停）丢失。建议 s = 1 时也保留包层（`zoom: 1`、宽度用 `c.width`），或者在用例里接受并写明。
- **P3-3** 触控板捏合一次会发出很多 wheel 事件，每个事件按一步算（`EventTable.tsx:517`）。跳步后，在无变化区间里一个事件就跳 9 步，轻轻一捏可能从复位直接到下限。这符合用户批准的规则，但真实目标验证应加一次触控板捏合（或连续 10 个快速 wheel 事件）的记录，在总结里说明。
- **P3-4** 卡片的 ⋯ 菜单（`EventCard.tsx:253-259`）在包层内，会随 s 放大到 1.2×；RM-B8（菜单在模式切换钮之上）应在 s = 1.2 复测。
- **P3-5** 全部展开下工具栏的“全部展开 / 全部收起”按 `openCards` 判断（`PlanningWorkspace.tsx:2415-2416`），画面全开但按钮仍显示“全部展开”，点了会写入 `openCards`，缩小后所有卡保持展开。建议在 §5 写明，或在全部展开时让按钮按显示状态判断。
- **P3-6** 性能：方案 §6 只测“含展开那一步”的提交耗时。全部展开后往上滚动时，每进入一屏都要测高、`setHeights`、整表重排（`EventTable.tsx:446-474`），而且上方卡片从估算高度改成实测高度。建议真实目标（1061 事件）加全部展开下连续滚动 20 屏的帧耗时与视图跳动记录（第一张可见卡片屏幕位置变化 ≤ 2px）。F885 的事实文字较短，不能代表真实数据的展开高度。
- **P3-7** §2 “对树中出现的每个重要度”应明确只取已定位事件，与 `zoomPlan` 的 `maxImportance`（`worldline-layout.ts:2099`）口径一致；待定位事件不参加隐藏 / 时间点（`zoomPlan` 只遍历 `tree.roots`，`:2150`）。
- **P3-8** 展开卡固定 1.0×，复位处收起卡是 1.1×（标题 14.3px），收起卡的标题会比展开卡的标题大。设计稿已通过，真实目标截图应包含手动展开一张卡的复位视图，供用户确认。

## AGENTS 约束

- 未见违反：真实目标用隔离根、无模型；台账列入 WL-602；用例按顺序在方案审核后补写。
- 注意 P2-7 最后一行：被取代的 WL-600 / WL-601 结论要在台账里追加说明，不能把已执行的证据改成未执行，也不能删掉。

修改后通过
