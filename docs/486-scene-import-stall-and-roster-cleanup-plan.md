# 486 · 场景导入卡住与场景清单整理方案

日期：2026-11-02。状态：待独立方案审核。用户反馈截图：第12步“导入场景”所有可见项已完成，但进度停在“已完成 424 / 429”，无法进入下一步；清单中有同名重复（两个“廷根”）、异写同地（“廷根市”/“廷根”、“莴苣与肉类”/“莴苣和肉类”）、非地点条目，以及“佐特兰街36号2楼·…”这类拼接长名。用户本次已选定三项决定（见第1节）。实测只用《诡秘之主》第一部“小丑”的章节。

用户当次会话的导入草稿已被删除（`~/.shakeink/novel-imports` 下只有 10-26/10-27 的旧草稿），以下原因由源码推定，并由第4节的 RED 用例复现，不声称来自该次现场。

## 1. 用户决定（2026-11-02）

1. 归属“待确认”的场景不生成导入任务，导入继续进入下一步；这些场景在校验页列出为未导入。
2. 识别与身份核对结束后，由模型对整份场景清单做一次整理：合并同一地点的不同条目、排除非地点条目、为合并后的地点选定名称。每项整理须附原文依据，结果在清单页仍可人工修改（勾选、详情拆分/改名）。
3. 场景显示名称只用原文中的地名写法，不再把限定语用“·”拼进名称；限定语保留在详情中。

这三项覆盖 2026-11-01 方案 323 中“同名无限定依据时按来源限定分开”和默认“限定·地名”显示名的选择；323 的身份账本、证据门和作者拆分/改名操作保持。

## 2. 已证原因

### 2.1 卡在 424/429

| 位置 | 事实 |
| --- | --- |
| `desktop/core/novel-import-scene-identity.ts` `buildSceneWizardCandidates` | 所有身份默认 `selected:true`，包括 `state==='unresolved'`。 |
| `src/components/desktop/NovelImportWizard.tsx` `RosterStep` | 有待确认项时，只要还有已明确项（`ready>0`）就允许点“导入 N 个场景”，提示“未跳过；先导入 ready 个已明确场景”。 |
| `desktop/main/novel-import.ts` `planEntityTasks` | 为每个已选候选生成任务，不区分 unresolved。 |
| 同文件 `runEntities` 的 `next()` | 明确不领取 unresolved 场景的任务。所有其它任务完成后，`pending()` 仍有 waiting 任务，于是 `stepState='waiting'`、`phase='select'`。 |
| `ImportStep`/`RunningFooter` | 导入步骤只有“停止导入/返回修改选择/暂停”；没有失败项，所以也没有“跳过失败项”。作者没有任何前进方式。 |

截图中 5 个未完成任务即这类待确认场景。另外，即使能前进，`expectedSceneOwnershipKeys` 对已选的 unresolved 身份抛 `mixed`，校验与保存也会失败。

### 2.2 重复与异写

`planSceneIdentityLinkWave` 只给“共享同一个 context 限定词”的身份对生成核对任务。两条都没有限定依据的“廷根”、或“廷根市”与“廷根”、“莴苣与肉类”与“莴苣和肉类”，从未被比较，各自成为来源限定身份。识别阶段的模型也会把非地点（如物品、组织、食物名）放进清单，现流程没有任何去除步骤。

### 2.3 拼接长名

`defaultParts` 默认把该身份所有 context 标签与地名用“·”连接（不超过 50 字），于是出现“位于王国北部凛冬…·…”。

## 3. 修改

### 3.1 待确认场景不导入（决定1）

