# 602 · 世界线事件表：缩放档位（卡片尺寸、两端停止、自动全部展开）技术方案

来源：用户 2026-11-24 修改要求与设计稿审核（`docs/602-worldline-table-card-scale-research.md` §1–§6；设计稿 `design/worldline-table-card-scale/index.html`，用户 2026-11-24 “UI 审核通过”）。基于 docs/601 工作区（`052627a` 之上未提交的 601 改动）。

## 1 需求

| # | 内容 |
|---|---|
| S1 | 事件表收起卡（普通卡、父事件头、层叠卡）随缩放缩放：s(e) = clamp(1.1 + 0.1·e/E, 1, 1.2)，E = 6·ln 1.15，保留 3 位小数；复位 e = 0 为 1.1 |
| S2 | 展开卡、编辑中的卡、时间点、卡片间距、时间轴列不缩放；时间线视图不变 |
| S3 | 每个缩放步（Ctrl + 滚轮 ±ln 1.15、工具栏 − / + ±ln 1.25）都有可见变化：若下一步外观不变，沿同方向继续，直到外观变化；到缩放边界仍无变化则 e 不动 |
| S4 | 两端：到头后继续滚轮不累计；反方向第一步立即有变化；该方向无变化可走时 − / + 置灰，滚轮被忽略 |
| S5 | 全部展开：e ≥ eOpen = max(E, eL1) + ln 1.15（eL1 为级别降到 ≤ 1 的位置）时，所有已定位事件（含父事件头、层叠卡）展开；待定位块不展开；离开即收起 |
| S6 | 全部展开中单击某卡：260 ms 后本地收起（docs/600 §8.1 行为），双击编辑；`openCards` 不变；离开全部展开后清空本地收起 |
| S7 | 两种模式都全部展开。对齐模式 eOpen 后外观不再变化，即放大上限；等距模式展开后继续放大仍拉开间距，直到拉伸量不再变化 |
| S8 | 跨尺寸或展开切换的缩放步（滚轮、工具栏、复位）保持视图：滚轮按指针锚点（docs/600 §9.5），工具栏 / 复位按视图内第一张卡片 |
| C1 | 分级关（`TimelineZoomLevelsContext` false，测试夹具默认）：行为与 docs/601 完全相同（s = 1、不展开、步进为原来的 e + step 夹取）；TZ-02 快照不变 |
| C2 | docs/600 §9–§12 的“放得下才展开”判定、退出锁存、空闲判定在事件表中取消（S5 替代）；时间线视图的自动展开（docs/597）不变 |

## 2 纯函数（`worldline-layout.ts`，新段 `docs/602`）

```ts
export const TABLE_WHEEL_STEP = Math.log(1.15);
export const TABLE_BUTTON_STEP = Math.log(1.25);
export const TABLE_CARD_SCALE_MAX = 1.2, TABLE_CARD_SCALE_RESET = 1.1;
export const TABLE_CARD_SCALE_SPAN = 6 * TABLE_WHEEL_STEP;          // E
export function tableCardScale(e: number): number;                  // S1
export interface TableZoomModel { fit; lo; hi; gap: number | null; levels: boolean; eOpen: number;
  importances: readonly number[]; hasParents: boolean; pairs: Float64Array; adapter: CalendarAdapter }
export function tableZoomModel(tree, adapter, bounds: TableZoomBounds, levels: boolean): TableZoomModel;
export interface TableZoomAt { e: number; level: ZoomLevel }
export interface TableZoomView { level: ZoomLevel; scale: number; open: boolean }
export function tableZoomView(m, at: TableZoomAt): TableZoomView;
export function tableZoomStep(m, mode: RailMode, at: TableZoomAt, dir: 1 | -1, size: number): TableZoomAt | null;
```

