# 601 · 世界线事件表：卡片原尺寸、对齐模式等间距 技术方案与测试用例

来源：用户 2026-11-24 修改要求（截图为对齐模式、复位视图，LOTM-587-wg-r1）：事件表默认缩放下事件卡片尺寸太小、字体太小；卡片之间空隙太大，应去掉无意义的空隙，卡片之间的空隙相等。基于 docs/600 提交（052627a）。

用户确认（2026-11-24）：

| 问题 | 选择 |
|---|---|
| 等间距范围 | 对齐模式在任何缩放级别都按固定间距排列（根事件与家族内子事件都一样），时间轴日期仍与卡片对齐；等距模式继续按时间拉伸；对齐模式不再自动展开 |
| 相隔行 | 保留“相隔 N 年”文字，放进正常卡片间距里（时间轴列），不额外占高度，所有卡片间距相等 |
| 卡片尺寸 | 事件表收起卡片在所有级别都保持原尺寸（不再缩到 0.75）；缩小时仍转时间点、折叠父事件、按重要度隐藏；时间线视图不变 |

## 0 原因（源码）

- 卡片小：`EventTable.tsx:111` `zScale = cardScale(d, zLevel)`，真实数据复位为级别 2（d 21.7，docs/600 r3），`cardScale` 为 0.75，收起卡以 `zoom: 0.75` 渲染（`EventTable.tsx:419`），字体 12.8 → 9.6px。
- 空隙大：`tableLayout`（`worldline-layout.ts:877`、`:896`）按时间拉伸根块与家族子块（`stretchChildren`，docs/600 §8.5），上限 `tableGapFor(d)`；截图中家族内子事件相隔数天就被拉开数百 px。分段之间的断档行 `BREAK_HEIGHT` 46px（`:890`），两侧卡片距离 52px，比段内 6px 大。

## 1 需求

| # | 内容 |
|---|---|
| Q1 | 事件表收起卡片在所有级别 `zoom` 为 1（无 `data-card-zoom` 包层）；时间点、层叠父事件、按重要度隐藏照旧（docs/600 T3–T5） |
| Q2 | 对齐模式：卡片（根块、家族子块）之间不按时间拉伸，相邻块间距恒为 `CARD_GAP`，与缩放无关 |
| Q3 | 对齐模式：分段断档、待定位断档不额外占高度：断档两侧卡片间距也是 `CARD_GAP`；断档文字（相隔 N / 时间待定位）居中画在这段间距的时间轴列 |
| Q4 | 对齐模式：断档处若下一段开头有年份徽章，徽章与断档文字同处一行会重叠，此时只画徽章，断档文字放进徽章的 `title`；无徽章时画断档文字 |
| Q5 | 对齐模式：相邻两段的时间轴竖线在断档处断开（各留至少 4px 空白），不再按 `SEGMENT_BADGE_OFFSET` 22px 伸进相邻段 |
| Q6 | 对齐模式不自动展开（`data-auto-open` 不出现）；等距模式自动展开、拉伸、`BREAK_HEIGHT` 断档照旧 |
| Q7 | 切换对齐 / 等距：视图内第一张卡片的屏幕位置不变（两模式布局不再相同，原 RM-B3“卡片位置不变”改为此规则） |
| C1 | 分级关（夹具默认）时等距模式布局与 docs/600 逐字段相同（TZ-02 快照）；时间线视图不变 |

## 2 布局（`worldline-layout.ts`）

- `TableOptions` 增 `equalGaps?: boolean`（docs/601 Q2/Q3，对齐模式传 true）：
  - 根块与子块的 `atLeast` 一律为 `-Infinity`（不拉伸；`TableBlock.stretch` 为 `-Infinity`）。
  - 断档 `{ kind, top: y, height: CARD_GAP }`，`y += CARD_GAP`，断档后第一块不再加 `CARD_GAP`（`first = true` 不变），所以断档两侧卡片间距 = `CARD_GAP`。
  - 其余（时间点、隐藏、层叠、行数、宽度）不变。
- 不给 `equalGaps` 时输出不变（TZ-02 快照，等距模式所有用例）。

## 3 对齐时间轴（`alignedRailMarks`）

