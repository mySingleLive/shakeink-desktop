# 592 · 世界线卡片：两行标题、时间线缩放分级、时间点、层叠父事件 技术方案与测试用例（修订 2）

来源：用户 2026-11-20 修改要求，调研 `docs/592-worldline-card-zoom-stack-research.md`，设计稿 `design/worldline-card-zoom/index.html`（审核第 1–3 轮后，用户 2026-11-20 批准）。基于 `74a6dfb`。修订 1 按 `docs/592-worldline-card-zoom-stack-plan-review.md`（下称“审核”）第 1 轮修改，各处以【审 n】标注；修订 2 按第 2 轮修改，以【审2 n】标注。

## 需求（批准稿）

| # | 内容 |
|---|---|
| R1 | 收起卡片（不显示正文）标题最多两行；事件表与时间线 |
| R2 | 时间线：缩小时卡片随之变小，最小系数 0.75；放大不超过原尺寸 |
| R3 | 时间线：缩小到一定程度，“一般”事件改为**时间点**：重要度圆点 + 日期 + 短标题（末尾渐隐），同一行、灰色、无卡片无边框 |
| R4 | 时间线：再缩小，所有父事件自动折叠子事件 |
| R5 | 事件表与时间线：子事件已折叠的父卡片画成层叠卡（四角 12px、40px 高、下方露出两层） |
| R6 | 时间线：悬停卡片或时间点时，卡片、它的日期、标尺上同一时间一起高亮 |
| R7 | 时间线：缩到最小时，只有“关键”事件是卡片，“重要”也改为时间点 |
| C1 | 已通过的功能与流程不变；界面状态不写入作品（WU-09e） |

术语：“折叠”指子事件折叠（`folded`，左侧圆钮）；“展开 / 收起”指卡片正文（`expanded`）。

不进入产品（AGENTS.md）：设计稿的示例数据、审核栏（视图 / 主题 / 最小系数切换）、右下角“卡片系数 · 拥挤度 d”浮层、状态行中的级别指示条“原样 / 缩小卡片 / …”（审核辅助）。【审 10】

## 0 常量（`src/lib/planning/worldline-layout.ts`）

```ts
export const TITLE_LINE = 18;                 // 标题行高
export const STACK_HEAD_HEIGHT = 40;          // 层叠卡本体（单行）
export const STACK_PEEK = 8;                  // 下方两层露出的高度
export const POINT_HEIGHT = 18;               // 时间点行高
export const POINT_TITLE_MAX = 94;            // 时间点标题最大宽度（8.5 × 11px）
export const ZOOM_FULL = 160, ZOOM_POINTS = 40, ZOOM_FOLD = 10, ZOOM_KEY = 2.5;   // 拥挤度阈值 d（px）
export const ZOOM_HYSTERESIS = 1.15;
export const CARD_SCALE_MIN = 0.75;
export const POINT_GAP = 6, POINT_CARD_GAP = 16;   // 时间点之间 / 时间点与卡片之间；卡片之间仍是 FAMILY_V_GAP = 30
```

## 1 R1 两行标题

### 1.1 行数由布局决定，DOM 服从布局【审 7】

不测量收起卡。布局估算出行数后写到卡片上（`data-title-lines="1|2"`），CSS 按行数固定标题高度，DOM 高度恒等于估算高度：

- 1 行：标题 `white-space: nowrap; height: 18px`，溢出末尾 36px 渐隐（与现在相同）。估算偏小（DOM 实际需要 2 行）时多出的字被渐隐，不换行。
- 2 行：标题 `white-space: normal; height: 36px; overflow: hidden`，不用 `-webkit-line-clamp`（Chromium 会画省略号）【审 4】。第二行仍放不下时，`useFade` 检测 `scrollHeight > clientHeight + 1` 设 `data-fade`，遮罩只盖第二行末尾 36px：

  ```css
  .title[data-title-lines="2"][data-fade] {
    mask-image: linear-gradient(#000 0 18px, transparent 18px), linear-gradient(90deg, #000 calc(100% - 36px), transparent);
    mask-composite: add;      /* 第一行全显；第二行按横向渐隐 */
  }
  ```
  估算偏大（DOM 一行就放得下）时第二行为空，卡片仍是 52px。
- 这样平移、缩放都不会因为测量结果触发重排；`heights` 仍只记录展开卡（现状）。

纯函数：

```ts
/** 头部除标题外的宽度（边框、内边距、间隙、控件），按视图区分头像尺寸：事件表 18px、时间线 16px。【审 5】 */
export function collapsedHeadChrome(c: CollapsedCardInput, variant: "table" | "timeline"): number
export function titleWidth(title: string): number                // 已有，导出
/** 宽度已定时的标题行数。 */
export function collapsedTitleLines(c: CollapsedCardInput, width: number, variant: "table" | "timeline"): 1 | 2
/** 卡片高度：(stack ? 40 : 34) + (lines − 1) × 18；层叠卡另加 STACK_PEEK。分组标题卡 36 + (lines − 1) × 18。 */
export function collapsedCardHeight(lines: 1 | 2, kind: "card" | "stack" | "groupHead"): number
```

`collapsedTitleLines`：`chrome + titleWidth(title) + TITLE_SLACK > width + 0.5` 为 2，与宽度规则 `collapsedCardWidth` 用同一个 `TITLE_SLACK = 2`，所以按自身标题定宽（未到上限）的卡片一定是 1 行。（实现中修订：修订 2 曾写 6px 的 `LINE_SLACK`，但它与 2px 的宽度余量矛盾——未到上限的卡片会被估成 2 行；而只在上限附近多留 4px 并不能保护未到上限的卡片。真实字体下的偏差由 §8 驱动统计“1 行且渐隐”的卡片数验证。）【审2 4】`collapsedCardWidth` 改为 `chrome + titleWidth + TITLE_SLACK` 夹在 [下限, 上限] 内（结果不变，CW-01…04 保持）。

