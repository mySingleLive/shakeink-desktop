# 594 · 世界线时间点悬停显示完整标题 技术方案与测试用例

来源：用户 2026-11-20 修改要求。基于工作区（docs/593 未提交改动之上）。

## 需求

| # | 内容 |
|---|---|
| P1 | 鼠标悬停在收起成时间点的事件上时，显示该事件的完整标题（不截断、不渐隐） |
| P2 | 完整标题浮在其他事件卡片和时间点之上 |
| P3 | 标题的位置不变：左边缘与悬停前相同，只向右伸长；圆点、日期不动 |
| C1 | 只改悬停样式：布局（packing）、点击/双击/框选、悬停高亮（docs/592 R6 日期、标尺胶囊、竖线）不变；不写入作品 |

## 1 实现（只改 `src/components/content/planning/worldline/worldline.module.css`）

现状：`.tpoint > span[data-point-title]` 有 `max-width: 94px; overflow: hidden`，超长时 `useFade` 设 `data-fade`，用渐隐遮罩；时间点所在 `.tcard` 的 `z-index: 2`，与卡片相同。悬停状态已存在：`EventPoint` 的 `hot` 给 `.tpoint` 加 `.hot` 类和 `data-hot`（`EventTimeline` 的 `shownHover`，拖动时间时为 null）。

改动：

```css
/* 594 P1–P3: the hovered point shows its whole title above the other cards; the title's left edge stays put. */
.tcard:has(> [data-event-point][data-hot]) { z-index: 8; }
.tpoint.hot > span[data-point-title] { max-width: none; overflow: visible; mask-image: none; -webkit-mask-image: none;
  background: var(--background); border-radius: 3px; box-shadow: 0 0 0 3px var(--background); }
```

- `max-width: none` 只让标题向右伸长：它在 flex 行中位于日期之后，左边缘由圆点与日期决定，不变（P3）。不加 padding，衬底用 `box-shadow` 向外延 3px，不移动文字。
- `mask-image: none` 写在同一条规则上，悬停时即使 `data-fade` 尚未被 ResizeObserver 移除也不渐隐。
- `z-index: 8`：高于卡片（2）、展开的卡片（5）、选择框以外的画布元素，低于打开的卡片菜单（`details[open]` 为 9）、选择框（11）和小地图（12）。不透明衬底使下面的卡片文字不透出（P2）。
- 不动 TSX：`hot` 已经只在悬停时为真，`title` 属性保留（原生提示照旧）。

## 2 测试用例（`tests/browser/planning-worldline-card-zoom.test.ts`，夹具 zoomView，内存 API）

| ID | 步骤与断言 |
|---|---|
| ZB-34 | 缩到 12 ≤ d < 39，取长标题时间点 r3。悬停前记录标题框 `x`、宽度（≤ 94）、圆点与日期框位置，且 `data-fade` 存在。悬停后：标题 `scrollWidth ≤ clientWidth + 1`，计算 `max-width` 为 `none`、遮罩为 `none`，文本等于事件标题；标题左边缘、圆点、日期框位置与悬停前差 ≤ 0.5px，标题宽度 > 悬停前；标题沿水平中线每 8px 一点做 `elementFromPoint`，全部落在 r3 时间点内（证明在最上层，P2）；时间点外层 `.tcard` 的 `z-index` 大于画布中所有卡片外层的 `z-index`；标题背景色等于面板 `var(--background)`。鼠标移开后：宽度回到悬停前值，`data-fade` 仍在，遮罩恢复 |
| ZB-35 | 同一缩放下，r3 标题悬停伸长后，构造覆盖：把 r3 所在 `.tcard` 的 top 设为与卡片 r1 同高、left 使标题右段压在 r1 上（只改测试页 DOM 位置），悬停时 r1 区域内标题范围的 `elementFromPoint` 落在 r3 而不是 r1；不悬停时同一点落在 r1 |

已有用例 ZB-04（时间点外观、长标题渐隐）、ZB-13（悬停高亮）、ZB-19（悬停不重渲 PlanningWorkspace）、ZB-22（悬停不保存）回归运行。

## 3 验证与台账