- `lo` / `hi`：现有 `tableZoomBounds` 的 ln(min/fit)、ln(max/fit)（fit ≤ 0 时 0 / 0）。
- `eL1 = gap ? ln(ZOOM_POINTS × ZOOM_HYSTERESIS / (gap × fit)) : −∞`；`eOpen = max(E, eL1) + TABLE_WHEEL_STEP`。
- 级别：`level = levels ? zoomLevel(gap·fit·e^e, at.level) : 0`（`tableZoomStep` 对每个候选 e 用起点的 `at.level` 计算，与渲染时 `zoomLevel(d, prev)` 一次求值相同）。`zoomLevel` 幂等（`zoomLevel(d, zoomLevel(d, p)) = zoomLevel(d, p)`，§9 单元用例证明），所以保存步进得到的级别、渲染时再算一遍结果不变。
- `open = levels && e ≥ eOpen − 1e-9`；`scale = levels ? tableCardScale(e) : 1`。
- **外观签名**（判断“一步有无可见变化”），两个位置相同当且仅当以下全部相同：
  1. `scale`（差 < 1e-6）；`open`。
  2. 分级类别：对树中出现的每个重要度 i，`i < hide ? 隐藏 : i < bar ? 时间点 : 卡片`（`zoomBars(level, maxImportance)`），再加 `hasParents && level ≥ 3`（自动折叠）。所以级别 0 与 1 相同，没有父事件时 2 与 3 相同，没有某重要度时对应级别相同。
  3. 仅等距模式：`railLevel(k)`；每个拉伸对的有效拉伸 `eff(min(tableGapFor(d), Δt·k))` 差 ≤ 0.5px，`eff(v) = v ≤ POINT_HEIGHT + CARD_GAP ? 0 : v`（拉伸不超过最小块高 + 间距时对布局无影响，`tableLayout` 的 `atLeast > y` 不成立）。
- 拉伸对 `pairs`（Δt > 0 的列表）：每个 `railSegments(tree.roots)` 段内相邻根（布局按段内顺序拉伸）；每个父事件内相邻已定位子事件（`stretchChildren`）。不考虑隐藏（偏保守：可能把隐藏事件的变化也算作变化，只会少跳，不会把有变化的步跳过）。
- `tableZoomStep`：`levels` 为假时返回 `{ e: clamp(at.e + dir·size), level: 0 }`（与现在相同；不变时 null）。否则从 `at.e` 按 `dir·size` 逐步试探，夹在 [lo, hi]，第一处签名与起点不同即返回 `{ e, level }`；走到边界仍相同返回 null。试探次数 ≤ (hi − lo)/size + 1（真实数据约 100），每次 O(pairs)。
- `tableAutoOpenFits`、`decideAutoOpen` 删除（只有事件表用；时间线用的是 `autoOpenFits`）；`isProgrammaticScroll` 保留（滚动锚点清理仍要区分程序滚动）。

## 3 PlanningWorkspace

- `tableZoom` 状态由 `number` 改为 `TableZoomAt`（初值 `{ e: 0, level: 0 }`；首次渲染级别按 `zoomLevel(d, 0)` 求得，与原来 EventTable 新挂载时 `prevLevel = 0` 相同）。
- `wTableModel = useMemo(() => tableZoomModel(wViewTree, wAdapter, wZoom, zoomLevelsOn), …)`。
- `tableView`：`e = clamp(tableZoom.e)`，`k = fit·e^e`，`level = zoomLevel(d, tableZoom.level)`（levels 关为 0），`scale`、`open` 由 `tableZoomView`；`canIn = tableZoomStep(m, tableRail, {e, level}, 1, WHEEL) !== null`，`canOut` 同理；读数照旧。
- 滚轮 `onZoom(stepLog)`：`setTableZoom(z => tableZoomStep(m, mode, cur(z), sign, |stepLog|) ?? z)`；工具栏 − / + 同理用 `TABLE_BUTTON_STEP`；复位 `{ e: 0, level: zoomLevel(d0, 当前 level) }`（TZB-18 “从上方复位为级别 1、从下方为 2”不变）。
- 级别从此由 PlanningWorkspace 求出并传给 EventTable（`zoomLevel` 新 prop）；EventTable 删除自己的 `prevLevel`。
- 新 props：`zoomLevel`、`cardScale`、`allOpen`（`tableView.open`）。

## 4 EventTable

