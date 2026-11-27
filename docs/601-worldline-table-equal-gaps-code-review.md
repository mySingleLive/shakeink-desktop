# docs/601 世界线事件表卡片原尺寸、对齐模式等间距：代码审核

审核范围：工作区未提交的 docs/601 改动（`git diff HEAD` 与未跟踪文件）：`worldline-layout.ts`（`tableLayout` 的 `equalGaps` / `widen` / `addBreak`、`RAIL_MARK_SPAN` / `RAIL_BREAK_SPAN`、`TableLayout.equal`、`alignedRailMarks` 段线端点与段首徽章、`tableAutoOpenFits` 守护）、`EventTable.tsx`（`zScale = 1`、`equal`、`layoutK`、`autoLevel`、`modeAnchor` / `recordModeAnchor`、`railBreakTight`）、`worldline.module.css`，新增 `tests/unit/worldline-table-equal-gaps.test.ts`、`tests/browser/planning-worldline-table-equal-gaps.test.ts`，以及 table-zoom / table-rail-modes / auto-open 用例的修改。依据是方案 §1–§7 与 §8 修订（冲突处以 §8 为准）和 `docs/601-worldline-table-equal-gaps-plan-review.md`。行号按审核时的工作区文件。本次只读，除本文件外没有改源码、测试和文档；探测脚本放在 `/tmp/rv601/`，不在仓库内。

## 结论

有 P1。布局部分与 §8.2 一致：`widen` 复现的换年判定与 `alignedRailMarks` 的徽章规则逐条对应（随机探测 400 个布局、1828 个徽章、748 个断档，零冲突，见下），`first` / `CARD_GAP`、分组 `top` 同步、`lastHead` / `lastAnyHead` 的取舍都对。

P1 出在 `layoutK = 0` 的副作用：对齐模式下同一级别内的 Ctrl + 滚轮不再改变 `layout`，恢复 effect 不运行，滚轮写入的 `anchor.current` 不会被消费，会一直留着。之后任何一次布局变化（展开卡片、切模式、换级别）都会用这个过时锚点把视图拉回很久以前的滚轮位置。§8.4 规定 `anchor.current` 优先于 `modeAnchor`，所以模式切换锚点也会被它盖掉（P1-1）。P2 是断档文字只按 `lastHead + 20` 定位：上一段末尾是展开卡或无时间子卡时，“相隔”文字画在那张卡的正文旁边，不在两卡之间的空隙里（P2-1）；另有 §8.6 用例缺口（P2-2）。

## 运行结果

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 通过 |
| `node --import tsx --test tests/unit/worldline-table-equal-gaps.test.ts` | 9/9 通过 |
| `node --import tsx --test --test-name-pattern "TZ-02" tests/unit/worldline-table-zoom.test.ts` | 1/1 通过（不给 `equalGaps` 时与 docs/599 快照相同） |
| 探测 `/tmp/rv601/rand.test.ts`：固定历（有年份），400 个随机树（根、子事件、跨 200 年断档、回溯子事件、无时间子事件、15% 纪元精度、50% 时间点、8% 展开、待定位），`equalGaps` 布局 + `alignedRailMarks` | 徽章 1828、断档 748、加宽的同层间距 1029；徽章与可见日期标签中线距离 < 20：0；断档文字中线与标签 < 15.5 或与徽章 < 17.5：0；无法用徽章 / 断档解释的加宽：0 |
| 探测 `/tmp/rv601/brk2.test.ts`：`a`、`b`（第 0 段）、`c`、`d`（80 年后，第 1 段），`b` 展开高 300 | 断档文字中线 82，`b` 占 40–340，`c` 顶 346：文字在 `b` 正文旁，离空隙 264px（P2-1） |

浏览器用例未运行（主代理在跑全量）；P1-1 是读代码得出的，没有浏览器复现。

## P1

### P1-1 对齐模式同级滚轮的 `anchor.current` 不被消费，之后的布局变化跳回过时位置

