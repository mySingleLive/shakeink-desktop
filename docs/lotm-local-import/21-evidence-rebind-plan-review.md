# 证据唯一逐字改挂方案（20）独立审核

日期：2026-10-29。审核对象：`docs/lotm-local-import/20-evidence-rebind-plan.md`。方向（唯一逐字改挂）不在审核范围。

## 结论：有条件接受

条件集合本身足以挡住编造证据：改挂后的quote仍是某个请求单元的逐字子串，晚期还会再经`validateImportEvidence`（`desktop/core/novel-import.ts:167-169`）和控制器来源检查（`desktop/main/novel-import.ts:700`）。`unknown-unit`、`too-short`、`ambiguous`、需排版恢复的情形和跨边界拼接都排除了。不过下面两条阻断项要先在方案中写清并配用例，才能进入TDD。

## 阻断项

B1. 早期与晚期必须共用同一个判定函数，并固定先后顺序。
- 早期检查在`requestedEvidence`中调用`anchorEvidence([entry],request.units)`（`desktop/service/novel-import-ai.ts:46-50`），只有它抛出`no-match`时才查找唯一归属单元。
- 晚期接纳则写成“先按条件3改挂……再执行原`anchorEvidence`”（方案“落点”第3条，对应`novel-import-ai.ts:336`）。如果照字面实现，一条quote在声明单元A中可以经排版恢复唯一定位（早期判定通过，应留在A），同时又逐字唯一出现在B，晚期就会把它改挂到B，违反条件2，两处判定也就分叉了。
- 要求：新增一个共用函数，例如`anchorAnalyzeEvidence(entry,units)`，内部先执行原`anchorEvidence`，仅在原因恰为`no-match`时调用`uniqueLiteralOwner`，返回`{unitId:B,quote}`或抛出原错误。早期superRefine和晚期都只调用这个函数，`sourceUnitIds`在晚期补充。
- 还要说明：`runImportAi`中的最终`responseSchema.safeParse`（`:326`）用的也是`importAiResponseSchema`，同样会放行。所以晚期如果漏掉改挂，就会以`no-match`失败；而且这次失败不经过`generateJSON`重发，属于非重试路径的错误。

B2. 适用范围要写明覆盖“遗漏补全”请求。
- `semanticPending`的遗漏补全请求同样是`phase:'analyze'`、无intent的普通分析（`desktop/main/novel-import.ts:647-651`），按条件1也会被改挂，但方案只在RB08中验证了`semanticAnalyzeUnits`（`:680-710`）。
- 两种处理都可以：明确接受，并补一条控制器用例（改挂后`completedUnitIds`、`validateImportEvidence`仍成立）；或者明确排除，同时说明如何在服务层识别这类请求（目前只能靠instruction区分，不建议这样做）。

## 已核对、无阻断

- 唯一性计数：按`indexOf(quote,position+1)`计数，重叠出现也要算（如B为“甲”×9、quote为“甲”×8，应判为2次）。诊断代码`novel-import-ai.ts:95`已经这样数，方案应写明沿用。两个单元文本相同时计为2次，失败，符合预期。
- 条件3的“≥8”与`anchorEvidence`中`too-short`在`no-match`之前判断（`:290`）重复：能走到`no-match`的quote必然已经≥8。保留作双保险可以，但计数口径应与`evidenceLayout`相同。
- generateJSON重发与归因：可改挂的条目不产生issue，`evidenceReason`只来自剩余的真实失败（`:136-145`），所以同一响应中混有真实`no-match`时，整体照常以`no-match`重发和失败。归因逻辑不受影响。
- 下游：
  - 控制器的`sourceUnitIds`子集检查成立，因为B属于本次请求。
  - `mergeImportArtifacts`对`sourceUnitIds`取并集（`core/novel-import.ts:220`）。
  - coverage按`request.units`记录，与`sourceUnitIds`无关（`main/novel-import.ts:702`）。
  - 身份链接校验`validateIdentityLinks`和`validateSemanticLinks`不读evidence。
  - review分片按unitId过滤证据（`core/novel-import-review-tasks.ts:27`），改挂后反而更准确。
  - `importArtifactSemanticHash=importHash(a)`（`core/novel-import-semantics.ts:263`）包含evidence，但它在接纳之后才计算，锁和baseHash不受影响。
  - 角色字段报错的映射分支（`:157-178`）只在invalid_schema时进入，不受影响。
- RB09：DIAG02中`one-position`（`tests/unit/novel-import-anchor-diagnostics.test.ts:57`）用的是`bad(quote)`，即no-match且在x中唯一，改后会被接纳，`rejected()`断言（`:38-40`）将失败。按方案改用`unknown-unit`（`bad(quote,'missing')`）是对的。
- 其余诊断用例无需修改：`same-unit-two-positions`、`two-units`、`literal-only`仍是no-match；`:54`的四类计数中，otherUnitUnique来自unknown-unit；`:64、:78-84`已在用`'missing'`。
- 以下现有no-match用例都属于编造、拼接或需排版恢复，改后仍然失败：
  - `tests/unit/novel-import-ai.test.ts:96-105`
  - `tests/unit/novel-import-request-schema.test.ts:122-129`
  - `tests/unit/novel-import-evidence-batches.test.ts:30`

## 非阻断建议

1. 诊断语义会变化：改后no-match条目的`otherUnitUnique`在结构上恒为0，只有unknown-unit条目还会计入。r7若再出现诊断，应按这个口径解读，最好在方案中写一句。
2. 改挂后原声明单元A仍留在`sourceUnitIds`中，可能已经没有任何证据支撑。现有代码没有“每个sourceUnitId都有证据”的不变量（missingTargets才有，`novel-import-ai.ts:350`），保留A可以接受，但请写明是有意保留。
3. 同一artifact改挂后可能出现两条完全相同的`{unitId,quote}`，可以考虑去重，参照`main/novel-import.ts:611`的键。不去重也没有正确性问题。
4. `uniqueLiteralOwner`搜索到第2次命中就提前返回。quote长度受payload预算约束，不必另设上限。
5. 晚期改挂应基于zod解析后的新对象，不修改raw和request，`tests/unit/novel-import-ai.test.ts:87`已有这个断言习惯。

## 需补充的用例

- RB10：同一quote在A中可经排版恢复唯一定位，同时逐字唯一在B。预期留在A，早期与晚期结果一致（验证B1）。
- RB11：同一artifact内一条证据可改挂、另一条是真实no-match。预期整体失败（no-match），generateText调用2次，诊断noMatch=1。
- RB12：多条证据改挂到不同单元，或B已在`sourceUnitIds`中。预期顺序为原值在前，新单元按证据顺序追加，无重复。
- RB13：B内重叠出现两次（“甲”×9对“甲”×8）。预期失败，不改挂。
- RB14：quote本身含空白且在B中逐字出现，非空白字符恰为8个；再测7个，预期`too-short`。
- RB15：遗漏补全路径端到端（验证B2）。
- RB16：`semanticVersion`未定义的旧请求，以及worldline、narrative各一例。旧请求行为不变；新类别能改挂，且后续`validateSemanticLinks`仍执行。
- RB17：raw和request不被修改；改挂结果合并后，`assertImportSemanticLocks`仍通过。
