# 580 · 世界线界面改版 技术方案（修订 5）

依据：`577-worldline-ui-product-design.md`（§1–§15，2026-11-15 设计稿 v9 审核通过）、`design/worldline-redesign/`（只作视觉参考，不进入产品）。基础：`fix/worldline-chronology` 提交 `195b4c0`（docs/570–582，纪元历法，2026-11-16 第六轮复审通过）。本分支已变基到这个提交上。

修订 2 回应 `580-worldline-ui-plan-review.md` 的 M1–M9 和 S1–S14。修订 3 回应该文件“修订 2 复审”一节的 R1–R5、各项细节和新增矛盾，并写入用户 2026-11-16 的决定：Cmd/Ctrl+F 接入桌面快捷键系统。修订 4 回应“修订 3 复审”一节的 N1–N5 和两条说明。修订 5 回应“修订 4 复审”一节的 P1–P4。每处在方括号中标注对应编号。下文行号指提交 `195b4c0`。

## 1. 范围与原则

- 改动范围：世界线面板（`WorldlinePanel`，即 `PlanningWorkspace` 中 `mode="world"` 的分支）的样式、纯函数库、事件字段、事件编辑器和导入契约。叙事线和大纲投影面板不受影响；三个面板共用的头部只在世界线模式下改变 [S9]。
- 遵循 AGENTS.md：复用 Web 真实 React 组件；设计稿中的示例数据和评审工具条不进入产品；界面文案来自真实状态。
- 布局计算放在可单元测试的纯函数中（`src/lib/planning/worldline-layout.ts`），不依赖 DOM。React 组件只负责渲染和事件处理。
- 以下都是界面状态，不写入作品，也不产生版本：展开/折叠、目录开关、缩放、选中项、搜索词、类型筛选。

## 2. 数据模型（`src/lib/planning/domain.ts`）[M6、S14]

`eventSchema` 新增两个字段。都有默认值，旧作品不需要迁移：

```ts
export const EVENT_CATEGORIES = ["冲突","谋划","揭示","关系","成长","变故","其他"] as const;
category: z.enum(EVENT_CATEGORIES).default("其他").describe("事件类型，决定颜色"),
importance: z.number().int().min(1).max(3).default(1).describe("重要程度：1 一般 / 2 重要 / 3 关键，决定圆点大小"),
```

- 字段写在 `eventSchema` 中，因此 `planningSchema.parse`、历史快照、AI 规划工具的 put、分叉冻结副本（`worldline.fork.events`）和导入发布都会自动带上。
- `forkChanged` 按字段逐一比较事实、标题、时间、时长和角色变化，不比较新字段。所以只改颜色或重要度时，不会提示“源事实已有变化”。WU-03 覆盖这一点。
- **事件编辑器**（`renderEventEditor`，`PlanningWorkspace.tsx:1504`）新增“类型”和“重要度”两项。类型用 `Select`，7 个选项前各有一个色点；重要度用三段 `Tabs`（一般 / 重要 / 关键）。冻结前史的事件中，这两项和其它字段一样只读。事件详情对话框（`:3529`）的时间行后显示“类型 · 重要度”。[M6]
- `planning-tools.ts` 的工具说明补充这两个字段的含义。put 不带这两个字段时，保留原值；这与现有的合并规则（`applyPlanningOperations` 以 `{...list[at], ...entity}` 为准）一致。
- **差异与哈希检查** [S14]：已用 grep 核查 chronology 工作树。规划服务（`src/lib/services/planning.ts`）中，`syncProjection` 只按卷和章节同步，不对 `data.events` 做哈希或全量比较。`desktop/service/novel-import-world-repair.ts` 的 `worldRepairProtectedRowsHash` 中，`protectedKeys` 包含 `planning`（`:19`），会对数据库中原样保存的规划行计算哈希。新字段的默认值只在读取时补上，不写回原行，所以修复前后的哈希不会因此变化。旧文档解析后补上默认值，第一次保存时每个事件会多出两个键。这只是普通的版本保存，不会触发冲突，WU-01 验证保存后读回不变。

## 3. 导入（第 17 步世界线提取）[M1、S13]

| 位置 | 修改 |
|---|---|
| `desktop/core/novel-import-semantics.ts:57` `IMPORT_SEMANTIC_FACT_FIELDS.worldline` | 加入 `category`、`importance`。不加的话，strict 校验（`:232-233`）会拒收回复 |
| `novel-import-semantics.ts:264-270` worldline 校验分支 [R1] | 这里是纯校验函数，不修改 artifact。规则：`category` 只能是 7 个取值之一，`importance` 只能是 `"1"`/`"2"`/`"3"`，否则 `fail`。非法值在下一行的规整阶段就已删掉，所以正常情况下不会走到 `fail` |
| `desktop/core/novel-import-worldline-facts.ts`（新增）`normalizeWorldlineGrade(facts)` [R1] | 纯函数：去掉首尾空白；数字 `importance` 转为字符串；非法值删除，并返回删除的个数。由**两条**回复整理路径调用：向导路径的 `normalizeLinesReply`（`novel-import-ai.ts:1439`，`wizard-lines-v1`）；普通语义导入路径（`referenceContract`）则在 `generateText` 包装器中调用（`:760-763`），时机在 `:598` 的校验之前。删掉的非法值个数计入 `ImportLinesRepairs`（新增 `droppedGrades`），不写入 `mappingWarnings`。两条路径各有单元测试（WU-08） |
| `desktop/core/novel-import.ts:308-322` 跨批合并 | `importance` 取较大值；`category` 保留先出现的值。两者都不产生冲突，也不进入 `WIZARD_REVIEW_STRUCTURAL` 或人工复核 |
| `desktop/shared/novel-import-field-labels.ts:6` | 增加中文标签：类型、重要程度 |
| `desktop/core/novel-import-ai-payload.ts:79` `referenceContract` 与 `:145` `wizardLinesContract` | 两处都写明：`category` 取 7 个值之一，`importance` 取 1–3，按事件在全书情节中的分量判断，拿不准时写 1 |
| `tests/fixtures/novel-import-prompt-golden.json` | 按新的提示文本更新 |
| `desktop/service/novel-import-publish.ts:168` | 发布前把 facts 中的字符串转成 `category` 和整数 `importance`，再交给 `eventSchema.parse`；值不合法时用默认值，不能抛错。续写拆分出的 `-part-N` 片段沿用原事件的值 |

