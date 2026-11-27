# 600 · 世界线事件表随缩放分级 技术方案与测试用例

来源：用户 2026-11-23 修改要求：事件表视图下画布也能用鼠标滚轮缩放，并与时间线视图一样，随缩放程度自动展开 / 收起父事件的子事件、自动展开 / 收起普通卡片、把普通事件卡片收缩成一行标题、按重要度隐藏或显示事件卡片。基于 docs/599 提交之后的工作区。

用户确认（2026-11-23）：

| 问题 | 选择 |
|---|---|
| 滚轮 | Ctrl + 滚轮（含触控板捏合）缩放；只有滚轮时仍是上下滚动（与现在相同） |
| 分级依据 | 与时间线相同的拥挤度规则（d = 中位根事件间隔 × 每单位 px），复位视图按 d 落在哪一级就显示哪一级 |
| 自动展开 | 只在有空间时展开：视图内每张卡片展开后都放得下、不推动下方卡片 |
| 卡片缩小 | 与时间线相同，级别 1 起收起卡片按 cardScale 缩到 0.75 |

## 0 需求

| # | 内容 |
|---|---|
| T1 | 事件表 Ctrl + 滚轮缩放（已有，docs/586），缩放同时驱动 T2–T6；普通滚轮仍滚动 |
| T2 | 缩小：收起卡片按 `cardScale(d, level)` 缩小（级别 1 起，0.75 封底） |
| T3 | 缩小：低重要度事件收缩成一行（时间点：光点 + 日期 + 短标题），级别 2 起一般、级别 5 起重要（`zoomBars`） |
| T4 | 缩小：级别 ≥ 3 父事件自动折叠子事件（层叠卡）；放大回到级别 < 3 自动展开 |
| T5 | 缩小：级别 4 起隐藏一般、级别 6 起隐藏重要（`hide` 不超过最高重要度） |
| T6 | 放大：级别 0 且视图内全部卡片展开后都有空间时自动展开；不满足或缩小时自动收起；自动展开期间用户点收起的卡片保持收起，直到退出自动展开（与 docs/597 A4 相同） |
| C1 | 只作用于事件表画布：工作区 `openCards`、`foldedEvents`、事件目录、时间线不变；界面状态不写入作品；缩放帧不渲染 PlanningWorkspace 以外的面板（滚轮缩放本来就改 `tableZoom` 状态，PlanningWorkspace 渲染次数不增加） |
| C2 | docs/586–599 已通过的功能不变：对齐 / 等距时间轴、分组框、两行标题、虚拟化、定位、编辑形态、Esc |

## 1 级别计算（纯函数，`worldline-layout.ts`）

- 复用 `medianRootGap(tree)`、`zoomLevel(d, prev)`、`cardScale(d, level)`、`zoomBars`、`zoomPlan`。
- 事件表 `d = gap × k`（k 为 px / 世界线小时，与时间线 `width / span` 同单位；gap 为 null 时 Infinity）。新导出 `tableCrowding(gap, k)` 仅做这一乘法与 null 处理，便于单测。
- 真实数据（LOTM-587-wg-r1，1061 事件、371 个已定位根，中位间隔 1784.18 h）：fit k = 0.003127，d = 5.58 → 复位为级别 3（一般 → 时间点、父事件折叠）；min k → d = 0.46 → 级别 5；max k → d ≈ 107 050 → 级别 0。
- 缩小下限：`tableZoomBounds` 的 `min` 改为 `min(原 min, ZOOM_HIDE_KEY × 0.8 / gap)`（gap 非 null 时），使级别 6 可达；`fit` 与 `max` 不变。真实数据 min 从 0.000260 变为 0.0000673（缩小倍数从 12× 增到 46×）。

## 2 表格布局（`tableLayout` 新选项）

`TableOptions` 增：

```ts
/** docs/600: zoom plan of the table (zoomPlan output) and the collapsed card scale. */
plan?: Pick<ZoomPlan, "points" | "hidden" | "scale">;
```

- `hidden` 中的事件（含其子孙）不进入布局：不产生卡片、分组、圆点。根事件被隐藏时，相邻根的拉伸间隔按剩下的根计算（与图例筛选 docs/591 相同的效果）。`railSegments` 改为接收过滤后的根（新增内部 `visibleRoots`）。
- `points` 中的事件为 `TableCard { point: true, height: POINT_HEIGHT, lines: 1, head: top + POINT_HEIGHT / 2 }`，不建分组（子孙随它不画，`▸ N`）。
- 收起卡片高度 × `scale`（`collapsedCardHeight(lines, kind) × c`，层叠的 `STACK_PEEK × c`），`cardHeadOffset × c`；展开 / 编辑卡不乘。行数按未缩放宽度估算（与时间线 §2.5 相同）。`CARD_GAP`、`GROUP_HEAD_GAP`、`GROUP_PADDING`、缩进不乘（分组框的内距在 0.75 时的观感见设计核对 §7）。
- `TableCard` 增 `point: boolean`、`zoom: number`（收起卡为 `scale`，展开 / 时间点为 1）。
- 没有 `plan` 时输出与现在逐字段相同（`point: false, zoom: 1`），已有单测不变。

## 3 `EventTable.tsx`

### 3.1 级别与计划

- 新 props：无（`scale` 已有）。`TimelineZoomLevelsContext` 同样控制事件表（夹具默认关，产品默认开），已有事件表用例保持级别 0。
- `gap = useMemo(medianRootGap(tree))`；`d = gap × scale`；`level = zoomOn ? zoomLevel(d, prevLevel.current) : 0`；`prevLevel`、`prevPlan` 为 ref，在 layout effect 中提交（时间线 docs/592 §2.1 审 11 的做法）。
- `keepCards = selected ∪ hitId ∪ editing ∪ open`；`unfolded`、`showAllRaw` 为 EventTable 本地 state，规则与 `EventTimeline.tsx:193-220` 相同。
- `plan = zoomPlan(tree, level, cardScale(d, level), { cards: keepCards, unfolded, showAll, folded }, prevPlan)`。
- `viewFolded = (folded ∪ plan.autoFolded) − unfolded` 只用于布局与卡片的 `folded` 属性。
- 折叠钮：级别 ≥ 3 时切换本地 `unfolded`，不调用 `onFold`；级别 < 3 调用 `onFold`（与时间线 §2.3 相同）。

### 3.2 渲染

- 时间点：`EventPoint`（同一组件），外包 `.slot.slotPoint`（`left` 为缩进、高 18）。单击选中、双击编辑、悬停高亮：`[data-event-point]` 的 pointerdown 调 `ctx.onSelect(id, e.detail, mods)`（表格没有 lane 指针捕获，不需要时间线的双击转发）。
- 收起卡：`.slot` 内包 `<div data-card-zoom={z} style={{ zoom: z }}>`；`z === 1` 时不加 style。展开 / 编辑卡不包。
- 对齐模式圆点落在时间点中线（`head`）；等距模式不变。
- 状态行提示：表格也写 `TimelineZoomNoteContext` store（`ZoomNoteLine`），PlanningWorkspace 的 `zoomNote` 在两种视图都显示。

