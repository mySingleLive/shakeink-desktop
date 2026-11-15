# 580 · 世界线界面改版 技术方案

依据：`577-worldline-ui-product-design.md`（§1–§15，2026-11-15 设计稿 v9 审核通过）、`design/worldline-redesign/`（只作视觉参考，不进入产品）。基础：`fix/worldline-chronology`（docs/570–579，纪元历法）合入后的代码。

## 1. 范围与原则

- 只改世界线面板（`WorldlinePanel`，即 `PlanningWorkspace` 的 `mode="world"` 分支）及其样式、纯函数库、数据字段和导入契约。叙事线、大纲投影面板不受影响。
- 遵循 AGENTS.md：复用 Web 真实 React 组件；设计稿中的示例数据和评审工具条不进入产品；界面文案来自真实状态。
- 布局计算放进可单元测试的纯函数（`src/lib/planning/worldline-layout.ts`），React 组件只负责渲染和事件处理。
- 展开/折叠、目录宽度开关、缩放、选中项、搜索词都是界面状态，不写入作品，也不产生版本。

## 2. 数据模型（`src/lib/planning/domain.ts`）

`eventSchema` 新增两个字段，都有默认值，旧作品不需要迁移：

```ts
category: z.enum(["冲突","谋划","揭示","关系","成长","变故","其他"]).default("其他")
  .describe("事件类型，决定颜色"),
importance: z.number().int().min(1).max(3).default(1)
  .describe("重要程度：1 一般 / 2 重要 / 3 关键，决定圆点大小"),
```

- 字段放在 `eventSchema` 中，所以 `planningSchema.parse`、AI 规划工具（`src/lib/ai/planning-tools.ts` 的 put 操作）、分叉冻结副本（`worldline.fork.events`）、导入发布都自动带上。
- 分叉冻结前史的“已变化”判断（`PlanningWorkspace.tsx` `forkChanged`）只比较事实、时间、角色变化，新增字段不参与比较，避免改颜色就提示“源事实已有变化”。
- `planning-tools.ts` 的工具说明中补一句两个字段的含义，模型新建事件时可以填写。

## 3. 导入（第 17 步世界线提取）

- `desktop/core/novel-import-ai-payload.ts` 的世界线契约：`facts` 增加可选的 `category`（7 选 1）和 `importance`（1–3）。说明“按事件在全书情节中的分量判断，拿不准时写 1”。
- `desktop/service/novel-import-ai.ts`：回复整理时，非法值丢弃（不报错）。
- `desktop/service/novel-import-publish.ts:168`：`eventSchema.parse` 时传入 `category`、`importance`。续写拆分出的 `-part-N` 片段沿用原事件的值。
- 已导入的作品（包括《诡秘之主》）没有这两个值，显示为“其他 / 一般”。测试改版时重新导入一次。

## 4. 纯函数库（新增 `src/lib/planning/worldline-layout.ts`）

| 函数 | 作用 | 对应设计 |
|---|---|---|
| `eventTree(events)` | 根事件和子事件的树，同层按开始时间排序；待定位事件单独列出 | §3.1、§13 |
| `familyEnd(e, tree)` | 父事件和所有后代中最晚的结束时刻 | §11 |
| `railSegments(roots, resolve)` | 事件表时间带分段：相邻根事件间隔大于 30 天且大于中位间隔的 20 倍时断开 | §3.2 |
| `railPositions(segments, cardTops)` | 段内严格按比例计算圆点 y；4px 内合并为簇点；标签避让（间距 < 18px 不画） | §3.2 |
| `packFamilies(families, previous, pinned)` | 时间线二维排布：首次按开始时间放到最高的空位并记录原位；之后被点击的家族固定，其他家族回到原位，只有相撞时才下移 | §13、§15 |
| `minimapModel(roots, width)` | 小地图分段（规则同时间带），每段宽度按事件数分配；`toX` / `toT` 互为反函数 | §10、§12 |
| `matchEvent(e, terms, names)` | 搜索：多个关键字须全部出现在标题、内容、角色名、类型名或时间说明中 | §12 |

`timeline.ts` 现有的 `layoutTimelineCards` 保留给角色变化泳道使用；事件卡片改用 `packFamilies`。

## 5. 组件结构

`PlanningWorkspace.tsx` 已有 4735 行。世界线部分拆进 `src/components/content/planning/worldline/`，由 `renderWorld()` 调用。状态仍集中在 `PlanningWorkspace`（保存、对话框、草稿等逻辑不动），通过 props 传入。

