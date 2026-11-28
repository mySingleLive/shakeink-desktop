# 612 · 正文框选 AI 助手工具栏 技术方案

## 1. 依据

- 调研：`docs/612-selection-ai-toolbar-research.md`；产品设计：`docs/612-selection-ai-toolbar-product.md`。
- 已批准设计：`design/selection-ai-toolbar/index.html` v9（用户 2026-11-29「UI 设计通过，可以继续」，记录于 `docs/implementation-boundaries.md`）。
- 用户随批准追加：润色、扩写、缩写、续写、重写等 AI 修改除本章上下文外，还要参考小说主题、角色、设定、世界线、叙事线、大纲。
- 产品设计 §9 未答问题按设计稿默认：仅作品正文；续写写回「原文 + 续写」；总结保留替换；输入框不含标准/计划模式；框选时隐藏原选区「添加评论」圆钮（段落悬停钮与行号槽钮保留）。

## 2. 要求清单

| 编号 | 要求 |
|---|---|
| R1 | 作品正文编辑、分屏左右、预览框选非空文字后，选区末行下方 8 px 弹出 34 px 细长工具栏；下方不足翻到首行上方；随滚动跟随，滚出隐藏；评审视图、整章生成中、处理框存在、评论/伏笔/阅读设置弹框打开时不弹 |
| R2 | 工具栏从左到右：添加评论 · 输入修改要求 · 润色 · 扩写 · 续写 · ⋯；⋯ 菜单列出润色、扩写、缩写、续写、重写、总结（名称 + 说明） |
| R3 | 添加评论：沿用现有 `CommentComposer` 与 `onCreateComment`，效果与原选区评论圆钮相同；评论框打开期间不弹工具栏；框选时不再显示原选区评论圆钮 |
| R4 | 输入修改要求：工具栏消失，原位弹出宽 min(560, 正文宽 − 32) px 输入框；选中文字摘要（引号图标 + 浅底条 + 已选 N 字）；contenteditable 输入区 2–6 行；@ 引用与「+ 插入角色·场景·大纲」；`ModelPicker` 同款模型/思考强度（仅本次）；无作品选择、模式、发送、图片/附件、# 会话、/ 命令 |
| R5 | 输入框下方功能列表六项；当前选择项主色浅底高亮，默认润色；Enter 执行当前选择；Shift+Enter 换行；↑/↓ 只移动光标；⌘↑↓（macOS）/ Alt+↑↓（Windows）切换选择、首尾循环、光标不动、@ 弹窗打开时与输入法组合中不响应；Tab 进入列表，列表内 ↑/↓ 移动高亮并改变选择，首项 ↑ 或 Shift+Tab 回输入框；Esc 先关 @ 弹窗再关输入框并恢复正文选区；点功能直接执行；同一选区内要求保留，换选区清空并恢复润色 |
| R6 | 处理框：正文区底部居中，宽 min(640, 正文宽 − 32) px；上部 160 px 只显示 AI 输出（思考折叠为「思考中…/已思考 N 秒」+ 正文流式追加，自动滚底，用户上滚暂停）；状态栏「X中 · 已生成 N 字」+ 停止；选区原文浅色底纹高亮；右下评分指示器让位 |
| R7 | 停止：「已停止 · 已生成 N 字」，按钮继续 / 放弃；不完整结果不可替换。失败：红色「X失败：原因」，继续 / 放弃。继续以已生成部分为前文接着写 |
| R8 | 完成：框长高到 260 px（200 ms），显示最终文本（正文段落排版，可复制不可编辑）；「X完成 · [第 N 次 ·] 原文 a 字 → b 字」；按钮 放弃 / 重试 / 替换；续写显示「原文（灰）+ 续写」 |
| R9 | 重试：同功能、同要求、同选区、同模型重新生成；丢弃当前结果；状态显示「第 N 次」；不改正文、不写历史 |
| R10 | 替换：先保存未保存输入；校验选区原文仍在原位置且版本未被他人改动，否则拒绝，显示「复制结果 / 放弃」；一次提交写两条历史「AI X前」（替换前全文）与「AI X」（替换后全文），即使前一版刚被自动保存；成功后浮层消失、新文字闪烁并滚动到可见 |
| R11 | 撤销：替换后撤销条 10 秒（再编辑或新任务时消失）；「撤销」恢复替换前正文，新提交原因「撤销 AI X」；编辑/分屏视图替换后紧接 Cmd/Ctrl+Z 同效；之后又编辑则不再提供 |
| R12 | 版本历史列表每行显示原因；「AI X前 / AI X / 撤销 AI X」为主色浅底 ✦ 标签，其他原因灰色；本次新增行淡绿提示一次；详情页头部显示原因标签 |
| R13 | 无模型：工具栏照常出现，功能按钮与列表项禁用并提示「请先在 设置 → 模型 中添加模型」；输入框可打开可输入；不发请求，不回退 |
| R14 | 选中超过 10000 字：功能按钮禁用，提示「选中文字超过 1 万字，请缩小范围」 |
| R15 | 处理期间正文不锁定；改动选区原文时状态栏提示「选中原文已改动，完成后无法直接替换」；切换视图保留处理框并重绘选区高亮；关闭标签或切换章节中止并丢弃；处理框存在时「⋯ → AI 生成正文/重新生成正文」禁用 |
| R16 | AI 修改的模型上下文：选区、前后约 1500 字、章节标题、卷大纲、本章细纲；**并且**小说主题、文风、角色（按本章弧线阶段）、设定、世界观、本章叙事线投影（卡片/讲述意图/披露与暂不披露）、本章涉及的世界线事件、本章伏笔线索、前一章结尾 |
| R17 | 宣纸/玄墨两主题；窄面板（正文宽 < 480 px）「输入修改要求」收为图标按钮 |
| R18 | 键盘可达：Tab 进入工具栏，方向键在按钮间，Enter 执行；Esc 在 Electron 中按 docs/599 处理 |
| R19 | 用量按 `selection.<功能>` 动作记录 |