### 3.3 自动展开（T6）

- 只在 `level === 0` 时计算。与时间线 docs/597 §6.1 同思路：同时求“全部展开”的第二个布局 `openLayout = tableLayout(..., { expanded: open ∪ (all − autoClosed) })`，在它上面判断。
- 判定 `tableAutoOpenFits(openLayout, view, gap)`（纯函数）：视图 `[scrollTop − TABLE_TOP, scrollTop − TABLE_TOP + clientHeight]` 内（含与之相交的）每个根块，其底部 + gap ≤ 下一个根块的拉伸起点（`atLeast`，即只由时间决定、不被上一块推下的位置）。`tableLayout` 在 `TableSegment` 中输出每个根块的 `{ id, stretch, top, bottom }` 供判断。视图内没有卡片时沿用上一状态。进入用 `AUTO_OPEN_GAP`（24），保持用 `AUTO_OPEN_KEEP`（12）。
- **拉伸上限**：`GAP_MAX = 240` 让展开卡（估算 150–400px）永远放不下。级别 0 时上限改为 `max(GAP_MAX, OPEN_STRETCH_MAX)`，`OPEN_STRETCH_MAX = 1200`；级别 > 0 仍为 240（docs/586 行为不变）。真实数据中位间隔要 k ≥ 0.112（e ≈ 3.58，复位后放大约 36×）才有 200px，处于缩放范围内（max e ≈ 9.86）。
- 切换布局时保持锚点：沿用 `anchorNow(zoomAnchor || firstVisible)`，切换的那一次布局提交后恢复卡片屏幕位置。
- `autoClosed`、`onAutoExpand`（memo 的 `WorldlineCardContext` 覆盖，`EventTable` 包住卡片列）与时间线 `EventTimeline.tsx:306-349` 相同；退出自动展开清空 `autoClosed`。工作区 `openCards` 不变。

## 4 已知限制

- 自动展开的高度首帧为估算，测量后重排一次，锚点修正（与手动展开相同）。
- 级别 0 时拉伸上限提高，会让放大时根事件之间出现更大空白（最多 1200px）。
- 隐藏的事件不在表格中，搜索命中 / 定位它们时它进入 `keepCards` 而显示（与时间线相同）。

## 5 测试用例

### 5.1 单元（`tests/unit/worldline-layout.test.ts`）

| ID | 内容 |
|---|---|
| TZ-01 | `tableCrowding`：gap null → Infinity；gap 100、k 0.5 → 50 |
| TZ-02 | `tableLayout` 无 `plan`：与现有输出逐字段相同（`point: false, zoom: 1`） |
| TZ-03 | `plan.points` 含叶子 a：a 高 18、`point: true`、`head = top + 9`；含父事件 p：只有 p 一张、无分组 |
| TZ-04 | `plan.hidden` 含根 r：r 与子孙不在 `cards`/`groups`，相邻根的拉伸按剩余根计算 |
| TZ-05 | `scale 0.75`：收起卡高 25.5、两行 39、层叠 (40+8)×0.75；展开卡高不乘；`head` 偏移 ×0.75 |
| TZ-06 | `tableZoomBounds`：gap 已知时 min ≤ 0.15 × 0.8 / gap；fit、max 不变 |
| TZ-07 | `tableAutoOpenFits`：两根相隔足够（底 + 24 ≤ 下一拉伸起点）→ true；差 1px → false；保持 12 的回差；视图外根不参与 |
| TZ-08 | 级别 0 拉伸上限 1200、级别 > 0 为 240 |

### 5.2 浏览器（新文件 `tests/browser/planning-worldline-table-zoom.test.ts`，夹具 `zoomLevels: true`）

| ID | 内容 |
|---|---|
| TZB-01 | Ctrl + 滚轮缩小：级别依次出现缩小卡（`data-card-zoom` < 1）、一般时间点、层叠父事件、一般消失、重要时间点、只剩关键；普通滚轮只滚动不改缩放 |
| TZB-02 | 放大回去：回差（越过阈值 × 1.15 才回级）；子事件重新出现 |
| TZB-03 | 级别 ≥ 3 点折叠钮展开一个家族：只影响事件表，`foldedEvents` 不变，事件目录不变 |
| TZB-04 | 时间点单击选中 → 变卡片；双击进入编辑形态 |
| TZB-05 | 状态行“N 个一般事件显示为时间点 · 显示为卡片”；点击后时间点变卡片 |
| TZB-06 | 放大到级别 0 且间隔足够：视图内卡片自动展开（`aria-expanded=true`），`openCards` 不变；点其中一张的收起保持收起；缩小退出后再放大恢复 |
| TZB-07 | 间隔不足（两个事件同一时刻）：放大到上限也不自动展开 |
| TZB-08 | 对齐模式：时间点中线与圆点 0px；缩小卡的卡头与圆点 0px |
| TZB-09 | 缩放过程 PlanningWorkspace 渲染次数与改动前相同（每步 1 次 `tableZoom`）；作品数据版本不变 |
| TZB-10 | 夹具默认（`zoomLevels` 关）：已有事件表用例全部不变 |

### 5.3 回归

全部 `tests/browser/planning-*.test.ts` 与 `npm test`，与 docs/599 提交（HEAD）的失败集合按用例名对比。

### 5.4 真实目标

构建版、隔离根 `worldline-ui-599`（LOTM-587-wg-r1，无模型）：复位读级别与各类数量；Ctrl + 滚轮逐步缩小到下限、再放大到上限，每步记录级别、卡片 / 时间点 / 层叠 / 隐藏数、`data-card-zoom`、自动展开数、对齐偏差、作品版本；截图每一级。证据 `~/shakeink-test-roots/worldline-ui-583-evidence/600/`，台账 `WL-600`。

## 6 文件范围

`src/lib/planning/worldline-layout.ts`、`src/components/content/planning/worldline/EventTable.tsx`、`worldline.module.css`、`PlanningWorkspace.tsx`（状态行提示在事件表也显示）、`tests/unit/worldline-layout.test.ts`、新浏览器用例文件、`tests/helpers/worldline-browser-fixture.ts`（如需）。

## 7 设计核对

0.75 缩小后分组框内距（4 / 10px）不乘系数，视觉上框略松；与时间线家族框外距不乘的规则一致。实现后截图对比，不满意再改。

## 8 修订 1（按 `docs/600-worldline-table-zoom-plan-review.md`）

以下规则替换前文对应内容；冲突处以本节为准。用户 2026-11-23 就 P1-5 选择“家族内子事件也按时间拉伸”。

### 8.1 P1-1 自动展开时的收起走 `onToggle`