- 已导入的作品（包括《诡秘之主》）没有这两个值，显示为“其他 / 一般”。
- **导入性能** [S13]：第 17 步每个事件多输出两个字段，提示词前缀也变了，缓存会失效。按 120 秒的世界线 + 叙事驱动重新测基线，只看第一次运行（记忆：重复运行会抬高缓存命中率）。结果记入 docs/584 的验收记录。

## 4. 历法与时间基准 [M8]

所有年、月、日都通过一个 `CalendarAdapter` 从当前历法取得（新增在 `worldline-layout.ts` 中，由 `activeWorld.calendar` 和当前时间基准构造）。布局函数只调用适配器，不写死 360 天或 30 天。

| 历法 | 年 / 月边界 | 断轴阈值的单位 | 短时间（目录） | 刻度 |
|---|---|---|---|---|
| gregorian + 纪元 | `era-calendar.ts` 的 `civilFromDays`，真实月界 | 30 天 = 720 小时 | `M-DD` | 纪元徽章、年徽章、月刻度 |
| gregorian 无纪元 | `Date` 公历（现有 `formatTime`） | 720 小时 | `M-DD` | 年、月 |
| fixed | `hoursPerDay`、`daysPerMonth`、`monthsPerYear` 都有时按其计算；`hoursPerDay` 为 null 时只有小时 | 有日长时为 30 日，否则 720 小时 | 有月时为 `M-DD`，否则 `formatTime` 的短格式 | 有年时显示年徽章，有月时显示月刻度；都没有时只按 `timelineTicks` 的数值刻度 |
| years | 单位就是年 | 30 天 ÷ 365.2425 年 | `formatTime` 的值 | 只有数值刻度，没有年徽章、月刻度 |

- 卡片、目录、时间带标签、搜索中的“时间说明”，统一使用 `formatTime(value, calendar, span, precision)`，以及 chronology 已提供的 `eraLabel`。`precision: 'era'` 的事件显示纪元名（如“第四纪”）；时间带上画在该纪元区间的位置，标签只显示纪元名。
- **时间基准**：切换后，所有标签和刻度都按 `timeBaseValue` 转换后的值重新计算（现有逻辑在 `:2327-2340`）。分段和排布用世界线自身的小时值，不重排。
- **视窗函数**：首次进入和“复位”沿用 chronology 的条件（`PlanningWorkspace.tsx:412`），只有世界线历法带纪元时才用 `fitDenseTimelineWindow`，否则用 `fitTimelineWindow`。时期下拉中的“全部时期（全貌）”总是用 `fitTimelineWindow`。
- **时间基准下的断轴阈值**：阈值永远按世界线自身的小时计算。若时间基准的历法单位不同，先把“30 天”按基准历法换算成基准单位，再除以 `base.scale` 换回世界线小时。

## 5. 布局模型（`src/lib/planning/worldline-layout.ts`）[M2、M3、S12]

### 5.1 事件表高度模型（不依赖 DOM）[M3、S12]

`tableLayout(tree, heights, zoom, adapter)` 返回每张卡片的 `top`、每段的范围、每个断轴的位置，以及总高度。
- 收起卡片 34px，间距 6px；分组框上下各加 10px；事件表中子事件缩进 18px，目录中每层缩进 16px；断轴高 46px。这些数值以已批准的设计稿 v9 为准（`app.js:104`、`:150`、`:203`），577 §3.2、§3.3 中的 44px 和 16px 是早期草稿的数值。
- 展开卡片和展开分组框使用 `heights[id]`（实测值，由 `ResizeObserver` 写入，每帧最多合并更新一次）；还没有测到时，按正文字数估算。
- `zoom`（1–4）：相邻两个根事件之间额外加 `min(240, Δ天 × 6 × (zoom−1))` px。
- 时间带圆点、引线、目录定位、滚动同步、搜索跳转、时期定位、吸顶年份、Ctrl + 滚轮的锚点，全部使用这个模型给出的位置，不读 DOM。
- **虚拟化**：只有一个条件：当前世界线的**全部事件数**（含待定位，不受折叠影响）> 300 时启用 [R3]。这样折叠或展开不会让表格在虚拟化和非虚拟化之间来回切换。启用后只渲染视口上下各 1 屏内的卡片和时间带元素，其余位置由模型给出。《诡秘之主》（885 个）会启用虚拟化，性能测试在启用状态下进行。
- **滚动锚定** [R3]：估算高度被实测高度替换时，若被修正的卡片在锚点之上，就按差值同步调整 `scrollTop`，屏幕内容不跳动。锚点平时是视口顶部的第一张卡片，Ctrl + 滚轮缩放时是指针下的卡片。全部展开后，视口外的卡片只有估算高度，所以这条规则在全部展开时同样适用（WU-47b）。

