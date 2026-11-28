# 612 · 正文框选 AI 助手工具栏 测试用例

依据 `docs/612-selection-ai-toolbar-plan.md`（含 §8 两轮审核修订）、`docs/612-selection-ai-toolbar-product.md` 与已批准设计 `design/selection-ai-toolbar/index.html` v9。用例编号前缀 `SA`；台账键 `SA612`。

## 0. 夹具

### 0.1 单元 `tests/unit/selection-ai.test.ts`

纯函数与命令目录，`node --import tsx --test`。

### 0.2 集成 `tests/integration/selection-ai-service.test.ts`

- PGlite 夹具同 `tests/integration/original-content-service.test.ts`：临时目录、迁移、本地作者、`runInDatabaseContext`。
- 作品 `novel-p`（有规划）：主题、文风设定、两条设定、一条世界观、两名角色（其一有弧线阶段，第 2 章生效）、一条伏笔；规划含世界线 `w1`、叙事线、卷章，本章 `chapter-p2` 投影含一张卡片（讲述意图、节拍、披露「钥匙在柜中」、暂不披露「老人身份」）、一个世界线事件「雨夜来客 · 老人抵达书铺」；前一章 `chapter-p1` 有正文结尾。
- 作品 `novel-n`（无规划）：主题、文风、设定「旧书铺规则」、世界观「雨镇」、角色、伏笔一条。
- 模型：仿 `tests/integration/local-model-generation.test.ts`，`ModelService` + `ModelGateway` + 假 `fetch`，记录请求体（不写入证据文件），按脚本返回流（思考增量、正文增量、finish_reason）。另配置第二个模型以验证「不回退」。
- 每例前重置章节正文与版本。

### 0.3 浏览器 `tests/browser/selection-ai.test.ts`

- 先例：`tests/browser/chapter-reader.test.ts`。真实 `ChapterContentPanel`、`MarkdownEditor`（Monaco）、`CommentablePreview`、`CommentComposer`、`ChapterHistory`、`DesktopCommandController`、`ChatPanel` 的 `ai.stop` 注册（挂载最小 `ChatPanel` 或同等注册，记录 `probes().aiStop`），真实 `globals.css` + `desktop.css`，Chromium。
- 仅替身：本地 `fetch`（`/chapters/c1` GET/PATCH、`/versions`、`/candidates`、`/comments`、`/selection-ai`、`/selection-ai/commit`、`/selection-ai/undo`）和 `window.desktop` 桥接。`/selection-ai` 返回可脚本控制的 SSE（`queued`、`reasoning-delta`、`text-delta`、`done`、`error`、挂起、断连），并记录请求体。
- 正文夹具：6 段占位文字（「甲段……」至「己段……」），第 2 段 ≥ 60 字。宽 1200px × 760px；窄 460px。
- `useDesktopStore.setState({ bootstrap })`：`darwin` 与 `win32` 各跑键盘用例；`shortcuts` 可配置改绑。
- 有/无模型两种 `/api/models` 夹具；对话 `modelChoice` 预设为模型 `m1`。
- 每个场景新页面；`pageerror` 为空才通过。

### 0.4 真实目标 `scripts/verify-selection-ai.mjs`

- 隔离数据根：复制 `~/shakeink-test-roots/` 中已有作品到 `~/shakeink-test-roots/selection-ai-612/`，按记忆规则移走 inbox 租约回执；若模型 Key 缺失先重新添加（记忆 tmp-roots-purged）。
- Node 24 构建一次后运行，运行期间不构建；Playwright `_electron`。
- 证据：截图与原始读回放 `~/shakeink-test-roots/selection-ai-612-evidence/`，不进仓库；仓库 `docs/612-selection-ai-toolbar-evidence/real-target-report.json` 只记用例结果、章节 id、正文 sha256、version、版本原因列表、截图文件名与 sha256，不含正文、要求原文、Key、`state.json`。

## 1. 单元