- 表格的卡片上下文覆盖 `onToggle(id, detail)`（memo，依赖 `ctx`；处理函数经 ref 读 `on / open / expanded`）。`on` 为真且 `id` 自动展开（在 `shownOpen` 中、不在工作区 `expanded`）时：`detail === 1` 延迟 `COLLAPSE_DELAY_MS`（260 ms，与 `PlanningWorkspace.tsx:119` 相同）切换本地 `autoClosed`，期间收到 `detail >= 2` 取消该延迟并交给 `ctx.onToggle(id, 2)` 进入编辑；不自动展开的卡片照常交给 `ctx.onToggle`。
- 卡片 `expanded` 属性 = `on ? shownOpen.has(id) : expanded.has(id)`（同 `EventTimeline.tsx:881`）。
- 用例 TZB-06b：自动展开中单击一张卡片 → 260 ms 后收起，`openCards` 不变；双击 → 进入编辑，不收起；退出自动展开再进入 → 它重新展开。

### 8.2 P1-2 缩放包层与 CSS

- 包层 `.tableZoom`（`data-card-zoom={z}`）只在 `z < 1` 时加；宽度用布局的未缩放值：`TableCard.width`（新字段：普通卡 `min(slot(depth), max(220, own))`，分组头 / 层叠卡 `group(depth)`，即 `linesOf` 用的同一宽度），`style={{ zoom: z, width }}`。卡片 `width: 100%` 填满包层。
- CSS 直接子选择器同时匹配包层：`worldline.module.css:223`、`:232-243`、`:391` 中的 `.slot… > .card…` 改为 `:is(.slot…) > :is(.card…, .tableZoom > .card…)` 写法（实现时逐条列出）。
- 用例 TZB-11：级别 1–3（`zoomView` 夹具），分组头宽 = 分组框宽、左边 0px；层叠卡与框同宽；每张收起卡的实际高度 = `TableCard.height`（±1px），含 `data-lines="2"` 至少 1 张。

### 8.3 P1-3 拉伸上限：选项、连续、只在分级打开时

- `TableOptions.gapMax`（默认 `GAP_MAX` 240）。EventTable：`zoomOn ? clamp(GAP_MAX × d / ZOOM_FULL, GAP_MAX, OPEN_STRETCH_MAX) : GAP_MAX`，`OPEN_STRETCH_MAX = 1200`。不依赖级别（无跳变、无回差差异）。
- 夹具默认（分级关）上限恒为 240：docs/586、588 用例不变。
- TZ-08 改：选项生效；TZB-12：分级打开，d 从 150 逐步放大到 400，中位根间距单调不减，相邻两步变化 ≤ 1.15 倍。

### 8.4 P1-4 滚动带状态与判定区间

- 新增 `band` 状态：`sync.current()` 中按 `step = max(100, h / 4)` 量化 `scrollTop` 后 set（非虚拟模式也 set），只有带变化才渲染。
- 判定区间：取锚点（`zoomAnchor` 有效时用它，否则当前显示布局的 `firstVisible`）及其屏幕偏移 `off`；候选布局（展开或收起，取与当前相反的那份）的视图顶 = `candidate.byId.get(anchor).top − off`，判定在该区间上进行。两份布局都给出同一锚点时，判定的就是切换后可见的那段。
- 切换由渲染决定：layout effect 中若 `on` 改变（`flipped`），用上一次提交的布局 ref 与当前 `scrollTop` 求锚点偏移，再在新布局上设置 `scrollTop`（与 `anchor` 恢复同一 effect，先于 `sync`）。渲染中不写 `anchor.current`，不读 DOM。
- 用例 TZB-13：级别 0 自动展开中，滚到两个同刻事件附近 → 退出；滚回 → 重新进入；每次切换视图中线处卡片屏幕位置变化 ≤ 2px。非虚拟（`zoomView`）与虚拟（F885）各一次。

### 8.5 P1-5 家族内按时间拉伸（用户选择）

- 子事件块的起点：同一家族内相邻子块 `atLeast = 上一子块起点 + min(gapMax, Δt × k)`（Δt 为两个子事件开始时间差；待定位或无时间的子事件不拉伸）。分组头之后第一个子块不拉伸（紧跟头，`GROUP_HEAD_GAP`）。
- 影响：分级打开时，家族内间距随缩放变化。分级关闭时为保持 docs/586/588 行为，**子块拉伸只在 `gapMax` 选项显式给出时启用**（`TableOptions.stretchChildren`，EventTable 在 `zoomOn` 时为 true）。RL-02 的 124px 不变（未给选项）；新增 TZ-09 验证拉伸后的子块间距。
- 判定 `tableAutoOpenFits` 扩展到每一层：视图内每一个块（根块与家族内子块），展开后底部 + gap ≤ 同层下一个块的拉伸起点；家族最后一个子块与分组底（`GROUP_PADDING`）之后再与下一个根块比较。祖先与子孙不比较。
- 用例 TZ-10：父事件带两个子事件，间隔足够 → 全部展开且兄弟块的 top 不变；差 1px → false。TZB-06c：家族展开后兄弟卡屏幕位置不变。

### 8.6 P2

- **P2-1 锚点**：滚轮锚点改为 `{ id, t, offset }`（t = 指针处卡片的开始时间，待定位为 null）。恢复时 `byId.get(id)` 不在新布局，则取新布局中 `start ≤ t` 的最后一张卡（同段），仍无则不恢复。ResizeObserver 400 ms 路径同。用例 TZB-14：指针放在一般卡上从级别 3 缩小到 4，指针处轨道时间变化不超过一个相邻根。
- **P2-2 状态行提示**：`ZoomNoteStore` 增 `owner` 参数：`set(note, owner)`、`clear(owner)`（只清自己写的），`actions` 同样按 owner 注册 / 注销。时间线与事件表各自用 `useRef(Symbol())` 作 owner。`PlanningWorkspace.tsx:2481` 两种视图都渲染 `ZoomNoteLine`。用例 TZB-05b：时间线级别 2 有提示，切到事件表后立即显示表格自己的计数；切回同理。
- **P2-3 时间点交互**：表格时间点单击 = 与单击表格卡片相同（`onToggle(id, 1)` 语义：它在 `keepCards` 外，单击后成为“展开”卡，进入 `openCards`，因此变为展开卡片），不调用 `onSelect`、不写 `selection`。双击：照搬 `lastPointPress` 判定（`POINT_DOUBLE_MS`），第二次按下落在新卡片上只进入编辑一次，吞掉随后的 click。悬停：卡片列 `onPointerOver` 同时找 `[data-event-point]`。TZB-04 改为：单击 → 变为展开卡、`selection` 为空；双击 → 编辑一次；第二次点击后卡片不收起。
- **P2-4 子事件全隐藏的父事件**：`tableLayout` 引入 `visibleKids(n) = n.children − hidden − 时间点之下`（与时间线 `worldline-layout.ts:1360-1363` 相同）；没有可见子事件时画成层叠卡（`stacked: true`，不进 `groups`）。`descendantCount` 不变（显示全部子孙，与时间线相同）。TZ-04 增此情况。
- **P2-5 `tableZoomBounds`**：新增可选参数 `{ levels: boolean }`，只在 `levels` 为真时放宽 `min`（有月历与无月历两个分支都放宽）。PlanningWorkspace 读 `TimelineZoomLevelsContext` 传入。RL-03 不传参，断言不变；TZ-06 改为验证带参数的值（years 历 gap 1：min = 0.12）。
- **P2-6 回调引用稳定**：`foldClick`、`onToggle` 覆盖都用 `useRef` + live ref（照搬 `EventTimeline.tsx:414-419`），`cardCtx` 为 `useMemo([ctx])`。TZB-09 加：缩放一步，展开卡片的 Markdown 正文元素节点引用不变。
- **P2-7 用例**：TZB 主夹具改用 `tests/helpers/worldline-zoom.ts` 的 zoomView（按其数值算级别），F885 只用于虚拟化与性能。新增：TZB-15 虚拟化下级别 6 定位 / 搜索隐藏事件 → 显示、滚入、闪烁；TZB-16 隐藏事件无圆点 / 标签 / 引线，`breaks` 与“相隔”文字按过滤后的根；TZB-17 待定位块在级别 ≥ 2 不变时间点、不隐藏、不计入提示；TZB-18 工具栏放大 / 缩小 / 复位改变级别；TZB-19 F885 分级打开每步滚轮（含跨级与级别 0 两份布局）渲染 < 100 ms。回归对比 HEAD 工作树需链接 `src/generated`。

