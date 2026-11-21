# 558 导入校验冲突的展示与解决方案 测试用例 · 独立审核

审核对象：`docs/558-import-conflict-choices-cases.md`。对照依据：`docs/557-import-conflict-choices-plan.md`（「审核后修订」R2–R12 优先于正文）与 `docs/557-import-conflict-choices-plan-review.md`。审核时没有修改任何源文件或测试。

说明：审核期间工作区里已有未提交的实现（`desktop/core/novel-import-conflict-choices.ts`、`desktop/main/novel-import.ts` 的 `wizardDecision` 等）和未跟踪的 `tests/unit/novel-import-conflict-choices.test.ts`。下面的行号按审核时的工作区记录，之后可能移动。引用这些未提交文件只是为了判断用例能不能落地，审核对象仍是 558 文档。

## 发现

1. **OK：控制器用例的主体能用现有夹具执行。**
   - `legacySceneFixture` + `rosterAi` + `fullAi` + `toVerify` 能走到第 21 步（`tests/helpers/novel-import-wizard-fixture.ts:54,87,200-201`）。"首包报冲突，定向复核继续报同一冲突"的写法与 NIW-C60 一致（`tests/unit/novel-import-wizard-session.test.ts:352-362`，`held` + `r.artifacts.length===1`）。
   - 自动修复（`repairConflicts`，`desktop/main/novel-import.ts:1506`）对短 `text` 冲突会先试 3 次。每次定向复核仍报同一字段（`:1529`），冲突才会留给作者。用例开头那句"定向复核仍报同一冲突"正好针对这一点，可以执行。
   - `injectJournalEdit`/`verifyAgain`（`novel-import-wizard-fixture.ts:205-211`）能构造 CC-10、CC-13、CC-15、CC-18 需要的会话状态。

2. **must-fix：控制器夹具的 `publish` 是桩，CC-06/07/08/11/14/18 写的「保存完成」证明不了 `assertPlan` 和读回。**
   - 夹具的 `publish` 只复制会话、返回固定回执（`tests/helpers/novel-import-wizard-fixture.ts:39`），不执行 `publishNovelImport` 里的 `assertPlan`（`desktop/service/novel-import-publish.ts:48-78`）。`assertPlan` 检查的是：冲突全部 resolved（`:70`）、`importNativeMappings` 通过、锁与资料一致、`inputHash`/`decisionHash`/`verifiedHash` 匹配、`stage==='ready'`（`:76`）。用户要求"选任何方案都能成功导入和保存"，要证明的正是这一组检查。
   - 补法：在 `tests/integration/novel-import-verify-publish.test.ts` 追加 `inferred`/`source`/`merge` 各一条用例。写法照该文件的 `verifyFixture`（`:23-29`，`f.options.publish` 接到真实 `publishNovelImport` + 一次性 PGlite `Workspaces`）。每条断言：
     - `completed`，`publish` 不抛错；
     - 读回数据库：角色 `bio`（即资料 `text`，`desktop/core/novel-import-semantics.ts:240`）分别等于候选值、原值、填写值；
     - `assertSaved` 全量一致（`:30-40`）；
     - 冲突的 `resolution` 与所选方案一致；
     - 发布会话的 `semanticState.locks` 含 `{artifactId,field,value}`，`stage==='ready'`。这一条证明作者决定没有被 `keepForSave` 去掉（`desktop/main/novel-import.ts:1412` 起）。
   - 控制器用例里的「保存完成」改写成"桩发布收到的会话中，字段值、冲突状态、锁、decision 符合预期"，不要写成保存通过。

