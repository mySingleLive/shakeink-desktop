# 490 · 识别物品误收角色、场景与概念的修复方案

日期：2026-11-03。状态：第三轮独立审核通过（见 `490-…-plan-review-3.md`），审核建议已并入 2R2-7。用户反馈截图：第13步“识别物品”清单 317 项全选，其中“克莱恩·莫雷蒂”“邓恩·史密斯”“黑夜女神”“奥黛丽·霍尔”“老尼尔”标签为“角色”，“廷根市”“贝克兰德”“值夜者”“序列”“魔药”标签为“concept”，“黑荆棘安保公司”标签为“物品”。用户要求：角色、场景、世界观概念等非物品内容不应被识别为物品。

## 1. 已证原因

| 位置 | 事实 |
| --- | --- |
| `desktop/core/novel-import-ai-payload.ts:136` | 物品清单契约只有 `roster:[{name,aliases:[别名],itemType:物品类型,important:true|false}]`，没有说明什么算物品、什么不算。模型把出场人物、地点、组织、体系名都列入，并把“角色”“concept”写进 `itemType`（截图标签即 `itemType`，`NovelImportWizard.tsx:129`）。 |
| `desktop/core/novel-import-wizard.ts:124` `keepWizardItem` | 正文条目在 `important` 或出场 ≥3 章时保留。主角、城市、体系名出场章数多，即使 `important:false` 也全部保留。 |
| `desktop/core/novel-import-wizard-roster.ts:52` | 物品候选不与已识别的角色（第9步）、场景（第11步）比对，同名条目照样进入物品清单。 |

## 2. 修改

### 2.1 模型逐项给出类别（主修复）

- 物品清单契约增加必填 `category`，取值 `"item"|"character"|"place"|"organization"|"concept"|"other"`，并写明物品定义：小说中可被持有、使用、交付或损毁的具体物件（器物、武器、文书、药剂、信物、封印物等）。人物、神祇及其他有意识个体为 character；城市、街道、建筑等地点为 place；公司、教会、小队等组织为 organization；途径、序列、能力、职业、体系、种族等世界观概念为 concept；其余为 other。拿不准是否具体物件时不用 item。`itemType` 写物品自身类别（如封印物、武器），不写角色、地点或概念。
- 要求模型对每个候选显式分类，而不是只靠“不要列入”的指令：模型必须先判类，判错的代价可见，且非物品项由应用丢弃，不依赖模型自行省略。
- 服务端 `rosterEntrySchemas.item`（`desktop/service/novel-import-ai.ts:367`）增加 `category:z.enum([...])` 必填；严格 schema 不变，缺失或非法值走现有两轮纠错。
- `runImportAi` 定位证据后（`:1067` 附近），物品清单只保留 `category==='item'` 的条目，并去掉 `category` 字段再返回。暂存（`rosterStash`）、草稿 schema 与候选结构都不变，旧草稿可直接读取。
- 只改物品清单提示；角色、场景、世界观提示字节不变。

### 2.2 与已识别角色、场景同名的条目不进物品清单（本地防线）

- `buildWizardCandidates` 增加可选参数 `taken:ReadonlySet<string>`（规范化名称）。物品候选的任一合并名称（`c.names`）在 `taken` 中、且没有资料文件来源时，跳过。
- 主进程 `runRoster('item')` 传入 `w.candidates.character` 与 `w.candidates.scene` 全部候选（不论是否勾选）的名称与别名，经 `normalizeWizardName`。
- 资料文件中作者明确列为物品的条目照常保留（与 `keepWizardItem` 的 `fromSource` 规则一致）。
- 世界观在第15步才识别，概念类不能本地比对，依赖 2.1。

### 2.3 不改

- `keepWizardItem` 的“重要或 ≥3 章”规则不变（产品文档 02-product.md:84）；它只作用于模型已判为物品的条目。
- 不把被排除的条目转入角色/场景/世界观清单（用户未要求）。
- 不改清单 UI。

## 2R. 第一轮独立审核后的修订（以本节为准，覆盖 2.1–2.3 冲突部分）

审核见 `490-item-roster-category-plan-review.md`。已逐条对照源码核实：`wizard-redetect` 在等待状态下覆盖完整、暂存已删（`desktop/main/novel-import.ts:439,602`），fixture 的 `ai` 不经 `runImportAi`（`tests/helpers/novel-import-wizard-fixture.ts:39`），`mergeWizardRoster` 对 `important` 取“任一批为真”（`novel-import-wizard.ts:109`）。