| 编号 | 场景 | 期望 |
|---|---|---|
| SAU-01 | 功能表 | `SELECTION_AI_ACTIONS` 键顺序为 polish、expand、shrink、continue、rewrite、summary；名称为 润色、扩写、缩写、续写、重写、总结；说明与产品 §2.3 表逐字一致；`TOOLBAR_ACTIONS` 为 polish、expand、continue；`DEFAULT_PICK` 为 polish |
| SAU-02 | `stepPick` | polish −1→summary；summary +1→polish；expand +1→shrink；未知值 +1→polish |
| SAU-03 | `resultText` | 续写：原文「甲。」+ 输出「乙。」→「甲。\n\n乙。」；原文以「\n」结尾时只补一个「\n」；原文以「\n\n」结尾时不补；其余功能返回输出本身 |
| SAU-04 | `applyReplacement`、`selectionStillMatches` | 中文、emoji、CRLF 正文按 UTF-16 偏移替换正确；偏移越界或 quote 不符返回 false |
| SAU-05 | `historyReason` / `isSelectionAiReason` | 六功能 × before/after/undo 得到「AI 润色前」「AI 润色」「撤销 AI 润色」等；`isSelectionAiReason` 对这 18 个为 true，对「正文更新」「AI 生成正文」「恢复正文版本 3（x）」「修改前稿件」为 false |
| SAU-06 | `overLimit` | 10000 字 false；10001 字 true；空白不计 |
| SAU-07 | `toolbarPlacement` 下方 | 末行矩形下方空间足：top = 末行 bottom + 8，水平中心对齐末行中点 |
| SAU-08 | `toolbarPlacement` 翻转与贴边 | 下方不足、上方足：位于首行上方 8px；左右越界时贴边内收 8px；上下都不足（输入框）：返回 `scrollBy` = 让下方放下所需量，且 ≤ 首行到视口顶距离；选区本身过高：`scrollBy`=0，贴底 |
| SAU-09 | `toolbarPlacement` 滚出 | 选区完全在视口外：`hidden: true` |
| SAU-10 | 上下文截断 | 各节超过上限时截断到上限并以「（已截断）」结尾；未超不变 |
| SAU-11 | 命令目录 | `platformCommands('darwin')` 含 `selectionAi.run`(Enter)、`selectionAi.newline`(Shift+Enter)、`selectionAi.pickPrev`(Cmd+ArrowUp)、`selectionAi.pickNext`(Cmd+ArrowDown)、`selectionAi.escape`(Escape)，分组「AI 修改要求」；`win32` 下 pick 为 Alt+ArrowUp/Down |
| SAU-12 | 冲突判定 | `commandContextsOverlap`：`selectionAi.pickPrev`(win) 与 `ai.historyPrev` 不重叠；`selectionAi.run` 与 `ai.send` 不重叠；`selectionAi.escape` 与 `ai.stop`、`worldline.escape` 不重叠；设置页冲突检测（`shortcut-settings` 现有函数）对默认绑定不报冲突 |
| SAU-13 | 改绑冲突转移 | 把 `selectionAi.pickNext` 录制为 `Cmd+J`（已被某 global 命令占用）时按现有规则原子转移，与 `tests/unit/shortcut-settings.test.ts` 同一断言方式 |
| SAU-14 | Esc 归属 | 无 owner：`selectionAiEscapeOwner()` 为 null；注册一个 owner 后返回它；注销后为 null；两个 owner 同时存在时返回最近注册的（或 null，与实现一致并写明） |
| SAU-15 | 生成的命令目录 | `command-catalogs.generated.json` 与 `scripts/verify-command-catalogs.mjs` 校验通过 |

## 2. 集成：生成