### 5.2 时间线排布与原点 [M2]

`packFamilies(families, prev, { scale, pinned })` 与 `placeOnPlane(layout, { base, scale, range })` 分成两步 [N1]：

**① 排布：世界坐标，不裁剪。**
- 每个家族及其所有卡片、标题栏、框体都用世界坐标 `wx = start × scale`（以 px 为单位，不减 `base`），宽度也按世界坐标计算。数值可以很大，但只用于计算，不写入 CSS。
- 碰撞判断只用这些**未裁剪的**世界外框，所以平移不会改变外框，已放好的家族不会被重新推开（不再出现 577 §15 的原因 1）。
- 首次排布时按开始时间放到最高的空位，记下原位 y。展开或收起后，被点击的家族固定不动，其它家族回到原位，只有发生相撞才下移；收起后回到原位。
- 只有缩放比例或面板宽度变化时才全量重排。**面板宽度为 0（标签页隐藏）时不重排**，保留原位记录，等宽度恢复后再按实际宽度处理 [说明 2]。
- 构建范围：结束时刻 ≥ `windowStart − 3·span` 且开始时刻 ≤ `windowStart + 4·span` 的家族才参与排布。平移超出这个范围时增量构建，新家族按同样的规则加入，已放好的家族 y 不变。

**② 上屏：逐个元素换算并裁剪。**
- 每个元素写入 CSS 时，单独换算成相对 `base` 的坐标：`left = wx − base × scale`。然后把 `[left, left + width]` 裁剪到已构建范围 `R = [(windowStart − 3·span − base) × scale, (windowStart + 4·span − base) × scale]`。被裁掉的左端显示“‹ 起点在视野外”，右端显示“延续到视野外 ›”（沿用现有 `:3043-3067`）。
- 完全落在 R 之外的元素不渲染。这包括长跨度家族中离视窗很远的子卡片和孙卡片，例如从远古持续到现代的根事件、跨纪元的父事件。
- 家族不再使用“以 `root.start` 为原点的局部坐标”，每张卡片都按自己的世界坐标换算，所以长跨度家族里的子卡片也受这个约束。
- 适用范围：卡片、父事件标题栏和框体、时间轨、持续事件和开放结束的时间条、时期色带、角色变化泳道。开放结束的时间条画到 R 的右端。
- **重定原点** [R2]：每次写入 `transform` 之前，在同一帧内同步检查。只要 `|windowStart − base| × scale > 10⁶ px`，就令 `base = windowStart`，按 ② 重新写入所有元素的 left，排布结果和 y 不变。全量重排时直接令 `base = windowStart`。
- **上界**：R 的两端到 `base` 的距离都 ≤ 10⁶ + 4 × 视窗宽。平移层中每个元素的 left 和 left + width 都在 R 内。`translateX` 的绝对值 < 10⁶ + 视窗宽。所以写进 CSS 的任何坐标的绝对值都 < 10⁶ + 7 × 视窗宽，与家族自身的起点无关。

### 5.3 其它纯函数

| 函数 | 作用 |
|---|---|
| `eventTree(events)` | 整棵树，同层按开始时间排序；待定位事件单独列出；父事件不存在的子事件提到根层 |
| `familyEnd(e, tree)` | 父事件和所有后代中最晚的结束时刻 |
| `railSegments(roots, adapter)` | 相邻根事件间隔同时大于“30 天”（见 §4）和中位间隔的 20 倍时断开 |
| `railMarks(layout, segments, adapter)` | 段内严格按比例算圆点 y；4px 内合并为簇点；标签间距 < 18px 时省略；年份徽章、月刻度、时期竖条 |
| `minimapModel(roots, width, adapter)` | 分段规则同时间带，每段宽度按事件数分配；`toX` / `toT` 互为反函数 |
| `matchEvent(e, terms, ctx)` | 多个关键字须全部出现在标题、正文、角色名、类型名、`time.label` 或格式化后的时间中；英文不区分大小写 [S7] |
| `dimmedBy(e, filter)` | 被类型筛选隐藏，或搜索没有命中 → 淡化。两者是“或”的关系 [M7] |

`timeline.ts` 中的 `layoutTimelineCards` 保留，继续用于角色变化泳道。

## 6. 子事件层级 [M4]

577 §3 和 §13 规定，两个视图都显示整棵树；时间线用标题栏加框体表示父子关系。现有的“分层进入”模型改动如下：

