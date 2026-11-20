# 597 · 世界线时间线放大后自动展开事件卡片 技术方案与测试用例

来源：用户 2026-11-21 修改要求（截图：放大到卡片之间已有很大空白时卡片仍是收起的）。基于 `13f41a3`（docs/593–596）。

## 需求

| # | 内容 |
|---|---|
| A1 | 时间线放大到一定程度、卡片之间有足够间隔时，自动展开事件卡片 |
| A2 | 自动展开后所有卡片之间仍有安全间隔（不碰到、不重叠）；做不到就不展开 |
| A3 | 判断范围：视图内（lane 可见范围）全部卡片展开后都满足 A2 才展开，有一处挤就都不展开（用户选择“视图内全部满足才展开”）。平移到拥挤处自动收起 |
| A4 | 自动展开后用户点某张卡片的“收起”，它保持收起，直到退出自动展开（缩小或平移到拥挤处）；再次进入时恢复自动展开（用户选择“保持收起直到缩小”） |
| C1 | 只作用于时间线画布：事件表、事件目录、“全部展开/收起”按钮、工作区的展开状态（`openCards`）不变；界面状态不写入作品；平移、缩放帧不渲染 PlanningWorkspace |
| C2 | docs/592–596 已通过的功能不变；只在缩放级别 0（d ≥ 160，`TimelineZoomLevelsContext` 为真）时生效 |

## 1 判定（纯函数，`src/lib/planning/worldline-layout.ts`）

```ts
export const AUTO_OPEN_GAP = 24;   // 进入：展开后卡片之间的最小水平间隔（px）
export const AUTO_OPEN_KEEP = 12;  // 保持：已自动展开时的最小间隔（回差，避免在边界上反复开合）
export interface AutoOpenInput {
  tree: EventTree;
  /** 当前打包结果（state.packed）：家族 y 与 box 用于选出视图内的家族。 */
  packed: PackedLayout;
  /** 视图，世界 px：x 为 [view.start·scale − PAD, view.start·scale + width + PAD]，y 为 plane 坐标 [−view.y, −view.y + laneH]。 */
  view: { left: number; right: number; top: number; bottom: number };
  /** 当前画成卡片的事件 id（step.elements 中 kind = card；时间点、隐藏、折叠内的不在其中）。 */
  cards: ReadonlySet<string>;
  /** 已展开的（工作区 openCards ∪ 编辑中）。 */
  open: ReadonlySet<string>;
  family: Omit<FamilyOptions, "expanded">;   // 与 timelineStep 相同的 buildFamilies 选项
  gap: number;                               // AUTO_OPEN_GAP 或 AUTO_OPEN_KEEP
}
/** 视图内全部卡片展开后两两水平不相交（含 gap）时返回要自动展开的 id（不含已展开的），否则 null。 */
export function autoOpenCards(input: AutoOpenInput): string[] | null
```

步骤：

1. 候选家族：`packed.families` 中 `built` 的家族，`box.left < view.right` 且 `box.right + OPEN_CARD_WIDTH > view.left`（收起时在视图左侧、展开后会伸进视图的也算），且 `[y, y + box.h]` 与 `[view.top, view.bottom]` 相交。没有候选返回 null。
2. 试排：对候选家族的根调用 `buildFamilies(roots, { ...family, expanded: open ∪ cards })`（只取候选家族内的卡片），得到展开后的卡片宽度（叶子 420，家族头为家族宽度）。卡片纵向位置取 `family.y + piece.top`（沿用当前打包 y，只用于判断是否在视图内）。
3. 视图内卡片 V：试排中 kind = card 的块，x 区间 `[wx, wx + width]` 与视图 x 相交、y 区间与视图 y 相交。V 为空返回 null。
4. 判定：V 中任意两张卡片 a、b，若二者不是祖先/子孙关系，要求 `a.wx + a.width + gap ≤ b.wx` 或 `b.wx + b.width + gap ≤ a.wx`。有一对不满足返回 null（A3）。祖先与子孙不比较（家族头本来就横跨子事件，它们上下分行）。
5. 满足时返回 V 中尚未展开的 id。