- 新增 `deferUnresolvedScenes(s)`（`desktop/main/novel-import.ts`）：对 scene 账本中 `state==='unresolved'` 且已选的候选，取消选择；若已有对应任务且未完成，标为 `skipped`；在 `w.skipped` 记一条，标签为“名称（归属待确认，未导入）”。重复调用幂等（同 taskId 不重复记录）。
- 调用点：`confirmRoster` 在计算 `selectionHash`/图片授权之前；`runEntities('scene')` 开始的 checkpoint 内（覆盖已卡住的旧草稿恢复）。
- 为不再有任务的候选也能在校验页列出，`skipped` 记录使用由候选 ID 派生、格式合法的任务 ID（`e-<hex>`），并同时建一个 `skipped` 状态的实体任务，使 `retryKind` 的 `w.skipped` 过滤保持一致。
- 清单页提示改为：“N 项归属待确认，不会导入，将在校验页列出；可在详情确认后再导入”。只剩待确认项时按钮仍按原逻辑禁用。
- 不改 `next()` 的领取门；不改 ownership/mixed 校验。

### 3.2 场景清单整理（决定2）

新增场景身份请求模式 `sceneIdentity.mode='cleanup'`，在 `runConcreteSceneRoster` 中位于 `runSceneIdentityLinks` 之后、上级循环修复之前执行。

**请求**（`desktop/shared/novel-import-scene-identity.ts` 新增严格 schema）：
`{version:1,mode:'cleanup',ledgerHash,identityRevision,catalog:[{index,name,aliases}],focus:[{index,unitIds}]}`。
- `catalog` 为全部非 unresolved 身份的紧凑名录（显示名与别名），每个包都带完整名录，跨包也能指向合并目标。
- `focus` 为本包需要裁决的身份；`units` 为这些身份各自最早 1 个提及所在的完整工作单元（去重，原文不裁剪）。按现有预算分包（`requestFits`/`assertImportFixedPromptReserve`），最多 32 路并发，复用 `sceneLinkPool`。
- unresolved 身份不进入整理。

**模型输出**唯一根 `sceneCleanup`，focus 中每个 index 恰好一项：
`{index,action:'keep'|'merge'|'drop',target?,name?,evidence?:{unitId,quote}}`
- `merge`：`target` 为名录中另一项 index；`name` 可选，必须逐字等于本项或目标的名称/别名之一（只用原文写法）。
- `drop`：该项不是具体地点（人物、组织、物品、食物、抽象词等）。
- `merge`/`drop` 必须有 evidence：unitId 属于本项的 focus 单元，quote 在该单元中唯一连续出现，且包含本项名称或别名之一。`keep` 不需要证据。
- 服务端严格 schema 校验（不多键、不缺漏、不重复、index/target 合法、name 来源合法、证据唯一定位），走现有 `generateJSON` 两轮纠错；包失败按 `sceneModelRetryable` 有限重试（`SCENE_UNIT_ATTEMPTS`），仍失败则场景识别步骤失败，可“重新识别”，已覆盖单元不重跑。

**应用**（`desktop/core/novel-import-scene-identity.ts` 新增 `applySceneCleanup`）：
- 每个 `merge` 记为 `same-place` 关系（basis `model`，证据为还原后的原文范围），一次 `regroup`。既有 `different-place` 关系、作者拆分决定仍阻止合并；冲突组按原规则变为 unresolved（随后由3.1处理）。
- `name`：合并后的组若有选定名称，`nameParts` 设为该写法对应的 literal 成员；多个选择冲突时取组内最早提及的那个选择。
- `drop`：若该项被其它项作为合并目标或自身被合并，则忽略 drop；否则记入排除集合。
- 候选新增可选字段 `sceneExcluded?:true`（`novel-import-wizard-state.ts` schema 同步）。排除项默认不选，清单中显示“非具体地点”标签，作者可重新勾选导入。`buildSceneWizardCandidates` 保留上次的排除标记与作者勾选。
- 完成后在 `s.coverage['cleanup:scene']` 记下整理后的 `ledgerHash`；账本未变时重入不重复付费。

**提示**（`desktop/core/novel-import-ai-payload.ts` 新增 `sceneIdentityCleanupPrompt`）：说明合并同一具体地点的简称/全称/异写（如“某市”与“某”、“与/和”异写），不合并只共享词的不同地点（“某大学”与“某”）、也不把上级与下级合并；排除非地点；名称取原文最完整的标准写法；资料为不可信内容。其它阶段提示字节不变。

