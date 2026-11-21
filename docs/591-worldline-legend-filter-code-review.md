# 591 · 世界线图例筛选 代码独立审核

审核对象：工作区未提交的 591 改动（`worldline-layout.ts`、`PlanningWorkspace.tsx`、`WorldlineToolbar.tsx`、`EventTimeline.tsx`、`worldline.module.css` 及三份测试）。忽略同一工作区的 589/590 导入改动。行号以当前工作区为准。

已运行：`tests/unit/worldline-layout.test.ts` 69/69 通过；`planning-worldline-workspace`、`planning-worldline-table` 中 `LF-B*`、`WU-33`、`WU-34b` 共 10 个用例通过（Node 24）。未重跑全部 151 个浏览器用例。

结论：主体正确。`filterEvents` 带环保护，时间仍按完整 `data` 解析（LF-05 已证明）；视图树、搜索、缩放基准、待定位/延续/复位都已改用筛选后的数据；编辑中被筛掉时兜底编辑器会出现。剩下的问题是：多选菜单显示的数量和实际操作的数量不一致（P1）；方案审核 P1-4 只解决了一半，时期下拉和“定位子事件”仍会定位到隐藏事件，结果整组筛选被清空；部分用例证明力不足。没有发现 Hook 顺序或闭包过期导致的错误。

## P1：应修复

### 1. 卡片菜单“删除所选 N / 引用所选 N”的 N 包含隐藏事件，实际只操作可见事件

`EventTimeline` 收到的是完整的 `selection`（`PlanningWorkspace.tsx:2860`），卡片的 `selectionSize` 按它计算（`EventTimeline.tsx:611`），菜单文字来自 `EventCard.tsx:221`、`:228`。而 `deleteSelection`/`quoteSelection` 用的是 `shownSelection`（`PlanningWorkspace.tsx:2322`、`:2334`）。

例子：选中 3 个事件，隐藏其中 1 个的类型。菜单显示“删除所选 3 个事件”，确认框和实际删除的是 2 个。如果只剩 1 个可见，菜单仍是“删除所选 2 个事件”，点击后弹出的却是单个事件的删除确认（`:2326`）。拖动标题时的 `selectionSize` 角标同样偏大。

建议：把 `selection={shownSelection}` 传给 `EventTimeline`。框选的追加逻辑读的是 `selectionRef.current`（完整选择），不受影响；隐藏事件不在视图树里，本来也不会被高亮。这样 Delete 键的判断 `selection.size > 0`（`EventTimeline.tsx:451`）也会和实际删除的对象一致。目前 Delete 键能通过这个判断，再由 `deleteSelection` 中的 `!ids.length` 返回，结果正确，但所选全部隐藏时它仍会 `preventDefault` 并吞掉按键。

### 2. 时期下拉和“定位子事件”仍按全部事件选目标，会清空整个筛选（方案审核 P1-4 只解决一半）

- 时期下拉（`:2549`）：`inside` 来自 `worldAllEvents`/`wTree`。在事件表中，如果 `inside[0]` 是隐藏事件，`locateWorldEvent` → `revealEvent` 会清空全部类型和重要度筛选。用户只是选了一个时期，筛选却没了。选项中的“N 件”（`:2560`）和提示“· N 件事件”（`:2552`）也包含隐藏事件。
- “定位子事件”（`:2349`）：取的是 `wTree.byId.get(e.id)?.children[0]`。父事件可见、第一个子事件类型被隐藏时，同样会清空筛选。按钮所在卡片的 `▸ N` 来自视图树，这里取的却是完整树里的子事件，两者不一致。

方案审核的建议是“时期下拉和定位子事件改用 `wViewTree`”，实现里没有做。建议这两处改为从 `wViewTree` 取事件（`inside` 用 `wViewEvents`，子事件用 `wViewTree.byId.get(e.id)?.children[0]`）。只有深链接这类“指定了某个事件”的入口才应该走 `revealEvent`。

## P2：建议修复

### 3. 新增用例没有覆盖方案审核要求的几条关键路径

- LF-B5（`planning-worldline-workspace.test.ts:411`）只检查“已选 N”计数。方案审核测试第 1 条要求的“框选后隐藏一类，按 Delete 或整体拖动，只作用于可见事件”没有用例。这是 P0-1 的核心，`deleteSelection`/`drag` 改用 `shownSelection` 目前没有测试保护。建议断言删除对话框中的数量，或 `posts` 中只包含可见事件的 id；整体拖动后隐藏事件的时间不变。
- LF-B6（`:430`）的正则 `^(1 \/ \d+|无结果)$` 两种结果都接受，也没有先确认筛选后的命中数小于筛选前的序号。即使去掉 `useEffect(() => setHitIndex(0))`，只要命中数仍大于 3，这个用例也会通过。建议先断言“3 / M”，再选一个能把命中数降到 3 以下的筛选，并断言显示“1 / K”且 K < 3。
- LF-B7（`:435`）只覆盖“新建事件后保存到隐藏类型”。没有覆盖以下情况：编辑中隐藏该类型时兜底编辑器出现（`PlanningWorkspace.tsx:2746`）；菜单“编辑”触发 `revealEvent`；深链接定位到隐藏事件。
- WU-33 新增的断言（`planning-worldline-table.test.ts:51`）实际上什么也没检查。`[data-card-tag]` 只在卡片展开时渲染（`EventCard.tsx:239`），收起的卡片没有这个元素，`allTextContents()` 返回空数组。再加上 `.catch(() => [])`，这条断言永远通过。建议改为检查卡片根节点上的类型属性，或者先展开卡片。
- LF-B1 只在对齐模式下用“前 20 个间距 < 200px”判断。方案审核第 8 条要求在等距模式下断言间距与筛选前相同，没有做。
- 没有用例覆盖：待定位、延续计数和复位范围跟随筛选（方案审核第 5 条）；图例 `role="group"` 的组名（审核 P3）；时期下拉（见第 2 条）。