## 3. 现状要点

- 正文外壳 `ChapterContentPanel.tsx:48-461`：`useAutosave` PATCH 保存，`versionRef`/`controller`（暂停、恢复、`confirmExternal`），`receiveCommit` 按回执更新编辑器；`generationLock` 防重入；外层 `ChapterContentPanel` 按 `useExternalSyncKey` 决定是否重挂载（自己的保存不重挂）。
- `MarkdownEditor` 编辑视图 Monaco、预览 `CommentablePreview`；伏笔已经有统一选区回调：Monaco `use-editor-references.tsx:46-47`、预览 `preview-references.tsx:165`，产出 `selectionSnapshot(source, start, end)`（源文偏移）。工具栏复用这两个入口，不另写 DOM→源文映射。
- 选区评论：预览 `CommentablePreview.tsx:252-293`（mouseup → `addBtn` → `openComposer`），Monaco `use-monaco-comments.tsx:380-417`（`addBtn` → composer ViewZone）。两者都把 composer 挂在选区末块/末行之后。
- 正文提交 `content-commit.ts:89-130`：锁章 → CAS → `snapshotChapter(before, "修改前稿件")` → 写入 → `snapshotChapter(after, reason)`；`snapshotChapter` 对同一 `version` 只保留一份（已存在则复用），所以刚被自动保存过的前一版不会新增「AI X前」记录。
- `listChapterVersions` 已返回 `reason`，`ChapterHistory.tsx:131-146` 列表不显示它。
- 小说上下文：`buildNovelSections`（主题、文风、角色按本章弧线、设定、世界观、场景、伏笔摘要，`context.ts:335`）、`buildChapterSections`（卷大纲 + 本章大纲 + 前一章结尾，`context.ts:400`）、`buildChapterMaterialContext`（本章道具/场景、伏笔线索、涉及世界，`story-materials.ts:89`）、`chapterProjection`（叙事线卡片/讲述/节拍/披露，`domain.ts:683`）、`chapterMaterials(...).events`（本章世界线事件，`story-materials.ts:40`）。整章生成 `chapter.ts:86-145` 组合了以上全部。
- 提示词模板由 `prisma/seed-templates.ts` 提供，`template-library.ts:45` 启动时补齐新 key 并升级未改动的内置模板。
- 路由：`docs/migration-map.json` → `scripts/generate-routes.mjs` → `routes.generated.ts`；handler 放 `desktop/handlers/...`。
- 快捷键：`desktop/shared/commands.json` + `command-registry.ts` 的 `contexts`（如 `ai.mentionNext` 的 `{mention:true}`）；`commandScope` 中 `.chat-composer-editable` 为 `composer` scope；`DesktopCommandController` 在 composer scope 下只拦截被绑定的键，其余交给原生（所以 ↑/↓ 原生移动光标）。macOS 原生 ⌘↑/⌘↓ 在 contenteditable 中是到开头/结尾，绑定后由命令接管。`ai.historyPrev/Next` 默认 Alt+↑↓ 也是 composer scope，与 Windows 的 Alt+↑↓ 冲突（§4.7 处理）。
- Esc：`DesktopCommandController.tsx:113` 在存在 `[role="dialog"]` 或打开的 `[role="menu"]` 时放行 Esc；否则 `ai.stop`（global）会抢。
- 模型：`getModelByIdForUser(userId, modelId, {thinkingEffort})`；`resolveLocalModel` 无模型时抛错，不回退。

## 4. 方案

### 4.1 共享纯逻辑 `src/lib/selection-ai.ts`

- `SELECTION_AI_ACTIONS`：六项 `{ key, name, desc, icon, instruction, usage }`，顺序固定（润色、扩写、缩写、续写、重写、总结），`instruction` 为产品设计 §2.3 默认要求。`TOOLBAR_ACTIONS = ["polish","expand","continue"]`，`DEFAULT_PICK = "polish"`。
- `stepPick(current, dir)`：首尾循环。
- `selectionLimit = 10000`，`overLimit(text)` 按 `countChineseWords`。
- `resultText(action, original, output)`：续写返回 `original + "\n\n" + output`（原文末尾已有换行时不重复），其余返回 `output`。
- `applyReplacement(source, start, end, text)` 与 `selectionStillMatches(source, start, end, quote)`。
- `historyReason(action, phase: "before" | "after" | "undo")`：`AI 润色前` / `AI 润色` / `撤销 AI 润色`；`isSelectionAiReason(reason)` 供版本历史标签。
- `toolbarPlacement(rects, view, size)`：选区矩形 → 工具栏/输入框坐标（下方 8 px、翻上、贴边、滚出隐藏、输入框首次打开需滚动量），纯函数便于单测。