- `EventTable.tsx:129` `layoutK = equal ? 0 : scale`，`closedLayout`（`:159-162`）的依赖不再含 `scale`；`zoomPlan` 只在 `zLevel` 变化时重算（`:112-116`）。所以对齐模式下，同一级别内的滚轮步进不产生新 `layout`，`[layout]` 恢复 effect（`:483-503`）不运行。
- 滚轮处理仍然无条件写 `anchor.current = pa`（`:521`）。docs/600 时每一步都改 `k`，布局一定变化，这个锚点在同一次提交里就被消费并清空（`:490`）；现在它会留到下一次布局变化。`onScroll`（`:555-565`）只清 `zoomAnchor`，不清 `anchor.current`。测量回调（`:462-463`）只在展开卡高度变化时覆盖它。
- 失败场景 A（展开）：对齐模式、复位级别，指针在表格上部 Ctrl + 滚轮一步（不跨级）。再普通滚动到表格下部，单击一张卡片展开。展开改变 `open`，布局变化，恢复 effect 取到过时的 `pa`，`projectAnchor` 把 `scrollTop` 拉回最初滚轮所在的位置。用户刚点的卡片不在视图里了。
- 失败场景 B（切模式，§8.4 / Q7）：同样先滚轮一步，再滚动，再点“等距”。`:489` 的优先级是 `anchor.current ?? modeSwitch ?? …`，过时的滚轮锚点盖掉 `modeAnchor`，第一张可见卡片不再保持原位。RM-B3（`planning-worldline-table-rail-modes.test.ts:137-156`）切换前没有滚轮操作，查不到。
- 等距模式不受影响：`layoutK = scale`，每一步都换布局，锚点在同一次提交里被消费。
- 处理：滚轮处理只在布局会变时写 `anchor.current`（例如 `!live.current.layout.equal || 级别会变`），否则只写 `zoomAnchor`；或者在 `onScroll` 的用户输入分支（`:562` 之后）把 `anchor.current = null`。两者都做更稳。补用例：对齐模式滚轮一步（不跨级）→ 滚动 600px → 展开一张卡片，`scrollTop` 不回跳；同样前置后切等距，第一张可见卡片 ±1px。

## P2

### P2-1 断档文字只跟 `lastHead`，上一段末是展开卡或无时间子卡时文字不在空隙里

- `addBreak`（`worldline-layout.ts:944-956`）和 `widen`（`:871-875`）把有年份历法的断档文字中线放在 `lastHead + RAIL_BREAK_TEXT`（20）。这是 §8.2 的原文，但 Q3 的目的是“文字画在这段间距里”。`lastHead` 是卡头，不是块底：
  - 上一段末卡展开时，卡头在卡顶下 22，正文向下延伸几百 px。探测 `brk2`：文字中线 82，`b` 占 40–340，下一段首卡顶 346，“相隔 约 80 年”画在 `b` 正文的左侧时间轴列，与下一段的年份徽章（346 + 17 − 20 = 343）相距 261px。下一段首卡头 363 > 62 + 62，所以 `widen` 不加宽，真正的两卡空隙只有 6px，什么文字都没有。
  - 上一段末是家族且最后几个子块无时间：`lastHead` 停在最后一个有时间的卡头（`:907` 只在 `n.start !== null` 时更新），文字画在无时间子卡旁边。
- 对齐模式下手动展开是正常操作（不再自动展开，§5 让用户手动展开），所以这个场景不少见。EGB-03 只在复位、无展开卡时检查第一个断档，查不到。
- 处理：`from` 取 `max(lastHead, 上一块底 − CARD_HEAD)` 一类的值，使文字中线不早于上一块底 + 3，`minHead` 同样从它起算；或者文字中线取 `下一卡头 − 20 − 徽章所需`。补单元：段末卡展开、段末家族以无时间子卡结尾，两种情况下文字中线都在上一块底与下一块顶之间。

### P2-2 §8.6 用例缺口