### 8.7 P3

- 时间点：日期用对齐模式轨道标签同一文字（`ctx.adapter.label(start, 1, precision)`）；标题不截到 94px，最多到 slot 宽度单行省略。实现后截图给用户确认。
- `alignedRailMarks` 注释更新（点 24px、缩小卡 31.5px，仍 > `LABEL_MIN_GAP`）；TZB-08 加“相邻标签不重叠”，对齐断言允许 ±0.5px。
- TZ-05 加分组头：36 × 0.75 = 27，头偏移 18 × 0.75 = 13.5。
- “全部展开”不含待定位块；视图只在待定位块时按“视图内没有卡片”。
- 用户折叠（`foldedEvents`）的父事件不参与自动展开（保持折叠）。
- §4 第 2 条改为：拉伸上限随 d 连续增长，最大 1200px。

## 9 修订 2（按审核第 2 轮）

用户 2026-11-23 就 P1-B 选择“分组头不参与自动展开”。以下替换 §8 中对应内容。

### 9.1 P1-A 判定放到事件中（审核方案 1）

- 删除 `band` 状态（§8.4 第 1 条作废）。
- `on`（自动展开是否生效）为 EventTable 的 state，只在 `zoomOn && level === 0` 时可能为真；级别离开 0 或分级关闭时在渲染中派生为 false（不 setState），layout effect 中同步清掉 state。
- 判定函数 `decide()`（ref 持最新的两份布局、`on`、gap），读真实 `scrollTop` / `clientHeight`，在三处调用：`sync.current()`（滚动与 ResizeObserver）、布局提交后的 layout effect（缩放、高度测量、树变化之后）。结果与当前 `on` 不同才 set。
  - `on` 为假（进入判定）：取锚点（滚轮锚点有效时用它，否则当前收起布局的 `firstVisible`）与其屏幕偏移，算出展开布局上的视图顶 `openLayout.byId.get(anchor).top − off`，在该区间上判定 `fits(openLayout, 区间, AUTO_OPEN_GAP)`。
  - `on` 为真（保持判定）：在当前显示的展开布局、真实可见区间上判定 `fits(openLayout, 区间, AUTO_OPEN_KEEP)`。
  - 视图内没有块时不改变 `on`。
- 切换后的锚点：`decide()` 在 set 之前用当前显示布局与真实 scrollTop 记录 `anchor.current = { id, top }`（滚轮锚点已存在时不覆盖），已有的“布局提交后恢复锚点”effect（`EventTable.tsx:227-234`）负责恢复。渲染中不读 DOM。
- 稳定性：进入判定的区间就是切换后锚点恢复所得的区间（同一锚点、同一偏移），保持判定在切换后第一次调用时看到的是同一区间，且 KEEP（12）≤ GAP（24），所以不会在切换后立刻退出。之后只有真实滚动或布局变化才会再判定，没有 effect 循环。
- 用例 TZB-13 增：停在判定边界附近（同刻事件对刚好在视图边缘）1 s 内 `on` 最多变化 1 次，控制台无 “Maximum update depth” 报错；非虚拟、虚拟各一次。

### 9.2 P1-B 分组头不参与自动展开

- “全部展开”集合 = 全部事件 − 有可见子事件的分组头 − 用户折叠的父事件 − `autoClosed`，再并上工作区 `open`（用户手动展开的分组头照常展开）。层叠卡（子事件被折叠或全隐藏的父事件）不是分组头，可以自动展开。
- 判定：同层相邻块（根块之间、同一家族内子块之间），展开布局中前一块底部 + gap ≤ 后一块的拉伸起点；家族最后一个子块与分组底 `GROUP_PADDING` 之后，分组底 + gap ≤ 下一根块的拉伸起点。分组头本身高度不变，不参与比较。
- TZ-10 明确：比较收起布局与展开布局中每个块的 top，相同（±0.5px）即“未推动”。
- §4 已知限制增：家族时间跨度大于到下一根事件的间隔时（收起时已推动下一根），该家族在视图内时不会自动展开。

### 9.3 P2-a 提示 owner

`set(note, owner)`：先更新 `owner`，内容相同时只跳过通知。`clear(owner)` 只在 `owner` 相同时清空。TZB-05b 用两边计数相同的同一 zoomView、同一级别测。

### 9.4 P2-b 时间点单击

- 时间点的单击、双击都在 pointerdown 中处理，并设置 `swallowClick`，在卡片列的 `onClickCapture` 中吞掉随后的那一次 click（第一次与第二次按下都吞）。
- 单击语义：等同单击表格收起卡片：`ctx.onToggle(id, 1)` → 工作区主选中该事件（`setEventSelection`），加入 `openCards`（展开），多选 `selection` 不变。
- TZB-04 断言：单击后 400 ms 卡片仍展开、`openCards` 含它、主选中为它、`onToggle` 调用 1 次；双击进入编辑 1 次。

### 9.5 P2-c 滚轮锚点插值

- 滚轮锚点改为指针处插值：找指针 y 上下最近的两张卡（按 `head`），按 y 在两 `head` 之间的比例记 `{ a, b, f, offset }`（offset 为指针屏幕 y）。恢复时在新布局中取 a、b 的 `head`，按 f 插值得到指针应在的布局 y，`scrollTop = y − offset`。a 或 b 不在新布局时按 P2-1 的时间回退规则找替代卡。只有一张卡（边界）时退回“该卡 + 偏移”。
- 测量高度引起的重排（400 ms 内）沿用同一锚点。
- TZB-14 增：级别 0、指针位于两张相距 > 600px 的卡片之间，缩放一步，指针处轨道时间变化不超过两卡时间差的 5%。

### 9.6 P3

- P3-a：自动展开卡片的本地单击收起同时调用工作区选中：上下文新增 `onSelectOnly(id)`（`setEventSelection(id)` + `setPinnedCard`，不切换展开）。PlanningWorkspace 在 `wCardContext` 增此方法（reuse 文件，台账记录）。
- P3-b：表格的 `visibleKids` 只排除 `hidden` 与时间点之下的子孙，保留无时间的子事件（不拉伸，排在最后）。
- P3-c：无 `band`，不适用。
- P3-d：§4 第 1 条补：首帧估算高度偏小时，测量后可能退出自动展开一次（不循环）。