### 4.2 服务端：生成 `src/lib/services/selection-ai.ts`

`prepareSelectionRewrite(scope, input)`，input：`{ action, start, end, quote, baseVersion, baseHash, requirement?, modelId, thinkingEffort?, continuation?: string }`。

1. **生成基准取自快照，不取当前章（审核 B3）**。前端发起首次请求前先 `flush()`，以 flush 后的 `versionRef` 与 hash 作为 `baseVersion/baseHash`。服务端 `ownedChapter` 后确定基准正文：若当前章 `version === baseVersion` 且 `contentHash(content) === baseHash`，直接用当前正文；否则读 `ContentVersion(Chapter, baseVersion)` 中该版本最早的快照，取其 `content`。**不能假定每个修订都有快照**（复审 N1）：建章（`outline.ts:171`、`planning.ts:147`、`novel-import-publish.ts:155`）时 version 1 不写快照，只在首次提交时由 `snapshotChapter(before)` 补上。由于前端发起前已 flush，首次请求时基准一定等于当前稿；只有处理期间作者又保存了，才需要读快照，而那次保存已经为 `baseVersion` 补了快照。两者都找不到、或 hash 不等于 `baseHash`、或 `content.slice(start, end) !== quote`，返回 409「正文已变化，请重新框选」。生成路径不写库。重试与继续沿用同一 `baseVersion`，所以作者在处理期间编辑别处（自动保存使版本加 1）不影响重试与继续；是否还能替换在提交时再判断（§4.3）。
2. 长度：quote 去空白后为空 → 400；超过 10000 字 → 422 `SELECTION_TOO_LONG`；`requirement` ≤ 2000 字；`continuation` ≤ 200000 字。
3. 上下文（R16），与整章生成同源，**按是否有规划分两路（审核 B1）**：
   - 读规划；本章在规划中（`planning.chapters` 含本章）时：`materialContext = buildChapterMaterialContext(novelId, chapterId)`，`buildNovelSections(novelId, chapterId, materialContext, requirement)`（与整章生成相同的聚焦方式），settings 为 `[sections.settings, materialContext.section]` 拼接（同 `chapter.ts:124`，含本章道具与场景资料），叙事线 `chapterProjection(...).outline`，世界线事件 `chapterMaterials(...).events` 渲染为「标题 · 事实」，伏笔 `materialContext.foreshadows`；
   - 不在规划中（含无规划作品）时：`buildNovelSections(novelId, chapterId, undefined, requirement)`（全量世界观、设定、伏笔一览），叙事线与世界线事件为「（本章未纳入叙事线规划）」；
   - 两路都加：`buildChapterSections`（卷大纲 + 本章大纲 + 前一章结尾）、作品名、章节标题、选区前后各 1500 字（截在段落边界）；
   - 各节单独截断上限（设定 12000 字、角色 8000 字、叙事线 8000 字、其余 4000 字），截断时注明「（已截断）」。上限常量放 `selection-ai.ts`，单测覆盖；
   - 作者要求中的 @ 引用 token 原样传入（与对话一致）。
4. **模型不回退（审核 I7）**：前端总是传具体 `modelId`（默认取对话当前模型选择 `useChatStore.modelChoice`，为空时取任务默认文本模型）。服务端 `resolveLocalModel(userId, "text", modelId, "selection")` 拿到记录后 `instantiateModel(...,{ thinkingEffort })`，失效 id 直接报 `MODEL_NOT_FOUND`，不换成默认模型；无模型报 `MODEL_NOT_CONFIGURED`，前端提示添加模型（R13）。`streamGeneration` 传入 `resolvedModel`，确保用的就是所选模型。
5. 提示词：新模板 `selection.rewrite`（变量 `novelTitle`、`chapterTitle`、`action`、`instruction`、`requirement`、`theme`、`style`、`characters`、`settings`、`narrative`、`worldEvents`、`chapterOutline`、`previousSummary`、`foreshadows`、`before`、`selection`、`after`、`continuation`），加入 `prisma/seed-templates.ts`，启动时由模板库补齐，作者可在模板库修改。模板要求：只输出替换选区的文字；不重复选区外内容；不提前揭晓「暂不披露」；人称、时态、文风与上下文一致；续写只输出接在选区后的新文字；总结输出一段概括；`continuation` 非空时从其末尾接着写，不重复。
6. 调用 `streamGeneration({ resolvedModel, action: "selection.<key>", abortSignal })`。`acquireLongTask` 排队期间先发 `queued` 事件，前端状态栏显示「等待中…」。

