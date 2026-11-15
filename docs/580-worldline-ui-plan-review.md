# 580 · 世界线界面改版 技术方案 独立审核

审核对象：`docs/580-worldline-ui-plan.md`（提交 `f1b07b4`）。
对照：`docs/577`（§1–§15）、`docs/575`、`docs/576`、`AGENTS.md`、`docs/implementation-boundaries.md`；设计稿 `design/worldline-redesign/`。
代码：`worldline-chronology` 工作树中未提交的纪元历法改动（`PlanningWorkspace.tsx`、`domain.ts`、`timeline.ts`、`era-calendar.ts`、导入相关文件）。行号均指 chronology 工作树。

**结论：不通过。** 下文列出 9 个必须修改项（M1–M9），以及若干建议修改项（S1–S14）。方案的总体方向可行：拆组件、纯函数布局、平移只改 `translateX`、字段带默认值。但导入契约、远古坐标、事件表虚拟化、层级模型、平移的 React 渲染路径、事件编辑器字段、图例、历法退化和台账这几处缺少可执行的方案，或者与设计和代码有冲突。

---

## 必须修改

### M1 导入契约不完整，按 §3 实施后模型回复会被严格校验拒收（方案 §3）

方案 §3 只提到改 `novel-import-ai-payload.ts` 的提示词、`novel-import-ai.ts`“非法值丢弃”和 `novel-import-publish.ts:168`。按代码，至少还缺以下几处：

1. **字段白名单。** `desktop/core/novel-import-semantics.ts:57` 的 `IMPORT_SEMANTIC_FACT_FIELDS.worldline` 不含 `category`、`importance`。`validateImportSemanticArtifactV1`（`:232-233`）在 strict 模式下遇到未列出的字段就返回“导入语义含未支持的业务字段”。worldline 回复经过 `novel-import-ai.ts:597` 的 `checkedArtifact.superRefine` 时会因此失败，触发纠错轮次或整批失败。方案“字段可选”的说法在现有校验链上不成立。
2. **丢弃非法值的位置。** 应写在 `normalizeLinesReply`（`novel-import-ai.ts:1416`，worldline 分支 `:1439`），并写明 facts 的值都是字符串（`"2"`，不是 `2`）。`validateImportSemanticArtifactV1` 的 worldline 分支（`novel-import-semantics.ts:264-270`）也要补上值域校验，否则非法值可能直接进入发布。
3. **跨批次合并。** 同一事件出现在两批章节中时，由 `mergeImportArtifacts`/`reconcileImportFact`（`desktop/core/novel-import.ts:308-322`）合并。现在没有这两个字段的合并规则，取值不同就会生成冲突，送到第 21 步人工处理。需要定规则，例如 `importance` 取较大值，`category` 保留先出现的值。还要说明这两个字段是否属于 `WIZARD_REVIEW_STRUCTURAL` 或 `WIZARD_REVIEW_NO_AUTO_REPAIR`（`novel-import-conflict-choices.ts:12-13`）。
4. **其他配套。** `desktop/shared/novel-import-field-labels.ts:6` 要加中文标签，否则冲突或复核界面会显示英文键。`novel-import-ai-payload.ts:79` 的 `referenceContract` 和 `:145` 的 `wizardLinesContract` 两处说明都要加。`tests/fixtures/novel-import-prompt-golden.json` 必须更新。
5. **发布。** `novel-import-publish.ts:168` 的 `f.category`、`f.importance` 是字符串，要转换并校验后再交给 `eventSchema.parse`。值非法时用默认值，不能抛错让整次发布失败。

### M2 远古事件的超大坐标没有解决，设计稿的修复同样有这个缺陷（方案 §4 `packFamilies`、§6“时间线平移”，577 §15）

方案说“只构建视窗前后各 3 个视窗宽度范围内的家族（避免远古事件产生超大坐标）”。但坐标是 `(start − base) × scale`，`base` 只在全量重排时更新（`app.js:428`）。只构建附近的家族并不能缩小坐标值。我用 Playwright 在 v9 设计稿上实测：