- `zLevel = zoomOn ? props.zoomLevel : 0`；`zScale = zoomOn ? props.cardScale : 1`（docs/601 Q1 的 `zScale = 1` 取消）；`zoomPlan(..., zScale, ...)`，`layoutPlan.scale` 带入 `tableLayout`（z > 1 时宽度 `slot/z`、高度与卡头 ×z，现有代码已按任意 z 计算，§9 用例覆盖 z > 1）。
- 包层：`z !== 1` 时 `<div data-card-zoom={z} className={s.tableZoom} style={{ zoom: z, width: c.width }}>`；CSS 不改（`.tableZoom` 规则已覆盖普通卡、父事件头、层叠卡）。
- 全部展开：`on = zoomOn && props.allOpen`；`openAll = 所有 start !== null 的事件 − autoClosed`，并上 `open`；`layout = tableLayout(tree, heights, layoutK, adapter, { expanded: on ? openAll : open, …与收起布局相同的选项（equalGaps、stretchChildren、gapMax）})`——只保留一个布局（原 `closedLayout` / `openLayout` 合并）。
- 删除：`decide`、`scheduleDecide`、`auto.latched / input / timer / flipAnchor`、`lastScale` effect、`autoLevel`、`tableAutoOpenFits` 调用、`DECIDE_IDLE_MS`。`autoClosed` 在 `on` 变为假时清空（原 §11.1 effect 改用 `on`）。`onAutoToggle`（单击本地收起、双击编辑）保留，条件 `o.on && o.shownOpen.has(id) && !o.expanded.has(id)`。
- 视图保持（S8）：恢复 effect 记录上次的 `zoomKey = scale|cardScale|on`；变化且没有滚轮锚点（`anchor.current`）时，用 `modeAnchor`（docs/601 §8.4，每次滚动与每次提交后记录的第一张可见卡片与屏幕偏移）恢复。改名 `viewAnchor`，模式切换照旧用它。滚轮步仍用指针锚点，展开后卡片实测高度变化时沿用现有 `zoomAnchor`（400 ms 内）/ 第一张可见卡片的高度修正。
- `[data-event-table]` 增 `data-card-scale={zScale}`；`data-auto-open` 在 `on` 时出现（语义改为“全部展开”）。

## 5 已知限制

- 跳过的位置不能停留；读数在跳步时一次变化很多（研究 §6.3）。
- “显示为卡片”（`showAll`）打开时，时间点与卡片的区分消失，签名仍按分级计算，可能有一步只改变读数（罕见，状态行按钮本身就是例外操作）。
- 等距模式的拉伸签名不考虑隐藏事件，个别步可能只改变被隐藏事件之间的间距（看不出变化）；不会漏掉真实变化。
- 从等距（放大到 > eOpen）切回对齐：读数保留等距的值，对齐下 + 置灰，− 第一步立即收起并回到 1.2×。

## 6 风险

- 全部展开时 1061 张卡全展开：布局对展开卡用估计高度，窗口内渲染后实测修正（docs/580 §5.1 虚拟化），与 docs/600 等距自动展开同路径；TZB-19（每步 < 100 ms p95）在构建版复测，含展开那一步。
- 级别移到 PlanningWorkspace：EventTimeline 不受影响（自有级别）；EventTable 不再在挂载时重置回差，切换视图后保留回差（行为更稳定）。

## 7 文件范围

`src/lib/planning/worldline-layout.ts`、`src/components/content/planning/PlanningWorkspace.tsx`、`src/components/content/planning/worldline/EventTable.tsx`、测试（§9）、`docs/requirements-traceability.json`（WL-602）。CSS 预计不改。

## 8 真实目标

构建版、隔离根 `worldline-ui-599`（LOTM-587-wg-r1，无模型），驱动 `card-scale-602.mjs`：对齐 / 等距各走全程（复位 → 放大到上限 → 缩小到下限 → 放大回复位），逐步记录 `data-card-scale`、`data-zoom-level`、`data-auto-open`、读数、视图内卡片 / 时间点数、标题字号；断言每步至少一项变化、两端多滚 10 步不变、反向第一步变化；截图复位、1.2×、全部展开、下限；全部展开那一步的提交耗时。证据 `~/shakeink-test-roots/worldline-ui-583-evidence/602/`。

## 9 修订 1（按 `docs/602-worldline-table-card-scale-plan-review.md`）

以下规则替换前文对应内容，冲突处以本节为准。

### 9.1 P1-1 拉伸对按可见事件计算