路由 `POST /api/novels/[id]/chapters/[chapterId]/selection-ai`（`desktop/handlers/novels/[id]/chapters/[chapterId]/selection-ai/route.ts`），SSE：`queued`、`reasoning-delta`、`text-delta`、`done { finishReason }`、`error { code, message }`；断连 `abort`。输出不落库（重试/放弃无副作用，R9）。`finishReason` 不是 `stop` 时前端按失败处理（R7）。登记到 `migration-map.json` 的 `routes`：现有 disposition 只有 `migrate-handler`/`replace-boundary`/`excluded-platform`，本功能为桌面新增，使用 `migrate-handler` 并在 `reason` 注明「桌面新增本地 handler（docs/612），无上游对应」，`scripts/generate-routes.mjs` 生成路由。

### 4.3 服务端：替换与撤销

`commitSelectionReplacement(scope, input)`：`{ action, start, end, quote, replacement, expectedVersion, expectedContentHash, operationId }`。前端在提交前 `flush()`，传 **flush 后**的 `versionRef` 与当前 hash，以及经编辑器装饰跟踪更新后的 `start/end`（作者在别处编辑会移动偏移），不是生成时的 `baseVersion`（审核 I1）。

- 在 `commitChapterRevision` 事务内完成。顺序：`lockContentOperation` → **先查 `contentMutation` 幂等回执**（同一 `operationId` 重放直接返回原回执与正文）→ 锁章 → 版本/hash CAS（原有 `VERSION_CONFLICT`/`CONTENT_HASH_CONFLICT`）→ 校验 `content.slice(start, end) === quote`（否则 `SELECTION_CHANGED` 409）→ 写入。为此在 `commitChapterRevisionInTransaction` 增加可选 `precheck(before)` 回调，在回执检查与 CAS 之后、写入之前调用，不在回执检查之前做选区校验（审核 I1）。
- 新增 `ChapterRevisionInput.beforeReason?: string`：设置时，若 `before.version` 已有快照（自动保存留下的），**另建一条**同 `version` 快照，`reason` 为 `beforeReason`，内容须与已有快照一致（沿用 `snapshotChapter` 的一致性检查）。`before.version` 没有快照时（新建或导入后从未修订的章），只建一条以 `beforeReason` 为原因的快照，不再另建「修改前稿件」。`snapshotChapter` 增加可选 `createdAt` 参数；前快照 `now`，后快照 `now + 1 ms`，保证列表「AI X」在「AI X前」之上（审核 I3）。
- **同版本多快照的其他读取方（审核 I3）**：`content-candidate.ts:220/254/257` 与其他 `contentVersion.findFirst({ version })` 调用改为 `orderBy: [{ createdAt: "asc" }, { id: "asc" }]`，取该版本最早的快照（即原始的那条）；`:254` 的 `reason.startsWith("替换采用候选稿")` 判断改为在该版本快照中 `some(reason 匹配)`。实现前 `grep contentVersion.findFirst` 列出全部调用并逐个改，单测覆盖候选撤回/换用撤回在存在「AI X前」快照时仍正确。
- `source: "ai-selection"`（新增 `ContentSource`，仅 TS 类型，不入库）。不经 `source === "ai"` 的整章完整性与字数预算检查；服务端自查：replacement 非空、与 quote 不同、≤ 200000 字。
- `reason: historyReason(action, "after")`、`beforeReason: historyReason(action, "before")`。返回 `ContentReceipt` 与新正文。
- **撤销 `undoSelectionReplacement`（审核 I2）**：`{ replacementOperationId, expectedVersion, operationId }`。事务内先 `lockContentOperation` 并**先查本次撤销 `operationId` 的回执**，存在即返回（重放时版本已前进，不能再做过期校验，复审 B5；顺序同 `content-candidate.ts:226-227`）。之后读 `contentMutation(replacementOperationId)`，要求其属于本章、`afterVersion === expectedVersion === 当前版本`、`afterHash === contentHash(当前正文)`（替换后未再编辑），否则 409 `SELECTION_UNDO_STALE`；取 `beforeVersion` 的「AI X前」快照正文（按 `reason` 精确匹配，回退取该版本最早快照），`commitChapterRevisionInTransaction(tx, { source: "restore", reason: historyReason(action, "undo"), expectedVersion, expectedContentHash: mutation.afterHash, changes: { content } })`（复审 N6）。重放同一 `operationId` 返回原回执。做法同 `content-candidate.ts:228-231`。
- 路由：`POST .../selection-ai/commit`、`POST .../selection-ai/undo`，`mutationInput` 校验 `expectedVersion`/`operationId`。

### 4.4 编辑器：选区通道 `MarkdownEditor`