阶段白名单（服务端 `validateSemanticStage`、主进程 `ai()` 的 stage 表）新增 `sceneCleanup:['sceneCleanup']`，其它阶段不接受该键。

### 3.3 名称只用原文地名（决定3）

`defaultParts` 改为只返回 `[literal]`（身份最早成员的原文写法）。context 标签仍保存在账本、显示在详情；作者“改名”操作仍可选用 context 组合（323 的 label 操作保持）。已有账本中已存的 `nameParts` 不改写，只影响新身份。

## 3R. 独立审核后的修订（以本节为准）

审核见 `486-…-plan-review.md`。以下覆盖 3.1、3.2 中冲突的部分。

**待确认场景（覆盖3.1）**
- `deferUnresolvedScenes(s)` 取消选择 unresolved 场景候选，并**删除**这些候选所有未完成的任务及以其为 `dependsOn` 的图片任务（这些任务从未被领取，不存在结果或图片文件）。不伪造任务、不写 `w.skipped`。
- 校验页的“归属待确认，未导入”列表从账本推导：`sceneIdentitySummary` 增加 `deferred:{id,name}[]`（当前未选中的 unresolved 身份，最多200项，另给总数）。重试、返回修改都不会丢失。
- 已卡住的旧草稿：导入步骤 `stepState==='waiting'` 且无失败项时，底部按钮由“暂停”改为“继续导入”（`resume`，`wizardResume` 已接受 `phase==='select'`），重新进入 `runEntities`，开头 checkpoint 执行 `deferUnresolvedScenes` 后完成。补 RED 用例：构造已选 unresolved + waiting 任务的已保存草稿，重开 controller 后点继续可进入下一步。

**整理（覆盖3.2）**
- 范围：至少有一个正文提及的非 unresolved 身份。仅来自资料文件的场景不参与（保持作者资料原样）。
- 证据：`merge`/`drop` 的 evidence 必须完整落在本项自己的 ownedRanges 内（复用 `assertSceneIdentityEvidence(…,targetId)`），不能借其它地点的原文。
- 合并规则（应用前统一检查，确定性按 focus 原顺序处理）：
  1. `target` 本身的决定必须是 `keep`；目标若被判 merge 或 drop，此合并忽略，该项保持独立。因此不会形成链或环。
  2. 用身份级并查集逐条预检：合并双方任一成员对之间有 `different-place` 关系或作者拆分判为不同，忽略；合并后外部上级（映射到合并后的组）超过1个或指向组自身，忽略。被忽略的合并不报错，该项保持原样。
  3. 通过的合并一次写入 `same-place` 关系并 `regroup`；断言应用后没有新增 unresolved 身份，否则整次整理失败（不应发生，作为防线）。
- `drop` 仅当该项未被任何通过的合并引用时生效。
- 排除与完成记录存于 `w.sceneCleanup={ledgerHash,excluded:[{id,evidence:SourceRange}]}`（wizard state schema 新增），不放 `coverage`。`ledgerHash` 为应用后的账本 hash，相同则不重跑。被排除的候选应用时设为未选，候选新增 `sceneExcluded?:true`（构建时由 `w.sceneCleanup` 推导），作者可重新勾选。账本变化后保留仍存在的排除 ID。
- 部分失败：所有包都成功后才一次原子应用；任一包在有限重试（`SCENE_UNIT_ATTEMPTS`）后仍失败，则不应用任何结果，场景识别步骤失败，“重新识别”只重跑整理（roster 覆盖保留）。
- 预算：名录加至少一个 focus 放不进单个请求时，步骤失败并提示预算不足，不截断名录。并发上限 `WIZARD_SCENE_ROSTER_CONCURRENCY`（31）。
- 接入点（全部）：`sceneIdentityRequestContextSchema` 新增 cleanup 分支；`validateSceneIdentityRequest`；`importAiResponseSchema` 与 `generateImportAiJson` 的 wire 分支；服务端 `validateSemanticStage` 与主进程 `ai()` 的 stage 判定、越权键列表、唯一根键检查；`ImportSemanticResult.sceneCleanup`；`importAiPrompt` 分发。