说明：

- 只比较水平区间：通过判定的卡片在视图内各占一段时间，没有上下叠放的；展开只让它们向下变高，打包（增量，`home` 不变）不会让视图内的卡片互相移动。视图外与它们 x 相交的家族照常被增量打包推开，不重叠。
- 同一时刻（或间隔小于 420 + gap）的两个事件在任何缩放下都不满足，所在视图不自动展开。这是 A3 的直接结果。
- 只有一张卡片在视图内时，判定成立，它会展开。

## 2 `EventTimeline.tsx`

- 状态：`auto: ReadonlySet<string>`（自动展开的 id）、`autoClosed: ReadonlySet<string>`（自动展开期间用户收起的 id）。都是 EventTimeline 的本地 state，不进 PlanningWorkspace，不写作品。
- 计算时机：`useLayoutEffect`（每次提交后），用已提交的 `step`（`step.state.packed`、`step.elements`）调用 `autoOpenCards`；`gap = auto.size ? AUTO_OPEN_KEEP : AUTO_OPEN_GAP`。条件不满足（null）、`level ≠ 0`、`!zoomOn`、`width = 0` 或 `laneH = 0` 时结果为空集。结果与 `auto` 内容相同时不 setState（不触发额外渲染）。输入未变（scale、view、packed 对象、cards、open 均相同）时跳过计算。
- 回差：已自动展开时候选判断改用 `AUTO_OPEN_KEEP`；`auto` 包含仍在视图内、此前已展开的卡片，不在视图内的从 `auto` 移除（平移出视图后收起）。
- 退出：`auto` 变为空集时清空 `autoClosed`（A4：缩小或平移到拥挤处退出后，再进入时恢复自动展开）。
- 生效集合：`open = expanded ∪ editing ∪ (auto − autoClosed)`，作为 `timelineStep` 的 `expanded` 输入（重排）、`openKey`（ResizeObserver 测量展开高度）的来源。`keepCards` 只用 `expanded ∪ editing`（自动展开只在级别 0，不影响时间点计划）。EventCard 的 `expanded` 属性改为 `open.has(id)`（编辑中的卡片原来就按 `editing` 显示展开，不变）。
- 收起按钮：EventTimeline 用一个 memo 的 `WorldlineCardContext.Provider` 包住画布，值为 `{ ...ctx, onExpand }`（依赖只有 `ctx`，身份稳定）。`onExpand(id)`：若 `id ∈ auto` 且不在工作区 `expanded`，在 `autoClosed` 中切换它（第一次点收起，再点展开）；否则调用原 `ctx.onExpand(id)`。
- 平移、缩放：`auto` 只改 EventTimeline 本地 state；PlanningWorkspace 渲染 0 次（IC-21b、ZB-19 的约束）。`auto` 改变时 `open` 身份改变，触发一次增量重排（与手动展开相同的路径）。

## 3 已知限制

- 自动展开的高度在第一次渲染时用 `estimateCardHeight` 估算，测量后重排一次（与手动展开相同）。
- 自动展开期间双击卡片进入编辑：编辑结束后它按 `openCards`（双击会加入）保持展开，退出自动展开后也不收起。这是双击的原有行为。

## 4 测试用例

### 4.1 单元（`tests/unit/worldline-layout.test.ts`）

| ID | 内容 |
|---|---|
| AO-01 | 三个根相隔 500px（scale 换算）、视图覆盖三者：返回三个 id；gap 24 时相隔 443px（420 + 23）返回 null，444px 返回三个 |
| AO-02 | 视图外（x 在 view.right 之外、或 y 在 view.bottom 之下）有一个与视图内卡片 x 相交的家族：不影响，返回视图内的 id |
| AO-03 | 视图左侧收起时不在视图内、展开后伸进视图且与视图内卡片相交：返回 null |
| AO-04 | 同一时刻两个根（上下叠放，都在视图内）：返回 null |
| AO-05 | 父事件家族（父 + 两个相距 500px 的子事件），视图内只有它：父与子不比较，返回父与两个子；两个子相距 300px：返回 null |
| AO-06 | `open` 中已展开的卡片参与判定但不在返回值中；`cards` 之外的（时间点）不参与 |
| AO-07 | gap 12（保持）：相隔 433px 返回 id，432px 返回 null |