- 新增可选 prop `selectionActions?: { render(anchor: SelectionAnchor): ReactNode; active: boolean; onComposerChange?(open: boolean): void }`，只由 `ChapterContentPanel` 传入；其他调用方不传，行为不变。
- `SelectionAnchor = { snapshot: ReferenceSelection & { blockIndex?: number; line?: number }; view: "edit" | "preview"; rects(): DOMRect[] | null }`。
- **选区来源（审核 I8）**：
  - Monaco：在 `MarkdownEditor` 内单独订阅 `onDidChangeCursorSelection`，**另加**去抖：鼠标选取在 `onMouseUp` 后、键盘选取在最后一次变化后 300 ms 才发布；`snapshot` 用 `selectionSnapshot(model.getValue(), startOffset, endOffset)`，`line = endLineNumber`（composer ViewZone 需要）。`rects()` 由 `getScrolledVisiblePosition(start/end)` 与 `getDomNode().getBoundingClientRect()` 换算视口矩形。不改 `use-editor-references` 的即时回调（伏笔「标注伏笔」按钮照旧）。
  - 预览：把 `CommentablePreview.handleMouseUp` 中「DOM Range → 源文 start/end、blockIndex」的计算拆为独立函数 `previewSelectionSnapshot(range)`，评论浮钮与 `selectionActions` 都调用它。原 `readOnly`/`!commentsEnabled` 提前返回只约束评论浮钮，不再挡住工具栏（复审 B11）；工具栏另按 `selectionActions.active` 判断。保存 `selectionRef` Range 供定位；`rects()` 读 `selectionRef.current.getClientRects()`。键盘选取用 `selectionchange` + 300 ms 去抖复用同一计算。
- 工具栏、输入框渲染在 `MarkdownEditor` 根内的绝对定位层（不进 Monaco DOM），定位按 `toolbarPlacement`，在 Monaco `onDidScrollChange/onDidLayoutChange`、预览 scroll、`ResizeObserver` 时重算。
- **选区评论（审核 I8）**：工具栏「添加评论」调用 `openSelectionComment(anchor)`：预览 → `CommentablePreview` 现有 `setComposer({ ...snapshot, blockIndex })`；Monaco → `use-monaco-comments` 现有 `setComposer({ ...snapshot, line })`。两者把 composer 开关通过 `onComposerChange` 回传，`ChapterContentPanel` 据此不弹工具栏（R1、R3）。`selectionActions.active` 时不渲染原选区评论圆钮 `addBtn`；段落钮、行号槽钮不变。预览的 `md.comment` 命令 enabled 由依赖 `addBtn` 改为依赖「当前有有效选区快照」（`addBtn` 被抑制时也保留快照）。Monaco 的 `md.comment` 本就按 `getSelection()` 判断（`editor-comment-command.ts`），不改。
- 选区高亮：处理框存在期间，Monaco 用 `deltaDecorations`（`stickiness: NeverGrowsWhenTypingAtEdges`）加 `selection-ai-range` 装饰，装饰范围即当前 `start/end`（作者编辑别处时自动移动）；预览视图按 `resolveAnchor(value, { quote, prefix, suffix })`（评论同款锚点）重算并渲染 `<mark class="selection-ai-range">`。替换提交使用这里的最新偏移。

### 4.5 前端组件 `src/components/content/selection-ai/`

| 文件 | 内容 |
|---|---|
| `SelectionToolbar.tsx` | 工具栏（R2、R13、R14、R17、R18）；⋯ 用现有 `DropdownMenu` |
| `SelectionRequestBox.tsx` | 修改要求输入框（R4、R5）。输入区为 contenteditable，class `chat-composer-editable selection-ai-request`（`commandScope` 判为 composer，并获得 composer 的剪贴板、撤销、右键菜单能力），复用 `composer-editor.ts`（`editorToText`、`insertMentionChip`、`insertDraftAtCaret`、`selectedEditorText`）、`MentionPopup` + `useMentionCandidates(novelId)`、chip 渲染与粘贴/剪切处理；快捷键全部经 §4.7 命令注册；「+」菜单只含插入角色·场景·大纲；模型选择从 `ModelPicker` 抽出 `ModelPickerMenu({ value, onChange })`，请求框用本地状态，初值取对话当前 `modelChoice`，不写回对话 store |
| `SelectionAiPanel.tsx` | 处理框 + 结果框 + 冲突 + 撤销条（R6–R11）；思考行复用 `ThinkingRow` 的展示规则（从 `ChatPanel` 抽出为 `components/chat/ThinkingRow.tsx`，ChatPanel 改为引用，渲染不变） |
| `use-selection-ai.ts` | 状态机：`idle → toolbar → ask → queued → running ⇄ stopped/failed → done → (retry → running) / replaced(undo) / conflict`；SSE 读取；中止；`attempt` 计数；`baseVersion/baseHash` 固定于首次请求；选区原文改动检测（读编辑器装饰/锚点最新范围，`selectionStillMatches`）；结果与原文相同时隐藏替换（R10） |
| `selection-ai.css` | 两主题样式；色值取设计稿 v9 |