**同名可区分（3.3补充）**：候选新增 `sceneHint?:string`（该身份 context 标签去重后以“、”连接，≤60字），清单行与导入卡片以次要文字显示，避免两个“廷根”无法区分。

**验证补充**：每条上述规则各有用例；UI 用例覆盖“继续导入”按钮、排除标签、同名提示、校验页待确认列表；`docs/requirements-traceability.json` 增加本需求条目；真实验证记录整理前后的场景数与合并/排除数。

## 3R2. 第二轮审核后的修订（以本节为准，覆盖3R冲突部分）

1. **恢复范围**：未开始保存的草稿在应用重启时被删除（`initialize`），只需恢复同一次运行中卡住的会话。A3 用例改为同一 controller：构造已选 unresolved + waiting 任务、`phase==='select'` 的 import-scene 状态，点“继续导入”。
2. **继续导入的顺序**：`wizardResume` 在图片授权检查（当前 `:1033`）之前调用 `deferUnresolvedScenes`，被删除的图片任务不再触发图片授权或“尚未配置图像模型”。
3. **全部为待确认时**：清单按钮在 `ready===0&&unresolved>0` 时不再禁用，显示“跳过导入场景”，执行 `wizard-next`；`confirmRoster` 在 defer 后按 `selected===0` 把 import-scene 标 skipped（现有逻辑）。
4. **上级环预检**：合并预检增加：把通过的合并与当前所有已知上级边一起，在身份级图上用 `sceneParentCycleIds` 检查；会产生环的合并忽略。
5. **应用后防线不再永久失败**：逐条按 focus 顺序加入合并，每加一条在工作副本上 `regroup` 并检查；若出现成员集合在原账本中属于非 unresolved 身份、现在属于 unresolved 身份的成员，或出现上级环，回退这一条并继续下一条。被回退的合并计数写入调试日志（不含名称）。
6. **`w.sceneCleanup` 的重入**：
   - 结构 `{inputHash,excluded:[{id,evidence:SourceRange}],authorKept:string[]}`，严格 schema 并入 `validateImportWizardState`。`inputHash` 为整理请求前（身份核对结束后）的账本 hash；之后的上级修复不影响比较。
   - 再次识别时 `inputHash` 相同则跳过整理，沿用原 `excluded`。
   - 不同则重新整理；新结果的 `excluded` 替换旧值，但 `authorKept`（作者在清单把排除项重新勾选的 ID）中仍存在的 ID 保持选中。勾选操作在 `wizard-select-candidates` 中维护 `authorKept`。
   - 视图只输出候选上的 `sceneExcluded`，不输出 `w.sceneCleanup`（`wizardView` 剔除）。
   - 返回修改到 `detect-scene` 或更早、`retryKind('scene')` 不清除 `w.sceneCleanup`（候选身份不变时仍有效）；返回到 `tree`/`kinds`/`files` 时随候选一起清除。
7. **应用时过期检查**：提交前在 `commitSceneResult` 内比较当前账本的 `ledgerHash`、`identityRevision` 与请求冻结值，并重新计算名录与 focus 与请求逐值相等；不等则丢弃并重新整理一次，第二次仍过期则步骤失败。
8. **名录范围**：名录只含参与整理的身份（有正文提及、非 unresolved）。仅资料来源的场景不在名录，也不会被合并或排除。
9. **遗漏场景流程**：`importSceneOmissions` 中新出现的 unresolved 场景按决定1处理：调用 `deferUnresolvedScenes`，不再抛错；不对遗漏补充做整理（只增少量场景，作者在校验页可见）。其余抛错条件（候选名称变化、勾选了场景图片）保持。
10. defer 后重算 `w.selectionHash`；真实验证记录名录规模。