- 竖线：段首向上、段尾向下的延伸 = `min(SEGMENT_BADGE_OFFSET, 与相邻段最近卡头距离 / 2 − 4)`，第一段向上、最后一段向下仍为 22（Q5）。
- 段首年份徽章：有上一段时 y = 上一段末卡头与本段首卡头的中点（与段内换年徽章同规则，距两侧日期标签各 20px）；第一段仍在 `首卡头 − 22`。
- `RailBadge` 增 `gapText?: string` 不需要：断档文字的取舍在 EventTable 渲染时决定（§4），`alignedRailMarks` 只多输出 `RailBadge.segment` 已有的段号。

## 4 `EventTable.tsx`

- `zScale = 1`（Q1）：`zoomPlan(..., 1, ...)`，`layoutPlan.scale` 为 1，`data-card-zoom` 包层不再出现。`cardScale` 不再由事件表调用（时间线照旧）。
- `const equal = railMode === "aligned"`；`closedLayout` / `openLayout` 传 `equalGaps: equal`、`stretchChildren: zoomOn && !equal`、`gapMax`（等距时）。
- `autoLevel = zoomOn && zLevel === 0 && !equal`（Q6）。切到对齐时 §11.1 的清理 effect 已会关掉自动展开、清空 `autoClosed`。
- 断档渲染（Q3/Q4）：`equal` 时 `.railBreak` 加 `.railBreakTight`（高 0、`top` = 断档中线，`transform: translateY(-50%)`，`height` 不设），文字与日期标签同右对齐；若 `marks.badges` 中有 `segment === b.to` 且 `|y − 断档中线| < 12` 的年份徽章，不画该断档文字，改写到该徽章的 `title`（`相隔 约 112 年`），徽章加 `data-gap-text`。
- 模式切换保持位置（Q7）：恢复 effect 中记 `lastLayout` / `lastMode` ref；模式变化且没有其他锚点时，用 `firstVisible(lastLayout, scrollTop)` 与它在 `lastLayout` 中的屏幕偏移作为锚点，`projectAnchor` 到新布局。

## 5 已知限制

- 对齐模式下卡片位置不再反映时间间隔，时间间隔只由日期标签、年份徽章与“相隔”文字表达（用户选择）。
- 对齐模式不自动展开；需要展开时手动展开或切到等距。

## 6 测试用例

### 6.1 单元（`tests/unit/worldline-table-equal-gaps.test.ts`，新文件）

| ID | 内容 |
|---|---|
| EG-01 | `equalGaps`：zoomView(24) 在 fit、fit×40 两个 k 下，相邻收起块（同层）`top − 上一块 bottom` 全部 = 6，与 k 无关；卡片 `top` 两个 k 下逐个相同 |
| EG-02 | `equalGaps` + `stretchChildren`：家族内子块间距仍为 6 |
| EG-03 | `equalGaps` 的断档：`height` = 6，断档上一卡底到下一卡顶 = 6；待定位断档同样 |
| EG-04 | 不给 `equalGaps`：zoomView(24)、f885 与 `tests/fixtures/table-layout-600-before.json` 逐字段相同（TZ-02 复用） |
| EG-05 | `alignedRailMarks` 在 `equalGaps` 布局：相邻两段竖线不重叠、间隔 ≥ 8px；第一段上延 22；后续段首年份徽章 y = 两卡头中点；每张卡点位 = 卡头 |
| EG-06 | `equalGaps` + `plan`（points/hidden）：时间点高 18、间距 6；隐藏根不留空隙 |

### 6.2 浏览器（`tests/browser/planning-worldline-table-equal-gaps.test.ts`，新文件，夹具 `zoomLevels: true`）