| 现有代码 | 处理 |
|---|---|
| `eventParent` 状态、面包屑（`:2504-2525`） | **移除**。两个视图始终显示整棵树。原先“进入子层”的需求，由目录中的折叠和定位代替 |
| 菜单项“展开子事件”（`:2007`）、卡片按钮“展开 N 件子事件 ›”（`:2089`） | 菜单项改为“定位子事件”，它会展开这个家族（取消折叠），并定位到第一个子事件。卡片按钮被收起卡片上的 `▸ N` 和父事件标题行的折叠按钮 ▾ 取代 |
| 按层记忆视窗 `worldViews`/`fittedViews`（`:398-418`、`:2222`） | 改为按世界线记忆一个视窗（键为 `worldId`） |
| `refinementRange` 限制子层视窗（`:215-223`） | 视窗不再限制，删除 `constrainWindow` 的 effect（`:218-224`）。`refinementRange` 函数本身保留，编辑器仍用它校验子事件时间是否落在父事件范围内 |
| “当前层 · N 件事件”（`:2728`） | 改为“N 件事件”。时间线视图中，目录头另外显示“视窗内 N 件” |
| “＋ 事件”新建时 `parent: eventParent`（`:2536`） | 默认新建根事件。选中某张卡片时，“＋ 事件”旁出现下拉项“在『…』下新建子事件”；父事件卡片的「…」菜单中加入“新建子事件”。新建子事件时同时设置 `parent` 和 `time.anchor`，沿用 `:2536-2538` 的写法 |
| `navigateWorldParent(next)` | 只保留切换世界线的功能，改名为 `switchWorld` |

## 7. 组件与渲染路径 [M5、M7、S1–S11]

### 7.1 组件

世界线部分拆进 `src/components/content/planning/worldline/`。保存、对话框、草稿等逻辑仍在 `PlanningWorkspace` 中，不改动。

| 文件 | 内容 |
|---|---|
| `WorldlineHeader.tsx` | 面板标题栏，只在 `mode==="world"` 时替换原头部 [S9]：`h2` 世界线；右侧依次是保存状态、版本 `Badge`、ghost 按钮“撤销上次规划修改”。在 `put` 和 `save` 中维护单独的保存状态 `saveState: 'idle'|'saving'|'saved'|'failed'`（不从 `message` 推导，因为 `message` 还用于其它提示）。只读时额外显示第二个 `Badge`“只读”，沿用现有的真实状态（`:4073-4076`） |
| `WorldlineToolbar.tsx` | 目录开关；世界线 `Select`；视图 `Tabs`；时期选择 `DropdownMenu`（定位后让色带或竖条闪烁，并提示“已定位到时期「…」· N 件事件”）[S4]；全部展开/收起；缩放（− 值 ＋ 复位）；搜索 `Input`；待定位；延续事件；“更多” `DropdownMenu`；“＋ 事件”。窄窗口规则：≤1280px 时隐藏“复位”、⌘F 提示和计数为 0 的延续事件；≤1160px 时，时期、全部展开、待定位只显示图标和数字；搜索框最小 120px；始终单行 [S8] |
| `WorldlineLegend.tsx` | 状态行：时间范围、事件数；类型图例（7 类，各带计数；单击隐藏/显示，双击只看这一类）；重要度大小说明。隐藏的类型在图例中用空心圆点加删除线表示，不只靠颜色区分 [M7、S10] |
| `EventTree.tsx` | 左侧事件目录，`role="tree"`，两个视图共用：年份分隔、视窗内标记、当前行跟随；支持 ↑↓←→ 和 Enter [S10] |
| `EventCard.tsx`（`memo`） | 收起态：圆点、标题（溢出时淡出）、头像叠层、子事件数。展开态：内容与现有 `eventCard()`（`:1949-2103`）相同（菜单、时间行、`MarkdownPreview`、人物、角色变化、引用），但改写成独立组件，不再是闭包 [R4]：<br>• **props**：`event`、`expanded`、`selected`、`hit`、`dimmed`、`frozen`、`editing`、`childCount`（由父组件从 `eventTree` 算出）、`refs`（该事件的引用列表）<br>• **`WorldlineContext`**（值由 `useMemo` 生成，只在依赖变化时更新）：`data`（整份规划数据，供 `resolveTime`、`timeBaseValue` 沿锚点查找）[N3]、`calendar`、`timeBase`、`readonly`、`hasDraft`、`characters`（头像、姓名）、`searchTerms`（标题和正文高亮所需的关键字列表；`hit` 只表示是否为当前结果）[N3]<br>• **稳定回调**（`useRef` 加一个不变的包装函数）：`onToggle`、`onEdit`（已有草稿时调用现有提示“请先保存或取消当前事件编辑，输入已保留。”，`:1955`）[N3]、`onDetail`、`onQuote`、`onCopy`、`onDelete`、`onFork`、`onLocateChildren`（定位子事件）、`onNewChild`（新建子事件）[N3]、`onStartTimeDrag`、`onReferenceClick`。它们内部调用 `put`、`setDialog`、`quotePlanning`、`startTimeDrag`<br>• **原位编辑器** [N3、P3]：`editing` 为真时，`EventCard` 渲染 `<EventEditorSlot />`。这个组件从一个**独立的** `EventEditorContext` 读取 `renderEventEditor`（现有约 440 行的闭包，`:1950`，本轮不拆分）。`EventEditorContext` 的值每次渲染都会变，但只有处于编辑状态的那张卡片挂载了 `EventEditorSlot`，所以草稿变化只会让这一个组件重新渲染。`WorldlineContext` 中不放这个函数，回调也都用稳定包装，所以 `memo` 对其它卡片有效。实现时用 React Profiler 验证：编辑时每输入一个字符，重新渲染的 `EventCard` 数量为 0（WU-56h）<br>• **时间行**：按事件精度选择 span：日精度为 48，时精度为 1，其余使用 `formatTime` 的精度参数。不再读取 `windowRange.span`（`:2044-2049`）<br>props 和 context 中都不出现 `windowRange` [M5] |
| `EventTable.tsx` | 时间带（SVG 引线、圆点、标签、刻度、年份徽章、时期竖条、断轴、吸顶年份）和分组卡片列；Ctrl + 滚轮缩放；虚拟化 |
| `EventTimeline.tsx` | 刻度尺、时期色带（可拖动改时间，沿用 `:2930-2963`）[S4]、`#plane` 平移层（父事件标题栏和框体、卡片、角色变化泳道 [S3]）、小地图 |
| `worldline.module.css` | 只使用 `globals.css` 中的主题变量 |