- 进入时间线视图后点小地图最左端，缩放比例不变，所以没有全量重排。远古家族的 `style.left = -1.13838e+09px`，浏览器计算值被截断为 `-3.35544e+07px`。
- 在远古位置缩放一次，`base` 变成远古时刻，再平移回现代：35 个现代家族的 `left` 都是 `1.13838e+09px`（计算值 `3.355e7`），屏幕上全部叠在同一个 x（`rect.left = 282`）。这正是 577 §15 记录的“两张卡片叠在一起”，在最终版设计稿中仍能复现。

《诡秘之主》按小时计，跨度约 47.8 万年 ≈ 4.2×10⁹ 小时，日级缩放下 x 可达 10⁹–10¹⁰ px，必然超出上限。方案必须写明重定原点的规则：当 `|windowStart − base| × scale` 超过阈值（例如 10⁶ px）时，平移 `base` 并重算 x0，同时保留每个家族的原位 y。`packFamilies` 的签名需要增加 `base`。单元测试和浏览器测试都要覆盖“同一缩放下跳到远古再跳回”这条路径，不能只覆盖“缩小后看全貌”。

### M3 事件表虚拟化与时间带布局冲突（方案 §7、§9）

- §7 说“超过 300 张时按视口虚拟化”，§9 说“不达标再启用虚拟化”，两处互相矛盾。《诡秘之主》有 885 个事件，按 §7 必然启用虚拟化。
- 时间带的段高等于卡片总高度（577 §3.2），圆点 y 依赖 `railPositions(segments, cardTops)` 的实测卡片位置。虚拟化后，视口外的卡片没有 DOM，也就没有位置。下列功能都需要不在视口内的卡片位置：目录定位到 1/3 处（§3.1）、滚动时的目录当前行同步、搜索跳转、时期定位、Ctrl+滚轮缩放时保持指针下卡片不动（§9）、年份吸顶。
- 方案必须给出不依赖 DOM 的高度模型：收起卡片固定 34px，间距 6px；断轴 44px；展开卡片和分组框用实测高度，未测时用估算值；缩放倍率用来增加根事件之间的间距。所有位置由这个模型算出，`ResizeObserver` 只用来修正实测高度。另外要写明是否虚拟化的唯一条件，并让性能测试在启用虚拟化的状态下测量。

### M4 子事件层级模型没有说明，与现有面包屑和分层冲突（方案 §5、§6；577 §1、§3、§11、§13）

现有代码按层显示：`eventParent`、面包屑（`PlanningWorkspace.tsx:2504-2525`）、“展开子事件”菜单项和按钮（`:2007`、`:2089`）、按层记忆视窗 `worldViews`/`fittedViews`（`:398-418`、`:2222`）、新建事件时用当前层作为 `parent`（`:2536`）、子层时间范围 `refinementRange`。577 §3 和 §13 改为两个视图都显示整棵树，时间线视图用标题栏加框体表示父子家族。但 577 §1 和 §4 又保留了“面包屑（进入子层时）”。方案没有说明以下几点：

- `eventParent` 和面包屑是否保留。如果保留，进入子层后目录、时间带、家族排布的范围是什么。
- 菜单中的“展开子事件”和卡片上的“展开 N 件子事件 ›”改成什么行为（展开家族，还是进入子层）。
- “当前层 · N 件事件”在整树模式下统计什么。
- 在什么上下文中用“＋ 事件”新建子事件。

请明确取舍，并逐一列出受影响的代码点。

### M5 平移时 React 的渲染路径无法达到“每帧 < 16ms、不重建卡片”（方案 §5、§6、§7）

方案让状态集中在 `PlanningWorkspace`，“通过 props 传入”，平移通过修改 `windowRange.start` 实现。现在每个 pointermove 都调用 `setWindowRange`（`:2786-2815`），会让整个 4735 行组件和 `renderWorld()` 重新渲染，并重新计算 `layoutTimelineCards`（`:2342`）。`eventCard` 是每次渲染都重新创建的闭包，引用了 `windowRange.span`、`timeBase` 等值（`:2044-2049`），所以 `EventCard` 上的 `memo` 不起作用。