- `tableZoomModel` 对 `hide` 的每个可能取值（`zoomBars` 的 hide ∈ {0, 2, 3}，再取 `min(·, maxImportance)`）各预算一份拉伸对：根按 `zoomPlan` 的 `isShown` 规则过滤（重要度 ≥ hide，或有满足条件的后代），过滤后重新 `railSegments` 并取段内相邻根；子事件按同样规则过滤后取相邻已定位子事件。
- 候选位置的签名用其分级类别的 hide 对应的那份对，与未过滤的那份取并集。分级类别不同时签名已不同，所以只在同类别内比较同一份对，单调性不变。
- 单元用例 TS-05 / TS-06 覆盖：级别 4 下“未过滤相邻对 eff 都为 0、跨隐藏事件的对仍在变”的步不跳过；隐藏后两段合并的情况。

### 9.2 P2-1 级别回差以“上次画出的级别”为准

- PlanningWorkspace 增 `drawnLevel` ref：`tableView.level = zoomLevel(d, drawnLevel.current)`，layout effect 中回写 `drawnLevel.current = tableView.level`（与原 EventTable `prevLevel` 语义相同，树变化也保持回差）。`tableZoom` 状态只存 `e`（number），不存级别。
- 步进起点 `cur = { e: clamp(tableZoom), level: tableView.level }`（即画面上的级别）；`tableZoomStep` 返回新 `e`。复位：e = 0，级别由回差在渲染时求得（TZB-18 语义不变）。

### 9.3 P2-2 全部展开位置与边界

- `eOpen = hi > 1e-9 ? min(max(E, eL1) + TABLE_WHEEL_STEP, hi) : +∞`。密集作品（eL1 + 一步 > hi）在放大上限处全部展开；`hi ≤ 0`（复位已是上限或 `fit = 0`）时不会全部展开，写入 §5。
- 全部展开时 `keepCards` 并入 `openAll`，所以即使上限处仍是级别 2 以上，时间点与隐藏事件也作为展开卡画出（`zoomPlan` 的 `keep.cards`）。
- `fit = 0`（无主段且历法无月）时 lo = hi = 0：卡片固定 1.1×，两个按钮均置灰（§5）。
- 下限不再要求落在网格上：缩小停在第一个进入最终外观的位置，放大第一步由跳步求得（审核结论）。

### 9.4 P2-3 视图恢复键每次提交都更新

- 恢复 effect（依赖 `[layout]`）比较 `zoomKey` 与 `lastZoomKey` ref；另设无依赖的 `useLayoutEffect`，在它之后声明，每次提交都写 `lastZoomKey.current = zoomKey`。所以布局未变的有效步不会把旧键留给之后不相关的提交。

### 9.5 P2-4 保留锚点清理

- `worldline-locate` 监听保留（清 `zoomAnchor`、`written`），只去掉 `scheduleDecide`；`onScroll` 的 `isProgrammaticScroll` / 清 `zoomAnchor` / 清 `anchor.current` 保留。`auto` ref 只剩 `written`、`prevOn`。

### 9.6 P2-5 全部展开的集合与折叠父事件

- `openAll = 所有已定位事件 − autoClosed`，并上 `open`，包括分组头。用户折叠的父事件也展开它自己，外观沿用“手动展开一个折叠父事件”的现有外观（展开的组头，子事件不出现）；research §6.2 的“层叠卡”措辞以此为准，真实目标截图供用户确认。
- 浏览器用例 TSB-07 覆盖。

### 9.7 P2-6 / P3-2 包层与宽度

- 分级开时收起卡始终有包层（含 s = 1，`zoom: 1`），跨过 s = 1 时 EventCard 不卸载；分级关时无包层（C1）。
- `tableLayout` 在给了 `plan` 时，收起普通卡宽度的估宽余量加 2px（`TITLE_SLACK + 2`），抵消 14.3 / 15.6px 字形取整误差；不给 `plan` 时不变（TZ-02 快照）。
- 用例 TSB-05（夹具）与真实目标：s = 1.1、1.2 下全部单行标题 `scrollWidth ≤ clientWidth`（除布局判定需截断的）。

### 9.8 P3