### 1.2 时间线

- 叶子卡 `w = widthOf(n)`，`lines = collapsedTitleLines(input, w, "timeline")`。
- 子事件展开的父卡占满家族宽度（`.tcard .card { width: 100% }`），`w = extent(n) − left`。
- 层叠卡（折叠的父事件）宽 `widthOf(n)`（见 §3.2）。
- `FamilyOptions` 新增 `inputOf?: (n) => CollapsedCardInput`；`EventTimeline` 传入现有的 `collapsedCardInput(n, known, tree)`。缺省时用 `fallbackWidth` 的输入。
- `EventCard` 收到 `titleLines` prop（由 `EventTimeline` 从 `step.elements` 中该卡的 `lines` 字段取得，`PlaneElement` 新增 `lines?: 1 | 2`）。

### 1.3 事件表：宽度按 CSS 嵌套规则推导【审 5】

纯函数（CSS 常量写在一处，与 `worldline.module.css` 注释互相引用）：

```ts
/** .cards 的 clientWidth 与窄面板标志 → 每层的槽宽与分组框宽。
 * 宽面板：.slot / .groupBox 为 left 12 right 24，窄面板（≤ 640px）right 10；.slot max 880，.groupBox max 940；
 * 组内元素再加 marginLeft = TABLE_INDENT。 */
export function tableWidths(cardsWidth: number, narrow: boolean): { slot(depth: number): number; group(depth: number): number }
```

递推：`inset = narrow ? 22 : 36`；`group(0) = min(940, cw − inset)`，`group(d) = min(940, group(d−1) − inset − 18)`；`slot(0) = min(880, cw − inset)`，`slot(d) = min(880, group(d−1) − inset − 18)`。审核数例：cw = 350、窄面板，`slot(1) = min(880, 328 − 22 − 18) = 288`。

- `TableOptions` 新增 `widths?: ReturnType<typeof tableWidths>` 与 `inputOf?`。收起卡宽 = `clamp(chrome + titleWidth + 2, 220, slot(depth))`，分组标题卡宽 = `group(depth)`，层叠卡宽 = `group(depth)`（与分组框同宽，见 §3.1）。缺省 `widths`（旧调用、单元测试）时全部按 1 行，结果与修改前逐字段相同。
- `EventTable` 用 ResizeObserver 测 `.cards` 的 `clientWidth`；`narrow` 沿用现有 `panelWidth ≤ 640`（与 `@container worldline (max-width: 640px)` 一致）。
- 分组标题卡头部：`.groupHead .head { height: auto; padding-block: 9px }`，单行 36、两行 54；第一行中线 9 + 9 = 18，`cardHeadOffset(true, false) = 18` 不变【审 6】。

### 1.4 头部 CSS

```css
.head { align-items: flex-start; height: auto; padding: 7px 6px 7px 14px; }   /* 1 + 7 + 18 + 7 + 1 = 34 */
.head > .ln { flex: none; display: flex; align-items: center; height: 18px; }  /* 每个控件各包一层 18px 行盒，对齐第一行 */
.head > .ln > .fold, .head > .ln > .expand, .head > .ln > .menuHost > summary { margin-block: -3px; }  /* 20/24px 控件居中到 18px 行 */
.open .head { height: 42px; align-items: center; padding-block: 0 }          /* 展开卡不变 */
.open .title { height: auto; white-space: normal; mask-image: none }        /* 展开后不受固定行高约束【审2 P2】 */
```

`EventCard` 的头部控件（折叠钮、圆点、头像、`.kids`、⌄、…）各包一层 `<span className={s.ln}>`。`cardHeadOffset` 收起卡 17、分组标题 18 不变，层叠卡 20。

## 2 R2–R4、R7 时间线缩放分级
### 2.1 拥挤度与分级（纯函数）

```ts
/** 相邻根事件开始时间间隔的中位数（偶数个时取较小的中间值，与调研测量相同；世界线单位）；不足 2 个根事件、或中位数为 0 时为 null。 */
export function medianRootGap(tree: EventTree): number | null
export type ZoomLevel = 0 | 1 | 2 | 3 | 4;   // 原样 / 缩小卡片 / 一般→时间点 / 折叠父事件 / 只留关键卡片
/** d = gap × width / span（gap 为 null 时 Infinity）。缩小立即进入下一级；放大要越过阈值 × 1.15 才回到上一级。 */
export function zoomLevel(d: number, prev: ZoomLevel): ZoomLevel
/** 级别 0 为 1；否则 d ≥ 160 为 1、d ≤ 40 为 0.75，之间按 ln 插值，取 0.05 的倍数。 */
export function cardScale(d: number, level: ZoomLevel): number
```

`gap` 按 `EventTimeline` 收到的 `tree`（图例筛选后的 `wViewTree`）计算，`useMemo([tree])`。

**上一级的提交**【审 11】：`prevLevel` 是 ref，只在 layout effect 中写（与 `state.current` 相同，`EventTimeline.tsx:195-198`）；渲染中只读。被丢弃的渲染不影响它。

### 2.2 每个事件的显示形式（纯函数）

```ts
export interface ZoomPlan {
  level: ZoomLevel; scale: number;
  points: ReadonlySet<string>;       // 画成时间点的事件
  autoFolded: ReadonlySet<string>;   // 自动折叠的父事件（已去掉例外）
}
export function zoomPlan(tree: EventTree, level: ZoomLevel, scale: number, keep: {
  cards: ReadonlySet<string>;        // 总是画卡片：选中（含多选）、搜索当前命中、正在编辑、已展开
  unfolded: ReadonlySet<string>;     // 自动折叠时用户手动展开的父事件
  showAll: boolean;                  // “显示为卡片”
}, prev?: ZoomPlan): ZoomPlan
```

