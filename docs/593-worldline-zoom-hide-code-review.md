# 593 · 世界线时间线缩小后按重要度隐藏事件 代码独立审核

审核对象：工作区未提交改动（`git diff`）中的 `src/lib/planning/worldline-layout.ts`、`src/lib/planning/worldline-viewport.ts`、`src/components/content/planning/worldline/EventTimeline.tsx`、`tests/unit/worldline-layout.test.ts`、`tests/browser/planning-worldline-card-zoom.test.ts`。对照 `docs/593-worldline-zoom-hide-plan.md`（含 §6 修订 1）、`docs/593-worldline-zoom-hide-plan-review.md`、`docs/592-worldline-card-zoom-stack-code-review.md`。

核对方式：读 diff 和相关源码；Node v24.18.0 下运行 `node --import tsx --test tests/unit/worldline-layout.test.ts`（91 条全部通过）和 `npx tsc --noEmit`（退出码 0）；在 `/tmp` 写临时脚本调用 `zoomPlan` 和 `fitDenseTimelineWindow` 核对边界情况，脚本已删除。按要求没有运行浏览器用例，也没有改动源码和测试。

## 结论

没有 P0。实现与方案 §1–§2 及修订 1 一致，docs/592 的级别 0–3 行为没有变化。有 1 条 P1，属于测试证明力问题：ZB-32 很可能在去掉锚点兜底代码后仍然通过，所以修订 1 P1-4 的修复目前没有证据。另有若干 P2，都不阻塞。补上 ZB-32 的反证（或改用能区分有无兜底的夹具）后可以进入全量验收。

## 已核对、没有问题

- **级别与门槛**：`ZOOM_STEPS` 有 6 个阈值，`zoomLevel` 的写法不变，回差对 0.6/0.15 同样生效（ZP-06）。`zoomBars`（`worldline-layout.ts:1863-1867`）与方案表 1.2 及 `hide = min(·, max)`、`pointClass` 公式一致；`max = 1`/`2` 的封顶由 ZP-17 覆盖。
- **`walk` 顺序**（`worldline-layout.ts:1936-1944`）：依次判断隐藏、时间点、`unfolded`、自动折叠、用户折叠，`hidden` 只记最上层节点。卡片一定是显示的：`isCard` 为真时，要么重要度 ≥ `bar` ≥ `hide`，要么是 kept/opened，所以不会出现“隐藏节点被判为卡片”。`showAll` 时 `bar = hide`，规则一致。级别 0–3 时 `hide = 0`，`if (hide && …)` 不生效；`showAll` 时 `bar = 0`，与 592 相同。
- **展开的父事件**：`walk(k, true)` 只传给直接子事件，更深的子孙照常判断隐藏，符合修订 1 P1-3 (a)。父事件自己先判隐藏，所以隐藏的父事件即使在 `unfolded` 中也不会画出。
- **kept/opened**：`keepCards` 包含 selection、selected、hitId、open（含 editing），这些事件和它们的严格祖先都会显示。选中的父事件自己仍然折叠，保持 592 P1-2 的修复。
- **集合沿用与重排**：`hidden` 与 `points`、`autoFolded` 一样，内容相同时沿用 `prev`（ZP-13）。`plan.hidden` 已加入 `inputs`（`EventTimeline.tsx:283`）并传给 `timelineStep`/`buildFamilies`。`buildFamilies` 过滤隐藏的根和子事件，`stackedOf` 只看 `n.children.length`，所以子事件全部隐藏的父事件会画成层叠卡，与方案一致。ZB-08 在级别 6 定位 `r8c0`：`autoFolded` 和 `points` 都不变，只有 `hidden` 变化，这正好证明了 `plan.hidden` 必须作为 relayout 输入。
- **`useMemo` 与 `prevPlan`**（`EventTimeline.tsx:194-198`）：依赖项没有 `maxImportance`，但 `zoomPlan` 自己从 `tree` 计算最大值，`tree` 已在依赖中，所以结果等价。`prevPlan.current` 只用于集合沿用，渲染中只读不写，仍在 layout effect 中提交。被丢弃的渲染不会留下状态（StrictMode 下 memo 函数执行两次也无害）。平移帧时 tree、level、scale、keepCards、unfolded、showAll、folded 都不变，memo 命中。级别 ≥ 2 时 scale 固定为 0.75，同一级别内的缩放帧也命中 memo，只有级别 1 每 0.05 步重算一次。
- **`showAll` 记录类别**：生效条件 `pointClass > 0 && showAllRaw === pointClass` 保证了类别切换的那一帧不会套用旧值，layout effect 再把它清零。layout effect 在绘制前同步执行，用户无法在两者之间点击。级别 0–1 时 `pointClass = 0`，会清零，与 592 的“级别 < 2 复位”相同。
- **锚点兜底的计算**（`EventTimeline.tsx:455-466`）：元素的屏幕 x 为 `r.left + PAD + translateX + e.left`，与 `.plane` 的 `translate(translateX + PAD, view.y)` 一致（`.plane` 定位在 `left: 0`，`.lane` 没有内边距）；屏幕 y 为 `r.top + view.y + e.top`，正确。新的 y 使 `best.top` 落在 `py − 6`。候选只取 `card`/`point`，排除了 `lane` 项。x 距离对重叠的元素取 0，同距离时比较 y，符合修订 1。兜底只在锚点缺失时遍历一次 `step.elements`，不在平移路径上。
- **改名**：`src`、`tests` 中已经没有 `ZoomNote.key`、`ZOOM_KEY`、`一般和重要`、`17 个`、`0.3, 2.4` 的残留。`createZoomNoteStore` 的相等判断已改为比较 `important`。
- **其他路径**：首次居中、空视图判断、框选都只读 `step.elements`，不会包含隐藏的事件；小地图、事件目录、事件表不读 `plan`。PlanningWorkspace 的渲染只经过 note store，ZB-19 已把缩放范围扩到全部 7 级。