方案必须写明以下几点：

1. 平移帧不经过 `PlanningWorkspace` 的状态：用 ref 直接写 `#plane` 的 `transform`；刻度尺、时期带、小地图、目录在子组件内节流更新；`windowRange` 在停止拖动或空闲时再同步回状态。
2. `EventCard` 的 props 不包含 `windowRange`。卡片上的时间标签只依赖事件精度，不依赖视窗跨度。回调用稳定引用。
3. 删除 `windowRange.y` 这个纵向偏移的变通做法（`:2977`、`:3004`、`:3097`），改用 spacer。同时说明平移取消（Esc、失焦，`:2120-2128`、`:2836`）在新方案下怎样恢复。

### M6 事件编辑器没有加入 `category` 和 `importance`（方案 §2、§5，577 §5.1）

577 §5.1 写明“事件编辑器增加这两项”，§9 恢复了 `importance`。577 §范围中“不改编辑器字段”已被这两条后加的内容覆盖。方案 §9 也说“用户可在编辑器中修改”，但 §5 的组件表和 §2 都没有修改 `renderEventEditor()`（`:1504`）。已导入的作品（包括《诡秘之主》）全部是“其他 / 一般”，只能在编辑器中修改，所以这一项必须实现。另外请说明事件详情对话框（`:3529`）是否显示这两个字段。

### M7 缺少类型图例和重要度图例（577 §8、§9）

577 §8 的 v2 设计稿规定：类型图例显示每类计数；单击隐藏或显示这一类，双击只看这一类；被隐藏的类型在卡片、树、圆点、引线、小地图上同步淡化。§9 规定图例右侧显示重要度的大小说明。方案的组件表、§6 和测试计划都没有提到图例。需要补充：放在哪个组件，淡化状态如何与搜索的淡化组合（设计稿 `app.js:13` 的 `dimmed` 是两者取或），以及对应的测试。

### M8 历法种类和时间基准的退化方案缺失，没有说明如何对接纪元历法（方案 §4）

目录的年份分隔、时间带的年份徽章和年/月刻度、断轴文字“≈ 约 N 年”、分段阈值“30 天”、短时间 `3-05`、小地图每段的起始年份，都要从历法得到年、月、日。方案没有说明这些依据：

- **带纪元的 gregorian 历法**（chronology 工作树）：必须用 `era-calendar.ts` 的 `civilFromDays` 和 `eraLabel` 计算真实月界，不能用设计稿的 `Y = 360`、`M = 30`（`data.js:4`）。`precision: 'era'` 的事件（导入中有 34 个远古事件，`novel-import-wizard-timeline.ts:276,295`）在时间带、目录和胶囊上显示什么？`formatTime(..., precision)`（`timeline.ts`）能否直接复用？
- **`fixed`**（按小时计，`hoursPerDay` 可为 null）和 **`years`** 历法：“30 天”换算成什么单位？没有月和年时，刻度和年份分隔怎样退化？575“约束与风险”最后一条已经提出这个问题，方案没有回答。
- **时间基准**切换（`timeBase`，`:2327-2340`）要对时间带标签、目录短时间、搜索中的“时间说明”生效，方案没有写。
- 初始视窗用 `fitDenseTimelineWindow`（`:412`），现有“全貌”按钮用 `fitTimelineWindow`（`:2581`）。新的“复位”和“全部时期（全貌）”分别对应哪个函数，需要写明。

### M9 缺少台账和旧作品回归验证（方案 §8；AGENTS.md）