| 文件 | 内容 |
|---|---|
| `WorldlineToolbar.tsx` | 标题栏（复用现有“版本 · 撤销上次规划修改”）、工具栏：目录开关、世界线 `Select`、视图 `Tabs`、时期选择、全部展开/收起、缩放、搜索、待定位、延续事件、“更多”菜单（`DropdownMenu`：世界线设置、＋ 世界线、＋ 时期、时期列表、跨世界连接、单位与对应、时间基准、显示时期、显示角色变化）、“＋ 事件” |
| `EventTree.tsx` | 左侧事件目录（`role="tree"`），两个视图共用；年份分隔、视窗内标记、当前行跟随 |
| `EventCard.tsx` | 收起和展开两种形态。展开时复用现有 `eventCard()` 的内容（菜单、时间行、`MarkdownPreview`、人物、角色变化、引用）；收起时只渲染圆点、标题（溢出淡出）、头像叠层、子事件数 |
| `EventTable.tsx` | 时间带（SVG 引线、圆点、标签、刻度、年份徽章、时期竖条、断轴）和分组卡片列；Ctrl + 滚轮缩放 |
| `EventTimeline.tsx` | 横向画布：刻度尺、时期色带、`#plane` 平移层、父事件标题栏和框体、角色变化泳道、小地图 |
| `worldline.module.css` | 新样式，只使用 `globals.css` 的主题变量（玄墨 / 宣纸）和 7 个类型色变量 |

控件尽量使用 `src/components/ui` 中已有的组件：`Button`（size `sm` / `icon-sm`，变体 outline / ghost / default）、`Input`、`Tabs`、`Select`、`DropdownMenu`、`Badge`、`Tooltip`、`Avatar`。

**类型色**：在 `globals.css` 的 `.ink` 和 `.paper` 下各加 7 个变量 `--event-conflict` … `--event-other`，取值沿用设计稿 v9（亮色主题另有一套）。

## 6. 关键行为

- **定位**（§13）：一个 `locateEvent(id)` 供目录、搜索、时间带圆点、待定位按钮共用。事件表中滚动卡片；时间线中把视窗平移到开始时刻位于宽度 30% 处，并滚动到对应行。待定位事件会切换到事件表。目标事件的祖先被折叠时自动展开。
- **时间线平移**（§15）：拖动画布、方向键、小地图只改变 `windowRange.start`，经 `transform: translateX` 平移 `#plane`。只有缩放比例或面板宽度变化时才调用 `packFamilies` 全量排布。只构建视窗前后各 3 个视窗宽度范围内的家族（避免远古事件产生超大坐标）。底部占位高度不低于 `scrollTop + clientHeight`。
- **保留现有交互**：拖动标题或时间条修改时间（`startTimeDrag` / `finishTimeDrag`）、双击原位编辑、「…」菜单、分叉冻结、时间基准切换、角色变化泳道、待定位 / 延续事件弹层、`panelFocus` 跳转（`PlanningWorkspace.tsx:269-325`）。拖动修改时间期间，被拖的家族按预览时间平移，不触发全量重排。
- **快捷键**：Ctrl/⌘ + F 只在世界线面板获得焦点时拦截，不影响其他面板和编辑器。
- **偏好**：目录开关、当前视图沿用组件内状态。若需要跨会话保留，再接入现有设置存储，本轮不做。

## 7. 性能

目标（《诡秘之主》885 个事件，真实应用）：
- 事件表首次渲染 < 500ms；展开一张卡片到重排完成 < 100ms。
- 时间线拖动时每帧 < 16ms（不重建卡片），无超过 50ms 的长任务。

措施：收起态不渲染 `MarkdownPreview`；`EventCard` 用 `memo`；事件表卡片列在超过 300 张时按视口虚拟化（时间带只画可见段）。时间带的 y 坐标依赖卡片实测高度，用 `ResizeObserver` 批量更新，每帧最多重算一次。

## 8. 测试计划（详细用例见 docs/581）

- 单元测试：`worldline-layout.ts` 的每个函数，包括设计稿 v9 中发现的问题（拖动不移位、展开只影响下方、远古坐标、搜索多关键字、小地图反函数）。
- 浏览器测试（`tests/browser/planning-worldline-*.test.ts`，沿用 `planning-card-menu.test.ts` 的方式：真实 `WorldlinePanel` + 内存接口数据）：收起/展开、目录定位（两个视图）、时期定位、全部展开、事件表缩放、搜索、小地图、重叠检测、拖动不移位、主题样式检查。
- 导入：`novel-import-worldline-timeline` / 发布用例补充 `category`、`importance` 的读写和非法值。
- 真实目标系统验证：在隔离根 `~/shakeink-test-roots/cache-522` 中，用 LotmVerification.app 重新导入《诡秘之主》第一卷，选择“角色 + 世界线”（docs/570 的运行只选了世界线，885 个事件的参与角色全部为空，无法验证头像）。截图检查两个视图，并测量 §7 的性能。

## 9. 风险

| 风险 | 处理 |
|---|---|
| `fix/worldline-chronology` 复审未通过 | 实现从它的提交开始；复审通过前不合并界面改版 |
| 拆分组件时破坏现有世界线交互 | 先补齐现有交互的浏览器测试（拖动改时间、双击编辑、菜单、分叉冻结），再拆分 |
| 885 个事件下时间带重算过慢 | 先测量；不达标再启用虚拟化 |
| 导入模型对类型、重要度判断不稳定 | 字段可选，非法值丢弃；用户可在编辑器中修改 |