| 编号 | 场景 | 期望 |
|---|---|---|
| SAI-01 | 有规划上下文 | 对 `chapter-p2` 润色：发给模型的提示中包含作品名、章节标题、主题、文风、两名角色（弧线角色为第 2 章生效状态）、本章聚焦的设定与世界观、叙事线卡片讲述意图与节拍、「披露：钥匙在柜中」「暂不披露（禁止写进本段正文）：老人身份」、世界线事件「雨夜来客 · 老人抵达书铺」、本章伏笔线索、卷大纲、本章大纲、前一章结尾、选区前后文、选区原文、默认要求「保留原意、情节……」 |
| SAI-02 | 无规划上下文（审核 B1） | 对 `novel-n` 章节润色：提示包含设定「旧书铺规则」、世界观「雨镇」、伏笔一览（不是「由本章披露简报提供」）、主题、文风、角色、卷/章大纲；叙事线一节为「（本章未纳入叙事线规划）」 |
| SAI-03 | 作者要求与 @ 引用 | requirement 含 `@[角色/林简](character:c1)`：提示原样包含该 token 与要求文字 |
| SAI-04 | 六功能指令 | 每个功能的提示含对应默认要求；续写提示要求「只输出接在选区后的新文字」；总结要求「一段概括」 |
| SAI-05 | 流事件 | SSE 依次为 `queued`（若排队）、`reasoning-delta`×n、`text-delta`×n、`done{finishReason:"stop"}`；数据库无新快照、无 contentMutation、正文不变 |
| SAI-06 | 基准取快照（审核 B3） | v1 发起；随后手动保存为 v2（别处改字）；以 `baseVersion=1` 再次请求（重试）与带 `continuation` 请求（继续）都成功，提示中选区与前后文来自 v1 |
| SAI-06b | 无快照章节（复审 N1） | 直接 `db.chapter.create` 的 version 1 章节（无任何 `contentVersion`）：首次润色请求成功，基准为当前正文；生成后数据库仍无快照 |
| SAI-06c | 无快照章节处理期间被保存 | SAI-06b 的章节在生成后手动保存为 v2（`snapshotChapter(before)` 为 v1 补快照）：以 `baseVersion=1` 重试成功，基准来自该快照 |
| SAI-01b | 道具与场景资料 | 有规划章节的本章道具「铜铃」进入提示的设定一节（同 `chapter.ts:124` 拼接 `materialContext.section`） |
| SAI-07 | 基准不符 | `baseHash` 不等于 v1 快照、或 `quote` 与 v1 快照对应区间不同 → 409，模型未被调用 |
| SAI-08 | 长度 | 空白选区 400；10001 字 422 `SELECTION_TOO_LONG`；要求 2001 字 400；均未调用模型 |
| SAI-09 | 模型不回退（审核 I7） | 传已删除的 `modelId` → `MODEL_NOT_FOUND`，第二个模型未被调用；传 `m2` → 请求体 `model` 为 m2 的 modelId；`thinkingEffort` 透传 |
| SAI-10 | 无模型 | 未配置任何模型 → `MODEL_NOT_CONFIGURED`，无网络请求 |
| SAI-11 | 断连中止 | 读到第一个 `text-delta` 后取消请求：上游 fetch 收到 abort；无写库 |
| SAI-12 | 未完成 | 上游 finish_reason=`length` → `done{finishReason:"length"}`；上游抛错 → `error{code,message}`，message 不含正文 |
| SAI-13 | 用量 | 成功后用量记录 `action="selection.polish"`，不含正文 |
| SAI-14 | 权限 | 其他作者的作品或不属于该作品的章节 → 403/404 |
| SAI-15 | 模板 | 新库首次启动后 `promptTemplate` 有 `selection.rewrite`，变量列表与方案 §4.2-5 一致；作者修改模板后重启不被覆盖 |
| SAI-16 | 日志 | 运行 SAI-01、SAI-12 期间捕获 `console.*`：不出现选区原文、要求原文 |

## 3. 集成：替换与撤销