`ChapterContentPanel` 接入：
- 传 `selectionActions`；`streaming`（整章生成）时 `active=false`。
- 首次生成：`await flush()` 后以 `versionRef.current` 与当前 hash 作为基准（§4.2-1）。
- 替换：`await flush()` → `controller.pause()` → `commit`（带 flush 后版本与最新偏移）→ `receiveCommit(receipt, newContent, boundary)`；失败按 `onCommitError` 现有提示；`SELECTION_CHANGED`/版本冲突转为冲突态（R10）。
- 关闭条件（产品 §2.4）：选区折叠、Esc、切换视图、开始评论、右键（`contextmenu` 时关闭工具栏，原生菜单照常）、选区原文被编辑。
- 状态栏悬停显示作者要求（`title`）；处理中/完成状态栏文本与产品 §4、§5 一致；输入框底部提示随选择与平台变化（产品 §3）。
- 撤销：撤销条与编辑视图 Cmd/Ctrl+Z。回执更新编辑器值时 `@monaco-editor/react` 用 `executeEdits` + `pushUndoStop`，原生 Cmd/Ctrl+Z 能撤回替换，但只改本地稿，随后被自动保存为普通「正文更新」，没有「撤销 AI X」原因，也不经服务端校验（审核建议）。所以在本章 Monaco 挂载时**只注册一次**（monaco 0.56 的 `addCommand` 不能注销，复审 N4）：`editor.createContextKey("selectionAiUndoable", false)`，并按桌面 `text.undo` 的当前绑定（可改绑，`bindingsFor`）用 `monaco-commands` 现有的绑定换算注册一个 `addCommand(keybinding, undoReplacement, "selectionAiUndoable")`；设置改绑时由现有 Monaco 命令重绑流程一起更新。菜单「编辑 → 撤销」（`monaco-commands.ts:119` 原生 undo）在 `selectionAiUndoable` 为 true 时同样改走 `undoReplacement`：在该处 run 前查询上下文键。上下文键在 `receiveCommit` 应用回执**完成后**再置 true（复审 N5），作者之后再编辑（`controller.revision` 变化）、撤销条消失或新任务开始时置 false；为 false 时 Monaco 原生撤销照常。动态绑定权重 1000 高于内置绑定。真实 Electron 中验证。
- 处理框存在时「⋯」菜单 AI 生成项禁用（R15）；卸载（关标签/换章节）时 `abort`。
- 评分指示器：处理框高度经 CSS 变量 `--selection-ai-offset` 上移。

### 4.6 版本历史 `ChapterHistory.tsx`

列表行与详情头部增加原因：`isSelectionAiReason(reason)` → `Badge` 主色浅底 + `Sparkles` 图标；否则灰色小字。打开时 `freshVersionIds`（由 `ChapterContentPanel` 在替换/撤销后记录）对应行加淡绿一次性动画（R12）。其余结构不变。

### 4.7 快捷键与 Esc

**命令目录 `commands.json` 新增（分组「AI 修改要求」）：**

| id | label | scope | mac | win |
|---|---|---|---|---|
| `selectionAi.run` | 执行当前修改功能 | composer | Enter | Enter |
| `selectionAi.newline` | 修改要求换行 | composer | Shift+Enter | Shift+Enter |
| `selectionAi.pickPrev` | 上一个修改功能 | composer | Cmd+ArrowUp | Alt+ArrowUp |
| `selectionAi.pickNext` | 下一个修改功能 | composer | Cmd+ArrowDown | Alt+ArrowDown |
| `selectionAi.escape` | 关闭 AI 修改浮层 | global | Escape | Escape |

- 运行时只看 handler 的 `enabled()` 与注册 root（审核 I4）：请求框用 `useDesktopCommands({...}, requestRootRef)` 注册以上 composer 命令，`enabled()` 中 `pick*`/`run` 要求 @ 弹窗未打开、非输入法组合。`run` 在无模型、超长等情况下**仍保持启用**，在 run 内只提示原因、不发请求，避免 Enter 落回原生 contenteditable 插入换行（复审 B8）；@ 候选的 ↑/↓/Tab/Esc 在请求框内同样用自己的 root 注册 `ai.mentionNext/Prev/Confirm/Close`（与 ChatPanel 相同 id，root 不同，焦点决定谁接收）。组件不自行处理这些 keydown，作者改绑后照常生效（审核 I5）。底部提示用 `composerBindingHint` 读取当前绑定。
- 设置页冲突检测：`command-registry.ts` 的 contexts 计算为 `selectionAi.*` 生成 `{ selectionAi: true }`（`pick*`、`run` 再加 `mention: false`），为 `ai.send`、`ai.newline`、`ai.historyPrev/Next` 加 `selectionAi: false`。这样 Windows Alt+↑↓ 与 `ai.historyPrev/Next`、Enter 与 `ai.send` 不报冲突。`ai.mention*` 不加：它们在请求框内同样运行（同一 id、不同 root），设置页须照实检出它们与其他键的重叠（复审 N2）。重新生成 `command-catalogs.generated.json`。
- **Esc 归属（审核 B2、I6）**：不使用 `role="dialog"`（会让全局命令与菜单失效）。新增 `src/lib/desktop/selection-ai-escape.ts`，仿 `worldline-escape.ts`：`registerSelectionAiEscape(owner)`，owner 在工具栏、⋯ 菜单外的工具栏态、请求框打开时存在，`run()` 按层关闭（@ 弹窗 → 请求框并恢复选区 → 工具栏）。`selectionAi.escape`（global，Escape）的 `enabled` = 存在 owner **且**焦点或事件目标在 owner 的范围内（正文根 `.desktop-markdown-editor` 或请求框，仿 `worldlineEscapeOwner` 的 `panel().contains(target)`，复审 N3）**且**请求框 @ 弹窗未打开（@ 这一层交给请求框注册的 `ai.mentionClose`，避免两条启用命令同时匹配被分发器判为 blocked，复审 N2）；`ChatPanel` 中 `ai.stop` 的 `enabled` 增加 `!selectionAiEscapeOwner()`。`commands.json` 中 `selectionAi.escape` 与 `ai.stop`、`worldline.escape` 共用 Escape，contexts 分别为 `{selectionAi:true}`/`{selectionAi:false}`，不报冲突；`ai.mentionClose` 与 `selectionAi.escape` 运行时由「@ 弹窗是否打开」互斥。⋯ 菜单（`role="menu"`）打开时 Esc 仍由菜单自己关闭（`DesktopCommandController.tsx:113`）。处理框与结果框不拦截 Esc。
- macOS ⌘↑/⌘↓ 在请求框内由 `selectionAi.pick*` 接管，替代原生「到开头/结尾」；与 `input.documentStart` 不同 scope，不冲突。