| ID | 内容 |
|---|---|
| EGB-01 | 默认（对齐）复位视图：任意相邻两张可见卡片 / 时间点（同层、DOM 实测）间距 = 6 ± 1px；Ctrl + 滚轮放大 6 步、缩小到级别 2 后再测仍成立 |
| EGB-02 | 所有级别无 `[data-card-zoom]`；收起卡标题计算字号 12.8px、卡高 34（单行） |
| EGB-03 | 断档：“相隔”文字可见且位于两侧卡片之间（文字中线在上一卡底与下一卡顶之间 ±4px），不与日期标签、年份徽章相交（DOM 矩形）；被徽章取代时徽章 `title` 含“相隔” |
| EGB-04 | 对齐模式放大到级别 0、间隔足够的夹具：不出现 `data-auto-open`、无卡片自动展开；切等距后出现（docs/600 TZB-06 规则） |
| EGB-05 | 对齐 → 等距 → 对齐：视图内第一张卡片屏幕 top 变化 ≤ 1px |
| EGB-06 | 等距模式：根间距随缩放增大（docs/600 TZB-12 在等距下仍过），断档高 46 |
| EGB-07 | 对齐模式时间轴：每个可见点位与卡头中线 ±0.5px（TZB-08 改为无缩放卡） |

### 6.3 既有用例改动

- `planning-worldline-table-zoom.test.ts`：依赖拉伸 / 自动展开的 TZB-06*、07、12、13*、17b、06c 先切到等距；TZB-01、11 中 `data-card-zoom < 1` 的断言改为“无包层”；TZB-08 去掉缩小卡。
- `planning-worldline-table-rail-modes.test.ts` RM-B3：卡片位置逐项相同改为 Q7（第一张可见卡片不动）。
- 其余用例不改；全量回归与 docs/600 提交的失败集合按用例名对比。

### 6.4 真实目标

构建版、隔离根 `worldline-ui-599`（LOTM-587-wg-r1，无模型），对齐模式：复位截图与截图问题同一位置（德维尔工厂家族）；实测相邻卡片间距、标题字号、断档文字与徽章不相交；缩放到各级再测；切等距对比。证据 `~/shakeink-test-roots/worldline-ui-583-evidence/601/`，台账 `WL-601`。

## 7 文件范围

`src/lib/planning/worldline-layout.ts`、`src/components/content/planning/worldline/EventTable.tsx`、`worldline.module.css`、上述测试文件、`docs/requirements-traceability.json`。

## 8 修订 1（按 `docs/601-worldline-table-equal-gaps-plan-review.md`）

以下规则替换前文对应内容；冲突处以本节为准。用户 2026-11-24 就 P1-1 / P1-2 选择“只在这两处加宽”：只在出现年份徽章或断档文字的位置把间距加宽到刚好放下，其余间距都是 `CARD_GAP`，所有文字保留。Q4（徽章取代断档文字）作废。

### 8.1 间距口径（P2-1）

“相等”指同一层相邻块：上一块底到下一块顶 = `CARD_GAP`（6）。分组头到首个子块 `GROUP_HEAD_GAP`（4）、分组框底内距 `GROUP_PADDING`（10）是框的样式，不变，EGB-01 按同层块量，不跨框边。

### 8.2 加宽规则（P1-1 / P1-2 / P2-3 / P2-5，`tableLayout` 的 `equalGaps`）

布局按卡片顺序（即各段 `heads` 顺序）记上一张已定位卡的卡头 `lastHead`，并复现 `alignedRailMarks` 的换年判定（同段内：`back = t < 段内已见最大 t`；非 back、非 era 精度，`yearText` 与当前年份不同且不是段内首个年份 → 换年）。

- 换年处：本卡卡头 ≥ `lastHead + RAIL_MARK_SPAN`（40）。两张收起卡头距本来就是 40，不加宽；时间点之间（24）、时间点与卡（32）才下推。徽章在两卡头中点，半高 9.5 + 日期标签半高 7.5 + 3 = 20。
- 分段断档（`kind: "gap"`）：有年份的历法，下一段首卡卡头 ≥ `lastHead + RAIL_BREAK_SPAN`（62）；断档文字中线 `lastHead + 20`，段首年份徽章中线 `首卡头 − 20`（文字底 +28、徽章顶 +32.5，不相交）。无年份的历法与待定位断档：卡头 ≥ `lastHead + 40`，文字在中点。
- `TableBreak` 在 `equalGaps` 时 `top` / `height` 为文字所在的 16px 行（中线如上），不再是占高度的 46px 块；断档前后的块间距仍从 `CARD_GAP` 起算，再按上面的卡头下限下推。下推只加在块顶（`start`、分组 `top` 同步），不改块内结构。
- `TableLayout` 增 `equal: boolean`。

### 8.3 对齐时间轴（P2-2）

