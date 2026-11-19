# 591 · 世界线图例：类型与重要度改为筛选（不显示并重新排版） 技术方案与测试用例

来源：用户 2026-11-19 修改要求（附截图：事件表顶部右侧“类型 冲突 106 … 其他 360 | 重要度 一般 重要 关键”）。基于 `c0e98c9` 与工作区未提交的 docs/589、docs/590 改动（保留）。

## 用户要求与约束

| # | 内容 |
|---|---|
| R1 | 点击取消某个事件类型：画布中不显示该类型的全部事件卡片，并重新排版（现在是置灰） |
| R2 | 重要度（一般/重要/关键）同样可以点击取消，取消后画布中不显示该重要度的全部事件卡片 |
| D1 | 父事件被筛掉时，整组（含全部子孙事件）一起不显示（用户 2026-11-19 选择） |
| D2 | 左侧事件目录同步筛选（用户 2026-11-19 选择） |
| C1 | 不破坏已通过的功能与流程；界面状态不写入作品（WU-09e） |

## 现状

- `WorldlineLegend`（`src/components/content/planning/worldline/WorldlineToolbar.tsx:109`）：类型按钮单击 `onToggle`、双击 `onSolo`，`aria-pressed`；重要度只是说明文字（`.sizes`）。
- `PlanningWorkspace.tsx`：`hiddenTypes` 状态（:176）；`wDimmed`（:283）把隐藏类型和搜索未命中都算作淡化；`wTree`（:266）同时给事件目录、事件表、时间线视图。
- 设计 docs/577 §126 原定“隐藏的类型同步淡化”，本次按用户要求改为不显示。搜索未命中仍淡化，不变。

## 方案

### 1 纯函数 `filterEvents`（`src/lib/planning/worldline-layout.ts`）

```ts
export interface EventFilter { hiddenTypes: ReadonlySet<EventCategory>; hiddenImportance: ReadonlySet<number> }
/** 去掉隐藏类型或隐藏重要度的事件，以及它们的全部子孙（D1）。无隐藏项时原样返回同一数组。 */
export function filterEvents(events: readonly PlanningEvent[], filter: EventFilter): readonly PlanningEvent[]
```

祖先判断沿 `parent` 链（在 `events` 中查找，遇环停止）；父事件不在列表中（孤儿）则只看自身。`dimmedBy` 去掉 `hidden` 判断，只保留搜索（`DimFilter.hidden` 删除）。

### 2 工作区

- 新状态 `hiddenImportance: ReadonlySet<1|2|3>`（界面状态，不写作品）。
- `wViewTree = eventTree(filterEvents(worldAllEvents, …), data)`；`data` 仍是完整数据，时间锚点引用被隐藏事件时照常解析。
- 事件目录（两个视图）、事件表、时间线视图、缩放范围 `tableZoomBounds` 改用 `wViewTree`，因此版面按剩余事件重新计算（R1“重新排版”）。
- 搜索命中 `wHits` 只在 `wViewTree` 中查找（隐藏的卡片不能跳转）。
- 选择、定位、折叠、深链接等仍用完整的 `wTree`，隐藏事件的已选状态保留，重新显示后不丢。
- `wDimmed` 只保留搜索未命中。
- 图例计数、“N 件事件”仍按全部事件计（与筛选前一致）。

### 3 图例

- 类型按钮行为不变（单击取消/恢复，双击只看这一类），含义从“淡化”改为“不显示”；`aria-label` 改为“类型筛选（点击隐藏或显示，双击只看这一类）”。
- 重要度三项改为按钮：`data-legend-importance="1|2|3"`、`aria-pressed`，单击取消/恢复；样式与类型按钮相同（取消后半透明加删除线，圆点改为空心）。圆点大小说明不变，`title` 保留“圆点大小表示重要程度”。

## 测试用例

单元（`tests/unit/worldline-layout.test.ts`）：

| ID | 期望 |
|---|---|
| LF-01 | 无隐藏项时返回同一数组 |
| LF-02 | 隐藏类型去掉该类型的事件；隐藏重要度去掉该重要度的事件；两者同时生效 |
| LF-03 | 父事件被隐藏，子孙全部去掉，即使子孙本身符合（D1）；子事件被隐藏，父事件保留 |
| LF-04 | 父链有环或父事件不在列表中时不死循环，按自身判断 |
| WU-21b（改） | `dimmedBy` 只按搜索判断 |

浏览器（F60 夹具）：

| ID | 期望 |
|---|---|
| WU-33/WU-34（改） | 单击“冲突”后事件表中没有冲突卡片（原先断言透明度）；`aria-pressed=false`；双击“揭示”后只剩揭示卡片 |
| WU-34b（改） | 隐藏类型的卡片不存在；搜索未命中的卡片仍淡化 |
| LF-B1 | 取消“冲突”后剩余卡片重新排版：卡片间无空位（相邻顶层卡片间距与筛选前相同），事件表总高度变小 |
| LF-B2 | 取消“一般”后事件表与事件目录中都没有重要度 1 的事件；再点恢复后数量回到原值 |
| LF-B3 | 父事件“港口商会签下秘密契约”类型被取消时，它的整组（含子孙）在事件表与目录中都不显示 |
| LF-B4 | 时间线视图同样不显示被取消的类型与重要度 |
| LF-B5 | 筛选不写作品（WU-09e 增加重要度点击） |

## 验证

单元与相关浏览器用例（`tests/browser/planning-worldline-*.test.ts`）全部通过；`tsc` 通过；构建后在真实应用中打开一部已导入作品的世界线，截图确认取消类型/重要度后卡片消失并重新排版。