- **EGB-05 自动展开中切换**：§8.4 / §8.6 要求“等距自动展开中切到对齐，第一张可见卡片不动”。RM-B3 用 F60、分级关，`on` 永远为假，`flipped` 分支（`EventTable.tsx:486-491`）里 `modeSwitch` 与 `flipAnchor` 的优先级没有浏览器证据。需在 `zoomView(24, { leavesOnly: true })`、`zoomLevels: true`、级别 0 自动展开后切对齐。
- **截断场景**：方案审核 P1-3 的要点是等距 `scrollTop` 大于对齐布局最大滚动时的截断。RM-B3 的 0.7 处没有断言当时的 `scrollTop` 确实超过对齐布局的 `scrollHeight − clientHeight`，所以不能证明覆盖了截断。加一条前置断言。
- **无年份历法的分段断档**：EG-03b 的标题写“a calendar without years”，但只测了待定位断档（固定历有年份）。`addBreak` 的 `mid = !adapter.hasYears`、`span = RAIL_MARK_SPAN` 分支（`worldline-layout.ts:961`）没有用例。
- **换年复现的边界**：回溯、纪元精度、段首、无时间子卡、组头与子块顺序都没有单元用例，只有 EG-07 的平铺时间点。本次随机探测覆盖了这些组合且零冲突，建议把探测的判据（徽章与可见标签中线 ≥ 20、断档文字与标签 ≥ 15.5、与徽章 ≥ 17.5）收成一条单元用例，夹具固定几种形状，避免以后改 `alignedRailMarks` 时两边规则悄悄分叉。
- **TZB-08**（`planning-worldline-table-zoom.test.ts:391-408`）：§8.6 要求去掉包层头位、加矩形不相交，未改。现在 `data-card-zoom` 不再出现，`?? 1` 让它照常通过，不算错误，但它只查标签对标签。EGB-03 在 F60 上补了矩形检查，zoomView 级别 2（时间点最密）没有徽章 / 标签矩形检查。

## P3

- **P3-1** 段内只有纪元精度或全是回溯卡时，下一段没有段首徽章，但 `addBreak` 仍要求 `RAIL_BREAK_SPAN` 62（`worldline-layout.ts:961`），这道缝比需要的 40 宽 22px。可在 `addBreak` 时预判下一段是否有 `firstYear`（与 `alignedRailMarks:1266-1273` 同规则）。
- **P3-2** 最后一段向下的段线仍伸 22px 进入待定位区（`alignedRailMarks` `nextSeg` 只看段，`:1260`）。断档文字右缘 x 144、段线 x 158，水平不相交，但“时间待定位”文字旁有一截上段的线。方案审核 P2-3 提过，§8.3 未采纳，记录在此。
- **P3-3** `.railBreakTight`（`worldline.module.css:217`）`white-space: nowrap`。窄面板 `.railBreak` 宽 120、`padding-right: 38`（`:358`），可用 82px；“相隔 约 12,345 年”11px 斜体超过 82px 时，`justify-content: flex-end` 让文字向左溢出到 x < 0，被滚动容器裁掉开头。宽面板可用 144px，没有问题。可加 `overflow: hidden; text-overflow: ellipsis` 并把全文放 `title`。
- **P3-4** TZB-11 重写后删掉了分组头类型边 `inset` 阴影的断言（原 `css.sh`），这是 docs/600 代码审核 P1-1（`:is` 选择器）的回归保护。现在分组头不再缩放，那个选择器问题不会复现，但保留一行 `boxShadow` 断言成本很低。
- **P3-5** EGB-02 的 `base` 在当前视图（已经 `zScale = 1`）读取，再与级别 3 比较，等于自己比自己；真正的保护来自 `[data-card-zoom]` 数为 0。方案审核 P3-3 要求与分级关时的同卡字号比较，未做。
- **P3-6** EGB-07 容差 1.5px，§6.2 写 ±0.5px。
- **P3-7** TZB-19 先把指针停在表格上 600 ms（`planning-worldline-table-zoom.test.ts:333-335`），把首次悬停重渲染从计时里排除。理由成立，但这也意味着“指针落到卡片上的第一步”不再计时；如果悬停重渲染本身变慢，没有用例会发现。
- **P3-8** EGB-01 对带标记的缝只断言 `≤ 40`，标记判定是“任一徽章 / 断档中线落在上一块顶与下一块底之间”，较宽松；zoomView(24) 只有 2 个徽章、无断档，带标记的缝很少。加宽量的精确值由单元 EG-03 / EG-07 保证，可以接受。