## 10 修订 3（按审核第 3 轮）

### 10.1 P1-C 预测与恢复用同一函数，判定只在恢复之后

- 新纯函数（`worldline-layout.ts`）：

  ```ts
  /** docs/600 §10.1: the anchor of a table re-layout. Either one card (`b` absent) or the pointer between two cards'
   *  heads at fraction f; `offset` is the anchor's screen y inside the scroller. */
  export interface TableAnchor { a: string; b?: string; f?: number; offset: number }
  /** scrollTop that puts the anchor back at `offset` on `layout`, clamped to [0, maxScroll]; null when a is missing. */
  export function projectAnchor(layout: TableLayout, anchor: TableAnchor, maxScroll: number, top0: number): number | null
  ```

  `top0` 为 `TABLE_TOP`；`maxScroll = layout.height + 底部留白 + TABLE_TOP − clientHeight`（底部留白 = `max(80, 0.67 × clientHeight)`，与 `EventTable.tsx:302` 的 `calc` 相同，由组件传入）。a、b 跨时间段或 b 不在新布局时退回单卡 a；a 不在新布局时按 P2-1 时间回退规则找替代 id，仍无则 null。
- 恢复 effect（`EventTable.tsx:227-234`）改为：`scrollTop = projectAnchor(...)`（非 null 时），然后 `sync.current()`，然后 `decide()`。`decide()` 只在这里与 `sync.current()`（滚动事件、ResizeObserver）中调用；不在别的 effect 中调用。
- 进入判定的区间：`projectAnchor(openLayout, 当前锚点, maxScrollOpen, TABLE_TOP)` 得到切换后的 scrollTop，区间为 `[st − TABLE_TOP, st − TABLE_TOP + clientHeight]`，与恢复后的真实区间相同（同一函数、同一截断）。
- 同一提交链内只允许一次切换：`decide()` 记录 `flipAt = 布局提交序号`；切换后的下一次恢复 effect 中（同一链）只做保持判定且结果为“退出”时不 set，等下一次真实滚动或布局输入变化。这样即使浮点误差导致一次误判，也不会形成 layout effect 内的连续 setState。
- TZB-13 增：在判定边界处逐步 Ctrl + 滚轮（10 步、每步等两帧），每步 `on` 变化 ≤ 1 次，无 “Maximum update depth”。

### 10.2 P2-d 时间点 click 吞掉

卡片列 `onPointerDownCapture`：每次按下先 `swallowClick = false`；按下在 `[data-event-point]` 上，或是 `lastPointPress` 的第二次按下（落在新卡片上也算），处理单击 / 双击并设 `swallowClick = true`。`onClickCapture` 吞掉一次 click 后复位。

### 10.3 P2-e 锚点统一

- `anchor.current` 与 `zoomAnchor` 都改为 `TableAnchor`。滚轮记录插值锚点（§9.5），`until = now + 400`；高度测量路径（`:214-215`）在 `zoomAnchor` 有效时用它，否则用 `firstVisible` 的单卡锚点；恢复 effect 统一调用 `projectAnchor`。
- 只有一个锚点来源生效：同一次提交前若滚轮已写入 `anchor.current`，`decide()` 不覆盖。

### 10.4 P3

- §9.2 删除“层叠卡可以自动展开”一句（级别 0 没有自动折叠，用户折叠的父事件本就排除）。
- 退出级别 0 / 分级关闭时，在同一 layout effect 中清 `on` 与 `autoClosed`。
- §4 增：虚拟模式下滚入视图的卡片首次测量可能让自动展开退出一次（不循环）。

## 11 修订 4（按审核第 4 轮）：判定改为“静止后判定一次”

§10.1 的“同一提交链内只允许一次切换”删除，改为下面更简单、可定义的规则。

### 11.1 P1-D 判定时机

- `decide()` 不在 `sync` / 恢复 effect 中同步执行，而是**静止后执行一次**：任何输入（用户滚动、滚轮缩放、布局提交、高度测量）都调用 `scheduleDecide()`，它清掉上一个计时器并在 `DECIDE_IDLE_MS = 160` 后执行 `decide()`。
- 程序写入的滚动不算输入：恢复 effect 写 `scrollTop` 时记下 `programmatic = 写入后的 scrollTop`；随后的 scroll 事件若 `|scrollTop − programmatic| ≤ 1` 则只 `sync`（虚拟窗、年份），不 `scheduleDecide()`，并清掉 `programmatic`。
- `decide()` 一次最多切换一次（set `on`）；切换带来的布局提交会再 `scheduleDecide()`，160 ms 后在**切换后的真实区间**上做保持判定。进入判定用 `projectAnchor` 预测的区间并在两端各放宽 8px（吸收取整），保持判定不放宽且用 KEEP（12）< GAP（24），所以预测正确时切换后的保持判定必然成立；即使因测量误差退出，也是在 160 ms 之后、之后不会再自动进入，直到下一次用户输入（滚动 / 缩放）使计时器重新开始。最坏情况是每次用户输入后至多两次切换（进 → 出），没有自发的循环或闪烁。
- 被拒绝的退出不存在：每次 `decide()` 都基于当时的真实状态给出结论并执行。
- 恢复 effect 在没有锚点时也调用 `sync.current()`（不再提前 return），然后 `scheduleDecide()`。
- 卸载、级别离开 0、分级关闭时清掉计时器，并在同一 layout effect 中清 `on` 与 `autoClosed`。
- 用例 TZB-13 改：（a）停在判定边界附近，无输入 1 s 内 `on` 变化 ≤ 1 次；（b）边界处逐步 Ctrl + 滚轮 10 步（每步间隔 50 ms），最后一步之后 1 s 内 `on` 变化 ≤ 2 次且最终稳定；（c）程序恢复滚动不触发判定（spy `decide` 调用次数）；无 “Maximum update depth”。用 Playwright 时钟或真实等待均可，断言用 MutationObserver 记录 `aria-expanded` 变化次数。

### 11.2 P2-f 锚点

- 进入判定与恢复用同一锚点：`decide()` 若 `zoomAnchor` 仍有效（400 ms 内）则用它，否则用当前显示布局的 `firstVisible` 单卡锚点，并把它写入 `anchor.current`（尚无锚点时）。
- 高度测量路径复用 `zoomAnchor` 时按当前 `scrollTop` 重新计算 `offset`；400 ms 内若发生用户滚动（非程序滚动），丢弃 `zoomAnchor`。

### 11.3 P3

- P3-h：`projectAnchor` 截断到 `[0, max(0, maxScroll)]`。
- P3-i：不适用（`decide` 只经计时器执行）。
- P3-j：时间点第二次按下落在新卡片时 `stopPropagation()`，并 `preventDefault()` 防止卡片标题的时间拖动（`EventCard.tsx:208`）。