规则：

- 门槛：级别 ≥ 4 为 3（关键），级别 2–3 为 2（重要），级别 < 2 或 `showAll` 时没有时间点。
- 事件画卡片：重要度 ≥ 门槛；或有子孙满足；或在 `keep.cards` 中；或是 `keep.cards` 中某事件的祖先。否则画时间点。
- 级别 ≥ 3：画成卡片的父事件都自动折叠，除了 `unfolded` 中的、以及 `keep.cards` 中某事件的**严格**祖先（定位、选中、编辑的事件必须可见；被选中的父事件本身仍折叠，代码审核 P1-2）。
- 只统计画布上会画出的事件（代码审核 P1-1）：时间点的子孙随它隐藏，用户折叠（`keep.folded`）或自动折叠的家族的子孙不计入。框选很多事件时这些家族都会展开，这是“选中事件可见”的直接结果，不另加规则。【审 15】
- **集合沿用**【审 12】：`points`、`autoFolded` 与 `prev` 的内容相同时返回 `prev` 的同一对象，避免无谓重排。
- 级别 < 3 时忽略 `unfolded`，级别 < 2 时忽略 `showAll`（渲染时派生，不在渲染中 setState）；`unfolded` / `showAll` 在 layout effect 中、级别离开对应范围时清空。【审 11】

### 2.3 自动折叠与折叠钮【审 2】

- 时间线的 `folded = (foldedEvents ∪ autoFolded) − unfolded`【审2 1】，只传给 `timelineStep` 和卡片；不写入 `foldedEvents`，事件目录与事件表不受影响。
- 时间线卡片的折叠钮改由 `EventTimeline` 的 `foldClick(id)` 处理：
  - 级别 ≥ 3 时（自动折叠生效）：`id ∈ unfolded` → 删除（重新折叠）；否则加入 `unfolded`（展开），**无论它是自动折叠还是用户在事件表中手动折叠的**。不调用 `onFold`。【审2 1】
  - 级别 < 3：调用 `onFold(id)`（与现在相同，改写 `foldedEvents`）。
- 事件表、事件目录的折叠钮不变。

### 2.4 状态归属、提示位置与渲染次数【审 10】

- `EventTimeline` 内部：`unfolded`、`showAll` 为 `useState`；`prevLevel`、`prevPlan` 为 ref（layout effect 提交）。不上提到 PlanningWorkspace，不写作品。
- **状态行提示放在状态行**（批准稿位置，`WorldlineLegend` 中“N 件事件”之后）。`worldline-viewport.ts` 新增一个小 store `createZoomNoteStore()`：`{ subscribe, getSnapshot, set(note) }`，`note = { kind: "points" | "pointsKey", count: number, showAll: boolean } | null`。`EventTimeline` 在 layout effect 中写入（内容相同不通知）；状态行中 `<ZoomNote store={…} onShowAll onHideAgain />` 订阅它（与 `ViewportValue` 相同做法），PlanningWorkspace 不重渲染。按钮回调通过 store 的 `actions` 字段转给 `EventTimeline`（store 持有当前 `EventTimeline` 注册的回调）。只在时间线视图显示。
- 文本：`N 个一般事件显示为时间点`（级别 2–3）/ `N 个一般和重要事件显示为时间点`（级别 4），按钮“显示为卡片”；`showAll` 时“一般事件已显示为卡片”/“一般和重要事件已显示为卡片”+“改回时间点”。- 提示 store 按面板创建（`PlanningWorkspace` 中 `useRef(createZoomNoteStore())`，与 `viewport` 相同），通过 `TimelineZoomNoteContext` 交给 `EventTimeline`；`EventTimeline` 卸载时（切到事件表、关闭标签）写入 `null` 并注销回调。`unfolded`、`showAll` 是时间线组件状态，切到事件表再回来时重置（与缩放级别从当前视窗重新计算一致）。【审2 5】
- 级别 4 的 `showAll` 文案“一般和重要事件已显示为卡片”是对批准稿的补充（批准稿只有“一般事件已显示为卡片”），与“N 个一般和重要事件显示为时间点”对应。【审2 5】
- **N = `points.size`**：整棵树（不按视窗，与设计稿相同）中画成时间点的事件数。被折叠家族的子孙不在画布上，`zoomPlan` 不把它们放进 `points`，不计入。
- `level`、`scale` 只随缩放（`span`、`width`）变化；平移时 `plan` 沿用同一对象（`prev`），`relayout` 为 false。

### 2.5 布局

`FamilyOptions` 新增 `scaleCard?: number`、`points?: ReadonlySet<string>`、`pointWidth?: (n) => number`、`inputOf?`。

- 收起卡宽 `widthOf(n) × c`，高 `collapsedCardHeight(lines, kind) × c`；行数按**未缩放**宽度估算（`zoom` 等比缩放，行数不变）。
- 展开卡、编辑卡不乘系数（宽 420、测量高度），其内层 `zoom: 1`。【审 15】
- 家族内距（`FAMILY_CHILD_TOP`、`FAMILY_ROW_GAP`、`FAMILY_FRAME_BOTTOM`、`CHILD_ROW_GAP`、`PARENT_BAR_MIN_WIDTH`）乘 `c`；家族之间的 `FAMILY_V_GAP`、`FAMILY_H_GAP`、`FAMILY_PAD_LEFT` 不乘。
- 时间点：`WorldPiece.kind` 新增 `"point"`，`wx = t × scale − 6`（光点 12px 格子圆心对齐时间），宽 `pointWidth(n)`，高 18。根事件时间点自成一个 `FamilyBox`（`point: true`）；家族内子事件时间点与卡片一样参与行分配。
- `pointWidth(n) = 12 + 5 + 10 + dateWidth + 5 + min(94, titleWidth(title) × 11/13) + (有子事件 ? 27 : 0)`，`dateWidth` 为该事件 stamp 开始部分的 `titleWidth × 11/13`。`EventTimeline` 已有 `stamps`（按轴精度缓存），`pointWidth` 由它构造并 `useMemo([stamps])`。
- `placeOnPlane` 中时间点的 `clippedStart/End` 不使用（`EventPoint` 不画剪切标签）。【审 15】