3. **must-fix：CC-12 在控制器夹具里不经过适配器，证明不了 R2。**
   - 夹具的 `ai` 直接调用桩（`novel-import-wizard-fixture.ts:39`），不调用 `runImportAi`。抛「语义锁定字段或基础版本无效」的 `validateSemanticRequest` 在 `runImportAi` 里（`desktop/service/novel-import-ai.ts:1127`，锁检查在 `:939`）。所以即使不改 R2，CC-12 的「复核请求不因锁报错」也照样通过。
   - CC-22/CC-23 只测适配器本身。主进程要把 v2 字段锁真正转发出去，这一段要另外证明：`requestSnapshot` 只转发 `Object.hasOwn(a.facts,field)` 的锁（`desktop/main/novel-import.ts:2088`），复核材料又会去掉超过 1500 字的事实（`:1449`）。
   - 补法（二选一，写进用例）：
     - CC-12 捕获决定之后那一次复核请求，断言 `semanticLocks` 含 `field:'backstory'`，再把它交给 `runImportAi`（`generate` 用桩，写法见 `tests/unit/novel-import-semantic-session.test.ts:41` 的 `realAdapter`），断言不抛错；
     - 或者让这条用例的夹具 `ai` 直接走 `runImportAi`。
   - 构造办法也要写明。`entityResult` 给角色的 facts 只有 `roleType`（`novel-import-wizard-fixture.ts:116`），复核材料里没有 `backstory`，桩报不出这条冲突。要先用 `injectJournalEdit` 给 schema 2 角色写入 `backstory`，清空 `coverage.review`，再重新复核。`backstory` 不是结构字段，会先走 3 次自动修复（R8），桩必须在定向复核里继续报它。

4. **must-fix：R11 和 §3 的详情计算没有对应用例。**
   - R11 规定了四件事，558 都没有写：
     - 「现在的设定」与 `conflictBases` 不一致（资料在冲突入库后被改动）时视为过期，不提供 `inferred`；
     - 只对引用字段和 JSON 字段跑 `importNativeMappings`；
     - 按 `revision` 缓存；
     - 所有已导入资料 ID 都换成名称，包括 JSON 内部的 ID。
   - 补用例：
     - (a) 冲突入库后用 `injectJournalEdit` 改资料现值：`current` 等于新值；`inferred` 不可用，原因可以区分；直接提交 `inferred` 被拒绝，会话不变；
     - (b) `parentId` 冲突（世界观资料，见第 9 条）：`current`/`proposed` 显示资料名称，不出现 `/[a-z]{1,2}-[0-9a-f]{16}/`；
     - (c) `relationships` 冲突（JSON 内含 `characterId`）：展示文字中的 ID 已换成角色名；
     - (d) 来源文件单位的依据显示文件名，找不到章节时显示「原文」（§3「位置」）；
     - (e) 复核运行中（`stepState.verify==='running'`）没有 `conflictDetail`。
   - CC-13 现在的构造会和 (a) 混在一起，见第 7 条。

5. **should-fix：R4（`fixStructure` 之后再加锁）和 R8（转成 setting-body 后先自动修复）没有用例。**
   - R4 补一条：对 `relationships` 选 `inferred`，候选里的 `characterId` 指向未选中的角色。`fixStructure` 会去掉这个关联（`desktop/main/novel-import.ts:1556` 起）。断言：
     - 冲突 resolved，但没有这条锁；
     - 随后 `wizard-verify-repair` 补细纲时不抛「导入作者锁定字段发生变化」，补细纲的分支会调用 `semanticCheckpoint(s).locks`（`:1435`，`assertImportSemanticLocks` 在 `:2318` 起）；
     - 保存通过。
   - R8 补一条：复核返回 `type:'body-body'` 的 `text` 冲突，定向复核**不再**报它。断言冲突被自动修复（`resolution==='auto-body'`，`verify.fixed` 有记录），没有留给作者。这对应 557 审核第 8 条的要求。