### 4.2 浏览器（`tests/browser/planning-worldline-card-zoom.test.ts`，夹具 zoomView，`zoomLevels: true`，内存 API）

zoomView 根间隔 720 h。d ≥ 444 时相邻根起点相距 ≥ 444px。

| ID | 内容 |
|---|---|
| ZB-37 | 从打开时的视窗逐步放大：d < 400 时画布没有 `aria-expanded=true` 的卡片；放大到视图内卡片都满足间隔（d ≥ 900，视图内只有叶子根）后，视图内所有卡片 `aria-expanded=true`、宽 420；两两水平间隔 ≥ 24px（读 `getBoundingClientRect`），没有任何两张卡片的矩形相交；事件表切过去没有展开的卡片；全程 `globalThis.posts` 为 0 |
| ZB-38 | 自动展开后缩小到 d < 400：全部收起；再放大回去：重新展开 |
| ZB-39 | 自动展开后平移（水平滚轮）到一个父事件家族（r2，子事件相距 48 h）进入视图：视图内全部收起；平移回叶子区域：重新展开 |
| ZB-40 | 自动展开后点 r6 的“收起”：r6 收起，其他仍展开；平移不使 r6 展开；缩小退出再放大回来：r6 重新自动展开；工作区 `openCards` 未改（事件表中 r6 未展开） |
| ZB-41 | 自动展开时平移 30 帧、缩放 10 步：PlanningWorkspace 渲染 0 次（profiling 构建，与 ZB-19 相同方式） |
| ZB-42 | `zoomLevels: false`（旧用例默认）放大到 d ≥ 900：不自动展开 |
| 回归 | ZB-01 … ZB-36、`tests/browser/planning-*.test.ts` 全量（基线失败 CM-02/03/06/10 逐条对比） |

### 4.3 真实应用

构建后在隔离根 `worldline-ui-583`、作品 `LOTM-587-wg-r1` 上写驱动 `drivers/auto-597.mjs`（只滚轮、截图、读 DOM，不点击）：从复位视窗放大，瞄准画出的事件，每步记录 d、视图内卡片数、展开数、视图内展开卡片两两最小水平间隔、任意两卡片矩形是否相交；要求：出现展开的步骤中视图内卡片全部展开、最小间隔 ≥ 24px（保持阶段 ≥ 12px）、无相交；缩小后展开数回到 0；作品 planning 版本号前后相同。截图存证 `~/shakeink-test-roots/worldline-ui-583-evidence/597/`。

## 5 验证与台账

- `npm run typecheck`、单元全量、`tests/browser/planning-*.test.ts` 全量。
- `docs/requirements-traceability.json` 追加 WL-597，分列夹具用例与真实应用证据；只追加，不 checkout。

## 6 修订 1（按 `docs/597-worldline-auto-open-plan-review.md`）

§1、§2 被本节替代；§4 的用例按 §6.5 修改。

### 6.1 两套排版，渲染中同步判定（P1-1、P2-4、P2-5）