### 4. `revealEvent` 清空全部筛选，范围过大

`showAllTypes`（`:2407`）同时清空所有类型和重要度。用户隐藏了 5 类，只因为保存了一个属于其中 1 类的事件，就要重新设置另外 4 类。方案审核的建议是“只重新显示该事件的类型和重要度”。由于 D1 规则，还要包括它祖先的类型和重要度。按 `parent` 链收集这些类型和重要度，再从两个集合中删除即可，代价很小。提示文字也要相应改为“已显示「冲突」类事件……”。如果有意保持“全部显示”，请在方案中写明。

### 5. 筛选后事件表和事件目录没有空状态

LF-B8 只覆盖时间线（`EventTimeline.tsx:624`）。在事件表模式下全部筛掉后，`EventTable` 和 `EventTreeNav` 都是空白，只有状态栏里有一个“显示全部”。方案审核第 6 条要求空状态带恢复入口。建议事件表也显示同样的 `emptyText`。

### 6. 没有真实应用验证和耗时记录

方案 §验证（`591-...-plan.md:74`）要求在真实应用中截图。方案审核要求用 `~/shakeink-test-roots/runtime` 中的《诡秘之主》（885 个事件）记录从点击图例到重新排版完成的耗时，对照 docs/577 §6 的 < 100ms 目标。本次改动中没有这些证据，台账也不能标为真实通过。每次点击都会执行 `filterEvents`（O(n·深度)，有缓存）、`eventTree` 和 `tableZoomBounds`，然后整体重新打包。此外，`counts` 在每次渲染时按 7 个类型各扫一遍事件（`:2632`），这是旧代码，但筛选会增加渲染次数。

## P3：次要

### 7. 可访问性

- 重要度组 `.sizes` 仍然嵌套在类型组 `.legend` 里面（`WorldlineToolbar.tsx:139`、`:154`）。读屏软件会把重要度按钮读成“类型筛选”组的一部分。方案审核建议改成两个并列的组，没有做。
- `aria-live` 加在了按条件挂载的 `data-filter-count` 上（`:133`）。从无筛选切到有筛选时，这个节点和内容同时插入，多数读屏软件不会播报。第一次隐藏一类时用户得不到反馈。建议让这个 live 区域常驻，只改变其中的文字。
- `显示全部` 按钮在 live 区域内部，每次计数变化都会把按钮名称一起读出来。建议把按钮移到 live 区域外面。

### 8. 搜索序号重置晚了一帧

`useEffect(() => setHitIndex(0), [hiddenTypes, hiddenImportance])`（`PlanningWorkspace.tsx:2403`）在提交后才执行。中间有一次渲染使用旧序号，`hitId` 为 `undefined`，计数可能闪现“6 / 2”。在渲染时限制序号（`Math.min(hitIndex, wHits.length - 1)`）可以避免这一帧，也能处理删除事件后命中数变少的情况（这是旧问题）。

### 9. 小问题

- `onShowAll`（`:2642`）重复实现了 `showAllTypes`（`:2407`），建议直接复用。
- `filteredOut`（`:2408`）对每次定位都复制整个数组并重新筛选。搜索 ↑/↓ 的目标本来就在视图中，也要多算一遍。1000 个事件时耗时不到 1ms，可以接受；也可以先用 `wShownIds.has(e.id)` 判断已有且未改动的事件，提前返回。
- `worldline.module.css` 中 `.showAll` 插在两条 `.sizes button` 规则之间，建议移开。
- `WorldlineLegend` 的默认参数 `hiddenImportance = new Set()` 每次渲染都会新建一个集合，影响很小。

## 已核对、没有问题