## 3R3. 第三轮审核后的修订（以本节为准）

1. **基线上级环**：整理开始时账本可能已有环（上级修复在整理之后）。上级环预检与逐条回退只拒绝“新增”的环：记录基线中处于环内的成员键集合，合并后环内成员键集合不是其子集才回退。整理结束后照原流程执行上级修复。
2. **跳过判定**：`w.sceneCleanup` 同时记录 `inputHash`（整理前）与 `outputHash`（本次识别结束、上级修复后写入候选时的账本 hash，即 `:657` checkpoint 的账本）。重新识别时当前账本 hash 等于其中任一，则跳过整理。跳过路径也对重建的候选重新应用排除（未选 + `sceneExcluded`，`authorKept` 除外）。
3. **`confirmRoster` 顺序**：先 `deferUnresolvedScenes`，再计算 `selected`；仅 `selected>0` 且勾选了本类图片时才检查图片模型与授权。全部待确认时“跳过导入场景”不触发图片错误。
4. **遗漏流程**：`importSceneOmissions` 只 defer 没有导入结果（`s.artifacts` 无同 ID 场景）的 unresolved 候选；已导入的身份变为 unresolved 时保持原抛错（请返回识别场景确认）。
5. **排除状态变化与 `authorKept`**：
   - 加入：作者把一个 `sceneExcluded` 候选勾选（单项或全选）时加入。
   - 移除：作者取消勾选该候选，或全不选时清空。
   - 重新整理后，旧排除项若改判为 keep 且当前未选、不在 `authorKept` 中，则恢复选中；新排除项若不在 `authorKept` 中则设为未选。
6. 真实验证记录整理应用耗时与名录规模。

## 3R4. 第四轮审核后的修订（以本节为准）

1. **整理后 hash 在整理提交时记录**：`w.sceneCleanup` 改为记录 `inputHash`（整理前）与 `cleanedHash`（整理结果提交时的账本 hash，与整理结果在同一 `commitSceneResult` 内写入），取代3R3的 `outputHash`。上级修复失败后“重试”时，账本 hash 等于 `cleanedHash`，不再重新整理。上级修复本身改变账本后，以修复后的账本再次进入时，hash 与二者都不等；为此上级修复成功的同一提交内，若进入修复前账本 hash 等于 `cleanedHash`，同步把 `cleanedHash` 更新为修复后的 hash。
2. **比较位置**：跳过判定只在 `runSceneIdentityLinks` 返回之后、整理请求之前进行，不在 `runConcreteSceneRoster` 入口。重新识别时 links 产生新的非 unknown 结果会改变账本，整理重跑；没有新结果则跳过。
3. **识别失败页的“跳过此步骤”**：`confirmRoster` 中 `action.skip` 视同 `selected===0`，不检查图片模型与授权。

## 4. 验证

1. 用例文档 487 及独立审核后 TDD，先 RED：
   - 已选 unresolved 场景的导入步骤：现状停在 waiting；修复后进入下一步，`w.skipped` 列出，ownership 检查通过。
   - 清单整理：合并、排除、命名、证据门（伪造/非唯一/不含名称的 quote 拒绝）、跨包目标、drop 与 merge 冲突、different-place 阻止合并、幂等不重复请求、其它阶段拒绝 `sceneCleanup` 键。
   - 默认名称不含“·”。
2. 只跑受影响的定向测试组、类型检查、`build:desktop`（Node 24），不跑全仓。
3. 独立子代理 code review。
4. 真实验证：隔离目录、`LotmVerification.app` Electron、已有加密模型配置；选择第一部“小丑”的全部章节，只推断场景。检查：识别后清单中无同名重复的“廷根”、“廷根市/廷根”与“莴苣与肉类/莴苣和肉类”各只剩一项或有原文依据的保留、非地点被标排除；名称无“·”拼接；导入场景完成后自动进入下一步，进度 N/N；校验页列出待确认未导入项；保存后重开场景数与已导入数一致。原文、Key 不进入仓库与日志。