| 编号 | 场景 | 期望 |
|---|---|---|
| SAC-01 | 替换基本 | v3（刚由手动保存产生，已有「正文更新」快照）替换第 2 段一部分：版本 4；正文为替换后全文；`contentVersion` 新增两条：version 3 原因「AI 润色前」（内容=替换前全文）、version 4 原因「AI 润色」（内容=替换后全文）；version 3 共两条快照，内容相同 |
| SAC-01b | 无前快照（复审） | version 1 无快照的章节直接替换：只新增 v1「AI 润色前」与 v2「AI 润色」两条，没有「修改前稿件」 |
| SAC-02 | 列表顺序（审核 I3） | `listChapterVersions` 前三条依次为「AI 润色」(v4)、「AI 润色前」(v3)、「正文更新」(v3)；两条 v3 均 `restorable` |
| SAC-03 | 续写 | 续写替换：选区位置写入「原文 + \n\n + 续写」；原因「AI 续写前」「AI 续写」 |
| SAC-04 | 幂等（审核 I1） | 同一 `operationId` 重放：返回相同回执与正文；不新增快照与 mutation；此时正文已是替换后，重放仍成功（不因选区校验报错） |
| SAC-05 | 选区已变 | 提交前另一次保存改了选区内的字 → 用旧 `expectedVersion` 报 `VERSION_CONFLICT`；用新版本但旧 quote → `SELECTION_CHANGED` 409；正文未变 |
| SAC-06 | 偏移移动 | 别处在选区前插入 10 字并保存为新版本；用新版本与 +10 偏移提交成功 |
| SAC-07 | 内容检查 | replacement 为空、与 quote 相同、超过 200000 字 → 422，正文未变 |
| SAC-08 | 跳过整章检查 | 有规划章节字数预算下限 2000、正文 2100 字；缩写使其降到 1900 字 → 成功（不报 `CHAPTER_BUDGET_UNDER_MIN`） |
| SAC-09 | 撤销（审核 I2） | SAC-01 后 `undo{replacementOperationId, expectedVersion:4}` → 版本 5，正文等于替换前全文，原因「撤销 AI 润色」；重放同一 `operationId` 返回原回执 |
| SAC-09b | 撤销重放（复审 B5） | SAC-09 完成后（版本已为 5）用同一撤销 `operationId` 重放：返回原回执，不报 `SELECTION_UNDO_STALE`，无新快照 |
| SAC-09c | 撤销 CAS（复审 N6） | 撤销提交带 `expectedContentHash = 替换回执 afterHash`：若事务前正文被篡改为同版本不同内容（直接改库模拟），报 `CONTENT_HASH_CONFLICT` |
| SAC-10 | 撤销过期 | 替换后又保存为 v5 → 撤销报 `SELECTION_UNDO_STALE`；`replacementOperationId` 属于其他章节或不存在 → 409/404 |
| SAC-11 | 候选撤回不受影响（审核 I3） | 先采用候选稿（v→v+1），再对 v+1 做选区替换（产生 v+1「AI 润色前」第二条快照），撤销选区替换后，「撤回候选稿」仍读到正确基线并成功 |
| SAC-12 | 换用撤回不受影响 | `revertCandidateReplacement` 在其 `afterVersion` 存在第二条「AI X前」快照时仍识别「替换采用候选稿」并成功 |
| SAC-13 | 恢复第二条快照 | 从版本历史恢复「AI 润色前」→ 新版本正文等于替换前全文，原因「恢复正文版本 3（id）」 |
| SAC-14 | 并发 | 两个不同 operationId 同时以 v3 提交 → 一个成功，一个 `VERSION_CONFLICT` |

## 4. 浏览器：工具栏