6. **should-fix：CC-11 的「执行 [修复]」在 R5 之后不会重新复核该包，测不到"重新打开"。**
   - R5 不清 `coverage.review`。`runWizardVerify` 只复核未覆盖或失败包里的单位（`desktop/main/novel-import.ts:1428`），所以决定后直接点 [修复]，这个包不会再发给审核模型，"冲突不重新打开"的断言自然成立。
   - 补法：先用 `injectJournalEdit` 往 `verify.failedPackets` 写入一条含该冲突证据单位的记录，再调用真实的 `wizard-verify-repair`（`:584`）。断言：
     - 该包确实又复核了（请求数增加）；
     - 桩返回的冲突 hash 与已解决冲突相同（桩固定 `hash:'h'`，`addConflicts` 正好走"同 hash 重开"这一支，`:2503`）；
     - 冲突仍为 resolved，`droppedConflicts` 不变（§1 规定"不计数"）。
   - 三种方案各跑一次，或至少 `source` 和 `merge` 各跑一次。`source` 的锁值等于现值，`merge` 的锁值是新值，两条路径不同。
   - 用 `resume` 代替 [修复] 不算覆盖 [修复]。

7. **should-fix：CC-13 要先确定构造顺序，并区分"较长"和"过期"两个原因。**
   - 如果冲突入库后再把资料改成 2500 字，`current` 与入库时的基准不一致，按 R11 同时是"过期"。用例断言的原因就有歧义。
   - 建议照 VS-12 的写法（`tests/unit/novel-import-verify-session.test.ts:103-114`）：先注入 2500 字 `text`，清空 `coverage.review`，再重新复核，让冲突在长资料上自然产生。同时断言：
     - 复核请求里该资料的 `text.length===2000`，`reviewProjection.textRange` 为 `{start:0,end:2000}`；
     - 冲突的 `source.value` 是 2500 字的现值（主进程按现值改写，`desktop/main/novel-import.ts:1478`）；
     - 长文本不走自动修复（`autoRepairable`，`:1500`），冲突直接留给作者，没有定向复核请求。
   - 然后断言 `inferred` 不可用，原因为「这项设定较长……」（`desktop/core/novel-import-conflict-choices.ts:47`）；`merge` 可用，预填完整 2500 字；`merge` 提交后发布值不缺字。
   - 事实值超过 1500 字的情况，复核材料不发送（`:1449`），审核模型不会报出。这种冲突只能来自前面步骤的推迟冲突，用 `injectJournalEdit` 构造一条，断言 `inferred` 不可用。

8. **should-fix：R9 只覆盖了一种形状，不对应资料的冲突和 `source-source` 没有用例。**
   - CC-18 只覆盖"资料 ID 在 candidate 一侧的 body-body"。补两条：
     - (a) 两侧都没有 `artifactId` 的推迟冲突：`choices` 只有 `source` 可用；提交后 resolved，有 decision，保存通过；
     - (b) `mergeImportArtifacts` 形状的 `source-source` 冲突，两侧都带 ID（`desktop/core/novel-import.ts:343-345`）：`current` 取 `source.artifactId` 资料的实时值，三种方案中可用的都能完成。
   - CC-18 写的是「前面步骤留下的」，实际只能用 `injectJournalEdit` 构造。用例里应写明构造方式，同时把冲突 ID 加进 `wizard.deferredConflicts`。

9. **should-fix：CC-15 的字段选错了资料种类。**
   - `toTree` 默认只选 `body/character/world`（`novel-import-wizard-fixture.ts:73-78`），夹具里没有场景资料。角色的事实字段也不含 `parentId`/`characterId`（`desktop/core/novel-import-semantics.ts:54`）。
   - 草稿测试已经改用角色的 `characterId`，这是该种类没有的字段，测到的不是 R12 的场景。
   - 改为世界观资料的 `parentId`（`world` 有 `parentId`，`:56`），候选值等于自身 ID。断言 `inferred` 不可用；`merge` 不可用（结构字段）；`source` 可用，提交后保存通过。