- EventTimeline 维护两份 `TimelineState`：`state`（现有：工作区展开 ∪ 编辑中）与 `openState`（试排：画布上全部卡片展开）。两份各自有 `lastSizes`，各自在 layout effect 中提交。
- 只在 `zoomOn && level === 0` 时计算 `openStep = timelineStep(openState, { …同一输入, expanded: openAll })`，其中 `openAll = tree 全部事件 id − (autoClosed − open)`（`useMemo`，依赖 tree、autoClosed、open）。级别 0 没有时间点和隐藏事件（`zoomBars` level 0 → bar 0、hide 0），所以“全部卡片”就是全部事件；用户折叠的父事件展开时按 420 宽叶子排（`stackedOf` 排除 expanded）。
- 判定在同一次渲染中完成：`on = autoOpenFits(openStep.elements, …)`，画布、选择框、缩放锚点、小地图、空视图提示都使用 `shown = on ? openStep : step`。判定基于将要显示的排版本身，没有“展开前 y”；不调用 setState，所以不存在 layout effect 中的循环（P1-1）。缩放锚点 effect 在第一次提交就拿到最终排版（P2-4）。收起排版 `state` 独立打包，退出时直接显示它，没有展开时的稀疏行位（P2-5）。
- 代价：级别 0 的缩放帧多一次 `buildFamilies + packFamilies`（构建范围 7 个视窗宽，级别 0 时 d ≥ 160，事件数有限）；平移帧在构建范围内两份都不重排，只重新判定（O(n²)，n = 视图内卡片数）。

### 6.2 纯函数（`worldline-layout.ts`）

```ts
export const AUTO_OPEN_GAP = 24;
/** 保持阈值 = 打包器的同行条件（家族盒左 6 + 右 14），review P2-1。 */
export const AUTO_OPEN_KEEP = FAMILY_PAD_LEFT + FAMILY_H_GAP;
/** view：lane 坐标（x = el.left + dx，y = el.top + dy）下的 [0, w] × [0, h]。返回 true / false；视图内没有卡片时 null。 */
export function autoOpenFits(elements: readonly PlaneElement[], tree: EventTree, view: { dx: number; dy: number; w: number; h: number }, gap: number): boolean | null
```

视图内卡片 V = kind = card 且矩形与视图相交的元素。V 为空 → null。任意两张非祖孙卡片满足 `a.right + gap ≤ b.left` 或反之 → true，否则 false。

### 6.3 三态与回差（P1-2、P2-1）

- `prevOn` 是 ref，在 layout effect 提交（同 `prevLevel`）。`gap = prevOn ? AUTO_OPEN_KEEP : AUTO_OPEN_GAP`。`autoOpenFits` 返回 null（视图内没有卡片：空白处）时 `on = prevOn`；级别 ≠ 0 或 `!zoomOn` 时 `on = false`。
- 只有 `on` 从 true 变 false 时清空 `autoClosed`（layout effect 中 setState，只渲染 EventTimeline 一次）。只剩手动展开的卡片不影响：判定看的是全部卡片的试排，与 `auto` 是否为空无关。

### 6.4 收起按钮（P2-2、P2-3）

- 覆盖值 `useMemo(() => ({ ...ctx, onExpand }), [ctx])`，`onExpand` 来自 `useRef(...).current`，读 `autoLive.current = { on, expanded }`（同 `foldLive`）。
- `on` 时点卡片的展开钮：在 `autoClosed` 中切换该 id；若它也在工作区 `expanded` 中，同时调用 `ctx.onExpand(id)`（否则它在两套排版中都保持展开）。`on` 为假时调用原 `ctx.onExpand`。
- 本地 `pinnedLocal = { id, base: pinned }`：切换 `autoClosed` 时设置；传给两次 `timelineStep` 的 pinned 取 `pinnedLocal.base === pinned ? pinnedLocal.id : pinned`，工作区的 pinned 变化后自动失效。

### 6.5 用例修改

单元（AO-* 改为测 `autoOpenFits` 与两套排版的组合）：

| ID | 内容 |
|---|---|
| AO-01 | 三个叶子根起点相隔 444px（展开 420）：gap 24 → true；443px → false |
| AO-02 | 与视图内卡片 x 相交、但在视图下方（y 不相交）的卡片不参与 → true |
| AO-03 | 只有一张卡片在视图内 → true；没有卡片在视图内 → null |
| AO-04 | 父事件与子事件互相不比较；两个子事件相隔 300px → false |
| AO-05 | gap 20：相隔 440 → true，439 → false；两张展开叶子起点相隔 440 时 `packFamilies` 后 y 相同（与打包同行条件一致） |
| AO-06 | 非卡片元素（frame、track、bar、lane）不参与 |