| 编号 | 场景 | 期望 |
|---|---|---|
| SA-01 | 预览框选 | 鼠标拖选第 2 段 4–30 字：`.selection-ai-toolbar` 出现，高 34px，`top` 距选区末行 `bottom` 8±1px，水平中心距末行中点 ≤ 2px（未贴边时） |
| SA-02 | 编辑视图框选 | Monaco 中拖选：同上；工具栏不在 Monaco DOM 内 |
| SA-03 | 分屏两侧 | 分屏左（Monaco）、右（预览）各拖选一次：工具栏均出现在对应侧选区下方 |
| SA-04 | 键盘选取 | 预览与 Monaco 中 Shift+→ 连续选取：停顿 300ms 后出现，停顿前不出现 |
| SA-05 | 顺序与图标 | 子按钮依次：添加评论（`aria-label="添加评论"`）、输入修改要求、润色、扩写、续写、更多 AI 修改；添加评论后与续写后各有分隔线 |
| SA-06 | ⋯ 菜单 | 点 ⋯：`role="menu"` 六项，名称与说明与 SAU-01 一致；点「缩写」发起 action=shrink 请求；菜单内 Esc 关闭菜单、工具栏保留 |
| SA-07 | 翻转与贴边 | 选中最后几行（下方不足）：工具栏在首行上方；选中左边缘文字：工具栏左边距面板 ≥ 8px |
| SA-08 | 滚动跟随 | 预览与 Monaco 中滚动 100px：工具栏 top 同步变化 ±1px；滚到选区不可见：工具栏 `visibility:hidden`；滚回恢复 |
| SA-09 | 关闭 | 点击正文别处、切换视图、右键（`contextmenu`，原生菜单桥接仍被调用）、Esc、在 Monaco 中编辑选区文字：工具栏消失 |
| SA-10 | 不弹出 | 评审视图；整章生成中（`/generate` 挂起）；处理框存在时再框选；伏笔引用选择框、阅读设置弹框打开时；章首（不在 `[data-block]`）拖选 → 均无工具栏 |
| SA-11 | 无模型 | 无模型夹具：工具栏出现；润色/扩写/续写/⋯菜单项 `disabled`，`title`=「请先在 设置 → 模型 中添加模型」；「输入修改要求」可点；输入框中按 Enter 不换行、不发请求、显示同一提示（复审 B8）；无 `/selection-ai` 请求 |
| SA-11b | 无评论目标 | 以不带 `commentsTarget` 的方式挂载（或评论只读）：预览框选仍弹工具栏（复审 B11），添加评论按钮按评论可用性禁用 |
| SA-12 | 超长 | 正文夹具选中 10001 字：功能按钮 `disabled`，提示「选中文字超过 1 万字，请缩小范围」 |
| SA-13 | 窄面板 | 正文宽 460px：「输入修改要求」为图标按钮（无文字），润色/扩写/续写保留文字；工具栏不超出面板 |
| SA-14 | 两主题 | 宣纸与玄墨下背景、边框、阴影与设计稿 v9 一致（读计算样式：背景 `--popover`，评论按钮颜色 `--primary`） |
| SA-15 | 键盘可达 | 工具栏出现后 Tab 聚焦第一个按钮；→/← 在按钮间移动；Enter 执行 |
| SA-16 | 原圆钮隐藏 | 预览框选后 `.text-comment-add-btn`（选区圆钮）不存在；悬停段落时 `text-comment-block-add` 仍出现；Monaco 行号槽评论钮仍出现 |

## 5. 浏览器：添加评论

| 编号 | 场景 | 期望 |
|---|---|---|
| SA-20 | 预览评论 | 拖选第 4 段 2–12 字 → 点添加评论：工具栏消失；`[data-comment-composer] textarea` 位于第 4 段之后并获得焦点；锚点高亮文字等于所选 |
| SA-21 | 发表 | 输入「示例评论」后 Cmd+Enter：`POST /comments` 体 `quote`、`startOffset`、`endOffset` 与所选一致；composer 关闭；评论卡片出现 |
| SA-22 | Monaco 评论 | 编辑视图同上：composer 为 ViewZone，位于选区末行之后；发表请求同 SA-21 |
| SA-23 | 收起与草稿 | 输入后点收起；再次对同一选区点添加评论：草稿恢复（沿用 `useCommentDraft`） |
| SA-24 | 评论期间不弹 | composer 打开时拖选别处：无工具栏；收起后拖选：工具栏出现 |
| SA-25 | 菜单命令仍可用（审核 I8） | 框选后（原圆钮已隐藏）从「⋯ 正文功能菜单」或 `md.comment` 命令添加评论：composer 打开 |
| SA-26 | 只读 | 整章生成中无工具栏，故无评论入口；原有段落悬停钮按原逻辑隐藏 |

## 6. 浏览器：修改要求输入框