10. **should-fix：缺少几条负面用例和"不改的部分"的回归用例。**
    - **过期的冲突**：提交已 resolved 的 `conflictId` 报「冲突决定已过期」；旧 `revision` 被拒绝；会话不变。
    - **复核运行中**：CC-17 应照 VS-32 的写法（`tests/unit/novel-import-verify-session.test.ts:121-127`），在 [修复] 真实运行、复核被挂起时提交决定。断言报「正在复核，请稍候再处理矛盾」（`desktop/main/novel-import.ts:2648`），放行后同一决定能完成。草稿用 `injectJournalEdit` 改 `stepState.verify`，这一步会先 `pauseAll`，会话进入 `paused`，拒绝的原因可能不是"运行中"。
    - **`merge` 校验失败**：填一个通不过 `validateImportSemanticArtifact` 的值，断言提示「填写的内容不能保存为「字段」：原因」，会话不变（§4 第 2 步）。
    - **直接提交置灰的方案**：对 JSON 字段或结构字段提交 `merge`、对 R12 字段提交 `inferred`，都被拒绝。只在 CC-13 测一处不够。
    - **`inferred` 的清理**：候选值带知识标注（匹配 `IMPORT_KNOWLEDGE_ANNOTATION`，`desktop/core/novel-import-semantics.ts:321`）时，写入的值已去掉标注；资料证据并入冲突证据（§4 表格）。
    - **非向导会话的回归**：非向导会话的 `resolve source` 仍要求解释并送审核复核（`resolveConflict`，`desktop/main/novel-import.ts:2683` 起）。
    - **仅场景目标的回归**：向导会话走 `runVerify`（`wizardChapterReview` 为假，`:1419`）时不出现 `conflictDetail`，决定仍走旧路径。方案「不改的部分」承诺了这两条，需要有用例。

11. **should-fix：现有测试的期望变化没有逐条列出。**
    - NIW-C60/C63（`tests/unit/novel-import-wizard-session.test.ts:352-362`）：R10 要求改为断言 `source` 决定后**没有任何模型请求**。现在只断言"没有整书重分析"。
    - NIW-C19/F2（`:527`）：`rewrite` 仍走旧 `resolveConflict`（`wizardStepDecision` 排除了 `rewrite`，`desktop/main/novel-import.ts:2644-2645`）。期望不变，但要写明它依赖 §1 把类型改成 `setting-body` 后，`conflictChoices` 仍含 `rewrite`（`desktop/core/novel-import.ts:360`）。CC-19 与它重复，可以只引用。
    - VS-09 与 golden：加 `reason` 句子会改变 `wizard-review-v1` 的提示词哈希（`tests/fixtures/novel-import-prompt-golden.json:188-192`）。用例应写明运行 `scripts/capture-novel-import-prompt-golden.ts --check`，并按 557 审核第 10 条重新确认 `assertImportFixedPromptReserve` 的预算。
    - `tests/browser/novel-import.test.ts:93`（NI-U06 的 body-body 分支）和 `tests/unit/novel-import-domain.test.ts:54` 走非向导路径，不受影响，列入"不变"即可。
    - `tests/integration/novel-import-verify-publish.test.ts` 的 VS-21/VS-40 和 541-2：未处理冲突在保存时保留的行为不变，应列入回归范围。

12. **should-fix：界面用例要写明用哪个夹具，并补忙碌和不可信文本两条。**
    - `tests/browser/novel-import.test.ts` 用的是非向导夹具 `novel-import-ui-fixture.tsx`。它的 `resolve` 会直接清空冲突（`:69-71`），视图里没有 `wizard`。向导夹具 `novel-import-wizard-ui-fixture.tsx` 对任何带 `revision` 的动作只加 revision（`:52-57`），没有模拟 `resolve`。
    - CC-30 到 CC-35 需要在向导夹具里加一个选项：`phase:'conflicts'` + `conflictDetail`，`resolve` 时推进到下一条或回到 `select`。用例应写明扩展哪个夹具，以及 CC-35 回到的 `verify` 页面要断言什么。
    - 补充以下界面用例：
      - 提交期间（`busy`）单选和确认按钮禁用；
      - 服务端拒绝时显示错误，界面停在当前冲突；
      - 最后一处的按钮为「确认」，其他为「确认并处理下一处」；
      - `reason`/`current` 含 `<img src=x onerror=…>` 时按纯文本显示，页面不出现 `img`；
      - 两侧文字相同时不出现 `del`/`ins`。