### 4.8 数据与隐私

- 不新增表。新增 `ContentSource` 值与 `beforeReason` 可选字段。
- 生成输出不落库；用量记录只有 token 数与动作名。
- 日志不打印选区与要求原文。

## 5. 改动文件

新增：`src/lib/selection-ai.ts`、`src/lib/services/selection-ai.ts`、`src/lib/desktop/selection-ai-escape.ts`、`desktop/handlers/novels/[id]/chapters/[chapterId]/selection-ai/{route.ts,commit/route.ts,undo/route.ts}`、`src/components/content/selection-ai/*`、`src/components/chat/ThinkingRow.tsx`、`src/components/chat/ModelPickerMenu.tsx`。

修改：`ChatPanel.tsx`（`ai.stop` enabled 增加 `!selectionAiEscapeOwner()`）、`content-candidate.ts` 等 `contentVersion.findFirst({version})` 调用方（加排序/按 reason 匹配）、`ChapterContentPanel.tsx`、`MarkdownEditor.tsx`、`CommentablePreview.tsx`（`openSelectionComment` 入口、`addBtn` 抑制、`selection-ai-range` mark）、`use-monaco-comments.tsx`（同上）、`use-editor-references.tsx`/`preview-references.tsx`（导出选区回调）、`ChapterHistory.tsx`、`ChatPanel.tsx`（改引用抽出的 `ThinkingRow`）、`ModelPicker.tsx`（改用 `ModelPickerMenu`）、`content-commit.ts`（`beforeReason`、`ai-selection`）、`prisma/seed-templates.ts`、`desktop/shared/commands.json`、`desktop/shared/command-registry.ts`、`command-catalogs.generated.json`、`docs/migration-map.json`、`desktop/service/routes.generated.ts`、`globals.css`（引入 css）、`docs/requirements-traceability.json`。

## 6. 风险与取舍

| 风险 | 处理 |
|---|---|
| 同 version 两条快照与「每修订一份快照」注释冲突 | 只在 `beforeReason` 存在时新增，内容必须与已有快照一致；显式 `createdAt` 定序；所有 `findFirst({version})` 调用方加排序/按 reason 匹配；单测覆盖候选撤回与换用撤回 |
| 原生 Cmd/Ctrl+Z 撤回替换但不记原因 | 替换后注册带上下文键的 Monaco 命令转为服务端撤销；再编辑后恢复原生撤销；真实 Electron 验证 |
| 处理期间作者编辑导致版本变化 | 生成基准取快照（§4.2-1），重试/继续不受影响；替换时用最新版本与偏移再校验 |
| 无规划作品上下文缺失 | 未纳入规划时不传 focus，用全量设定与伏笔，按节截断 |
| 预览选区映射失败 | 与伏笔/评论同一映射，失败不弹工具栏 |
| 上下文过长 | 与整章生成同源；模板中局部上下文 1500 字截断；章节规划输出已受控 |
| ⌘↑↓ 覆盖 macOS 原生到开头/结尾 | 只在请求框内（`selectionAi` context），产品设计已说明 |
| `ai.historyPrev/Next` 与 Windows Alt+↑↓ | contexts 区分，设置页冲突检测按 contexts 不报冲突；单测覆盖 |
| Esc 被 `ai.stop` 抢 / `role="dialog"` 使全局命令失效 | Esc 归属者 + `selectionAi.escape`，`ai.stop` 让位；不用 `role="dialog"`；真实 Electron 验证 |
| 作者改绑发送键吞掉 Enter | 请求框所有键走命令注册（§4.7） |
| 所选模型失效被悄悄替换 | `intent: "selection"` 解析 + `resolvedModel` 传入 |

## 7. 验证计划（细化见用例文档）

- 单元：`selection-ai.ts` 纯函数（结果拼接、偏移校验、原因、定位、截断）；快捷键 contexts 与冲突判定；Esc 归属。
- 集成（PGlite）：准备阶段基准取快照、处理期间版本变化后重试仍可生成；有规划/无规划两路上下文包含主题、文风、角色、设定、世界观、叙事线投影、世界线事件、伏笔、卷/章大纲、前章结尾；模型失效不回退；替换幂等重放、选区变化拒绝、同版本前快照与排序；撤销按替换回执校验；候选撤回/换用撤回在存在「AI X前」快照时仍正确。
- 浏览器（真实组件 + Chromium，仿 `tests/browser/chapter-reader.test.ts`，仅本地接口与 Electron 桥接为替身）：三视图框选、工具栏顺序、评论复用与原圆钮隐藏、`md.comment` 仍可用、输入框键盘（含改绑后）、处理/等待/停止/继续/完成/重试/替换/撤销/冲突、版本历史标签、无模型、主题、窄面板。
- 全量用例：`npm test`、`npm run typecheck`、命令目录校验脚本（AGENTS.md 要求，见用例文档的回归范围）。
- 真实 Electron：隔离数据目录，真实模型一次润色 + 一次续写的替换与撤销；Esc（含对话生成中）、⌘↑↓/Alt+↑↓、Cmd/Ctrl+Z；版本历史；关闭重开后历史仍在。