| 编号 | 场景 | 期望 |
|---|---|---|
| SA-30 | 打开 | 点「输入修改要求」：工具栏消失；`.selection-ai-request` 出现在选区下方，宽 560px（正文宽 1200）；焦点在输入区；摘要条含引号图标、所选文字（单行省略）与「已选 N 字」，N=`countChineseWords(quote)`；无竖线 `border-left` |
| SA-31 | 窄宽度 | 正文宽 460px：宽 = 正文宽 − 32 |
| SA-32 | 打开时滚动 | 选中视口底部附近一行：输入框完整位于选区下方（滚动后），选区末行仍可见 |
| SA-33 | 结构 | 有「+」（插入角色·场景·大纲）与模型选择；无作品选择、标准/计划模式、发送按钮、图片/附件、# 会话、/ 命令 |
| SA-34 | 默认选择 | 功能列表润色项 `aria-pressed="true"` 且背景为主色浅底；其余 false；无 `kbd` |
| SA-35 | ↑/↓ 移动光标 | 输入两行要求（Shift+Enter 换行）；按 ↑：光标移到第一行（`getSelection` 偏移变小），焦点仍在输入区，选择仍为润色；按 ↓ 回到第二行 |
| SA-36 | ⌘↑↓（darwin） | Cmd+↓ 两次：选择变为缩写，光标偏移不变，焦点在输入区，底部提示「Enter 执行缩写 · ⌘↑↓ 选择功能 · …」；Cmd+↑ ×3：选择为总结（循环）；Alt+↓ 不改变选择 |
| SA-37 | Alt+↑↓（win32） | Alt+↓：选择扩写，提示「Alt+↑↓ 选择功能」；Meta+↓ 不改变；`ai.historyPrev/Next` 探针为 0 |
| SA-38 | Enter 执行 | 选择扩写后 Enter：发起 action=expand、requirement=输入文字的请求；Shift+Enter 只换行 |
| SA-39 | 输入法 | `compositionstart` 期间 Enter、Cmd+↓ 不执行、不切换 |
| SA-40 | 改绑（审核 I5） | 设置中 `ai.send` 改为 Cmd+Enter：请求框 Enter 仍执行；`selectionAi.run` 改为 Cmd+Enter：Enter 只换行、Cmd+Enter 执行，提示显示新绑定 |
| SA-41 | @ 引用 | 输入「@林」：候选弹窗出现；↑/↓ 在候选间移动（选择不变）；Tab 插入 chip；弹窗打开时 Cmd+↓ 不切换功能；Esc 只关弹窗 |
| SA-42 | 「+」菜单 | 「插入角色·场景·大纲」子菜单插入 chip；请求体 requirement 含 `@[...]` token |
| SA-43 | 模型选择 | 默认为对话当前模型 m1；改为 m2 后执行：请求 `modelId=m2`；对话 store 的 `modelChoice` 仍为 m1 |
| SA-44 | Tab 进入列表 | Tab：焦点到当前选择项；↓：焦点与选择到下一项，提示更新；首项 ↑ 或 Shift+Tab：回到输入区末尾，选择保持 |
| SA-45 | 点击执行 | 点「重写」：发起 action=rewrite；悬停其他项只有浅灰底，选择不变 |
| SA-46b | @ 弹窗中 Esc（复审 N2） | 请求框 @ 弹窗打开时 Esc：只关闭弹窗，请求框保留；再 Esc 关闭请求框；`aiStop` 为 0 |
| SA-46c | 焦点在对话框（复审 N3） | 编辑视图框选后工具栏在，点击对话输入框（Monaco 失焦，选区保留），对话生成中按 Esc：`aiStop===1`，工具栏仍在 |
| SA-46 | Esc 分层（审核 B2） | darwin 与 win32：输入框打开、对话未生成时 Esc → 输入框关闭，正文选区恢复且工具栏重新出现，`probes().aiStop===0`；再 Esc → 工具栏关闭；对话正在生成时同样操作，`aiStop` 仍为 0 且对话未停止；工具栏与输入框都关闭后 Esc → `aiStop===1`（对话生成中） |
| SA-47 | 非模态（审核 I6） | 输入框打开时 Cmd+S：`file.save` 探针为 1（全局命令不被阻断）；原生菜单「保存」命令同样执行 |
| SA-48 | 要求保留 | 输入要求后 Esc 关闭，从同一选区工具栏再打开：要求与选择保留；换一个选区再打开：要求清空、选择回到润色 |
| SA-49 | 剪贴板与右键 | 输入区 Cmd+X/Cmd+V/右键菜单走 composer 现有能力（与 `tests/browser/text-shortcuts.test.ts` 同一断言） |

## 7. 浏览器：处理框、结果、替换、撤销