1. **类别跨批计票，在 core 判定（覆盖 2.1 的服务层丢弃）。**
   - 服务端 `rosterEntrySchemas.item` 增加 `category:z.enum(ITEM_ROSTER_CATEGORIES).optional()`。非法取值仍被严格 schema 拒绝并走两轮纠错；**缺省视为未知**，避免单项漏写使整批、整步失败。提示中仍写为必填。
   - `runImportAi` 不丢弃任何条目；`category` 原样进入结果。
   - `category` 作为可选字段进入：`ImportRosterEntry`（`core/novel-import-semantics.ts:40`）、`WizardRosterEntry`（`core/novel-import-wizard.ts:79`）、暂存拷贝（`main/novel-import.ts:575`）、草稿 strict schema 中 `rosterStash` 条目（`core/novel-import-wizard-state.ts:33,65`）。候选（candidate）结构不变。旧草稿暂存无此字段，仍合法。
   - `mergeWizardRoster` 对每组统计 `itemVotes`（category 为 item）与 `otherVotes`（其它五类）；未知不计票。`important` 只取 category 为 item 或未知的条目（判为角色的那批写的 important 不算）。
   - 新增 `wizardItemRejected(group)`：`otherVotes>0&&otherVotes>=itemVotes` 为真时该组不是物品。`buildWizardCandidates('item')` 在 `keepWizardItem` 之前跳过被判非物品、且无资料来源的组；资料来源的物品始终保留。
   - 运行中计数 `wizardRosterFound`（`core/novel-import.ts:407`）对 item 使用同一判定，避免进度数与最终清单不一致。
   - 中途恢复：已覆盖批次的旧暂存无 category，按未知处理，不改变其它批次的计票。
2. **同名比对集合（覆盖 2.2）。** `taken` 只取**已勾选**的角色候选，以及**已勾选**、非 `sceneExcluded`、非 `unresolved` 的场景候选的名称与别名。未勾选的角色/场景不参与（作者可能因其实为物品而取消）。角色或场景步骤被跳过时对应候选不存在，此防线不生效，只靠第1条。称号类别名与物品同名会误排除，作为已知风险写入第3节，并有用例。
3. **旧草稿（覆盖 2.3）。** 已生成的物品清单不会自动重算。生效路径为“返回修改选择 → 识别物品”（`revise` 会删除 item 候选与 `roster:item` 覆盖，`main/novel-import.ts:1133-1135`）。等待状态下 `wizard-redetect` 会清空正文物品是已有缺陷，本次不改，另记于第5节。
4. **测试与台账。** 控制器用例经 fixture 返回带 category 的条目，验证 core 计票；服务层用例（`runImportAi`）验证 category 透传、缺省允许、非法值拒绝。更新 RA-07、WP-01；新增 character/scene/world 清单提示改动前后逐字相等的用例；物品定义文案不含 `evidence`、`quote`、`逐字`（WP-04）。`docs/requirements-traceability.json` 新增 NI-10 条目。

## 2R2. 第二轮独立审核后的修订（以本节为准，覆盖 2R 冲突部分）

审核见 `490-item-roster-category-plan-review-2.md`。

1. **itemType 与 important 同源。** `mergeWizardRoster` 中 `itemType` 与 `important` 都只取 category 为 item 或未知的条目；判为其它类别的条目写的值不生效。
2. **计票字段不进候选。** `mergeWizardRoster` 返回值增加内部字段 `itemVotes`、`otherVotes`；`buildWizardCandidates` 解构时与 `important`、`names` 一并剥离，不经 `...rest` 进入 strict 候选 schema（`core/novel-import-wizard-state.ts:43`）。导出 `wizardItemRejected({itemVotes,otherVotes})` 供 roster 与 `wizardRosterFound` 共用。
3. **null 与非法值。** 服务端 schema 用 `category:z.enum(...).nullable().optional()`，`null` 去掉键后视为未知（同 scene `parent` 的处理，`service/novel-import-ai.ts:366`）。其它非法值（如 `"Item"`）由严格 schema 拒绝并走两轮纠错，持续失败时该批失败、第13步失败可重试。此风险接受：取值为固定英文小写枚举，与 roleType 同类，角色清单已按此运行。
4. **taken 比对范围。** 只用物品组自身名称（各条目的 `name`，即 primaries）比对，不用模型写给物品的别名，避免把“圣徽”因别名“黑夜女神”而排除。角色/场景一侧取名称与别名。作者在 `authorKept` 中重新勾选的 `sceneExcluded` 场景视为作者确认的地点，纳入 taken（规则即“已勾选且非 unresolved”的场景）。
5. **rosterFound 表述。** 运行中计数对 item 排除被判非物品的组，仍是上限（不经 `keepWizardItem`、taken 与资料来源合并）；不承诺与最终清单相等。
6. **按条目自身名称计票的取舍。** 票按合并后的组统计。别名强链接把物品条目与人物条目合为一组时票型混合；该情况要求互相列为别名且达到半数链接（`novel-import-wizard.ts:98-100`），概率低，接受并以用例记录行为。