## 已核对、无问题

- **换年复现与徽章规则**：`widen`（`worldline-layout.ts:850-877`）按 `push` 顺序遍历，即 `cards` 顺序；`alignedRailMarks` 遍历的 `segments[].heads` 是 `cards` 按段、有时间过滤后的同一顺序。`back = t < 段内已见最大 t`（最大值含纪元精度卡），首个年份取第一张非回溯、非纪元卡，换年要求非回溯、非纪元、`yearText` 不同；两边逐条相同。组头先于子块 `push`，与 `cards` 顺序一致。时间点的头位用 `POINT_HEIGHT / 2`，与 `card.head` 同式。无时间子卡与待定位卡不进入判定，也不更新 `lastHead`，与 `heads` 过滤一致。随机探测零冲突。
- **`lastHead` 与 `lastAnyHead`**：换年和断档下限都用 `lastHead`（上一张有时间卡），与徽章取 `cards[i − 1].head`（同段上一张有时间卡）一致。`lastAnyHead` 只在没有任何有时间卡时兜底，根事件都有时间，实际只在异常数据里用到。
- **`widen` 不会移动已推入的卡**：每个块第一次 `push` 前调用 `widen`，只移动 `y`、本块 `start` / `record.top` 和本块分组的 `top`；父块的组头早已推入，子块下推只增大框内距离，`group.bottom` 在子块之后才写。子块被下推时组头到首子大于 4，符合 §8.2“下推只加在块顶”。
- **`first` / `CARD_GAP`**：`addBreak` 在 `equal` 时 `y += CARD_GAP` 后 `first = true`，下一块不再加 `CARD_GAP`，所以断档两侧从 6 起算再按 `minHead` 下推；EG-03 断言了同段两侧为 6、跨断档卡头距 62。
- **断档后的下一张卡是组头 / 时间点 / 待定位卡**：`widen` 用本次 `push` 的头位（组头 18、时间点 9、收起卡 17），文字按 `openBreak.mid` 放中点或 `lastHead + 20`，三种都正确（P2-1 的展开卡情况除外）。
- **`layoutK = 0` 的其他读者**：`railLevel` / 缩放标签来自 `PlanningWorkspace` 的 `tableView`（真实 `k`），对齐模式不使用 `level`，标签显示百分比；`tableCrowding(gap, scale)` 用真实 `scale`，级别照常切换；`pointerAnchor` 只读布局卡头；`decide` 在 `!autoLevel` 时直接返回；`openLayout` 只在 `autoLevel` 时构建，仍用真实 `scale`；`tableZoomBounds` 不读布局。唯一的问题是 P1-1。
- **模式锚点的记录时机**：`onScroll` 时 `live.current.layout` 是当前布局；恢复 effect 末尾的 `recordModeAnchor` 在写 `scrollTop` 之后、用新布局与新模式记录，所以连续切换不会拿到旧模式的锚点。切表格 / 时间线视图时 `EventTable` 卸载，ref 重建，没有跨视图的旧锚点。恢复后 `sync.current()` 刷新虚拟窗口。
- **`tableAutoOpenFits` 守护**：`if (open.equal) return null`（`:2174`），EG-08 断言。
- **CSS**：`.railBreak` 是 flex、`align-items: center`，行内样式给 `height: 16`，`line-height: 16px` 让文字恰好占满这一行，没有方案审核 P3-1 的 `height: 0` + `translateY` 问题。
- **既有用例改动**：TZB-06*/07/12/13*/14/17b、ZB-37/38 切到等距是 §6.3 / §8.6 的要求，切换后断言仍在原条件下执行，没有变成空检查。RM-B3 去掉“卡片位置逐项相同”是 Q7 的规则变更，替换成高低两处的往返检查。TZB-01 / TZB-11 的包层断言改为“无包层”，符合 Q1。