- AGENTS.md 要求把需求、模块、测试 ID 和状态写入 `docs/requirements-traceability.json`（按记忆规则，这个文件常有未提交的条目，只能追加，不能 checkout）。方案完全没有提到台账。
- 方案说“旧作品不需要迁移”，但真实验证计划是“重新导入”，没有验证已保存的旧作品，例如 `worldline-570` 根中的 885 事件作品，或当前 `cache-522` 中的作品。需要增加一条真实目标系统用例：在不重新导入的情况下打开旧作品，两个视图正常显示“其他 / 一般”，编辑一次并保存后能重新读回。
- 《诡秘之主》第一卷导入结果中父子层级为 0、待定位事件为 0（575）。家族标题栏、分组框、待定位切换视图这几项无法在真实数据上验证。方案应写明这些只由固定数据的浏览器测试覆盖，在台账中如实标记为“真实数据未覆盖”，不能用一次启动冒烟测试覆盖整组功能。
- “重新导入到 `cache-522`”会改动现有隔离根。应先复制到新的隔离根（复制时按记忆规则移走 inbox lease 回执），使用 LotmVerification.app 和新会话，只选第一卷“小丑”。证据路径也要写明。

---

## 建议修改

- **S1 单击展开与双击编辑、拖动改时间互相干扰（§6，577 §2）。** 双击会先触发两次 click，展开状态切换两次后才进入编辑。按下标题拖动不足阈值（`finishTimeDrag` 的 5px 判断，`:2155-2163`）时松开也会切换展开。建议规定：单击延迟到双击判定之后执行，或在 dblclick 时撤销切换；拖动超过阈值后不触发 click。编辑中的卡片强制展开。
- **S2 Ctrl/⌘+F（§6）。** 原生“编辑”菜单的 `md.find` 已绑定 Cmd/Ctrl+F（`desktop/shared/commands.json:544-551`，`desktop/main/index.ts:844` 生成 accelerator），渲染进程的命令分发在 `DesktopCommandController.tsx:51` 按作用域过滤。方案要写明这个快捷键是否接入桌面命令注册表（受“录制真实按键、允许多绑定、冲突原子转移”的快捷键设置约束），还是作为面板内部按键。无论哪种，都要在真实 Electron 中验证菜单快捷键与面板搜索的先后顺序。搜索框的 Enter 要判断 `isComposing`，避免输入法组字时误触发。
- **S3 角色变化泳道（§4、§6）。** 泳道目前的 top 是 `layout.height + 28`（`:2381`），由 `toX` 定位。改为 `#plane` 后，泳道应放在平移层里，纵向位于 `tl.bottom` 之下，并在家族因展开下移时跟着移动。“视窗末端角色状态”（`:3148`）请注明保留。
- **S4 时期相关交互（§6）。** 方案没有列出：时期带拖动改时间（`:2930-2963`）、“时期与连接列表”折叠区（`:3166`）、“查看时期”对话框，以及 577 §9 时期下拉的定位行为（色带或竖条闪烁、提示“已定位到时期「…」· N 件事件”）。
- **S5 现有输入方式（§6）。** Shift+滚轮和横向滚轮平移（`:330-356`）、↑↓ 纵向滚动、底部“查看事件详情”按钮（`:3138`），请注明保留或移除。
- **S6 `panelFocus` 深链（`:269-325`）。** 改为调用 `locateEvent`：展开祖先、选中并闪烁。还要处理首次 fit 的 effect（`:398-418`）在同一轮覆盖定位视窗的先后顺序。浏览器测试应包含“从其他面板跳到某个子事件”。
- **S7 搜索高亮正文（577 §12）。** 黄色高亮要覆盖 `MarkdownPreview` 渲染出的正文（`src/components/editor/MarkdownPreview.tsx:19`），方案没有说明实现方法（例如 rehype 插件，或渲染后遍历文本节点）。搜索“时间说明”字段的来源（`time.label` 还是格式化后的时间）也要写明。
- **S8 窄窗口工具栏（577 §14）。** ≤1280px 和 ≤1160px 两档的隐藏和图标化规则、搜索框最小 120px、始终单行，方案没有写，测试也要覆盖 1440、1280、1160、1024、900 这几个宽度。
- **S9 面板标题栏（577 §14）。** 面板头部（`:4062-4097`）由世界线、叙事线、大纲三个面板共用。只改世界线时不能影响另外两个面板。`SaveStatusIndicator` 来自 `use-autosave`，规划面板的保存走 `put`/`save`，需要说明状态来源。
- **S10 可访问性。** 树要支持 ↑↓←→ 和 Enter（577 §3.1）。小地图 `role="slider"` 需要 `aria-valuemin/max/now/valuetext`。时间点要有 `aria-label`。闪烁、“关键”事件的扩散光环、180ms 下移过渡要遵守 `prefers-reduced-motion`（`globals.css:967` 已有先例）。亮色主题下类型色文字与背景的对比度需要实测。图例的淡化不能只靠颜色表达状态。
- **S11 类型色变量。** 设计稿用的是 `--c0..--c6`（`base.css:7`、`:14`）。方案改名为 `--event-*` 并放进 `globals.css` 的 `:root, .paper` 和 `.ink` 下。请写明 7 个枚举值到变量的映射位置（只放一处），避免组件里硬编码颜色。
- **S12 Ctrl+滚轮缩放事件表（577 §9）。** `railSegments` 和 `railPositions` 的签名没有缩放倍率参数。指针下卡片保持不动需要 M3 的高度模型支持。
- **S13 导入性能和缓存。** 每个事件多两个字段，第 17 步输出增加，提示词前缀也会改变。按记忆规则，世界线 + 叙事导入的 120 s 驱动和缓存命中率需要重新测基线，并且以首次运行为准。
- **S14 改动前的检查。** 请用 grep 确认没有代码对 `planning.data.events` 的原始 JSON 做哈希或全量比较，例如素材引用、复核绑定、`syncProjection`。旧文档解析后才补上默认值，第一次保存后所有事件都会多出两个键，不能因此误报“已变化”或产生大量差异。`novel-import-world-repair.ts` 也要一并检查。