- P3-1：`tableView` 的 `canIn` / `canOut` 放进 `useMemo`（依赖 model、tableRail、tableZoom、drawnLevel 的当前值），只在事件表视图计算。
- P3-3：触控板捏合连发 wheel 事件会连续跳步，符合批准规则；真实目标记录 10 个连续快速 wheel 事件的结果。
- P3-4：RM-B8 在 s = 1.2 复测（菜单在模式切换钮之上）。
- P3-5：工具栏“全部展开 / 全部收起”仍按 `openCards` 判断，全部展开时不随画面变化，写入 §5。
- P3-6：真实目标加全部展开下连续滚动 20 屏：每屏帧耗时与第一张可见卡片位置跳动。
- P3-7：重要度集合只取已定位事件（与 `zoomPlan` 的 `maxImportance` 一致）。
- P3-8：真实目标截图含复位视图中手动展开一张卡（收起卡标题 14.3px、展开卡标题 14px）。

### 9.9 §5 已知限制补充

- 复位已是放大上限（hi ≤ 0）或 `fit = 0` 的世界线不会全部展开。
- 全部展开时工具栏“全部展开”按钮不反映画面状态。

## 10 测试用例

### 10.1 单元（`tests/unit/worldline-table-card-scale.test.ts`，新文件）

| ID | 内容 |
|---|---|
| TS-01 | `tableCardScale`：e = −∞/−E/−E/2/0/E/2/E/+∞ → 1、1、1.05、1.1、1.15、1.2、1.2；三位小数 |
| TS-02 | `tableZoomModel`：zoomView(24) 的 lo/hi 与 `tableZoomBounds({levels:true})` 一致；eOpen = max(E, eL1) + 一步；hi ≤ 0 的树 eOpen = ∞；密集树 eOpen = hi |
| TS-03 | `tableZoomView`：levels 关 → scale 1、level 0、open 假；levels 开 e = eOpen → open；e = eOpen − 0.01 → 不 open |
| TS-04 | `tableZoomStep` 对齐：从复位放大逐步到 null，每步 `tableZoomView` 或分级类别变化；最后一步 open；在上限再放大返回 null；从上限缩小一步立即不 open。缩小到 null：每步签名变化，下限后 null，反向第一步非 null |
| TS-05 | P1-1：构造“级别 4 下相邻可见根跨过隐藏的一般事件、Δt·k 在 (24, cap) 内变化，未过滤相邻对 eff 都为 0”的树，等距模式该步不跳过（返回的 e 与一步相同） |
| TS-06 | P1-1：隐藏后 `railSegments` 合并两段，跨原断档的对随 k 变化，等距步不跳过 |
| TS-07 | 等距：从复位放大到 null，每步至少一项变化（scale、open、分级、railLevel、某可见对的 eff 拉伸），全部展开后仍有步（间距在变），最后 null |
| TS-08 | 工具栏步长 ln 1.25 与滚轮步长判断同一方向“有无有效步”结果相同（复位、上限、下限、中间 10 个位置） |
| TS-09 | levels 关：`tableZoomStep` = clamp(e + step)，在边界返回 null（与 docs/601 相同） |
| TS-10 | 无父事件的树：级别 2 → 3 不算变化（跳过）；没有重要度 1 的树：级别 3 → 4 不算变化 |
| TS-11 | `zoomLevel` 幂等：7 个起点级别 × 网格 d（0.05 – 500，对数等距 400 点）`zoomLevel(d, zoomLevel(d, p)) === zoomLevel(d, p)` |
| TS-12 | `tableLayout` z = 1.2：收起卡高 34×1.2、两行 52×1.2、组头 36×1.2、层叠 48×1.2、卡头偏移 ×1.2；展开卡与时间点不乘；`width` 为缩放坐标宽（slot/1.2 封顶）；给 `plan` 时估宽余量 +2；不给 `plan` 时 TZ-02 快照不变 |
| TS-13 | 真实数据规模 f885：`tableZoomStep` 单次 < 5 ms（取 50 次中位数），上限处两个方向 < 10 ms |

### 10.2 浏览器（`tests/browser/planning-worldline-table-card-scale.test.ts`，新文件，夹具 `zoomLevels: true`）