### 11.4 代价

自动展开在停止滚动 / 缩放约 160 ms 后才出现或消失，不在每一帧跟随。这与“只在有空间时展开”的确认不冲突；实现后截图 / 录屏给用户确认手感。

## 12 修订 5（按审核第 5 轮；审核结论：写入后即可进入测试用例审核与 TDD）

### 12.1 P2-g 退出后的闩锁

`decide()` 因保持判定失败而退出时设 `latched = true`；`latched` 期间进入判定直接返回（不进入）。清除 `latched` 的只有用户输入：用户滚动（非程序写入）、Ctrl + 滚轮 / 工具栏缩放（`scale` 变化）、定位 / 搜索滚动（见 12.2）。高度测量、自动展开自身引起的重排、树数据变化不清除。TZB-13(b) 依此断言最终稳定。

### 12.2 P2-h 定位、搜索滚动算用户输入

- `locateWorldEvent`（`PlanningWorkspace.tsx:2227-2233`）及经它的搜索首个命中 / 上下一个、事件目录、深链接写入的 `scrollTop`，在 EventTable 中按用户滚动处理：重新计时、丢弃 `zoomAnchor`、清除 `latched`。只有 EventTable 自己的锚点恢复写入是“程序写入”。
- `decide()` 选锚点的优先级：视图内的定位目标 / 当前搜索命中（`hitId`、`selected` 中在视图内的那个）> 有效的 `zoomAnchor` > `firstVisible`。自动展开不会把刚闪烁的卡片推出视图。
- TZB-15 增：级别 0 空间足够处定位一张卡片，自动展开后该卡片屏幕位置变化 ≤ 2px 且仍在视图内。

### 12.3 P3

- P3-k：`decide()` 使用 `zoomAnchor` 时按当前 `scrollTop` 重算 `offset`。
- P3-l：`sync.current()` 不调度判定；判定只由 `onScroll`（用户滚动）、恢复 effect、`scale` 变化、定位调用 `scheduleDecide()`。
- P3-m：`openLayout` 的 `useMemo` 不依赖 `on`（只依赖树、高度、缩放、展开集合等布局输入）。
- P3-n：§4 增：自动展开在停止输入约 160 ms 后才出现 / 消失。
- P3-o：`decide()` 只 `setOn` 并把选定锚点存入 `pendingFlipAnchor` ref；恢复 effect 中若 `on` 相对上次提交改变，用 `pendingFlipAnchor`（重算 offset 后）经 `projectAnchor` 恢复，然后清空。`decide()` 不写 `anchor.current`。
- P3-p：`programmatic` 取写入后读回的 `scrollTop`；写入前后值相同时不设。
- P3-q：TZB-13(c) 改为断言 DOM：程序恢复滚动后 1 s 内 `aria-expanded` 无变化（MutationObserver 计数）。

## 13 测试用例（定稿，替换 §5；供用例审核）

夹具数值（纯函数实测，`zoomView(24)`，固定历，gap 720 h）：fit k = 0.05556 → 复位 d = 40.0（级别 1，恰在 40 阈值上；用例不依赖复位即级别 1 以外的级别，按滚轮步数取级别）。Ctrl + 滚轮每步 ×1.15（docs/586 `ln 1.15`）。从复位起 n 步缩小 / 放大的 d 与级别（`zoomLevel(d, 0)`，放大方向另算回差）：

| 步 | −30 | −20 | −18 | −10 | −8 | −2 | 0 | +2 | +10 | +20 | +30 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| d | 0.60 | 2.44 | 3.23 | 9.89 | 13.08 | 30.2 | 40 | 52.9 | 161.8 | 654.7 | 2648 |
| 级别 | 4 | 4 | 3 | 3 | 2 | 2 | 1 | 1 | 0 | 0 | 0 |

级别 5 需 d < 0.6（−31 步起），级别 6 需 d < 0.15：分级打开时下限放宽为 0.12 / 720（§8.6 P2-5），−33 步约 0.197（级别 5），−35 步约 0.149（级别 6）。实现后用纯函数核对此表并在用例中引用常量，不手写数值。

### 13.1 单元（`tests/unit/worldline-layout.test.ts`）

| ID | 内容 |
|---|---|
| TZ-01 | `tableCrowding(null, k)` = Infinity；`(100, 0.5)` = 50 |
| TZ-02 | 无 `plan`、无 `gapMax`、无 `stretchChildren`：`zoomView(24)` 与 F885 的 `tableLayout` 输出（除新增字段 `point:false, zoom:1, width`）与改动前逐字段相同（改动前快照写入测试） |
| TZ-03 | `plan.points` 含叶子：高 18、`point:true`、`head = top + 9`、`zoom 1`；含父事件：单张、无 group |
| TZ-04 | `plan.hidden` 含根：其与子孙不在 cards/groups；相邻根拉伸按剩余根；父事件子事件全隐藏 → `stacked:true`、不进 groups；无时间的子事件保留（排最后、不拉伸） |
| TZ-05 | `scale 0.75`：收起卡 25.5、两行 39、层叠 (40+8)×0.75 = 36、分组头 27、头偏移 ×0.75（13.5 / 12.75）；展开卡不乘；`width` 为未缩放宽度 |
| TZ-06 | `tableZoomBounds(tree, adapter, { levels: true })`：years 历 gap 1 → min 0.12；有月历 zoomView → min = 0.12/720；不传参数与改动前相同（RL-03 不改） |
| TZ-08 | `gapMax` 选项：Δt·k = 500 时 240（默认）/ 500（gapMax 1200）；`gapFor(d)` = clamp(240·d/160, 240, 1200) |
| TZ-09 | `stretchChildren`：同家族相邻子块起点差 ≥ min(gapMax, Δt·k)；第一个子块紧跟分组头；不给选项时 RL-02 的 124px 不变 |
| TZ-07/10 | `tableAutoOpenFits(closed, open, range, gap)`：比较收起与展开布局的块 top；根之间、家族内子块之间、分组底与下一根；差 1px 为 false；KEEP 12 回差；范围外不参与；分组头不展开 |
| TZ-11 | `projectAnchor`：单卡；插值 f=0.5 在两 head 中点；跨段退回单卡；a 缺失按时间回退；截断到 `[0, max(0, maxScroll)]` |

### 13.2 浏览器（新文件 `tests/browser/planning-worldline-table-zoom.test.ts`，`zoomLevels: true`，主夹具 zoomView(24)，虚拟化 / 性能用 F885）

