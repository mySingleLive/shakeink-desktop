# 导入作品分步向导：调研

日期：2026-10-29。范围：按用户本次给出的新顺序重做"导入作品"整个流程。本文只记录现状与差距，不做产品决定。

## 用户约束（原文要点）

用户选择文件/文件夹 → 向导确认文件 → 选择"导入内容"和"补充推断内容" → 快速识别卷章 → 卷章树（卷、章均可勾选，默认全选；未选卷章的正文和设定都不进入后续环节）→ 导入大纲卷章结构（不含细纲）→ 导入所选章节正文 → 快速识别角色（名称 + 主/配/反，可勾选，默认全选）→ 并行导入所选角色（完成后名字后打钩；包含身份、外观、心理、弧线、人物关系全部属性）→ 场景（同上）→ 重要物品（同上）→ 世界观树（世界 → 等级体系、力量体系、社会环境、人文环境等子项，逐项可选）→ 导入世界观 → 世界线 → 叙事线 → 补充细纲 → 伏笔（关联世界线、叙事线、大纲、正文触点）→ 校验 → 完成。

产物顺序：调研 → 产品文档 → UI/UX HTML（子代理审核 + 用户审核）→ 技术方案（子代理审核）→ 测试用例（只覆盖本次）→ 实现 → 测试（只覆盖本次用例 + 自愈循环）→ 总结。测试书：`/Users/dt_flys/Documents/拆书/诡秘之主-原始文本.txt`。

## 现有流程（源码事实）

| 环节 | 现状 | 证据 |
| --- | --- | --- |
| 入口 | 原生选择文件/文件夹，创建草稿会话，打开对话框 `source` 页 | `desktop/main/novel-import.ts:200` `choose`，`src/lib/desktop/novel-import.ts:82` |
| 文件确认 | 文件列表可勾选、排序、改编码、核对原文、PDF 图像页核对 | `NovelImportDialog.tsx:33` `SourceScreen` |
| 内容识别 | 同意页 → AI/本地分类每个片段的类别（13 类）→ 必要时 AI 识别卷章边界 | `novel-import.ts:427` `classify`，`:459` `recognize`，`:445` `recognizeStructure` |
| 选择内容 | 一页同时选"直接导入"13 类和"补全"12 类 | `NovelImportDialog.tsx:88` `SelectionScreen` |
| 卷章 | 只有手工输入"字符起点 + 章名 + 卷名"的表单；没有树、没有勾选 | `NovelImportDialog.tsx:76` `ChaptersScreen` |
| 确认 | 作品名、空目录、导入计划、第二次发送授权 | `ConfirmScreen` |
| 执行 | 后台串行：正文 → 结构大纲 → 角色 → 场景/物品 → 世界观 → 主题/文风/伏笔/金手指/爽点 → 世界线 → 叙事线 → 细纲 → 复核 → 保存 | `core/novel-import.ts:309` `importSteps`，`main/novel-import.ts:718` `semanticWorkflow` |
| 分析方式 | 每类按正文批次逐批扫描全书（`stageRequests`），一个类型一个类型地串行调用模型 | `main/novel-import.ts:678` `semanticAnalyzeUnits` |
| 进度 | 11 行步骤列表，只有"完成数/总数"，没有实体级勾选或打钩 | `ProgressScreen` |
| 冲突 | 来源/推断冲突逐条由作者决定，可生成正文修改提案 | `ConflictScreen`、`PatchesScreen` |
| 发布 | 单事务写 Novel/Volume/Chapter/Character/Scene/Item/World/Setting/Foreshadow/Trope/PlanningDocument | `desktop/service/novel-import-publish.ts` |

结论：现有流程是"先一次选类别，再一次性后台跑完"。用户要求的是"多步向导，每类先快速列清单、让作者勾选、再按实体并行导入"。卷章勾选、实体清单、并行导入、逐实体打钩、世界观树、伏笔触点均不存在。

## 差距明细

### 1. 卷章树与章节过滤

- 现有 `ImportChapter` 只有 `title/start/end/volume`，没有"是否选中"。发布时全部章节写入（`novel-import-publish.ts` `volume.create` 循环）。
- 需要新增卷/章选中集合，并让后续所有分析只使用选中章节的正文单元；发布只写选中章节。卷全不选等于该卷不导入。
- 现有卷章识别对《诡秘之主》已可工作：本地规则识别"第X部 名称"为卷（`core/novel-import-chapters.ts:89,138`），之前的 LOTM 运行记录为 1402 章（`docs/lotm-local-import/16-ordered-import-plan.md` ORD02）。

### 2. 步骤顺序

- 用户要求"结构大纲 → 正文"，现有为"正文 → 结构大纲"。两者都在发布事务里一起写，顺序差异主要体现在向导步骤与进度展示。
- 用户要求细纲在叙事线之后、伏笔之前；现有细纲在叙事线之后、复核之前（已符合一半），伏笔目前在"设定"组，排在世界线之前，需要后移到细纲之后。