---

## 逐项核对

### 用户约束（575 §需求）

| 约束 | 方案 | 状态 |
|---|---|---|
| 卡片默认收起、点击展开 | §5 `EventCard` | 有，见 S1 |
| 两个视图重做 | §5、§6 | 有，见 M4、M5 |
| 事件表左侧树、定位 | §5 `EventTree`、§6 定位 | 有，见 M3 |
| 竖向时间带、刻度、圆点、清晰时间 | §4、§5 `EventTable` | 历法依据缺失，见 M8 |
| 用《诡秘之主》测试 | §8 | 见 M9 |

### 577 各节

| 节 | 方案 | 缺口 |
|---|---|---|
| §1 工具栏 | §5 | 面包屑见 M4 |
| §2 收起/展开 | §5、§7 | S1 |
| §3 三栏、树、时间带、卡片列 | §4、§5 | M3、M8、S10 |
| §4 时间线视图 | §6 | M4、M5、S3、S5 |
| §5.1、§8、§9 类型和重要度 | §2、§3 | M1、M6、M7 |
| §9 分组框和标题栏、时期下拉、全部展开、Ctrl+滚轮 | 部分 | S4、S12 |
| §10、§12 头像、小地图 | §4、§5 | S10（slider 属性） |
| §11 淡出和标题栏 | §5 | 溢出后重新判断的时机没有写 |
| §12 搜索 | §4、§6 | S2、S7 |
| §13 共用目录、统一定位、二维排布 | §4、§6 | S6 |
| §14 主题和工具栏 | §5 | S8、S9、S11 |
| §15 平移不移位、展开只推下方、远古坐标、滚动位置被浏览器修正 | §4、§6 | M2、M5 |

### 与 chronology 工作树的兼容性

- 时间字段 `precision` 新增 `'era'`，日历新增 `eras`。新增的 `category` 和 `importance` 在 `eventSchema` 中，与 `applyPlanningOperations` 中局部 calendar 的合并（`domain.ts:665-676`）互不影响。分叉副本 `fork.events: z.array(eventSchema)`（`domain.ts:89`）在解析时会补默认值，可以兼容。
- `formatTime(value, calendar, span, precision)` 和 `eraLabel` 可以直接复用于展开卡片的时间行。短标签和刻度见 M8。
- 当前工作树（`872303d` 加文档）不含 chronology 的改动。方案 §9 写明在其提交并复审通过后再开始实现，与 576 第 4 条一致。