**`packFamilies` 的间距**：`FamilyBox.point: boolean`；`gap(a, b) = a.point && b.point ? 6 : a.point || b.point ? 16 : 30`，`collides(y, f, o)` 用 `gap(f, o)`。单趟 `settle` 在这组数值下仍正确：出错需要“小间距一方的高 + 小间距 > 大间距一方的最小高 + 大间距”，即 `18 + 16 > 25.5 + 30` 或 `18 + 6 > 25.5 + 16`，都不成立（审核第 14 条的推导与反例）。代码注释写明此前提，开发构建中断言 `POINT_HEIGHT + POINT_CARD_GAP <= CARD_HEIGHT * CARD_SCALE_MIN + FAMILY_V_GAP` 与 `POINT_HEIGHT + POINT_GAP <= CARD_HEIGHT * CARD_SCALE_MIN + POINT_CARD_GAP`。【审 14】

**层叠卡**：见 §3.2。

`TimelineInput` 新增 `scaleCard`、`points`、`pointWidth`、`inputOf`；`EventTimeline` 的 relayout 输入数组加 `plan.points`、`plan.autoFolded`（对象身份）。`full` 判定不变（`scale`/`width`），`scaleCard` 只随 `scale` 变化。

### 2.6 渲染

- 卡片：`.tcard` 外层定位（`left/top/width` 为缩放后的像素），内层 `div[data-card-zoom={c}]` 设 `zoom: c; width: w / c`，`EventCard` 与 `.stamp` 在内层（`zoom` 会缩放 `left/top`，定位必须在外层，设计稿已验证）。`.stamp` 设 `zoom: 1 / c` 保持 10.5px。展开、编辑中的卡片 `c = 1`。
- 时间点：新组件 `EventPoint`（`worldline/EventPoint.tsx`，`memo`）【审 8】：

  ```tsx
  <div data-event-point="" data-event-id={id} data-importance={i} aria-label={`${title} ${date}`} title={title}
       className={`${s.tpoint} ${hot ? s.hot : ""} ${dimmed ? s.dim : ""}`} style={moved ? { transform } : undefined}>
    <span className={s.pdot}><span className={`${s.dot} ${s[`i${i}`]}`} /></span>
    <time data-point-time="">{date}</time>
    <span data-point-title="" ref={fadeRef}>{title}</span>
    {kids > 0 && <b>▸ {kids}</b>}
  </div>
  ```

  - 不设 `role`、`tabIndex`：按下时 lane 的 `onPointerDown` 照常把焦点交给时间线根节点（`typing()` 不会把它当控件），时间点变卡片后焦点仍在时间线上，Delete、方向键、空格平移可用。
  - 单击：`ctx.onSelect(id, 1, mods)`（与卡片相同，含 ⌘/Shift）。选中后它进入 `keep.cards`，下一帧变卡片。
  - 双击【审 8、审2 3】：第一次按下选中，时间点下一帧变卡片。第二次按下的 `detail` 由系统按位置与间隔计数（macOS `clickCount`，与目标元素无关），落在新卡片上时卡片自身 `onClick` 的 `detail ≥ 2` 路径（`EventCard.tsx:161`）打开编辑，只调用一次，lane 不另行处理。只有第二次按下落在空白处（变卡片后家族重排、卡片移开）时，lane 的 `onPointerDown` 看到 `e.detail ≥ 2` 且 400ms 内按过时间点 `lastPointPress.id`：不清空选择，并调用 `ctx.onSelect(lastPointPress.id, 2, mods)`。`lastPointPress` 为 ref，在时间点 `pointerdown` 时写入。
  - 拖动预览：与卡片一样应用 `moved` 的 `translateX`。【审 9】
  - 渐隐：`useFade`（一行，`scrollWidth > clientWidth + 1`）。
- 框选：`step.elements` 中 `kind === "point"` 参与命中。
- 搜索：`hitId` 在 `keep.cards`，当前命中是卡片；其他命中/未命中照常淡化（时间点 `.dim`）。
- 小地图、事件目录、角色变化轨道不变。

### 2.7 空视图与首次居中【审 3】

`EventTimeline.tsx:406-430` 中两处 `c.kind === "card"` 改为 `c.kind === "card" || c.kind === "point"`（时间点也是“事件”）。

### 2.8 缩放锚点与定位

- 滚轮锚点：`closest("[data-event-card],[data-event-point]")`；layout effect 中按 `data-event-id` 查找两种元素之一保持屏幕 y；找不到（被折叠）时只保持横向（现状）。
- 定位：`locateWorldEvent`（`PlanningWorkspace.tsx:2372`）先 `setEventSelection(id)`，事件进入 `keep.cards`，§2.2 规则展开其祖先并画卡片，两帧后的 `[data-event-card]` 查找能找到。不改 `foldedEvents` 以外的状态（现有逻辑只展开 `foldedEvents` 中的祖先，保持）。

## 3 R5 层叠卡