| ID | 内容 |
|---|---|
| TZB-01 | 普通滚轮只滚动（`scrollTop` 变、缩放标签不变）；Ctrl + 滚轮逐步缩小：−2 步 `data-card-zoom` < 1 且 一般为 `[data-event-point]`；−18 步父事件层叠；−20 步 一般 不在 DOM；−33 步 重要 为时间点；−35 步只剩 关键 卡片 |
| TZB-02 | 回差：从 −8（级别 2）放大到 −7 / −6 仍有时间点（d 15.0 / 17.3 < 46？按纯函数核对），越过 46 后时间点消失 |
| TZB-03 | 级别 ≥ 3 点层叠卡折叠钮：该家族展开，只影响事件表；`foldedEvents`、事件目录、时间线不变；退到级别 < 3 后本地展开集清空 |
| TZB-04 | 时间点单击：400 ms 后为展开卡，`openCards` 含它，主选中为它，`selection` 不变；双击：进入编辑一次 |
| TZB-05 | 状态行“N 个一般事件显示为时间点 · 显示为卡片”；点按钮后时间点变卡片；TZB-05b 时间线与事件表同级同计数切换视图，提示立即为本视图的 |
| TZB-06 | `zoomView(24, { leavesOnly: true })` 放大到 +30 步：视图内卡片 `aria-expanded=true`，`openCards` 不变，相邻卡片 top 与收起时相同（±0.5）；TZB-06b 单击一张 → 260 ms 后收起、`openCards` 不变，双击进入编辑；缩小到级别 1 再放大回来，它重新展开；TZB-06c 家族：r2 的子事件展开、分组头保持收起、兄弟卡 top 不变 |
| TZB-07 | 同刻两个事件在视图内：放大到上限不自动展开 |
| TZB-08 | 对齐模式：时间点中线、缩小卡头与圆点 ±0.5px；相邻标签不重叠 |
| TZB-09 | 缩放一步 PlanningWorkspace 渲染 1 次（与改动前相同）；展开卡 Markdown 正文节点引用不变；作品版本不变 |
| TZB-10 | 分级关闭（夹具默认）：现有事件表用例文件全部不改即通过（回归） |
| TZB-11 | 级别 1–3：分组头宽 = 框宽、左 0；层叠卡与框同宽；每张收起卡实际高 = 布局高 ±1，含两行卡 |
| TZB-12 | d 150 → 400 逐步放大：中位根间距单调不减，相邻两步比 ≤ 1.15 |
| TZB-13 | (a) 停在边界 1 s 内 `aria-expanded` 变化 ≤ 1 次；(b) 边界处 10 步 Ctrl + 滚轮（间隔 50 ms），最后一步后 1 s 内变化 ≤ 2 次并稳定；(c) 程序恢复滚动后 1 s 内无变化；无 “Maximum update depth”；非虚拟与 F885 各一次 |
| TZB-14 | 指针在一般卡上从级别 3 缩小到 4：指针处轨道时间变化不超过一个相邻根；级别 0 指针在相距 > 600px 的两卡之间缩放一步：时间变化 ≤ 两卡时间差 5% |
| TZB-15 | F885 级别 6：事件目录定位一个隐藏的一般事件 → 显示、滚入、闪烁；搜索命中同样；级别 0 定位后自动展开时该卡屏幕位置变化 ≤ 2px |
| TZB-16 | 隐藏事件无圆点 / 标签 / 引线；等距模式 `breaks` 与“相隔”按过滤后的根 |
| TZB-17 | 待定位块在级别 ≥ 2 不变时间点、不隐藏，不计入提示 |
| TZB-18 | 工具栏 − / + / 复位改变级别（每步 ln 1.25），复位回到 fit 对应级别 |
| TZB-19 | F885 分级打开：每步滚轮渲染 < 100 ms（含跨级与级别 0 两份布局） |

### 13.3 回归与真实目标

- 全部 `tests/browser/planning-*.test.ts` 与 `npm test`，与 docs/599 提交按用例名对比（HEAD 工作树链接 `src/generated`）。
- 真实目标：构建版、隔离根 `worldline-ui-599`（LOTM-587-wg-r1，无模型）：复位读级别；Ctrl + 滚轮逐步缩到下限再放大到上限，每步记录级别、卡片 / 时间点 / 层叠 / 隐藏数、`data-card-zoom`、自动展开数、对齐偏差、作品版本，并截图每一级；再在级别 0 滚动若干屏记录自动展开切换次数。证据 `~/shakeink-test-roots/worldline-ui-583-evidence/600/`，台账 `WL-600`。

## 14 测试用例修订 1（按 `docs/600-worldline-table-zoom-test-review.md`，替换 §13 中冲突部分）

### 14.1 可观察量与夹具

- `[data-event-table]` 输出 `data-zoom-level`（0–6）与 `data-crowding`（d，保留 3 位小数）。浏览器用例一律按这两个属性判定级别 / d（`expect.poll` 等待），不按步数推算；§13 步数表作废，只作参考。
- `tests/helpers/worldline-zoom.ts` 导出 `TABLE_STEP = Math.log(1.15)` 与 `stepsTo(target, fitD)`（`ceil(ln(target / fitD) / TABLE_STEP)`），用例写 `stepsTo(ZOOM_HIDE_KEY, 40)` 一类表达式。
- `zoomView` 新选项：`sameTime: [i, j]`（r_j 时间设为 r_i，二者为叶子）、`pending: n`（n 个一般、无时间根）、`farRoot: true`（末尾加一个远在 50 年后的根，产生断点）、`fact: { [i]: string }`（给某根加正文以控制估算展开高度）。
- 纯函数（新，`worldline-layout.ts`）：`isProgrammaticScroll(written, current)`、`decideAutoOpen({ on, latched, fits, input }) → { on, latched }`（`input` = 是否刚有用户输入）。闩锁与程序写入的规则在单元层断言，浏览器只测组合结果。

### 14.2 单元新增 / 修改

| ID | 内容 |
|---|---|
| TZ-02 | 先在改代码前生成快照（`zoomView(24)`、F885 的 `tableLayout`，去掉新增字段）并在 HEAD 通过，再实现 |
| TZ-04+ | 子事件全隐藏 → 层叠；无时间子事件保留 |
| TZ-09 | 另造家族（子事件相隔 240 h、k = 1、`gapMax` 1200）：子块起点差 = 240；不给 `stretchChildren` 时 RL-02 不变 |
| TZ-07/10+ | 视图内无块 → null；家族跨度大于下一根间隔 → false；待定位块不参与；分组头不展开 |
| TZ-11+ | `maxScroll` 小于目标 → 截断；`maxScroll` 为负 → 0；b 在待定位段 → 单卡 a |
| TZ-12 | `zoomLevel` 回差边界：prev 2 时 d 40 / 45.9 → 2、46.1 → 1；prev 3 时 11.4 → 3、11.6 → 2；从 0 进入 40 → 1 |
| TZ-13 | `isProgrammaticScroll`：written null → false；差 0 / 1 → true；差 2 → false |
| TZ-14 | `decideAutoOpen`：保持失败 → `{ on:false, latched:true }`；latched 且 fits 且无输入 → 仍 false；latched 且有输入且 fits → `{ on:true, latched:false }`；fits 为 null → 不变 |

### 14.3 浏览器修改