浏览器（新增夹具选项 `zoomView(n, { leavesOnly: true })`：n 个叶子根，间隔 720 h）：

| ID | 内容 |
|---|---|
| ZB-37 | leavesOnly：d < 430 无自动展开；d ∈ [444, 460) 视图内全部卡片 `aria-expanded=true`、宽 420、相邻水平间隔 ≥ 24；全程 posts 为 0；事件表无展开卡片 |
| ZB-38 | 回差：ZB-37 之后缩到 d ∈ [440, 443)：仍全部展开；缩到 d < 438：全部收起；在 [440, 443) 再放大不展开，回到 ≥ 444 才展开 |
| ZB-39 | zoomView（默认）：d ≥ 900 瞄准 r6 时视图内全部展开（r5–r7 叶子）；水平滚轮平移到 r2 家族（子事件相距 48 h）进入视图：全部收起；平移回：重新展开 |
| ZB-40 | 自动展开时点 r6 的收起钮：r6 收起，屏幕 top 不变（±1）；其他仍展开；平移经过空白处（无卡片）再回来 r6 仍收起；缩小退出再放大回来 r6 重新展开；事件表中 r6 未展开 |
| ZB-41 | 自动展开时平移 30 帧、缩放 6 步（保持展开）：PlanningWorkspace 渲染 0 次；平移帧 EventCard 渲染次数不超过新进入视图的卡片数 |
| ZB-42 | `zoomLevels: false` 放大到 d ≥ 900：不自动展开；`zoomLevels: "default"`：自动展开 |
| ZB-43 | 进入与退出那一步：滚轮指针所在的卡片屏幕 top 变化 ≤ 1px；页面无 “Maximum update depth” 错误（`pageerror` 与 console.error 为空） |
| ZB-44 | d ≥ 6660 瞄准 r2：r2 家族头与三个子事件全部展开，子事件 c0、c1 水平间隔 24 ± 1px |
| ZB-45 | 自动展开时双击 r6 编辑并保存：缩小退出后 r6 仍展开（openCards）；单击、框选不改变展开状态 |
| ZB-46 | 两个面板：只放大面板 0，面板 1 不展开 |

已知限制补充：事件表往返后（EventTimeline 卸载）`autoClosed` 丢失，回到时间线按当前视图重新判定；“全部收起”只作用于工作区展开，自动展开中的卡片不受影响（C1）；右下角小地图可能盖住展开的卡片；进行中事件的无限时长条现有行为不变。

真实应用驱动：“相交”按 `.tcard` 与其 `.stamp` 的合并矩形计算；每步连续 3 帧读 `aria-expanded=true` 的数量，必须稳定。

## 7 代码审核后的修改（`docs/597-worldline-auto-open-code-review.md`）

| 条目 | 修改 |
|---|---|
| P2-1 ZB-43 / ZB-40 证明力 | 夹具 `zoomView` 增加 `longRoot`（该根时长 3 个根间隔，时长条把后面的根压到下一行）。ZB-43 改用 `{ leavesOnly, longRoot: 5 }`，并在开合那一步断言 r6 的布局 y 变化 > 10px。初版在这个夹具上失败（进入时移动 18px）：开合后展开卡片下一帧量测高度再重排，锚点已被消费。修复：开合那一步保留锚点（`settleAnchor`），在下一次 `heights` 变化的提交中再应用一次；新的滚轮会替换它。修复后 ZB-43 通过 |
| P2-2 新进入渲染带的展开卡片不量测 | ResizeObserver 的重新绑定依赖加入 `vbandKey`（渲染带的步进键），纵向移动带进来的展开卡片也会被量测 |
| P3 laneH = 0 | 隐藏标签页（lane 高 0）时判定返回 null，保持原状态，不再清空 `autoClosed` |
| P3 ZB-41 | 断言保留（进入的卡片数 × 2 上界）；注释写明已在 DOM 中的卡片平移时不重渲 |
| 未改 | `pinnedLocal` 在用户之后点同一张基准卡片时仍生效：只影响该次增量重排的固定家族，被收起的卡片保持原位，可接受 |