条件：`childCount > 0 && folded && !expanded && !editing`。`EventCard` 新增 `stacked` prop（`data-stacked=""`），外包 `div.stackWrap`（`isolation: isolate; padding-bottom: 8px`），两层底卡用 `::before`（`z-index:-1; left/right 8px; top 4px; bottom 4px; radius 11px`）与 `::after`（`z-index:-2; left/right 16px; top 8px; bottom 0; radius 10px`），不透明填充（设计稿第 1 轮修订）。本体：四角 12px、类型色浅底深一档、1px 类型色描边、头部 `padding-block: 10px`（单行 40）、标题 600。

### 3.1 事件表

- 折叠的父事件不产生 `TableGroup`，作为普通卡片放置：`stacked: true`、`groupHead: false`、宽 `group(depth)`、高 `collapsedCardHeight(lines, "stack") + STACK_PEEK`（单行 48）、`head = top + 20`。
- 渲染：`.slot.slotStack`（`max-width: 940px`，与分组框同宽）。不渲染 `[data-event-group]`。
- 期望变化的已有用例见 §6.3。

### 3.2 时间线【审 1】

- 折叠（手动或自动）的父事件按**叶子卡**处理：`buildFamilies` 的 `extent(n)` 与 `layout(n)` 中，`visibleKids(n)` 为空的父事件 `width = widthOf(n) × c`，**不推入 `track`**，`familyEnd` 不参与宽度；高 `(collapsedCardHeight(lines, "stack") + STACK_PEEK) × c`。
- 持续时间条（`bar`，父事件自身有 `duration` 时）照常画在层叠卡下方（与叶子卡相同）。
- 时间戳 `stamps` 中折叠的父事件仍显示家族范围（`A → B`，docs/585，不变）。

## 4 R6 悬停

- `EventTimeline` 内部 `hover: string | null`：plane 上 `onPointerOver` 取 `closest("[data-event-card],[data-event-point]")`；lane `onPointerLeave` 清空；平移、框选、时间拖动进行中不更新（保持 null）。只重渲染 `EventTimeline`。
- 卡片：时间线传 `hot={hover === id}`（`EventCard` 已有）；`.tcard[data-hot] .stamp` 类型色底白字。
- 时间点：`hot` → 圆点光晕、日期类型色底白字、标题前景色。
- 标尺：`Ruler` 新增 `hot?: { x: number; text: string; ec: string }`，渲染 `[data-ruler-hot]` 胶囊；lane 内（plane 外）渲染 `[data-hover-guide]` 竖向虚线，`left = toX(start)`。文字为该事件 stamp 的开始部分（父事件取 `→` 之前）。
- 性能：悬停变化重算 `timelineStep`（不重排）并重渲染元素列表（`EventCard`、`EventPoint` 为 memo，只有 hot 变化的两个重渲染）。真实应用中记录 F885 规模悬停移动 20 张卡的帧耗时。【审 15】

## 5 不改

事件表缩放 `k`、对齐/等距模式、展开卡片、事件目录、图例筛选、搜索规则、时间拖动规则、框选规则、小地图、角色变化轨道、时间戳 `.stamp` 的省略号（docs/585 §4 已批准）。【审 13】

## 6 测试用例
期望值来自需求与批准稿的数值，不读页面代码求值。

### 6.1 单元（`tests/unit/worldline-layout.test.ts`）

| ID | 期望 |
|---|---|
| ZP-01 | `collapsedTitleLines`：标题宽 ≤ room → 1；> room → 2；30 字 → 2。表格与时间线的 chrome 差 = 头像差（18 vs 16 每个）+ ⌄ 按钮 24 + 间隙 9 |
| ZP-02 | `collapsedCardHeight`：(1,card)=34、(2,card)=52、(1,stack)=40、(2,stack)=58、(1,groupHead)=36、(2,groupHead)=54 |
| ZP-03 | `tableLayout` 不传 `widths`、不折叠：F60 与 F885 的世界线全部收起卡高 34、分组标题高 36、`head = top + 17`（卡片）/ `top + 18`（分组标题）。现有 tableLayout 单元用例中断言“折叠后分组高 36”的两处（`worldline-layout.test.ts:182, 898`）按 R5 改为“无分组、层叠卡高 48”，其余不改仍通过 |
| ZP-04 | `tableWidths(350, true)`：`slot(0)=328, group(0)=328, slot(1)=288, group(1)=288`；`tableWidths(1200, false)`：`slot(0)=880, group(0)=940, slot(1)=880, group(1)=886`（940 − 36 − 18） |
| ZP-05 | `tableLayout(widths=tableWidths(350,true))`：两行卡高 52，下一张卡 `top` 比单行情况多 18；折叠父事件无 `TableGroup`、高 48、`head = top + 20`、`stacked`；两行分组标题高 54、`head = top + 18` |
| ZP-06 | `zoomLevel`：d=200→0、100→1、30→2、5→3、1→4；prev=3、d=11→3、d=11.6→2；prev=2、d=45→2、d=46.1→1；prev=4、d=2.8→4、d=2.9→3；gap null → 0 |
| ZP-07 | `cardScale`：(160,1)=1、(40,2)=0.75、(100,1)=0.9、(120,1)=0.95、(60,1)=0.8、(1000,0)=1、(20,0)=1；比较容差 1e-9；结果均为 0.05 的整数倍【审2 测试】 |
| ZP-08 | `buildFamilies(scaleCard=0.75)`：收起叶子卡宽高 = 1 倍时 × 0.75（±1）；展开卡宽 420、高为测量值；家族框内距 × 0.75；家族之间间距仍 30 |
| ZP-09 | `zoomPlan` 级别 2：一般事件 → points；一般父事件有重要子孙 → 卡片；`keep.cards` 中的一般事件 → 卡片；其一般祖先 → 卡片 |
| ZP-10 | 级别 4：重要事件也进 points；只有关键事件、有关键子孙的祖先、`keep.cards` 及其祖先是卡片 |
| ZP-11 | 级别 3：所有父事件进 `autoFolded`，`unfolded` 与 `keep.cards` 的祖先除外；被折叠家族的子孙不在 points |
| ZP-12 | `showAll`：级别 2–4 points 为空，`autoFolded` 不变；级别 1 时 `unfolded`、`showAll` 被忽略 |
| ZP-13 | 集合沿用：同一输入（新建但内容相同的 keep 集合）与 `prev` 调用，返回的 `points`、`autoFolded` 与 `prev` 同一对象 |
| ZP-14 | `buildFamilies(points)`：根时间点自成一族、高 18、`wx = t×scale − 6`、`point: true`；家族内时间点与卡片同行分配，行内不交叠 |
| ZP-15 | 折叠父事件（`folded` 含它）：卡片宽 = `widthOf(n)×c`，没有 `track` 片段，高 (40+8)×c；有 `duration` 时有 `bar` |
| ZP-16 | `packFamilies` 混合间距：50 个随机盒子（卡片高 25.5–60、时间点 18）无交叠，相邻盒间距 ≥ 对应的 6/16/30，且每个盒子的 y 等于暴力“按 start 顺序、从 PLANE_TOP 起逐一尝试所有已放置盒子底边 + 间距”的最低可行位置；另加审核第 14 条的构造（时间点列与卡片列并排、纵向相近）|