### 数据和契约

- `.default()` 能保证旧文档通过 `planningSchema.parse`（`services/planning.ts:48`、`:304`），历史快照恢复（`:540`）也一样。AI 的 put 是合并后再解析，所以缺这两个字段时不会报错。超出枚举的值会让这次操作失败，属于可以接受的严格行为；`z.toJSONSchema(planningSchema)` 会自动带上枚举。
- `forkChanged`（`PlanningWorkspace.tsx:2264-2276`）逐个比较字段，不比较整个对象。方案说“新字段不参与比较”，与现状一致。
- 导入链路的缺口见 M1。

### 测试

方案 §8 的分层方向正确：单元测试、浏览器测试使用真实的 `WorldlinePanel` 加内存数据（与 `planning-card-menu.test.ts` 相同），再做真实目标系统验证。需要补充：M2 的同缩放远古往返、M3 的虚拟化状态、M9 的旧作品、S2 的真实 Electron 快捷键、S8 的窄窗口、M7 的图例。另外要明确，浏览器测试的结果在台账中只能记为“组件测试通过”，不能记为真实验收通过。

---

## 修订 2 复审

复审对象：`docs/580-worldline-ui-plan.md` 修订 2（217 行）。行号仍指 chronology 工作树。

**结论：不通过。** M4、M6、M7、M8、M9 已具体解决。M1、M2、M3、M5 和 S2 仍各有一处问题：要么写法与代码不符，要么约束不完整。下面的 R1–R5 修改后即可通过，不需要再改设计。

### 仍须修改

**R1（M1，方案 §3 第 2 行）：“值域校验不合法时删掉字段”在校验函数里做不到；非向导导入路径没有规整。**
- `validateImportSemanticArtifactV1`（`novel-import-semantics.ts:229`）是纯校验函数，只返回结果或 `fail`，不修改 artifact。`novel-import-ai.ts:598` 的注释也写明“Reuse the final native validator without transforming provider values”。在这里“删字段”无法实现。如果只是忽略非法值，它会留在 facts 里，最后进入复核界面和发布。
- `normalizeLinesReply` 只在 `wizardLinesLaneRequest` 为真时调用（`novel-import-ai.ts:763`、`:1112`，要求 `executionLane==='wizard-lines-v1'`）。普通语义导入（`referenceContract`，`novel-import-ai-payload.ts:79`）的回复不经过规整。
- 需要二选一并写明：(a) 校验函数对非法值 `fail`，同时在两条路径的回复整理阶段都先删掉非法值；(b) 校验函数接受任意字符串但记录 `mappingWarnings`，由发布阶段（`novel-import-publish.ts:168`）回退为默认值。还要给出普通路径的测试。

**R2（M2，方案 §5.2）：上界只约束了家族的左坐标，没有约束元素宽度和重定原点的时机。**
- “绝对值 < 10⁶ + 7 × 视窗宽度”只适用于 `x0`。以下元素的宽度由时间跨度乘以 `scale` 得到，不受这个上界限制：父事件标题栏和框体（宽度不小于家族跨度，577 §11）、持续事件的时间条、开放结束的时间条（现有代码中 `barWidth` 为 `timelineWidth − 14 − x`，`:2992-2995`，在平移层坐标中没有意义）、角色变化泳道。一个跨越第四纪到第五纪的父事件，在日级缩放下宽约 10⁹ px，仍会超过浏览器约 3.3×10⁷ px 的上限。需要规定：这些元素都裁剪到已构建范围 `[windowStart − 3·span, windowStart + 4·span]` 之内，被裁掉的一端用“‹ 起点在视野外 / 延续到视野外 ›”标记（沿用 `:3043-3067`）。
- 重定原点必须在写入 `transform` 之前、同一帧中同步完成。小地图点击是单步跳转，如果“平移结束时才检查”，这一帧的 `translateX(−(windowStart − base) × scale)` 本身就是 10⁹ 级。方案写的“每次平移结束（以及每帧检查）”需要改成“每次写入 transform 前检查”。
- 全量重排（缩放变化，包括 `locateEvent` 因父事件家族超过视窗 60% 而缩小视窗）时，令 `base = windowStart`。设计稿是这样做的（`app.js:428`），方案没有写。
- 被固定家族的展开路径只改 y，不改 x，满足上界。增量构建的新家族使用当前 `base`，也满足上界。这两条路径不需要修改。