- **Hook 顺序和暂时性死区**：`revealEvent`/`filteredOut` 是 `const` 箭头函数，声明在 `actions.current` 赋值（`:2262`）之后、`renderEventEditor` 的保存按钮之后。这些引用都在事件处理函数里，执行时同一次渲染的作用域已经初始化完毕，不会触发暂时性死区。`renderWorld`/`renderEventEditor` 在 JSX 返回阶段（`:2414` 之后）调用。`:2403` 的新 `useEffect` 之前没有条件返回，Hook 顺序固定。
- **`actions.current` 闭包**：每次渲染都重新赋值，读到的 `shownSelection`、`revealEvent` 是最新的。深链接的 effect（`:2414`）调用的是当次渲染的 `locateWorldEvent`。`revealEvent` 触发的重新渲染发生在两个 `requestAnimationFrame` 之前，卡片能被找到并滚动到位。
- **保存后的 `revealEvent(d)`**：`await put` 之后闭包中的 `worldAllEvents` 是旧数据，但 `filteredOut` 会先去掉同 id 的旧事件再放入 `d`，因此结果正确；新建事件的父链也在旧数据中。
- **`renderWorld` 中按 `eventParent` 过滤**：`eventParent` 目前只会被设为 `null`（`:405`、`:2525`、`:2688`），所以 `events` 实际是可见的根事件。父事件被隐藏时它的子事件已经被 D1 去掉，不会多算。待定位/延续只统计根事件，而事件目录的“待定位 · N”统计全部层级，这个不一致在 591 之前就存在，不属于本次改动。
- **Delete 键**：调用 `onDeleteSelection` → `deleteSelection`，后者使用 `shownSelection`，删除对象正确。计数和按键拦截的问题见第 1 条。
- **编辑中被筛掉**：兜底编辑器的条件（`:2746`）已经加上 `wFiltered && !wShownIds.has(...)`，草稿不会消失。在编辑器中把类型改成隐藏类型时，卡片仍按已保存的数据显示，保存时由 `revealEvent` 处理。
- **其他入口**：复制（与原事件同类型）、双击编辑、待定位弹层中的“编辑时间”（列表已筛选）都只作用于可见事件。
- **`filterEvents`**：没有隐藏任何项时返回同一个数组，`wViewTree` 复用 `wTree`，不会额外计算；父链有环或断开时会停止；有缓存。LF-01..06 覆盖了这些情况和时间锚点。

## 方案审核逐条对照

| 方案审核 | 状态 |
|---|---|
| P0-1 隐藏事件参与删除/引用/拖动/计数 | 已解决，但菜单数量不一致（第 1 条），且没有测试保护（第 3 条） |
| P0-2 搜索序号越界 | 已解决（晚一帧，第 8 条）；测试较弱 |
| P0-3 编辑中被筛掉、保存后消失 | 已解决（兜底编辑器 + `revealEvent`）；范围过大见第 4 条 |
| P1-4 定位入口指向隐藏事件 | 部分解决：深链接和搜索已处理；时期下拉和定位子事件未改用视图树（第 2 条） |
| P1-5 `renderWorld` 派生值 | 已解决 |
| P1-6 筛选后的空状态 | 时间线已解决；事件表和事件目录未处理（第 5 条） |
| P2-7 显示 X / 共 Y | 已解决 |
| P2-8 缩放基准、虚拟化、885 事件实测 | 缩放已改用视图树；LF-B1 的等距模式检查和实测都没有做（第 3、6 条） |
| P3 可访问性 | `role="group"` 已加；两组仍嵌套，live 区域首次不播报（第 7 条） |

## 修复记录（主代理）

| 项 | 处理 |
|---|---|
| 1 菜单数量含隐藏事件 | `EventTimeline` 改传 `shownSelection`；LF-B5 补 Backspace 只对可见事件弹出单事件删除确认 |
| 2 时期下拉、定位子事件 | 改用 `wViewEvents` / `wViewTree` |
| 3 用例无效 | WU-33 改为断言剩余卡片只有一种类型颜色；LF-B6 断言 `3 / N` → 筛选后 `1 / N`；新增 LF-B7b（编辑中隐藏、只恢复该事件类型）、LF-B9（事件表空状态）；LF-B1 补等距模式 |
| 4 `revealEvent` 清空全部 | 只恢复该事件及祖先的类型与重要度 |
| 5 事件表空白 | `EventTable` 增加 `emptyText`：“筛选后没有事件” |
| 6 真实应用 | `legend-591.mjs lf-r1`：见下 |
| 7 可访问性 | 重要度组移出类型组；live 区域常驻，“显示全部”按钮移出 |
| 8 序号闪现 | 渲染时把序号限制在命中数内 |
| 9 小问题 | `onShowAll` 复用 `showAllTypes`；CSS 规则移到末尾 |

真实应用（隔离根 worldline-ui-583，作品 LOTM-587-wg-r1，1061 个事件，构建版，无模型调用）：`~/shakeink-test-roots/worldline-ui-583-evidence/591/lf-r1`。取消“其他”后显示 717/1061，事件表高度 51598→32640px，84 ms 完成重排；再取消“一般”后 561/1061、25135px、68 ms，事件表无重要度 1 的圆点；时间线视图 37 张卡片；“显示全部”147 ms 恢复，高度与初始相同。

修复后世界线浏览器用例 153/153、`worldline-layout` 单元 69/69 通过，`tsc` 与 `npm run build` 通过。