| ID | 修改 |
|---|---|
| TZB-01 | 按 `data-zoom-level` 逐级：级别 1 `data-card-zoom` < 1；2 一般为时间点；3 父事件层叠；4 一般不在 DOM；5 重要为时间点；6 只剩 7 张关键卡（r4 r5 r11 r14 r17 r20 r23）。分级打开时缩小按钮在级别 6 之后才禁用；分级关闭时在 `tableZoomBounds` 原下限禁用 |
| TZB-02 | 从级别 2 放大：`data-crowding` < 46 时时间点仍在，首次 ≥ 46 后消失；再缩小一步（40 ≤ d < 46）不回来。从级别 3 放大：d < 11.5 仍层叠，≥ 11.5 子事件出现 |
| TZB-04 | 单击时间点：400 ms 后仍展开、`posts` 为 0、切到时间线该卡展开（读 `openCards`）、主选中；双击（第二次按下在日期文字处并按住移动 20px）：进入编辑一次、无时间拖动预览、无保存；F885 级别 2 单击后卡片在指针下 ±2px |
| TZB-05b | 时间线级别 2（14 个时间点）、事件表级别 3（8 个）：切换后提示立即为 8，切回 14；事件表级别 0 时切过去提示消失、切回时间线提示恢复（先确认标签切换为卸载） |
| TZB-06 | 夹具 `leavesOnly`；放大到首个 `data-zoom-level=0`：等 160 ms + 2 帧后视图内卡片全部展开；相邻卡 `top(n+1) − top(n) = min(gapFor(d), Δt·k)` ±0.5；GAP / KEEP 边界：`fact` 使某根估算高落在 [可用 − 24, 可用 − 12)，该处不进入，已进入状态下滚到该处保持 |
| TZB-06b | 单击自动展开卡：200 ms 时仍展开、`expect.poll` 收起；主选中为它；`openCards` 不变。双击：编辑 → 取消 → 仍展开。负向：手动展开（在 `openCards`）的卡单击正常收起并移出 `openCards` |
| TZB-06c | zoomView 放大到 `data-crowding` ≥ 2600（+30 步左右）：r2 子事件展开且间距由时间决定、分组头收起、兄弟卡 top 不变 |
| TZB-07 | `sameTime: [12, 13]`、`leavesOnly`：放大到上限，视图在 r12 处展开数 0；滚到 r2 一带全部展开（正向对照） |
| TZB-10 | 改名“分级关闭的现有用例不改”；ZB-02 改为 `zoomLevels: false`（需求导致），ZB-05 / 08 / 37 / 40 只改注释 |
| TZB-12 | 正向：d ≥ 300 时根间距 = `min(d, gapFor(d))` > 240，d 400 时 400；对照：分级关闭放大到同 k，根间距 240 |
| TZB-13 | 夹具 `sameTime`；边界 = 视图底边刚越过 r12 顶的 scrollTop（布局计算）。(a) 设为边界后 1 s 内变化 ≤ 1；(b) 30 ms 间隔 10 步 Ctrl + 滚轮（记录实际间隔，有 > 160 ms 的则跳过并说明），停手后 1 s 内 ≤ 2 次并稳定；(d) 边界附近 30 ms 间隔连续滚动 1 s 期间变化 0 次，停手后 ≤ 2 次；无 “Maximum update depth”；非虚拟与 F885 各一次。计数用 MutationObserver，全部真实等待（不用 Playwright 时钟） |
| TZB-13e | 闩锁清除：构造退出后，事件目录定位一张有空间处的卡 → 重新进入（跨 PlanningWorkspace 的定位不算程序写入） |
| TZB-14 | 指针放在级别 3 的一般时间点 r9：缩到级别 4（r9 隐藏）后指针处轨道时间变化 ≤ 一个相邻根（回退到 r8）；级别 0 间距 > 600px（d ≥ 400，分级打开、`sameTime` 不在视图内）指针在两卡之间缩放一步，时间变化 ≤ 5% |
| TZB-15 | F885 按 `data-zoom-level=6`；定位隐藏一般事件 → 显示、滚入、闪烁；级别 0 定位 / 搜索“下一个”后自动展开，目标卡位置变化 ≤ 2px；400 ms 内有滚轮锚点时定位，以定位目标为锚 |
| TZB-16 | `farRoot` + 隐藏一般根在断点一侧：过滤前后 `breaks` 不同；隐藏事件无圆点 / 标签 / 引线 |
| TZB-17 | `pending: 2`：级别 ≥ 2 待定位卡片不变时间点、不隐藏，提示计数不含 |
| TZB-18 | 工具栏 − 一次出现时间点（级别 2），+ 到 `data-zoom-level=0`，复位后 `data-crowding` = 40（级别按回差，从下方为 2、从上方为 1，两者都断言） |
| TZB-11 | 级别 1（`data-card-zoom` 0.85 附近，中间值）、2、3 各一次；两行卡用 470 宽确认存在 |
| TZB-08 | 级别 1 / 2 / 3 各测对齐 ±0.5px；级别 2 相邻标签最小间距 ≥ 18 |
| TZB-09 | `renders` 计数（ZB-19 做法）每 wheel 事件 1 次，带正向对照 |
| TZB-19 | profiling 构建、≥ 20 样本 p95 < 100 ms，跨级步与级别 0 步分别统计；允许单独复跑（负载） |
| TZB-20 | 负向：级别 2 双击收起卡进入编辑，编辑卡无 `[data-card-zoom]`，类型浮层在滚动区内；级别 0 前用户折叠 r2，放大后 r2 保持层叠不展开 |
| TZB-21 | 表格时间点悬停：对应轨道圆点 / 标签高亮，无时间线专有元素（标尺胶囊）；时间点不弹角色简介 |

### 14.4 真实目标

`worldline-ui-599` 已存在（docs/599 由 worldline-ui-583 复制，已移走租约收据；新增 3 个虚构角色）。驱动 `600/table-zoom-600.mjs`：复位读 `data-zoom-level`（预期 3）；逐步缩到下限、放大到上限，每步记录 `data-zoom-level`、`data-crowding`、卡片 / 时间点 / 层叠 / 隐藏 / 自动展开数、`data-card-zoom`、对齐偏差、作品版本，并截图每一级；级别 0 下滚动 5 屏，记录自动展开切换次数；记录进入级别 0 所需步数。

## 15 实施结果与真实目标修正

- §1 的真实数据估算（复位 d ≈ 5.58、级别 3）用全跨度算 fit；应用按主时间段算 fit（`tableZoomBounds`），真实目标实测复位 d = 21.657、级别 2（一般为时间点，收起卡 0.75）。下限 d 0.12（级别 6），从下限放大 53 步进入级别 0。
- 代码审核 r1（`docs/600-worldline-table-zoom-code-review.md`）P1 选择器、P2-1 工具栏输入、P2-2 待定位不自动展开、P2-3 第二次单击执行第一张的收起均已修复，各有去掉修复即失败的用例（TZB-11、06e、17b、06d）；另修两处：锚点卡被隐藏时按时间回退（TZB-14 去掉回退即失败）、自动展开判定只看展开布局内的相对位置（视图上方的高卡不再阻止视图内展开，TZ-07/10 增例）。
- 工具栏“复位”在窄工具栏（`.hideNarrow1`）下隐藏，真实目标 2400 宽、面板约 800px 时不可见，驱动改用 − 按钮回到复位拥挤度并记录。