**R3（M3，方案 §5.1）：估算高度被实测值替换时会出现跳动；虚拟化条件的含义不明确。**
- 虚拟化后，“全部展开”的 885 张卡片中，视口外的卡片都只有估算高度。卡片进入视口并测得实际高度后，它下方所有卡片和时间带都会移动。如果被修正的卡片在视口上方，屏幕内容就会跳动，这与 577 §15 修复的是同一类缺陷。需要规定滚动锚定：修正发生在锚点（视口顶部的卡片）之上时，按差值同步调整 `scrollTop`；Ctrl+滚轮缩放时，指针下的卡片作为锚点。
- “卡片总数 > 300”要写清楚是全部事件数，还是折叠后可见的卡片数。建议用全部事件数，避免折叠或展开时在虚拟化与非虚拟化之间来回切换。

**R4（M5，方案 §7.1、§7.2、§8）：三处写法与“拖动中 `PlanningWorkspace` 渲染 0 次”的目标冲突。**
- 目录（`EventTree`）由两个视图共用，折叠、滚动、选中状态要在视图切换后保留（577 §13），所以它的状态在 `PlanningWorkspace` 或更上层。“每 100ms 节流更新目录的视窗内标记”如果通过 `PlanningWorkspace` 的 state 传递，渲染次数就不会是 0。需要写明通道，例如一个外部 store 配合 `useSyncExternalStore`，只让 `EventTree` 订阅视窗变化。
- 平移期间 ref 和 props 谁说了算没有规定。150ms 同步回 state 之前，任何其他原因引起的重渲染（查询刷新、`ResizeObserver` 写入高度、悬停状态、保存完成）都会把旧的 `windowRange` 作为 props 传进来。如果 `EventTimeline` 根据 props 写 transform，画面会跳回旧位置。需要规定交互进行中以 ref 为准，忽略 props 中的 `start`。
- “展开态复用现有 `eventCard()` 的内容”与 `memo` 加最少 props 的写法冲突。`eventCard`（`:1949-2103`）是闭包，直接引用了 `data`、`query.data.characters`（`chip`）、`readonly`、`eventDraft`、`activeWorld.fork`、`put`、`setDialog`、`quotePlanning`、`eventReferences`、`worldEvents(data, …)`（子事件计数）和 `windowRange.span`（`:2044-2049`）。方案需要说明怎样抽出：哪些改为 props 或 context，哪些改为稳定回调。时间行目前按 `windowRange.span` 截断，要改为只按精度给出 span（日精度用 48，时精度用 1），否则 props 中仍然离不开 `windowRange`。