### 6.2 浏览器（新文件 `tests/browser/planning-worldline-card-zoom.test.ts`，挂载 `zoomLevels: true`）

夹具：

- **`zoomView(n = 24)`**（新，`tests/helpers/worldline-zoom.ts`）：固定历法（24h/30d/12m）；n 个根事件每 30 天一个（gap = 720h），重要度按 1/2/3/1/2/3… 轮换，类型轮换；第 3、第 9 个根为“一般”父事件，各 3 个子事件（重要度 1、2、1）；第 5 个根为“关键”父事件，2 个子事件（重要度 1、1）；标题长短交替（短 6 字、长 28 字）。人物 2 个。
- F60、F885（现有）。

d 由用例读出：`d = 720 × laneWidth / data-view-span`（`laneWidth = [data-timeline-lane].clientWidth − 28`）；每个用例先用滚轮把 d 调到目标区间并断言，再验证。【审·测试】

| ID | 期望 |
|---|---|
| ZB-01 | R1 时间线（级别 0，d ≥ 160）：对每张收起卡，在同一宽度下另建不受行高限制的测量元素（复制标题文本、同字体、`white-space: normal`）量出自然行数 n，断言 `min(n, 2) ≤ data-title-lines`（估算不偏小）；卡高 = `data-title-lines` 对应值（34/52 ± 1）；长标题卡为 2 行；2 行卡的圆点、⌄、… 中心 y 与标题第一行中心 ≤ 1；卡片（不含 `[data-stamp]`）内无 `text-overflow: ellipsis`，标题元素的 `-webkit-line-clamp` 为 none【审 4、13】 |
| ZB-02 | R1 事件表（宽 470 面板，对齐模式）：对每张可见收起卡，按 ZB-01 的方法量自然行数 n，断言 `min(n, 2) ≤ data-title-lines`，卡高等于行数对应值（34/52；分组标题 36/54；层叠 48/66）；相邻顶层卡间距恰好 6（组内 6、分组头到首个子卡 4）；圆点 y 与第一行中线 ≤ 1；覆盖嵌套一级的子卡两行、分组标题两行（夹具中加一组长标题父子）【审 5、6】 |
| ZB-03 | R2：d ≥ 160 时收起卡宽 = 级别 0 宽（继续放大不变）；d < 40 时宽 / 级别 0 宽 = 0.75 ± 0.01，标题框高度 = 18 × 0.75 ± 0.5（`getBoundingClientRect`，不读计算字号）【审2 测试】；160 > d > 40 时随 d 单调；展开卡宽始终 420、内层 `data-card-zoom = 1` |
| ZB-04 | R3（d ∈ [10, 40)）：一般事件只有 `[data-event-point]`，没有它们的 `[data-event-card]`；光点直径 6（一般）；日期与标题颜色 = `--muted-foreground`；长标题 `data-fade` 且 `mask-image` 非 none；时间点内无省略号 |
| ZB-05 | R4（d ∈ [2.5, 10)）：有子事件的父卡都 `data-stacked`，子事件不在画布；事件目录（与时间线同屏）中各家族 `aria-expanded` 为 true；点父卡折叠钮 → 该家族展开、其他仍折叠、目录不变；再点 → 恢复折叠；放大到 d > 11.5 后全部展开。最后切到事件表核对家族未折叠（切换会重置时间线状态，所以放在最后）【审 2、审2 测试】 |
| ZB-05b | 先在事件表手动折叠一个家族，回到时间线缩到级别 3：点它的折叠钮 → 展开；再点 → 折叠；`foldedEvents`（事件表中）始终为折叠【审2 1】 |
| ZB-06 | R7（d < 2.5）：只有关键事件与有关键子孙的父事件是卡片；状态行 `[data-zoom-note]` 在 `[data-filter-count]` 之后，文字 `N 个一般和重要事件显示为时间点`，N = 17（`zoomView(24)` 中关键根事件为 r4、r5、r11、r14、r17、r20、r23 共 7 个，其余 17 个根是时间点；所有家族折叠，子事件不计。实现时按夹具手算并用纯函数核对，修订 2 写的 16 有误）；点“显示为卡片” → 时间点 0、文字变“…已显示为卡片”；“改回时间点” → 恢复；放大到 d > 46 再缩回 < 40，`showAll` 已复位（时间点重新出现）【审 10】 |
| ZB-07 | 回差：把 d 调到 38（< 40），用小增量滚轮（`deltaY = −5`，每步 ×1.2^0.05）放大到 d ∈ (40, 46) 区间内，时间点仍在；再放大到 > 46.5，时间点消失；再缩回 d ∈ (40, 46)，时间点不出现【审·测试】 |
| ZB-08 | 定位：d < 2.5 时从事件目录点击一个“一般”子事件，它是 `[data-event-card]`、祖先家族展开、在 lane 内可见；事件表中该家族折叠状态不变 |
| ZB-09 | 时间点单击：根时间点 → 选中并变卡片（`data-selected`），随后按 Delete 弹出删除确认（焦点仍在时间线）【审 8】 |
| ZB-10 | 时间点双击：`page.mouse.dblclick`（Playwright 依次发送 clickCount 1、2，与系统计数相同）作用于家族内子事件的时间点 → 原位编辑器打开一次（`[data-event-editor]` 1 个，无“请先保存或取消”提示）；根时间点同样【审 8、审2 3】 |
| ZB-11 | 框选覆盖 3 个时间点 → 3 个都选中并变卡片 |
| ZB-12 | 拖动：级别 2 下拖动一张“重要”父卡的标题，拖动过程中它的时间点子事件与父卡的 x 差保持不变（±1）；松开后保存的时间变化；拖动中无 `[data-ruler-hot]`【审 9】 |
| ZB-13 | R6：悬停卡片 → `data-hot`、`.stamp` 的 `getComputedStyle().backgroundColor` 与同卡 `::before`（类型色竖条）的 `backgroundColor` 相同、文字 `rgb(255, 255, 255)`；`[data-ruler-hot]` 文字 = stamp 开始部分、中心 x 与卡片时间 x（lane 内 `toX`）≤ 1；`[data-hover-guide]` 同一 x；移开后都消失。悬停时间点同样 |
| ZB-14 | R5 事件表：折叠父事件 → 无 `[data-event-group]`、卡片 `data-stacked`、外层高 48 ± 1、`border-radius` 12px（四角）、`getComputedStyle(wrap,"::after").bottom === "0px"`、wrap `padding-bottom` 8px；与下一张卡间距 6；展开后分组框恢复 |
| ZB-15 | R5 时间线：手动折叠父事件 → `data-stacked`、宽 = 折叠前它作为叶子时的宽（`collapsedCardWidth`，≤ 340），无该家族的 `track`/`[data-family-frame]`，高 48 × c ± 1；两种主题截图存证据（不断言像素）【审 1】 |
| ZB-16 | 只有一般/重要事件的世界线（`zoomView` 去掉关键）在级别 4 打开：无“视图内没有事件”，首次居中执行（时间点在 lane 内）【审 3】 |
| ZB-17 | 编辑中的一般事件，缩到 d < 2.5：仍是卡片，编辑器与草稿保留 |
| ZB-18 | 搜索：两个一般事件命中，d ∈ [10, 40)；当前命中是卡片、另一个是时间点；跳到下一个后两者互换 |
| ZB-19 | 渲染次数：先做正向对照（切换视图一次，计数 > 0，确认 profiling 生效），再清零；`zoomLevels: true` 下，滚轮连续缩放跨过 40、10、2.5（每步之间等待一帧），PlanningWorkspace 渲染 0 次；点“显示为卡片”、点自动折叠家族的折叠钮、悬停 20 张卡，各 0 次（`renderProbe`，同 WU-56c）【审·§7.1】 |
| ZB-20 | F885 初始视图（级别 4，时间点与层叠卡都在）下：中键平移 30 帧、框选 30 帧，PlanningWorkspace 渲染 0 次、每帧 < 16ms（同 WU-56c / WU-82 的计法），平移期间 `data-pack-mode` 不出现 full/incremental【审2 测试】 |
| ZB-23 | 层叠卡在系数 0.75 下：时间线中层叠卡第一行中线（标题中心）与其折叠钮、圆点中心 ≤ 1px【审2 测试】 |
| ZB-24 | 两个世界线面板（`panels: 2`）：一个缩到级别 4，另一个保持级别 0；只有前者的状态行有 `[data-zoom-note]`【审2 5】 |
| ZB-21 | 默认开关：不传 Provider 挂载（夹具选项 `zoomLevels: "default"` 不包 Provider），F885 打开时间线后存在 `[data-event-point]`（防止默认值被改成 false）【审·§7.1】 |
| ZB-22 | 不写作品：缩放到级别 4、点“显示为卡片”、手动展开自动折叠的家族、悬停后，`POST /planning` 次数为 0 |