| ID | 内容 |
|---|---|
| TSB-01 | 复位：`data-card-scale` = 1.1，收起卡包层 `zoom` 1.1，单行卡屏幕高 37.4 ± 1，标题计算字号 13px（zoom 不改 computed font-size），卡片屏幕宽 = 布局宽 × 1.1 ± 1 |
| TSB-02 | 对齐：从复位逐步滚轮放大直到 + 置灰，每步记录（`data-card-scale`、`data-zoom-level`、`data-auto-open`、读数、卡片 / 时间点数），相邻两步至少一项外观值不同（读数不算）；最后一步出现 `data-auto-open`；再滚 10 步所有值不变；反向一步 `data-auto-open` 消失 |
| TSB-03 | 对齐：从复位逐步缩小直到 − 置灰，每步外观值变化；`data-card-scale` 到 1 后每步 `data-zoom-level` 都变；到底再滚 10 步不变；反向第一步外观变化 |
| TSB-04 | 等距：放大到 + 置灰；全部展开后仍至少一步只改变卡片间距（相邻根屏幕距离变化 > 0.5px）；到顶再滚不变 |
| TSB-05 | s = 1.1 与 1.2：全部单行收起卡标题 `scrollWidth ≤ clientWidth`（`data-fade` 的除外）；组头宽 = 组框宽；层叠卡与框同宽；收起卡屏幕高 = 布局高 ±1 |
| TSB-06 | 对齐圆点与卡头中线 ±0.5px：s = 1.0、1.1、1.2 与全部展开 |
| TSB-07 | 全部展开：所有已定位卡片 `aria-expanded=true`（含组头），待定位卡片收起；用户折叠的父事件展开但子事件不出现；`openCards` 不变（切到时间线无展开卡）；`posts` 0 |
| TSB-08 | 全部展开中单击一张：150 ms 仍展开，之后收起，主选中；双击另一张进入编辑，取消后仍展开；缩小一步全部收起，再放大回来，之前单击收起的那张重新展开 |
| TSB-09 | 视图保持：滚轮在某卡上放大跨尺寸、跨全部展开，指针下卡片屏幕位置变化 ≤ 2px（展开测高之后）；工具栏 + 跨全部展开，视图内第一张卡片 ≤ 2px |
| TSB-10 | 跳过的步：zoomView(24) 级别 3 之后再缩小一步，`data-zoom-level` 直接变为 4（中间无停留），读数一次变化多步 |
| TSB-11 | P2-3：全部展开前一步（布局变、键变）后不操作，展开一张卡：scrollTop 不变 |
| TSB-12 | 分级关（夹具默认）：无 `data-card-scale`/包层、无 `data-auto-open`，放大到上限与 docs/601 相同步数 |
| TSB-13 | P2-1：图例筛选改变 d 后取消筛选，`data-zoom-level` 按回差保持（与原 EventTable 行为一致） |
| TSB-14 | 切换对齐 → 等距 → 对齐（e 在等距 > eOpen）：对齐下 + 置灰、读数保留、− 第一步收起；视图内第一张卡片不动（RM-B3 规则） |
| TSB-15 | 性能（F885，构建版）：普通步与全部展开那一步提交 p95 < 100 ms / 全部展开步 < 400 ms；`PlanningWorkspace` 每步渲染 ≤ 1 次（TZB-09 规则） |

### 10.3 既有用例处理（P2-7）

| 用例 | 处理 |
|---|---|
| TZ-07/10、TZ-14、EG-08 | 随 `tableAutoOpenFits` / `decideAutoOpen` 删除 |
| TZB-06、06b、06d、17b | 改写到全部展开（放大到 + 置灰）：单击本地收起、双击编辑、待定位不展开；06c（家族内子事件展开、组头不展开）改为组头也展开 |
| TZB-07、TZB-13、TZB-13e、TZB-06e | 删除（同时刻不展开、锁存、空闲判定不再存在） |
| TZB-12 | 改为在 eOpen 之前断言间距规则；之后断言 `data-auto-open` |
| TZB-01、TZB-11、EGB-02 | “无 `[data-card-zoom]`” 改为包层 zoom = `data-card-scale`；卡高 34 × s、组头 36 × s |
| TZB-02 | 回差逐级断言保留；删去被跳步越过的 `[40, 46)` 空分支，改为断言放大方向在 d ∈ [40, 46) 不停留时级别仍为 2 |
| TZB-08、EGB-07 | 保留，增加 s = 1.2 |
| EGB-04 | 改为：对齐与等距都在 + 置灰前一步出现 `data-auto-open` |
| EGB-08 | “放大到最细”改为放大到全部展开前一步 |
| ZB-37/38（事件表部分） | 改为断言事件表复位不展开（时间线部分不变） |
| RM-B8 | 增加 s = 1.2 |
| 其余 | 不改；全量回归按用例名与 601 工作区基线的失败集合对比 |