**类型色** [S11]：`globals.css` 中，`:root, .paper` 和 `.ink` 下各定义 7 个变量 `--event-conflict` … `--event-other`，取值沿用设计稿 v9（亮色和深色各一套）。枚举值到变量名的映射只放在 `worldline-layout.ts` 的 `CATEGORY_VAR` 一处，组件中不出现颜色值。亮色主题下，类型色文字与背景的对比度实测须 ≥ 4.5:1，不达标时只调亮色主题那套变量。

### 7.2 平移帧不经过 React 状态 [M5]

- **视窗 store** [R4、N4]：新增 `src/lib/planning/worldline-viewport.ts`，导出 `createViewportStore()`，返回一个最小的外部 store（`subscribe`/`getSnapshot`/`setWindow`）。**每个世界线面板实例各建一个**：`PlanningWorkspace` 在 `useRef` 中创建，并通过 context 传给子组件。原因是 `ContentTabs` 会让隐藏的标签页保持挂载，模块级单例会让两个世界线标签互相影响。
- **视窗的使用者** [P2]：视窗只存放在 store 中之后，下列内容必须随视窗更新，因此改由订阅 store 的子组件渲染，或在事件处理时读取 `getSnapshot()`：
  | 现有位置 | 处理 |
  |---|---|
  | “延续事件 N”按钮及弹层（`:2359-2365`、`:2632`） | 移入 `WorldlineToolbar`，订阅 store，按 100ms 节流重新计算 |
  | 范围文字（`:2741`） | 移入 `WorldlineLegend`，订阅 store |
  | 视窗末端角色状态（`:3153`） | 抽成 `WorldEndStates` 组件，订阅 store，节流 150ms |
  | `worldTimeLabel` 的默认 span（`:426`） | 删除这个默认值；所有调用方显式传入 span：卡片按精度传入（§7.1），刻度尺从 store 读取 |
  | 拖动改时间的吸附阈值（`:2162`，`snapTimelineDelta` 依赖 `windowRange.span`） | 在 pointermove 处理函数中读取 `store.getSnapshot().span` |
  | 角色变化泳道的视窗过滤 | 在 `EventTimeline` 内订阅 store |
  用 grep 列出 `PlanningWorkspace.tsx` 中所有 `windowRange` 的读取位置，逐一归入上表或改为 `getSnapshot()`。实现时用一条测试保证这个文件中不再出现 `windowRange` 状态（WU-56g）。
- **唯一写入来源** [N4]：`windowRange.start`/`span` 只保存在 store 中，不再作为 `PlanningWorkspace` 的 state，也不再通过 props 下发。时期定位、目录定位、搜索、小地图、拖动、缩放、“复位”都调用 `store.setWindow`。`PlanningWorkspace` 中需要视窗的地方（按世界线记住视窗、保存视窗等）改为调用 `store.getSnapshot()`。这样交互结束后的 150ms 内只有一个写入来源。`EventTimeline` 写入视窗，`EventTree`（目录的“视窗内”标记）、刻度尺、时期色带、小地图通过 `useSyncExternalStore` 订阅。目录的“视窗内”标记每 100ms 节流一次。这样平移时不经过 `PlanningWorkspace` 的 state，它在拖动过程中不会重新渲染。
- **交互中以 ref 为准** [R4]：拖动、方向键、滚轮、小地图的每一帧只写 ref 和 transform。交互结束后，再调用一次 `store.setWindow`，把最终位置写入 store。因为视窗不再经过 props（见上一条），查询刷新、实测高度写入、悬停、保存完成等其它原因引起的重渲染，都不会把 transform 写回旧位置。
- `EventTimeline` 内部用 `useRef` 保存 `{start, span, base}`。pointermove、方向键、Shift + 滚轮、横向滚轮（沿用 `:330-356`）、小地图拖动时，只做三件事 [S5]：
  1. 写 `#plane.style.transform`；
  2. 在 `requestAnimationFrame` 中重画刻度尺、时期色带和小地图方框（子组件局部 state）；
  3. 每 100ms 节流更新一次目录的“视窗内”标记。