7. **第三轮建议。** `mergeWizardRoster` 返回内部字段 `primaries:Set<string>`（`g.primaries` 的键），与 `itemVotes`、`otherVotes` 一并在 `buildWizardCandidates` 剥离。物品组任一 primary 在 taken 中即排除。用例构造：itemType/important 同源用例须为物品票占多数的组（item 2 票、`important:false`、出场 <3 章；character 1 票、`important:true`、`itemType:'角色'` 且排在最前）；“物品别名等于人名”用例中人名只作物品条目的别名，不作任何物品条目的本名。

## 3. 风险与取舍

- 模型仍可能把个别概念判为 item；类别字段让这种错误需要模型主动选错，比当前“无定义”少。真实验证核对截图中的条目。
- 名称比对只做精确规范化比对，不做包含匹配，“罗塞尔大帝的日记”这类含人名的物品不受影响。代价：与已选人物或地点（含其别名，如称号）完全同名的物品会被排除，资料来源豁免。
- 计票“非物品票 > 0 且不少于物品票即排除”，平票排除；全为未知时保留（退化为现状）。真实物品若多数批次被误判为概念会丢失。
- category 缺省按未知：若模型普遍漏写，修复退化为现状。真实验证记录缺省比例与失败批次数。
- 非法 category 两轮纠错仍失败会使第13步失败（2R2-3，已接受）。
- 别名合并后票型混合（2R2-6）。
- 识别进行中、暂存已带 category 的草稿被旧版本打开时，strict schema 拒绝，该草稿被跳过（`main/novel-import.ts:379`）。只影响降级打开。
- 旧草稿已生成的物品清单不自动重算，见 2R-3。

## 4. 验证计划（按 2R/2R2 重写）

单元（core，`tests/unit/novel-import-item-category.test.ts`）：
- 计票：1:1 排除；item 2 : other 1 保留；全未知保留；仅 1 票 other 其余未知排除；判为 character 的条目 `important:true` 不使该组保留、其 `itemType` 不作标签；资料来源的组被判非物品仍保留；别名合并后混合票型按组统计。
- 候选：生成的候选不含 `itemVotes`/`otherVotes`，整份 wizard 状态通过 `validateImportWizardState`。
- 暂存 schema：带合法 category 通过；不带 category（旧）通过；非法 category 拒绝。
- 中途恢复：旧条目无 category、新条目带 category，混合计票结果正确。
- taken：已选角色名/别名排除同名物品；未选角色不排除；`sceneExcluded` 未选不排除；`authorKept` 的 `sceneExcluded` 场景排除；unresolved 场景不排除；无角色/场景候选（步骤跳过）不排除；角色称号别名与物品同名时排除（已知风险）；物品别名等于人名时不排除；资料来源物品豁免。
- `wizardRosterFound`：item 计数排除被判非物品的组。

服务层（`runImportAi`）：category 透传；缺省允许；`null` 视为未知且结果无该键；非法值拒绝。更新 RA-07 断言透传。

提示：WP-01 item 字段含 `category` 与六个取值；character/scene/world 清单提示与改动前逐字相等（改动前捕获固定串入测试）；WP-04 禁用词不出现。

控制器（fixture）：物品清单返回混合类别与和已选角色同名的 item，第13步候选只含物品。

全量：Node 24 下 `npm test`、类型检查、lint。台账 NI-10。

真实目标：LOTM 第一卷（小丑），走到第13步，记录物品清单数量、category 缺省比例、失败批次数，核对截图中各条目不在清单中；截图存证据目录（不进仓库）。

## 5. 另记（不在本次范围）

- 识别步骤处于等待（清单已生成）时调用 `wizard-redetect`，因覆盖完整、暂存已删，正文识别的条目会全部丢失（`main/novel-import.ts:439,602`）。UI 仅在失败或清单为空时显示“重新识别”，正常路径不触发。