## P1

### 1. ZB-32 很可能证明不了锚点兜底（`tests/browser/planning-worldline-card-zoom.test.ts:645-663`）

修订 1 P1-4 要防的情况是：锚点被隐藏后不做纵向跟随，画布高度缩小，`view.y` 停在画布以下，lane 变空。ZB-32 用的是 `zoomView(24)`，只有 24 个根，起点是 `zoomTo` 之后的默认 `view.y`（首次居中时，这么小的画布整体都在 lane 内）。缩小后即使 y 完全不动，剩下的重要/关键卡片多半仍在 lane 内，所以每一步的 `[data-empty-view]` 为 0、`inLane()` 为真都可能与兜底无关。这一点是推断，需要用浏览器验证。

建议：临时把 `EventTimeline.tsx:456-466` 的 `else` 分支注释掉，再跑 ZB-32。如果仍然通过，就要加强用例，任选其一：

- (a) 先把画布纵向滚到靠下（例如 `zoomView(60)` 或 F885，锚点选深处一行的一般卡片），让隐藏后的画布顶部明显高于原来的 y；
- (b) 直接断言兜底的结果：缩放后与指针 x 最近的画出事件的顶边在 `py − 6 ± 1` 处。

## P2

### 2. 展开父事件的子事件画成时间点，但没有提示，“显示为卡片”也不起作用（`worldline-layout.ts:1938-1940`、`EventTimeline.tsx:189-190, 299`）

`pointClass` 只由级别和 `maxImportance` 决定，不考虑 `walk(k, true)` 画出的子事件。用临时脚本在 zTree 上核对的结果如下：

- 级别 4，`unfolded = {p}`：`points = [p2]`，`pointClass = 0`，状态行没有提示，无法“显示为卡片”。
- 级别 6，`unfolded = {p}`：`points = [p1, p2]`，`pointClass = 0`，同样没有提示（ZP-21 的情形）。
- 级别 5，同时开启 `showAll` 和 `unfolded = {p}`：`points = [p2]` 仍是时间点，但提示文字是“重要事件已显示为卡片”。