### 10.4 台账

新增 WL-602；在 WL-600（T6 自动展开）、WL-601（Q1 原尺寸、Q6 对齐不自动展开）条目追加“被 WL-602 取代”的说明，不改原证据。

## 11 修订 2（按 `docs/602-worldline-table-card-scale-test-review.md` 与真实目标 602-r1…r10）

以下替换前文对应内容，冲突处以本节为准。

### 11.1 等距签名的拉伸对（真实目标 r4、测试审核 P1-1）

- 每个 hide 取值只用**画出的事件之间**的相邻对（§9.1 的“与未过滤对取并集”取消）：r4 中级别 5–6 的被隐藏事件之间的拉伸变化看不见，却让签名变化，留下 4 个无变化步。
- 每对带上方块的信息（自身重要度、子树最高重要度、是否父事件、估计展开高度），`minBlock` 给出该视图下上方块的最小高度（时间点 18；收起卡 34×s；组头 36×s + 10；级别 ≥ 3 的父事件层叠 48×s；全部展开时 max(34, 估计展开高度 × 0.75)）。拉伸不超过最小高度 + 6 时不改变布局，签名记 0。
- 估计高度取 3/4：实测高度可能小于估计，留余量保证不把真实变化当作无变化（误判方向只会多停一步）。
- 用例 TSB-04b（每个根 300 字事实，展开卡高于拉伸），去掉展开高度判断时失败。

### 11.2 估宽余量（真实目标 r8）

- 有 zoom plan 时余量 +3（§9.7 的 +2 在 1.2× 下仍有 1px 溢出）。2600px 宽窗口（卡片列 559px）全表扫描：1.0 / 1.1 / 1.2 均 0 张单行标题被截。1860px 窗口卡片列 249px，所有卡片都在槽宽封顶（两行），按设计渐隐，不计入。

### 11.3 首行上报（TSB-15b）

- `onScrollTop` 只在视图第一行变化时调用：尺寸步的锚点恢复会触发一次同一首行的滚动事件，原先让 PlanningWorkspace 每步多渲染一次（TZB-09 规则）。

### 11.4 测试审核处理

| 项 | 处理 |
|---|---|
| P1-1 | 见 11.1；TSB-04b；真实目标等距每步记录表高与视图内卡片 top |
| P1-2 | TSB-13 改为复位隐藏重要度 2：筛选中级别 2，取消后仍 2（按上次画出的级别）；去掉回写时失败 |
| P1-3 | TSB-05 改为：s = 1 时未截断的单行标题在 1.1 / 1.2 仍未截断，夹具标题 12–20 个汉字（宽于 220、窄于槽） |
| P2-1 | 当前实现中 `zoomKey` 只含布局输入，键变布局必变；§9.4 的回写改为代码审核项，TSB-11 记为“布局变的步之后不误恢复”的回归保护 |
| P2-2 | TSB-03 断言 s = 1 后级别依次 2 → 3 → 4 → 5 → 6 |
| P2-3 | TZB-02 空分支改为有断言；TZB-08 / EGB-07 的 s = 1.2 由 TSB-06（1.0 / 1.1 / 1.2 / 全部展开）覆盖；RM-B8 为分级关（夹具默认），s = 1.2 下菜单位置由真实目标截图覆盖 |
| P2-4 | TSB-12 断言步数 = ceil(ln(max/fit) / ln 1.15) |
| P2-5 | TSB-16：上限处仍为级别 2 的密集夹具，全部展开、无时间点；去掉 keepCards 并入时失败 |
| P2-6 | TSB-09 增加工具栏 −、复位跨尺寸的视图保持 |
| G4 / G5 | TSB-18（滚轮后定位）、TSB-17（越过 s = 1 不重挂） |
| 既有 | TZB-06/06b/06d/17b 改为走到全部展开；TZB-06d 对齐、等距各跑一次；`settle` 注释更新 |

### 11.5 已知问题（不在本次范围，待用户决定）

- 窄面板中展开卡的长标题换行后高出 42px 的卡头，压在类型标签与时间行上（`worldline.module.css` `.open .head { height: 42px }`，本次未改）。全部展开让它在窄面板中大量出现。截图 `602/r10/all-open.png`、`all-open-folded.png`。