13. **should-fix：CC-40/41 的真实系统验证要写明口径和降级办法。**
    - 真实运行时自动修复（R8）会先修掉一部分冲突。剩下的冲突数量和种类不确定，也不一定有 `inferred` 可用。用例应写明：
      - 剩下不足三处，或某一处只有 `source` 可用时，怎样补足：从同一隔离根复制会话，对同一冲突分别选三种方案，复制前要处理租约回执；
      - 记录每处冲突的字段、可用方案和所选方案。
    - 运行环境按现有约定写明：LotmVerification.app 开发构建；隔离数据根，只选第一卷「小丑」；Node 24；运行期间不构建；证据目录；不记录 Key 和正文。
    - 读回方式要写明：用 verify/save 驱动读取已保存作品，或直接查隔离根里的作品库。读回三项值，并截图「处理矛盾」界面。还要断言 557 现状一节提到的问题已消失：界面不显示原始字段键、单位 ID 和实体 ID（`c-…`）。
    - 台账：`docs/requirements-traceability.json` 应登记 CC 编号、对应测试文件和运行命令（包括 `zsh` 下用 `xargs` 传文件列表并确认用例数大于 0）。用例文档没有提到。

14. **OK：CC-01 到 CC-05、CC-09、CC-10、CC-16、CC-20 的期望具体，可以检查。**
    - CC-04 走控制器的截断（`desktop/main/novel-import.ts:1478`），夹具不经过 `normalizeReviewReply`。CC-21 建议再加一条 350 字 `reason`，经 `runImportAi` 的情况，确认 `normalizeReviewReply` 先截断，`.max(300)` 的严格 schema（`desktop/service/novel-import-ai.ts:38`）不会因此拒绝整个回复。
    - CC-10 用例中应同时断言两条 decision 的 `conflictId` 各不相同（R9）。

## R 条目覆盖表

| 条目 | 用例 | 结论 |
|---|---|---|
| §1 改类型/实体名 | CC-01 | 覆盖 |
| §1/R6 锁过滤，不计数 | CC-11 | 构造不足（第 6 条） |
| §2 reason | CC-04、CC-21、CC-24 | 覆盖；golden 未列（第 11 条） |
| §3/R11 详情 | CC-05 | 部分覆盖；过期、ID 换名、JSON、位置缺失（第 4 条） |
| §4 三方案 | CC-06/07/08 | 只覆盖桩发布（第 2 条） |
| R2 | CC-12、CC-22/23 | 控制器链路未证明（第 3 条） |
| R3 | CC-13 | 构造要改，facts>1500 缺失（第 7 条） |
| R4 | 无 | 缺失（第 5 条） |
| R5 | CC-20 | 覆盖 |
| R7 | CC-02、CC-03 | 覆盖 |
| R8 | 无 | 缺失（第 5 条） |
| R9 | CC-10、CC-18 | 部分覆盖（第 8 条） |
| R10 | CC-19、CC-24 | NIW-C60 的新断言未列（第 11 条） |
| R12 | CC-14、CC-15 | CC-15 字段要改（第 9 条） |

## 结论

**approve with changes**。大部分控制器用例用现有夹具就能执行，期望也具体。进入 TDD 之前必须先修改：

- 第 2 条：三种方案都要经过真实 `publishNovelImport`（PGlite），读回数据库，并断言锁、`stage`、`resolution`。控制器桩发布不能写成保存通过。
- 第 3 条：CC-12 要经过 `runImportAi`，或者断言捕获的请求带 v2 锁并能通过适配器校验。
- 第 4 条：补 R11 的过期、ID 换名称（含 JSON）、位置、运行中无详情等用例。

还应补充：第 5 条（R4、R8）、第 6 条（CC-11 用 failedPackets + 真实 [修复]）、第 7 条（CC-13 构造顺序与长事实值）、第 8 条（R9 的无资料冲突和 source-source）、第 9 条（CC-15 改用世界观资料的 parentId）、第 10 条（负面与回归）、第 11 条（现有测试变化与 golden）、第 12 条（界面夹具、忙碌、纯文本）、第 13 条（真实运行口径、降级办法、台账）。