| 编号 | 场景 | 期望 |
|---|---|---|
| SA-60 | 发起前保存（审核 B3） | 在编辑视图打字后立即框选并点润色：先出现 PATCH（autosave flush），`/selection-ai` 请求体 `baseVersion` 等于 PATCH 回执版本 |
| SA-61 | 处理框位置 | 处理框底边距正文区底 16±1px，水平居中，宽 min(640, 正文宽 − 32)；评分指示器底边高于处理框顶边 |
| SA-62 | 等待 | SSE 先发 `queued`：状态栏「等待中…」 |
| SA-63 | 流式 | 推送思考 → 「思考中…」展开；推送正文 → 思考收为「已思考 N 秒」，正文逐段追加，状态「润色中 · 已生成 N 字」，N 与已收文字一致；只显示 AI 文字，不显示作者要求；状态栏 `title` 含作者要求 |
| SA-64 | 自动滚动 | 输出超过 160px：自动滚到底；用户上滚后新增内容不拉回；滚回底部后恢复 |
| SA-65 | 选区高亮 | 处理期间预览中 `mark.selection-ai-range` 文本等于所选；切到编辑视图后 Monaco 有 `selection-ai-range` 装饰；处理框仍在 |
| SA-66 | 停止 | 点停止：请求被 abort；状态「已停止 · 已生成 N 字」，按钮为继续、放弃；无替换按钮 |
| SA-67 | 继续 | 点继续：新请求带 `continuation`=已生成文字、同 `baseVersion`；完成后结果为两段拼接 |
| SA-68 | 失败 | SSE `error`：红色「润色失败：…」，按钮继续、放弃；`done{finishReason:"length"}` 同样视为失败 |
| SA-69 | 完成 | `done{stop}`：处理框内容区高 260±2px（过渡 200ms）；显示最终文本（段落首行缩进、可选中、不可编辑）；状态「润色完成 · 原文 a 字 → b 字」；按钮依次 放弃、重试、替换 |
| SA-70 | 续写完成 | 续写：结果区先显示原文（灰色）再显示续写；字数 b = a + 续写字数 |
| SA-71 | 结果与原文相同 | 输出与选区原文相同：无替换按钮，提示「生成结果与原文相同」 |
| SA-72 | 重试 | 点重试：新请求同 action、requirement、modelId、`baseVersion`；状态「润色中 · 第 2 次」；完成「润色完成 · 第 2 次 · …」；无 commit 请求，正文不变 |
| SA-73 | 处理期间编辑（审核 B3） | 处理中在第 5 段打字并自动保存（版本+1）：重试与继续请求仍成功（`baseVersion` 不变）；替换请求带新的 `expectedVersion` 与原偏移（选区在第 2 段，偏移不变） |
| SA-74 | 编辑移动偏移 | 处理中在第 1 段插入 5 字：替换请求 `start/end` 各 +5，替换后正文正确 |
| SA-75 | 改动选区原文 | 处理中改了选区内文字：状态栏提示「选中原文已改动，完成后无法直接替换」；完成后点替换 → 冲突态「正文在处理期间已改动，无法替换…」，按钮「复制结果」「放弃」；复制写入剪贴板桥接 |
| SA-76 | 放弃 | 完成后放弃：浮层全部消失，正文不变，无 commit 请求，选区高亮消失 |
| SA-77 | 替换 | 点替换：先 flush，`commit` 请求体含 action、最新 start/end、quote、replacement、`expectedVersion`；回执后编辑器正文为新正文、不重挂载（Monaco 实例相同、滚动位置保持）；新文字闪烁一次并在可见区；处理框消失、撤销条出现「已替换为润色结果」 |
| SA-78 | 撤销条 | 点撤销：`undo` 请求带 `replacementOperationId` 与回执版本；正文恢复；toast「已撤销」；10 秒无操作撤销条自动消失；替换后在正文打字撤销条立即消失 |
| SA-79b | 改绑撤销与菜单撤销（复审 N4） | `text.undo` 改绑为 Cmd+Shift+U：替换后按 Cmd+Shift+U 发 `undo` 请求，Cmd+Z 不发；原生菜单「编辑 → 撤销」（派发 `desktop:command` 对应 detail）同样发 `undo` 请求；连续替换两次后只有一条 `selectionAiUndoable` 命令被注册（计数探针） |
| SA-79c | 上下文键时机（复审 N5） | 替换回执应用后立即（同一帧后）按 Cmd+Z：发 `undo` 请求（上下文键未被回执本身清除） |
| SA-79 | Cmd/Ctrl+Z | 编辑视图替换后（未再编辑）按 Cmd+Z：发 `undo` 请求，不产生本地编辑（之后无 PATCH 带旧内容）；再打一个字后 Cmd+Z：只撤销这一个字（Monaco 原生），无 `undo` 请求 |
| SA-80 | 互斥 | 处理框存在时「⋯ 正文功能菜单」中 AI 生成正文项 `disabled` |
| SA-81 | 切换与卸载 | 处理中切换到其他标签再回来：处理框与输出保留；关闭标签或切换章节：请求被 abort，回来后无处理框 |
| SA-82 | 两主题与窄面板 | 处理框与结果框在玄墨、窄面板下不超出正文区，按钮可见 |