- 停止拖动或空闲 150ms 后，把最终位置写入 store（`setWindow`），订阅者随之更新。
- 删除 `windowRange.y` 这个纵向偏移（`:2977`、`:3004`、`:3097`）。纵向只用原生滚动，并用 spacer 保证滚动位置不被浏览器截断。
- 取消平移（Esc、失焦，`:2120-2128`、`:2836`）：恢复拖动开始时 ref 中保存的 `start`，再写回 transform。
- 拖动改时间（`startTimeDrag`/`finishTimeDrag`）：预览期间，被拖的家族只改自己的 `translateX`，不全量重排；松开后保存，再按 §5.2 对该家族重新放置。

### 7.3 点击、双击与拖动 [S1]

- 用 `event.detail` 区分单击和双击，不使用固定延迟（macOS 的双击间隔可调）。`detail === 1` 时立即切换展开；`detail === 2` 时撤销刚才的切换，并进入原位编辑。编辑中的卡片强制展开。“展开 < 100ms”从切换生效开始计时。
- 按下标题后拖动超过 5px（与 `finishTimeDrag` 的阈值相同）时，视为拖动改时间；松开后不触发展开切换。

### 7.4 保留的现有交互

分叉冻结（不能拖动、编辑、删除）；时间基准切换；角色变化泳道和“视窗末端角色状态”折叠区（`:3148`）[S3]；“时期与连接列表”折叠区（`:3166`）和“查看时期”对话框 [S4]；待定位 / 延续事件弹层；时期对话框；↑↓ 纵向滚动 [S5]。底部的“查看事件详情”按钮（`:3138`）移除，因为卡片展开后已显示全部内容，「…」菜单中仍有“详情”[S5]。

### 7.5 定位、深链接与快捷键 [S2、S6]

- 目录、搜索、时间带圆点、待定位按钮、`panelFocus` 深链接，共用一个 `locateEvent(id)`：展开祖先，选中，按当前视图滚动或平移，然后闪烁。`panelFocus` 的 effect（`:269-325`）改为调用 `locateEvent`，并在首次视窗适配（`:398-418`）之后执行：首次适配完成时设置一个标志，`locateEvent` 等到这个标志后再运行，所以不会被首次适配覆盖。
- **Ctrl/⌘ + F** [S2、R5、N2，用户 2026-11-16 决定：接入快捷键系统]：
  - **作用域** [P1]：新增两个作用域值。`worldline` 用于世界线的画布、目录和卡片；`worldline-search` 用于世界线搜索框。以下位置都加入这两个值：`ShortcutScope`（`desktop/core/shortcuts.ts:2`）、`DesktopCommandScope`（`src/lib/desktop/command-scope.ts:1`）、`ShortcutContext.scope`（`desktop/core/shortcut-dispatch.ts:4`），以及目录校验脚本中写死的作用域白名单（`scripts/verify-command-catalogs.mjs:15`）。
  - **`commandScope(target)` 的判断顺序** [N2]：
    1. `composer`；
    2. 对话框内（`target.closest('[role="dialog"],[role="alertdialog"]')`）时，跳过所有世界线判断，按原有规则继续；
    3. 世界线搜索框（`target.closest('[data-worldline-search]')`，且在 `[data-command-scope="worldline"]` 内）返回 `worldline-search`；
    4. 原有的 `input` 判断（面板内编辑器表单的输入框仍是 `input`）；
    5. 原有的 `markdown`（Monaco）和 `preview`。事件编辑器内嵌的 `MarkdownEditor`（`:1736`）在这一步命中，所以 ⌘F 仍执行 `md.find`；
    6. **最后**才兜底：`target.closest('[data-command-scope="worldline"]')` 返回 `worldline`（世界线画布、目录、卡片）；
    7. 其余返回 `none`。
  - **启用的命令** [N2、P1]：
    - `worldline-search`（搜索框）启用 `worldline`、`input`、`text`、`global` 四类命令，用户改过的 22 条 `input.*` 绑定（回车、Esc、光标移动等）在搜索框里仍然有效。
    - `worldline`（画布、目录、卡片）只启用 `worldline` 和 `global` 两类。原因是用户改绑某个 `input.*` 或 `text.*` 命令后，它原来的默认键会被判为“已移除的默认键”：dispatcher 返回 `blocked`（`shortcut-dispatch.ts:53`），Controller 在 `:96` 拦截这个键。如果在画布上也启用这两类命令，画布的方向键平移（`PlanningWorkspace.tsx:2853`）、目录的键盘导航、小地图的 ←→ 都会失效。
    - 需要修改的位置：`configurationFor`（`shortcut-dispatch.ts:9`）、`DesktopCommandController.tsx:76` 的 `active` 过滤，以及 `:88` 的提前返回。`:88` 的规则：两个作用域中，没有命中自定义按键、也没有命中 `worldline.*` 命令的按键，都交给原生或组件自己的 keydown 处理。
  - **冲突检查** [N2、P1]：`worldline.search` 的作用域是 `worldline`，但它在两个作用域中都生效。`overlapping`（`shortcuts.ts:35`）中，`worldline` 与 `global`、`text`、`input` 重叠，与 `markdown`、`composer` 不重叠。这是因为它在搜索框里会与 `input.*`、`text.*` 同时生效，冲突检查必须把这种情况算作冲突。所以 `worldline.search` 和 `md.find` 可以共用同一个默认按键；它与 `input.*` 或全局命令冲突时，仍按“冲突原子转移”（`shortcuts.ts:40-60`）处理。
  - **命令定义**：`desktop/shared/commands.json` 中新增 `{"id":"worldline.search","label":"搜索世界线事件","group":"世界线","scope":"worldline","mac":"Cmd+F","win":"Ctrl+F","locked":false}`。之后用 `scripts/generate-command-catalogs.mjs` 重新生成目录，并用 `verify-command-catalogs.mjs` 校验。快捷键设置中可以录制、多绑定、修改这个命令。
  - **按键路径** [N2，更正修订 3 的错误说法]：主窗口设置了 `setIgnoreMenuShortcuts(true)`（`desktop/main/index.ts:930`），所有按键都由渲染进程的命令控制器处理，原生菜单的加速键不会先触发。所以 ⌘F 只走上面的作用域判断。
  - **菜单点击路径**：只有用鼠标点击“编辑 > 查找”时，才会经 `index.ts:911` → `DesktopApp.tsx:157` 送到 `DesktopCommandController.tsx:51`。`:51` 改为：`md.find` 到达时，如果当前目标的作用域是 `worldline` 或 `worldline-search`，就改为执行 `worldline.search`；其它 `md.*` 命令照旧丢弃。
  - **执行**：`worldline.search` 通过 `desktopCommandTargets` 注册到当前获得焦点的世界线面板实例，执行时聚焦并全选该面板的搜索框。
  - **测试**：更新 `command-catalog.test.ts`、`shortcut-settings.test.ts`、`native-command-priority.test.ts`。新增以下用例：作用域判断（7 个判断步骤）、启用命令过滤、冲突检查和原子转移、菜单点击改派。见 WU-66、WU-92。