### 3. 快速识别清单（角色/场景/物品/世界观）

- 现有没有"只列名称"的轻量识别阶段；角色分析一次性产出完整设定。
- 需要新的识别阶段：输出候选清单（角色：名称、别名、主/配/反；场景：名称、上级地点；物品：名称、重要性；世界观：世界 → 子项类型），作者勾选后再做完整导入。
- 世界观子项可直接对应现有 `SettingType`：`LEVEL_SYSTEM` 等级体系、`POWER_SYSTEM` 力量体系、`SOCIETY` 社会环境、`CULTURE` 人文环境、`GEOGRAPHY` 地理、`FACTION` 势力、`CONCEPT` 概念、`MAP` 地图、`WORLD_HISTORY` 世界历史（`prisma/schema.prisma:49`）。世界本身是 `World`，支持父子世界。

### 4. 并行导入与逐实体打钩

- 主进程 `ai()` 调用本身不在串行锁内，检查点 `checkpoint()` 走 `serial`；AI 服务 `ImportAiJobs` 按 `operationId` 并发管理（`desktop/service/novel-import-ai.ts:391`）。并行有基础，但现有工作流是 `for…await` 串行，进度结构 `ImportStep` 没有实体级状态。
- 需要：实体级任务表（待导入/导入中/完成/失败）、并发上限、每完成一个即检查点保存（重启可续）、暂停时取消在途请求。
- 模型供应商有频率限制，并发数应可控（默认小值），失败单个实体可重试而不影响其他实体。

### 5. 角色"全部属性"

- `Character` 表字段远多于现有导入映射。现有原生投影只写：`roleType, aliases, age, gender, occupation, bio, personality, appearance, clothing, catchphrase, growthArc, relationships`（`core/novel-import-semantics.ts` `ImportNativeProjection`）。
- 未覆盖：外在 `height/weight/build/faceShape/tastes/habits/dialogueStyle/sampleDialogue`；心理 `personalityTags/motivations/desires/fears/beliefs/bigFive`；能力 `abilities`；弧线 `backstory/arcStages`；关系 `relationships[].characterId` 链接。
- 这些字段已有现成校验/规范化：`src/lib/arc-stage.ts`、`src/lib/motivation`、`src/lib/beliefs`、`src/lib/big-five`。导入应复用，不另立格式。

### 6. 伏笔触点

- 现有发布只写 `Foreshadow{title,content}`（`novel-import-publish.ts` `foreshadow.create`），无触点。
- 数据模型已支持用户要求的四类关联：
  - 正文/大纲：`ForeshadowTouch{kind:PLANT|MENTION|PAYOFF, chapterId, summary}` + `ForeshadowReference{targetType:CHAPTER_CONTENT|CHAPTER_OUTLINE, quote, startOffset, endOffset}`（`schema.prisma:1160,1185`，`src/lib/services/foreshadow-reference.ts:13`）。
  - 世界线：规划文档世界事件 `eventSchema.materialRefs[{kind:'foreshadow', role:plant|mention|payoff}]`（`src/lib/planning/domain.ts:24`，`src/lib/material-reference.ts:3`）。
  - 叙事线：讲述 `tellingSchema.materialRefs`（同上 `:122`）。规划校验已要求首次埋入的讲述引用同一世界事件（`domain.ts:521`）。
- 因此伏笔必须在世界线、叙事线、细纲之后导入，才能引用它们的 ID；与用户顺序一致。

### 7. 校验

- 现有"一致性复核"是逐批让审核模型查冲突。用户要求的"校验"在伏笔之后、完成之前；可沿用现有复核，加上结构性校验（规划文档 `validatePlanning`、细纲完整、引用可解析、选中范围一致）。

## 测试书《诡秘之主》事实

用 `iconv -f GB18030` 解码后统计（只读，未复制进仓库）：

| 项 | 值 |
| --- | --- |
| 编码 | GB18030（`file` 识别为 ISO-8859，导入时需确认编码） |
| 大小 | 9,468,472 字节，解码后 4,803,440 字符，118,562 行 |
| 前言 | 下载站广告、书名、作者、内容简介（第 1–11 行），不属于正文 |
| 卷 | 8 个主线卷：第一部 小丑 213 章、第二部 无面人 269、第三部 旅行家 250、第四部 不死者 214、第五部 红祭司 204、第六部 逐光者 116、第七卷 倒吊人 87（用"卷"字）、第八部 愚者 41。第八部在原文中**没有卷标题**：第七卷第 87 章后是作者"第七部总结"（其中写明第八部名为"愚者"），随后章号从"第一章 这一晚"重新开始。与 `docs/lotm-local-import/03-test-cases.md` LOTM-L-VOL01 一致（2026-10-29 更正：初稿误把后 41 章算入第七卷，记为 128 章） |
| 章 | 1394 个"第X章"标题，每部重新从第一章起；另有番外 8 篇（"一个普通人的日常（一）…（八）"，无"第X章"） |
| 尾部 | 完本感言（上/下）、"番外"标题及 8 篇番外，不带"第X章"。既有真实导入（LOTM-L-VOL01）的目标结构为 9 组 1402 章：8 主线卷 + 独立番外组 8 章 |