### 6.3 已有用例的期望变化（需求导致）

| 用例 | 改动 |
|---|---|
| WU-41/42/48（`planning-worldline-table.test.ts:128`） | 折叠后不再有分组框：改为按标题找父卡，断言 `data-stacked`，组内子卡 0 张 |
| RM-B5（`planning-worldline-table-rail-modes.test.ts:193-207`） | “折叠后 box.h = 36” 改为 “折叠后无分组框，层叠卡外层高 48”；展开后断言不变 |
| WU-35（`planning-worldline-table.test.ts:112`） | F60 在 900px 下的渐隐标题都不到两行宽，R1 后改为两行不再渐隐。改为：1440px 下无省略号（保留）；900px 下 `[data-title-lines="2"]` 至少 1 个，且所有标题 `-webkit-line-clamp` 为 none【审2 2】 |
| `worldline-layout.test.ts:911-912` | 折叠 `c` 后不再有分组 `c`：改为 `f.byId.get('c')!.stacked === true`、高 48、`d.top = c.top + 48 + 6`、`d.head − c.head = 48 + 6 + 17 − 20`【审2 2】 |
| WU-75（`planning-worldline-workspace.test.ts:335`） | 折叠后 `group` 定位失效：先按标题找父卡操作菜单，“定位子事件”后再用 `[data-event-group]` 断言子卡出现 |
| CW-11（`planning-worldline-canvas.test.ts:97`） | 已检查：全部展开时不受影响，不改 |
| 其他按 `[data-event-group] [data-fold]` 先折叠再断言的用例（`table-scale:229-245`、`workspace:39`） | 实现时逐个检查，凡断言折叠后分组框存在的，按 WU-41 同样改 |