- `tests/browser/planning-worldline-card-zoom.test.ts` 全文件；`tests/browser/planning-*.test.ts` 回归；`npx tsc --noEmit`。
- 真实目标：构建版应用、隔离根中的 LOTM-587-wg-r1，在第 2 级悬停一个长标题时间点，截图并读 DOM（标题完整、左边缘不变、`elementFromPoint` 落在时间点）。
- 台账新增 `WL-594`。

## 4 修订 1（按 `docs/594-worldline-point-hover-title-plan-review.md`）

| 审核项 | 处理 |
|---|---|
| P2-1 伸长的标题接收鼠标 | 接受为预期：标题画在最上层，用户点到的就是这个时间点。C1 改为“布局、框选、悬停高亮不变；按在伸长的标题上选中该时间点”。ZB-35 增加断言 |
| P2-2 淡化时间点衬底透出 | 悬停的淡化时间点恢复不透明：`.tpoint.dim.hot { opacity: 1 }`。ZB-36 覆盖 |
| P2-3 “▸ N” 无衬底 | 衬底改到整行：`.tpoint.hot { background; border-radius; box-shadow }`，标题规则只去掉宽度限制和遮罩。不加 padding，圆点和日期不动。ZB-34 改用带子事件数的时间点之一做断言（夹具中有则用，否则注明） |
| P2-4 层叠说明 | 更正：`.plane` 有 `will-change: transform`，自成层叠上下文；`z-index: 8` 只与画布内元素比较（卡片 2、展开 5、打开菜单 9）。选择框、空视图提示、悬停竖线、小地图在 `.plane` 之外，本来就在上面 |
| P3-1 ZB-35 | 不改 DOM：缩到 d∈[20,26)（r3 自然压住卡片 r16），从 DOM 找与完整标题框相交的卡片，悬停前该点落在卡片，悬停后落在 r3；按下选中 r3。ZB-34 中的 `elementFromPoint` 检查删除，P2 由 ZB-35 证明 |
| P3 遮罩恢复 | ZB-34 移开后用 `expect` 轮询 `data-fade` |
| P3 右边缘截断、家族框色块 | 记为已知限制：画布 `.lane` 为 `overflow: clip`，靠近右边缘的标题仍被截断（原生 `title` 提示兜底）；家族框内衬底为 `--background`，比框内底色略深 |

最终 CSS：

```css
.tcard:has(> [data-event-point][data-hot]) { z-index: 8; }
.tpoint.hot { background: var(--background); border-radius: 4px; box-shadow: 0 0 0 3px var(--background); }
.tpoint.hot.dim { opacity: 1; }
.tpoint.hot > span[data-point-title] { max-width: none; overflow: visible; mask-image: none; -webkit-mask-image: none; }
```

新增 ZB-36：搜索使 r3 淡化（`data-dim` / `.dim`），悬停后时间点计算 `opacity` 为 1，移开后回到 0.3。

## 5 代码审核后的修改（`docs/594-worldline-point-hover-title-code-review.md`）

| 审核项 | 处理 |
|---|---|
| P2-1 ZB-36 悬停前未移开鼠标 | 已改：`revealTimelineCard` 之后先 `mouse.move(5, 5)` 再读淡化 |
| P3-1 ZB-35 区间 | 以实测为准：zoomView 中 r3 的完整标题在 17.5 ≤ d < 24.4 压住卡片 r16 / r17 / r19 / r20（d≈20.7 时只压住时间点）；用例在 DOM 中通用查找相交卡片，找不到即失败。§4 中“d∈[20,26)、r16”以本条为准 |
| P3-5 ZB-35 按下 | 已加断言：被悬停的时间点变成卡片且带 `data-selected`，下面那张卡片未选中 |
| P3-2 遮罩优先级靠先后顺序 | 不改；ZB-34 断言悬停时遮罩为 none，能发现回归 |
| P3-3 / P3-4 | 不加用例（审核标为可选）：菜单 z 9 > 8 由 CSS 数值保证；paper 主题探针确认衬底等于画布底色 |

真实目标（`hover-594.mjs h1`）：d ≈ 12.9，4 个样本全部通过，见 `WL-594`。