对设计的影响：卷用"部/卷"混写、每部章号重启、第八部无卷标题、尾部有非章节结构。卷章树必须能显示无卷名组并允许经"手动调整卷章"补卷名，让作者取消"完本感言"之类非正文；整书 480 万字，任何"每类扫一遍全书"的方案调用量都很大，快速识别必须廉价。

## 规模与成本的取舍

快速识别（只要名称清单）有三种做法：

| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| A 全模型扫描 | 按批把选中章节发给模型，只返回名称 | 准确，能分主/配/反 | 480 万字全量发送，调用多、慢 |
| B 本地统计 | 本地按高频词/引号前人名规则抽取 | 零调用、快 | 中文人名切分不可靠，无法判断主/配/反和"重要物品" |
| C 混合 | 模型按批只返回名称（输出极短），本地合并别名、统计出场章节数并排序 | 输出成本低，出场次数可作为排序和"重要"依据 | 输入仍为全量 |

完整导入单个角色时，不必再扫全书：本地按名称和别名检索出场章节，只发送这些片段（在预算内取首次登场、高频章节和关系章节），这让"每个角色一个代理并行"可行。

## 约束与已有条件

- `AGENTS.md`：桌面对话框与业务面板复用 Web 真实组件；真实数据与 Key 不进源码/日志/证据；隔离测试目录；默认无模型；不监听 HTTP。
- 本机 Node 默认 v20，构建与测试需要 v24.18.0（记忆 `node24-required`）。
- 真实《诡秘之主》导入此前在隔离运行时进行，模型 Key 绑定 `LotmVerification.app` 身份（记忆 `lotm-isolated-runtime`）；真实模型测试需沿用该运行时。
- 现有导入相关单测 28 个文件（`tests/unit/novel-import-*.test.ts` 等），本次只新增/修改与新流程相关的用例。
- 现有会话日志 `ImportSession` 已有版本字段与恢复逻辑；新字段须向后兼容或用新版本号隔离旧草稿。

## 待产品决定的问题

1. 内容识别（片段分类）放在"选择导入内容"之前还是之后：选择页需要知道文件里有哪些类别才能显示"识别到 N 项"。
2. 快速识别用方案 A 还是 C；并发上限默认值。
3. "重要物品"的判定标准（出场章节数阈值、模型判断，或两者）。
4. 主题、文风、金手指、爽点/泪点在用户顺序里未列出，放在哪一步。
5. 冲突处理（来源设定与正文推断矛盾）在新流程中出现在哪一步。
6. 世界观树的子项是否固定为 `SettingType` 九类，还是按识别结果只显示出现的类型。

## 补充（用户修改后）

- 编码：现有读取在严格 UTF-8 解码失败后回退到 GB18030，并把文件标为 `requiresEncodingConfirmation`，要求作者确认后才能继续（`desktop/main/novel-import-files.ts:235,245`；`desktop/main/novel-import.ts:55` `readable`）。用户要求自动识别，不再需要确认。GB18030 严格解码（`fatal:true`）成功即可直接采用；只有所有候选都解码失败时才需要作者处理。
- 作品名与目录：现有流程在"确认导入"页才填写（`NovelImportDialog.tsx` `ConfirmScreen`，`set-title`/`choose-target` 动作）。用户要求移到确认文件之后、选择内容之前。现有 `set-title` 在 `source` 阶段已允许（`novel-import.ts:167`），但 `choose-target` 目前没有阶段限制，需要在技术方案中确认它在早期阶段可用且不使后续结果失效。
- 头像/立绘：现有 `generateCharacterImage`（`src/lib/services/character-image.ts:62`）按角色资料拼提示词（`buildCharacterImagePrompt`），以作品主题类型/标签为画风语境，调用图像模型，落盘后写 `CharacterImage{kind:AVATAR|PORTRAIT, source:AI}` 并更新 `Character.avatarUrl/portraitUrl`。它要求角色已在作品数据库中；导入草稿在第 21 步才写入数据库，技术方案需决定图像是在草稿阶段生成并在保存时落库，还是保存后再生成。
- 场景、物品图片：场景有外景图/内景图（`SceneImage.kind` exterior/interior，`Scene.exteriorImageUrl/interiorImageUrl`，`src/lib/services/scene-image.ts:62` `generateSceneImage`）；物品有图标（`ItemImage`，`Item.iconUrl`，`src/lib/services/item-image.ts:48` `generateItemImage`）。与角色一样，都要求实体已写入作品数据库，且共用 `resolveImageContext` 画风语境。