- `layout.equal` 时，第 2 段起的段首年份徽章 y = `首卡头 − 20`（第一段仍为 `− 22`）；段换年徽章仍在两卡头中点。
- 竖线延伸 = `min(22, 与相邻段最近卡头距离 / 2 − 4)`，第一段上端、最后一段下端为 22。渐隐 18px 不改：竖线本就在日期列右侧（x 158，标签右缘 144），断档文字和标签与竖线水平不相交。

### 8.4 模式切换锚点（P1-3）

- `modeAnchor` ref：每次 `onScroll` 与每次布局恢复 effect 结束时写 `{ a: firstVisible, offset }`（用当时的布局）。
- 恢复 effect 中 `railMode` 与上次不同：锚点优先级 `anchor.current`（滚轮）→ `modeAnchor` → `flipAnchor`。等距自动展开中切到对齐，同样用 `modeAnchor`（屏幕上看到的是展开布局，第一张可见卡片保持不动）。

### 8.5 `tableAutoOpenFits` 守护（P3-5）

注释写明 `equal` 布局不得用于判定；函数开头 `if (open.equal) return null`，单元断言。

### 8.6 用例修订

- EG-03 改：断档文字行中线 = 上一卡头 + 20；下一段首卡头 − 上一卡头 = 62（年份历法）/ 40（无年份、待定位）。
- EG-07（新）：换年在时间点之间：两卡头距 = 40；两张收起卡之间换年仍为 40（不加宽）；不换年的时间点之间卡头距 24。
- EG-08（新）：`equal` 布局下 `tableAutoOpenFits` 返回 null。
- EGB-03 改：复位级别 2 与级别 0，时间轴列所有可见的日期标签、年份徽章、断档文字两两 DOM 矩形不相交；“相隔”文字全部可见。
- EGB-08（新，截图同形，P3-4）：zoomView(24) 对齐复位，家族 r3 / r9 子块同层间距 6、组头到首子 4。
- EGB-05 改：在表格下半部（滚到 70%）等距 → 对齐 → 等距，第一张可见卡片屏幕 top 变化 ≤ 1px；等距自动展开中切换同样检查。
- 既有用例：WU-43 保留不改（文字仍在）；TZB-11 重写为“所有级别无包层、收起卡高与布局相同”；TZB-08 去掉包层头位并加矩形不相交；TZB-14 切到等距；ZB-37 / ZB-38 切到等距；RM-* 单元用例不变（不带 `equalGaps`），另加 `equalGaps` 版本（EG-05）。
- EGB-02 字号与同卡在分级关时的计算字号比较（P3-3）。
- 真实目标（P3-2 / P3-6）：记录复位可见卡片数与时间点数；时间轴列矩形相交检查；下半部模式切换位置。

## 9 修订 2（按 `docs/601-worldline-table-equal-gaps-code-review.md`）

- **P1-1 滚轮遗留锚点**：对齐模式下级别不变的滚轮步不产生新布局，`anchor.current` 不被恢复 effect 消费。用户滚动（`onScroll` 的用户输入分支）清空 `anchor.current`。用例 EGB-10（滚轮一步 → 滚动 → 展开视图内卡片，scrollTop 不变）、EGB-11（滚轮一步 → 滚动 → 切等距，第一张可见卡片不动），去掉修复后两条都失败。
- **P2 断档文字位置**：断档文字中线 = `max(上一卡头 + 20, 上一块底 + 3)`，下一段首卡头下限随之下推（`文字中线 + 42` / 无年份 `+ 20`）；上一块高于卡头行（展开卡、以未定位子事件结尾的家族）时文字不再画在卡片正文旁。无年份历法的居中规则只在文字未被下推时使用。用例 EG-09、EG-10。
- **P3**：EGB-02 字号与分级关的同一卡片比较；EGB-07 容差按方案 ±0.5px；TZB-11 恢复类型边阴影断言；窄面板断档文字超出时从左侧渐隐裁切（不用省略号，WU-35）。
- 未改（记录）：无段首徽章（全部为 era 精度）的段仍留 62px，只发生在罕见的全 era 段；TZB-19 先悬停指针再计时，首次悬停重渲染不计入（悬停不是缩放步）。