- 搜索框的 Enter 先判断 `event.nativeEvent.isComposing`，输入法组字时不跳转 [S2]。
- **正文高亮** [S7]：`MarkdownPreview` 渲染完成后，用 `TreeWalker` 遍历文本节点，把命中的关键字包进 `<mark>`；不改 Markdown 源文本。搜索词变化时先移除旧的 `<mark>`，再重新包。

### 7.6 动效与可访问性 [S10]

- 小地图：`role="slider"`，带 `aria-valuemin`、`aria-valuemax`、`aria-valuenow`（视窗起点）和 `aria-valuetext`（格式化后的时间）。
- 时间点：`aria-label` = 标题 + 时间 + 重要度。卡片：`aria-expanded`。
- `prefers-reduced-motion: reduce` 时，关闭这些动效：闪烁、“关键”事件的扩散光环、180ms 下移过渡、平滑滚动（沿用 `globals.css:967` 的做法）。

## 8. 性能

目标（《诡秘之主》885 个事件，真实应用，事件表已启用虚拟化）：
- 事件表首次渲染 < 500ms；展开一张卡片到重排完成 < 100ms。
- 时间线拖动时每帧 < 16ms，不出现超过 50ms 的长任务；拖动过程中 `PlanningWorkspace` 的渲染次数为 0（用 React Profiler 计数）。

措施：收起状态不渲染 `MarkdownPreview`；`EventCard` 用 `memo`，props 保持稳定；事件表按 §5.1 虚拟化；平移按 §7.2 处理。

## 9. 测试与验收（详细用例见 docs/581）[M9]

- **单元测试**：`worldline-layout.ts` 中的每个函数。包括设计稿中发现的问题：拖动时卡片不移位，展开只影响下方，**同一缩放下跳到远古再跳回**，原点重定，搜索多关键字，小地图 `toX`/`toT` 互逆。历法适配器覆盖 4 种历法和时间基准。
- **导入**：语义白名单、值域校验、规整、跨批合并、发布转换、提示词 golden。
- **浏览器测试**：沿用 `planning-card-menu.test.ts` 的方式，使用真实的 `WorldlinePanel` 和内存接口数据。内容见 docs/581 §3。家族标题栏、分组框、待定位切换只能由这些固定数据覆盖（见下）。
- **真实目标系统**：
  1. 把 `~/shakeink-test-roots/cache-522` 复制到新的隔离根 `~/shakeink-test-roots/worldline-ui-583`。复制时把 inbox 中的 lease 回执移出（参见记忆），并确认 `state.json` 存在。
  2. **旧作品** [N5、P4]：
     - 先计算 `worldline-570/works/WL-wl-era1` 和 `WL-wl-base1` 两个原作品目录的哈希。
     - 把这两个目录复制到 `~/shakeink-test-roots/worldline-ui-583/works/`，不带 `.shakeink-lock`。
     - 新根**首次启动时、打开任何作品之前**，先清理复制过来的会话状态：删除 `session/` 中恢复的标签页，避免连接到原作品或给原作品加锁。然后用应用的“从列表移除”（`workspaces.ts:408` `forget`，只修改索引，不碰作品目录）删除 catalog 中指向原作品的所有登记。否则副本与原作品的 `id`、`novelId` 相同，打开副本时 `workspaces.ts:362-364` 会抛出“检测到重复作品”。
     - 之后在新根中按新路径打开两份副本。
     - 整轮测试结束后，再核对一次原作品的哈希，应与开始时一致，以证明 570–578 的验收数据没有被改动。
     两部作品：① `worldline-570/works/WL-wl-era1`：2026-11-15 由带纪元的版本保存，885 个事件，全部是“第五纪…”。② `worldline-570/works/WL-wl-base1`：2026-11-14 由无纪元的旧版本保存，91 条世界线，事件全部“待定位”。两部作品的两个视图都应正常显示，事件显示为“其他 / 一般”。各编辑一个事件的类型和重要度并保存，然后读回。
     - `~/Documents/小说/` 下的两部作品是用户本人的作品，不打开，也不复制。
  3. **新导入**：使用 LotmVerification.app，新开会话，只选第一卷“小丑”，目标为“角色 + 世界线”。保存后检查类型和重要度有值的比例、头像，并复测 docs/581 §5 中列出的用例和性能。
  4. 证据写入 `~/shakeink-test-roots/worldline-ui-583/evidence/<label>/`，不进入仓库，不包含原文和 Key。