## 8. 浏览器：版本历史

| 编号 | 场景 | 期望 |
|---|---|---|
| SA-90 | 原因标签 | 版本夹具含「AI 润色」「AI 润色前」「撤销 AI 润色」「正文更新」「AI 生成正文」：前三项为主色浅底标签含 ✦ 图标；后两项为灰色文字 |
| SA-91 | 新行提示 | 替换后打开版本历史：本次新增两行带一次性淡绿动画类，2.4s 后移除 |
| SA-92 | 详情头部 | 打开「AI 润色前」：标题「历史正文 · 修订 N」，下方原因标签、字数、时间、只读；「恢复为当前稿」可用 |
| SA-93 | 不回归 | 无 reason 的旧版本行正常显示；分页「更早记录」正常 |

## 9. 真实目标（Electron）

| 编号 | 场景 | 期望 |
|---|---|---|
| SAR-01 | 启动 | 隔离根离线启动，正文面板打开；工具栏在预览框选后出现 |
| SAR-02 | 真实润色 | 已配置模型：预览框选一段 → 润色；处理框流式输出；完成后替换；版本历史有「AI 润色前」「AI 润色」，内容分别为替换前后全文（比较 sha256） |
| SAR-03 | 真实续写 + 撤销 | 编辑视图框选 → 输入要求 → ⌘↓ 选续写 → Enter；完成后替换；Cmd+Z → 正文恢复，版本历史有「撤销 AI 续写」 |
| SAR-04 | Esc | 请求框与工具栏按层关闭；对话生成中时也不停止对话 |
| SAR-05 | 评论 | 工具栏添加评论 → 发表 → 关闭重开应用后评论仍在 |
| SAR-06 | 重启后历史 | 正常退出再启动：版本历史中 AI 版本与原因保留 |
| SAR-07 | 无 HTTP 监听 | 运行期间 `lsof -nP -iTCP -sTCP:LISTEN -a -p <pid>` 无监听端口 |

## 10. 回归范围

- `npm run typecheck`；`npm test`（全量单元与集成）；`node scripts/verify-command-catalogs.mjs`。
- 浏览器：`tests/browser/chapter-reader.test.ts`、`text-shortcuts.test.ts`、`file-export.test.ts` 及评论、伏笔、ChatPanel 相关浏览器用例（受 `CommentablePreview`、`use-monaco-comments`、`ChatPanel`、`ModelPicker` 改动影响）。
- 集成：`original-content-service.test.ts`、候选稿相关测试（受 `content-commit`、`content-candidate` 改动影响）、`local-template-library*.test.ts`（新模板）。
- 全量失败若与本改动无关，在同一提交的干净 worktree 上复跑确认基线（记忆 chapter-reader-611-driver）。

## 11. 台账映射

`SA612`（只追加到 `docs/requirements-traceability.json`）：R1→SA-01–04/07–10/SAU-07–09；R2→SA-05/06；R3→SA-16/20–26；R4→SA-30–33/42/43；R5→SA-34–41/44–49/SAU-02/11–14；R6→SA-61–65；R7→SA-66–68；R8→SA-69–71；R9→SA-72/73；R10→SA-60/73–77/SAC-01/01b–08/14；R11→SA-78/79/79b/79c/SAC-09/09b/09c/10；R12→SA-90–93/SAC-02/13；R13→SA-11/11b/SAI-10；R14→SA-12/SAI-08；R15→SA-73–75/80/81；R16→SAI-01/01b–04/06b/06c；R17→SA-13/14/82；R18→SA-15/46/46b/46c/SAR-04；R19→SAI-13；数据安全→SAI-14/16/SAC-11/12；真实目标→SAR-01–07；回归→§10。