## 12 修订 3（按 `docs/602-worldline-table-card-scale-code-review.md`）

### 12.1 模型按真实的 zoomPlan 求外观（P1-1、P2-1、P2-2）

- `tableZoomModel(tree, adapter, bounds, levels, keep, { linear, labelClass })`：`keep` = 用户折叠（`foldedEvents`）与保留卡（`openCards`、选中、搜索命中、编辑中）。对 0–6 每个级别用与 EventTable 相同输入的 `zoomPlan`（不含 `unfolded`：用户临时展开只会让模型多停一步）求 `hidden` / `points` / `autoFolded`（去掉用户已折叠的父事件），相同即同一“级别类别”；签名用类别号代替原来的重要度串和 `hasParents`。
- 拉伸对按每个类别的 plan 计算：画出的根（含保留卡）重新分段取相邻对；只取画出的家族（不在时间点、自动折叠、用户折叠中）的相邻已定位子事件；上方块的类型（时间点 / 层叠 / 组头 / 卡片）也取自 plan。
- PlanningWorkspace：`tableKeep` 随选中、搜索命中、编辑、展开、折叠变化重算模型；只在事件表视图开分级（时间线视图不算，P3-2）；`tableLabelClasses` 只在等距模式算一次（依赖树）。
- 用例 TS-14（P2-3）：zoomView、F885 与审核的三种形状（宽间距家族及其用户折叠、一般事件只在子事件中、选中的被隐藏事件），两种模式双向全程，用 `zoomPlan` + `tableLayout` 的真实卡片 top / 高 / 时间点 / 层叠 / 展开与时间轴实际文字比较：停点之间必不同、被跳过的位置与起点相同。去掉折叠与保留卡输入时失败（fold2 5 个死步、用户折叠 1 个）。
- 单元 TS-04 改用同一真实布局判定（原 `look` 是签名的复写）。

### 12.2 其他

- P3-4：注释更新。
- P3-5：曾在恢复 effect 末尾上报首行，后移除（见 12.3），保持 601 之前的行为。
- P3-1（全部展开后等距可能多停一步，展开卡实测高于估计时）：保留为已知限制，方向为“多停”不“漏变”；TS-14 允许等距放大方向 ≤ 3 个。
- P3-3：收起卡的 ⋯ 菜单在包层内随卡放大（最大 1.2×），展开卡上为原尺寸；真实目标截图 `602/r11` 供用户确认。
- P3-6：TS-13 保留；审核实测最坏 0.7 ms。

### 12.3 回归修正（CE-29）

- 全量浏览器回归中 CE-29 / CE-62（两个面板，B 中按 Esc 不应取消 A 的编辑）在当前工作区整文件运行时 6 次中约 2 次失败，干净 HEAD 0/4。失败时焦点在 Esc 前 1 ms 内被移回 A 的编辑卡（`PlanningWorkspace.tsx` §13.1 进入编辑的聚焦 rAF）。原因是 12.1 让模型随编辑 / 选中 / 折叠在时间线视图与分级关时也重算，进入编辑后的提交变长，rAF 落在 B 获得焦点之后。
- 修正：只在事件表视图且分级开时计算模型（`tableModelOn`）；分级关时 `tableZoomModel` 不求每级 plan。修正后整文件 6/6 通过。
- 12.2 的“恢复 effect 末尾上报首行”（P3-5）在排查中移除：它不是 CE-29 的原因，但会让每次布局提交多调用一次父组件 setState；该问题在 601 之前就存在，留作已知问题。
- 真实目标 602-r12（最终代码）通过。

### 12.4 步进比较改为数值（TSB-15）

- 全量回归中 TSB-15（F885 每步提交 p95 < 100 ms）在整套运行时为 102 / 108 ms，单独运行通过。`tableZoomStep` 改为数值比较并在首个不同处返回（不再拼接签名串）：F885 每次 `canIn + canOut` 最坏 0.17 ms（对齐）/ 0.37 ms（等距）。单独运行 TSB-15 p95 74–93 ms，TZB-19 跨级别 p95 54–57 ms（干净 HEAD 为 72–112 ms）。
- 真实目标 602-r13（最终代码）通过。