`.stamp` 省略号（docs/585）保留；WU-35 只在事件表中运行，不变。

## 7 风险与决定

### 7.1 现有时间线用例的初始级别

F60 初始视窗含 20 万年前的古代事件，d ≈ 3×10⁻⁵，级别 4。现有约 100 个时间线用例按标题查找卡片。拥挤度的任何定义都无法让 F60 初始视窗低于最高级（35 件密集事件在初始视窗里不到 1px 宽）；逐个改用例会改变它们原本验证的场景。

决定：`EventTimeline.tsx` 导出 `TimelineZoomLevelsContext = createContext(true)`，注释“仅测试夹具使用：现有时间线用例在关闭分级时运行”。为 `false` 时级别恒为 0（无缩放、无时间点、无自动折叠），R1、R5、R6 照常。`WorldlinePanel` 的 props 不改。测试夹具 `withWorldline` 新增挂载选项 `zoomLevels?: boolean | "default"`，缺省 `false`（包 Provider value=false）；ZB-* 传 `true`；ZB-21 传 `"default"`（不包 Provider）。产品中没有 Provider。

台账：现有时间线用例**不**记为覆盖分级打开时的行为；分级打开时的选择、定位、编辑、框选、拖动、渲染次数由 ZB-* 与真实应用验证覆盖（§8）。

### 7.2 `zoom` 兼容性

Electron 44（Chromium）按标准化语义处理 CSS `zoom`：参与布局，`getBoundingClientRect` 返回缩放后尺寸。展开卡的高度测量在 `c = 1` 下进行（展开卡不缩放），无换算问题。收起卡不测量（§1.1）。

### 7.3 性能

`zoomPlan` O(n)，F885 < 1ms（单元测试中计时记录，不作断言）。缩放每帧整体重排（现状）；时间点比卡片便宜。悬停见 §4。

## 8 验证与台账

- `npm run typecheck`、单元全量、`tests/browser/planning-*.test.ts` 全量；基线（`~/shakeink-test-roots/worldline-ui-583-evidence/592/baseline/`）：浏览器 163 项中 CM-02/03/06/10 失败，逐条对比。
- 构建后真实应用：隔离根 `worldline-ui-583`、作品 `LOTM-587-wg-r1`。驱动 `drivers/zoom-592.mjs` 只做滚轮、悬停、截图、读 DOM，不点击菜单、不拖动、不双击；另统计“`data-title-lines=1` 且 `data-fade`”的卡片数（真实字体下估算偏小的数量，期望 0）【审2 4】。版本号通过页面内的应用请求通道读取（与 `data-592.mjs` 相同，`page.evaluate(fetch("/api/…"))` 走应用自身协议，不另起 HTTP 服务）【审2 P2】。记录：每级的 d、时间点数、卡片数、层叠卡数、画布高度、各级截图；悬停 20 张卡的帧耗时；事件表窄面板截图（两行卡、层叠卡）；开始与结束时读作品 planning 版本号（`/api/novels/:id/planning` 的 `version`），断言不变。证据目录 `~/shakeink-test-roots/worldline-ui-583-evidence/592/`。
- `docs/requirements-traceability.json`：为 R1–R7、C1 各加条目，分列“浏览器夹具（内存 API）”的 ZB/ZP 用例与“真实应用”的证据文件；夹具通过不记为真实目标通过。该文件常有未提交条目，只追加，不 checkout。

## 9 代码审核后的修改（`docs/592-worldline-card-zoom-stack-code-review.md`）

| 条目 | 修改 |
|---|---|
| P1-1 计数多算 | `zoomPlan` 只统计画出的事件；`ZoomKeep.folded` 传入 `foldedEvents`；ZP-09/10/11 期望改为按画出的计数 |
| P1-2 选中父事件不折叠 | `kept` 与 `opened`（严格祖先）分开；ZP-11 增加“选中父事件仍折叠”；ZB-19 断言折叠钮点击后状态改变 |
| P1-3 折叠钮状态 | 时间线卡片 `folded` 读 `viewFolded`；新增 ZB-26 |
| P1-4 父卡头部底色 | `.header > .cardZoom > .card`；新增 ZB-27 |
| P2 | ZB-20 改用 rAF 帧间隔（p95 < 20ms）；ZB-15 与家族框宽度比较；新增 ZB-25（两行仍溢出时渐隐）；`revealTimelineCard` 卡片不在 DOM 时立即失败；每次按下清除 `swallowClick`；拖动中不显示悬停；分组标题行数估算加回 2px 无边框；删除无效注释与无样式类 |

## 10 真实应用验证中的修改（§8）

- 滚轮锚点改按布局坐标（`step.elements`）而不是 DOM 查找：重排可能把锚点卡片移出渲染带（`vband`），或卡片与时间点互换，原先查不到就不再纵向跟随，真实数据（LOTM-587-wg-r1）在跨度约 470 年处滚出“视图内没有事件”。修改后同一驱动逐级放大全程无空视图（`e5/result.json`）。
- 行数估算：真实字体下处于宽度上限的卡片比估算宽约 2px，5 张卡片一行渐隐（`fade-592.json`；另 18 张是构建范围边缘被裁短的卡片，与估算无关）。`collapsedTitleLines` 增加 `capped` 参数，处于上限 4px 内时换成两行；按自身标题定宽的卡片不受影响。新增 ZP-01b。