- **平台**：本轮在 macOS 上做原生验收。按 implementation-boundaries 的要求，Windows 的原生验收在台账中标为“待验收”。
- **台账**：在 `docs/requirements-traceability.json` 中追加 WU 系列需求，写明对应的模块、测试编号和状态。“整树显示、移除面包屑”这项取舍的依据（577 §3、§9、§11、§13，以及已批准的设计稿 v9）也写进对应条目。只能追加，不能 checkout 这个文件（参见记忆：这个文件常有未提交的条目）。《诡秘之主》第一卷的导入结果中没有父子层级，也没有待定位事件，所以这些项的真实数据验证状态如实标为“真实数据未覆盖，仅固定数据浏览器测试”。不能用一次启动冒烟测试覆盖整组功能。

## 10. 风险

| 风险 | 处理 |
|---|---|
| `fix/worldline-chronology` 复审尚未通过 | 实现从它的提交开始；复审通过前不合并界面改版 |
| 拆分组件时破坏现有交互 | 先补齐现有交互的浏览器测试（拖动改时间、双击编辑、菜单、分叉冻结、时间基准），再拆分 |
| 885 个事件下时间带重算过慢 | 时间带只依赖 §5.1 的高度模型；只有实测高度变化时才重算受影响的段 |
| 导入模型对类型、重要度的判断不稳定 | 字段可选，不合法的值丢弃；用户可以在编辑器中修改 |
| Ctrl/⌘ + F 与原生菜单冲突 | 接入桌面命令注册表，并在真实 Electron 中验证 |

## 11. 审核意见处理表

| 编号 | 处理位置 |
|---|---|
| M1 导入契约 | §3 |
| M2 远古坐标 | §5.2（重定原点）、§9（跳到远古再跳回） |
| M3 虚拟化与时间带 | §5.1 |
| M4 层级模型 | §6 |
| M5 平移渲染路径 | §7.1（EventCard props）、§7.2 |
| M6 编辑器字段 | §2 |
| M7 图例 | §5.3 `dimmedBy`、§7.1 `WorldlineLegend` |
| M8 历法退化 | §4 |
| M9 台账与旧作品 | §9 |
| S1 | §7.3 |
| S2 | §7.5 |
| S3 | §7.1 `EventTimeline`、§7.4 |
| S4 | §7.1 `WorldlineToolbar`、`EventTimeline`，§7.4 |
| S5 | §7.2、§7.4 |
| S6 | §7.5 |
| S7 | §5.3 `matchEvent`、§7.5 |
| S8 | §7.1 `WorldlineToolbar` |
| S9 | §1、§7.1 `WorldlineHeader` |
| S10 | §7.1 `WorldlineLegend`/`EventTree`、§7.6 |
| S11 | §7.1 类型色 |
| S12 | §5.1 |
| S13 | §3 |
| S14 | §2 |
| R1 校验函数不改 artifact，两条路径都规整 | §3 |
| R2 宽度裁剪、写 transform 前重定原点、全量重排时重定原点 | §5.2 |
| R3 滚动锚定、虚拟化条件 | §5.1 |
| R4 视窗 store、交互中以 ref 为准、EventCard 抽取 | §7.1、§7.2 |
| R5 快捷键作用域 `worldline` | §7.5 |
| N1 世界坐标排布、逐元素换算裁剪、构建范围外不渲染、长跨度家族 | §5.2 |
| N2 作用域判断顺序、启用 input 命令、对话框排除、校验脚本白名单、按键路径更正 | §7.5 |
| N3 编辑器插槽、`data` 与关键字进 context、补齐回调 | §7.1 |
| N4 每个面板一个 store，唯一写入来源 | §7.2 |
| N5 复制旧作品到新根，原作品只读 | §9 |
| 说明 1 普通路径规整位置与计数 | §3 |
| 说明 2 隐藏标签页不重排 | §5.2 |
| P1 `worldline-search` 与 `worldline` 两个作用域 | §7.5 |
| P2 视窗使用者逐项列出 | §7.2 |
| P3 编辑器插槽改用独立 context | §7.1 |
| P4 先清理会话、移除原作品登记，再打开副本 | §9 |
| 细节：M4 删除 `constrainWindow`、`time.anchor`；M8 `fitDense` 条件、时间基准阈值；M9 指定旧作品、Windows 待验收 | §6、§4、§9 |
| 新增矛盾：尺寸以设计稿 v9 为准；S14 理由改正 | §5.1、§2 |
| 建议：S1 `event.detail`；S9 单独的保存状态与“只读”标记 | §7.3、§7.1 |