**R5（S2，方案 §7.5）：“作用域过滤（`DesktopCommandController.tsx:51`）让 `worldline.search` 优先于 `md.find`”与代码不符。**
- 快捷键作用域只有 `global | text | markdown | composer | input`（`desktop/core/shortcuts.ts:2`），`commandScope()` 只返回 `none | markdown | composer | input | preview`（`src/lib/desktop/command-scope.ts:1`），代码中没有“世界线面板”作用域。焦点在画布上时作用域是 `none`，此时只有 global 命令生效（`DesktopCommandController.tsx:76`；`shortcut-dispatch.ts:9`）。焦点在搜索框时作用域是 `input`，按键在 `:88` 直接交给原生处理。
- `:51` 只会丢弃不在 markdown 或 preview 作用域内的 `md.*` 菜单命令，不会把命令转给别的处理者。如果原生菜单的 Cmd/Ctrl+F 加速键（`desktop/main/index.ts:844-846`）先于渲染进程触发，`md.find` 到达 `:51` 后会被丢弃，世界线搜索也不会打开。
- 如果新命令设为 `global`，冲突检查函数 `overlapping`（`shortcuts.ts:35`）会判定它与 `md.find` 冲突，而且是默认绑定之间的冲突。
- 需要给出完整做法，例如：新增作用域值 `worldline`，并修改 `ShortcutScope`、`overlapping`、`commandScope`（用 `closest('[data-command-scope="worldline"]')` 识别）、`shortcut-dispatch` 的过滤、`DesktopCommandController` 中 `:76` 的过滤和 `:88` 的提前返回规则（搜索框本身就在面板内）。还要处理菜单路径：`md.find` 到达且目标在世界线面板内时，改为执行 `worldline.search`。修改 `commands.json` 后要重新生成 `command-catalogs.generated.json`（`scripts/generate-command-catalogs.mjs`），并更新 `command-catalog.test.ts`、`shortcut-settings.test.ts`、`native-command-priority.test.ts`。另一种做法是不进入注册表，只在面板内处理按键，但这样需要说明为什么不受快捷键设置约束（AGENTS.md 要求快捷键逐条照批准设计实现）。

### 已解决（附带的小问题，实现时处理即可）

- **M4（§6）**：整树显示加移除面包屑，与已批准的 v9 设计稿一致；577 §9、§11、§13 覆盖了 §1、§4 中的“面包屑”。建议在 581 或台账中注明这项取舍的依据。“在『…』下新建子事件”要同时设置 `parent` 和 `time.anchor`，沿用 `:2536-2538` 的写法。删除 `constrainWindow` 的 effect（`:218-224`）这一点请写明。
- **M6（§2）**：已解决。
- **M7（§5.3、§7.1）**：已解决。
- **M8（§4）**：已解决。有两处细节。首次进入和“复位”使用 `fitDenseTimelineWindow`，应写成“与 chronology 相同的条件（只在有纪元时使用，`:412`）”，否则无纪元作品的行为会改变。时间基准的历法单位与世界线不同时，断轴阈值的“30 天”要换算回世界线的小时，再与 `base.scale` 相乘。
- **M9（§9）**：已解决。请写明“旧作品”指 `cache-522` 中的哪个作品，以及它是否由带纪元的版本保存过。最好再验证一个没有纪元的旧作品。implementation-boundaries 要求 macOS 和 Windows 各自做原生验收，台账中 Windows 一项应标为“待验收”。

### 修订 2 新增的矛盾

- **断轴高度和缩进与 577 不一致。** 方案 §5.1 写断轴 46px、子事件缩进 18px，577 §3.2 是 44px，§3.3 是 16px/层。设计稿 v9 的断轴是 46px（`app.js:150`、`:203`），目录缩进是 16px（`app.js:104`）。请以已批准的设计稿为准，并在方案中注明。
- **S14 的说法不准确。** `worldRepairProtectedRowsHash` 的 `protectedKeys` 包含 `'planning'`（`novel-import-world-repair.ts:19`），方案说的“与规划事件无关”不对。哈希是对数据库原样存储的行计算的，默认值只在读取时补上，所以结论“不会误报”仍然成立。请改正这句的理由。

### 建议修改项

S3–S8、S10–S13 已充分采纳。另有三条：
- **S1**：固定延迟 220ms 比 macOS 可以设置的双击间隔短。用户双击较慢时，第一次单击已经切换了展开状态。建议改用 `event.detail`：`detail === 1` 时立即切换，`detail === 2` 时撤销切换并进入编辑。“展开 < 100ms”从切换生效时开始计时。
- **S9**：“保存失败”从 `message` 推导不可靠，`message` 也用于其他提示。建议在 `put` 和 `save` 中维护单独的保存状态。现有头部显示“只读”（`:4073-4076`），这是真实状态，改版后要保留，例如作为第二个 `Badge`。
- **S14**：见上一节。