## 8. 审核记录

- 2026-11-29 独立子代理审核（只读）。阻断 3：B1 无规划作品聚焦后丢失设定与世界观；B2 预览中 Esc 被 `ai.stop`/dispatcher 吞掉；B3 处理期间编辑导致重试/继续 409。重要 8：I1 替换须用最新版本与偏移且先查幂等回执；I2 撤销缺少替换前快照 id；I3 同版本多快照影响 `findFirst({version})` 读取方与排序；I4 contexts 仅用于冲突检测；I5 改绑发送键吞 Enter；I6 `role="dialog"` 使应用变模态；I7 `invoke` 解析会回退到默认模型且 `streamGeneration` 未传 `resolvedModel`；I8 评论复用需要 blockIndex/line、去抖与 `md.comment` 依赖。建议：Cmd/Ctrl+Z 理由更正、漏映射的产品条目、migration-map disposition、排队提示、全量用例。主代理逐条核对代码属实（`model-service.ts:39`、`shortcut-dispatch.ts:45`、`content-candidate.ts:220/254/257`、`migration-map` disposition 集合等），已按上文 §4.2–§4.7、§6、§7 全部修订。
- 2026-11-29 第二轮独立复审（只读）。B1、I1、I3、I4、I6、I7 已解决；I2、I5、I8、B2 部分解决；B3 未解决。新问题：N1 新建/导入章节 version 1 无快照，基准读取会 409（阻断）；N2 @ 弹窗打开时 `ai.mentionClose` 与 `selectionAi.escape` 同时启用被判 blocked；N3 Esc 归属不看焦点会抢走对话框的停止；N4 Cmd/Ctrl+Z 写死键位、`addCommand` 不能注销、菜单撤销绕过；N5 上下文键可能被回执清除；N6 撤销未传 `expectedContentHash`；另：拼接 `materialContext.section`、撤销先查回执、无前快照只建一条、`run` 保持启用、预览选区计算与评论门槛拆开、`snapshotChapter` 加 `createdAt`。主代理核对 N1（`outline.ts:171`、`planning.ts:147`、`novel-import-publish.ts:155` 建章不写快照）等属实，已全部写入 §4.2、§4.3、§4.4、§4.5、§4.7。

## 9. 实现中的偏差（2026-11-29）

1. **「AI X前」占用新修订号**：数据库有部分唯一索引 `ContentVersion_chapter_revision_key`（`prisma/migrations/20260909100000_safe_content_commit`），每个 Chapter 修订只能有一份快照，§4.3「同版本另建一条快照」不可行。改为：`beforeReason` 存在且替换前修订已有快照时，事务内先把未改动的正文推进为新修订（原因「AI X前」），再写入替换后修订（原因「AI X」）；无快照时直接在原修订记「AI X前」。`contentMutation.beforeVersion` 指向「AI X前」修订，撤销据此取快照。由于不再出现同版本多快照，§4.3 中对 `content-candidate.ts` 等 `findFirst({version})` 调用方的改动不再需要，已还原。
2. **选区替换在事务内计算全文**：`ChapterRevisionInput.selection` 携带 start/end/quote/replacement，在回执检查与 CAS 之后对锁定的正文校验并替换；请求身份是选区而不是全文，重放时选区已不在也能返回原回执（SAC-04）。
3. **修复既有缺陷**：`loadCharacterAttributeNames`（`src/lib/ai/context.ts`）在 PGlite 上对枚举数组 `has` 报「malformed array literal」，使桌面数据库上所有 `buildNovelSections` 调用失败（2026-10-18 回归记录中级联修订同样报错）。改为读取后在内存过滤。
4. **提示词库计数**：新增 `selection.rewrite`，`docs/prompt-library-expansion/coverage.json` 内置服务提示词 29→30、合计 500→501。
5. **撤销键**：桌面 Monaco 命令目标的 `text.undo`（作者改绑后的任意按键，以及原生菜单「编辑 → 撤销」）先询问 `setMonacoUndoOverride`（`src/lib/desktop/monaco-commands.ts`），替换后未再编辑时转为服务端撤销，否则照常走 Monaco 撤销；未改绑时 Monaco 自己处理的默认 Cmd/Ctrl+Z 由每个编辑器实例只注册一次、带上下文键 `selectionAiUndoable` 的 `addCommand` 接管。浏览器用例 SA-79、SA-79b 覆盖；Electron 中需再验证。
6. **原选区评论圆钮**：作品正文中隐藏；`tests/browser/chapter-reader.test.ts` CR611-52 改为经工具栏「添加评论」进入同一评论框。