`unfoldedRaw` 在级别 3–6 之间一直保留。用户在级别 3 展开一个关键父事件（例如 `zoomView` 的 `r4`），再缩到级别 6，它的一般子事件会以时间点出现，H3 要求的“只剩关键卡片”因此不成立。这是用户主动操作的结果，可以接受。但提示和画面不一致，方案也没有写到。建议在方案中记为已知行为；或者对 free 子事件在 `showAll` 时用 `bar = 0`，并让提示按 `points.size` 显示（类别取 `max(1, pointClass)`）。

### 3. ZB-24 可能一次滚轮都不滚，也没有下限（`planning-worldline-card-zoom.test.ts:517-522`）

循环在 `d < 39` 时立即退出。按 `fitDenseTimelineWindow` 计算，`zoomView(24)` 首次打开时，plot 宽 400/500/600 对应的 d 为 2.6/6.7/10.9。双面板时每个面板较窄，d 多半一开始就小于 39，所以“缩小的面板”实际没有缩小，用例只是在检查初始状态。反过来，如果面板更窄，d < 2.5 进入级别 4，就没有提示，用例会失败。建议循环后断言 `2.5 × 1.15 ≤ d < 39`，或者在面板内复用 `zoomTo` 的双向逼近。

### 4. ZB-21 的“`n1` 不在画布”可能因为纵向裁剪而成立（`:533`）

画布只渲染 `vband` 内的元素（`EventTimeline.tsx:711`）。F885 在级别 4 有约 257 张根卡片，`n1` 不在 DOM 里也可能是因为它所在的行在 lane 视野之外。建议改成断言所有画出的根卡片的 `data-importance` 都 ≥ 2（或是关键事件的祖先），或者加一个正向对照：级别 ≤ 3 时 `n1` 存在。

### 5. 其他用例细节

- ZB-31（`:639`）用 `[data-event-id^="r2c"]` 计数为 3，没有区分卡片和时间点，而用例名写的是“children as points”。建议改用 `[data-event-point][data-event-id^="r2c"]`。
- ZB-19 中“显示为卡片”两次点击的渲染次数没有被断言：`reset` 之后紧接着定位，而定位本身会渲染 PlanningWorkspace，计数被覆盖。这个问题 592 时就存在，但用例名仍声称覆盖了这两次点击。建议在两次点击后立即断言 0。
- ZB-30 只比较不读 `plan` 的三个计数，作为回归保护可以保留，但它几乎不可能失败。
- ZP-20 没有覆盖方案 4.1 中“`timelineStep` 中 hidden 改变时重排”这一项。这项依赖已由 ZB-08 间接证明（见上文），可以在方案或台账中注明，不必补用例。

### 6. 重复计算与未使用的字段

`zoomPlan` 和 `EventTimeline.tsx:188` 各自遍历一次 `tree.byId` 求最大重要度，而 `ZoomPlan.pointClass`（`worldline-layout.ts:1872, 1949`）在组件中没有被读取：组件用的是自己算出的 `pointClass`。两份计算的结果一致，开销是 O(n) 且只在 memo 重算时发生。建议二选一：让组件读 `plan.pointClass`，或者给 `zoomPlan` 传入 `maxImportance`，删掉另一份。

### 7. 方案已接受的行为，提醒一次

- 增量重排时，重新隐藏的根会以 `built: false` 的障碍物留在原位（`worldline-layout.ts:1494`），在下次缩放前留下空洞。修订 1 已把它记为预期行为。
- 锚点为 null（指针在空白处）时仍然不做纵向跟随，平移到没有关键事件的时期会出现“视图内没有事件”，可以通过复位恢复。

## P3

- `planning-worldline-card-zoom.test.ts:10` 的头注释仍写“docs/592 ZB-01 … ZB-24”，现在用例已经到 ZB-33。
- ZB-20 的名称写“under 16ms”，断言却是 p95 < 20ms（592 第 2 轮 P3 遗留）。
