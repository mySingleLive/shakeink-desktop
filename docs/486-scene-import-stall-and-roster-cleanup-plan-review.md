# 486 方案独立审核

审核对象：`docs/486-scene-import-stall-and-roster-cleanup-plan.md`。依据为当前分支 `feat/novel-import-roster-speed` 的源码（未运行测试）。行号指当前文件。

## A. 卡在 424/429（3.1）

**原因判断成立。** `buildSceneWizardCandidates` 默认 `selected:true`（`desktop/core/novel-import-scene-identity.ts:8`），`planEntityTasks` 不看身份状态（`desktop/main/novel-import.ts:964-966`），`next()` 不领取 unresolved 场景（`:751`），所以收尾时任务仍为 waiting，进入 `stepState='waiting'`、`phase='select'`（`:779`）。`ImportStep` 只在有失败项时显示“跳过失败项”（`src/components/desktop/NovelImportWizard.tsx:163`），而这些任务不是失败项。另外 `expectedSceneOwnershipKeys` 对已选 unresolved 身份抛 `mixed`（`scene-identity.ts:20`）。

**已核对、无问题的部分**
- `scope` 检查（`novel-import-wizard-checks.ts:20`）只看已选候选与已导入结果。取消选择后不会出现“未选中却已导入”。
- `selectionHash` 只在 `confirmRoster` 写入（`:1154`），其余地方都调用实时的 `wizardSelectionHash`（`core/novel-import.ts:383`），从不比对已存值。图片授权的 `hash` 也不被校验，`generateWizardImage`（`:1120`）只比模型 id 和 authRevision。在 `runEntities` 中取消选择不会破坏这两项，但应顺手重算 `w.selectionHash`，保持一致。
- 由 `s-<16hex>` 派生的 `e-<16hex>` 符合任务 ID 格式 `/^[a-z0-9-]{1,80}$/`（`wizard-state.ts:37`）。

**问题**
1. **严重：人造的 skipped 实体任务会生成永远 waiting 的图片任务。** `planEntityTasks` 的图片循环（`:969`）为该类别下所有实体任务补建图片任务，不看选择状态，也不看任务状态。这些图片任务的 `dependsOn` 指向一个 skipped 任务，`ready()`（`:712`）永远为 false，`pending()` 又会计入它们。只要作者勾选了场景外景或内景图，步骤会再次停在 waiting，原问题照旧出现。已有任务的旧草稿也一样：只把实体任务标为 skipped，不级联到依赖它的图片任务。需要复用 `wizardTask` 里的递归 `skip`（`:461`），并让图片循环跳过未选中或已 skipped 的实体任务。
2. **`retryKind` 后未导入列表会丢失。** `retryKind`（`:945-948`）删除该类别全部候选的任务，再按“任务是否还存在”过滤 `w.skipped`。之后的 `deferUnresolvedScenes` 只处理“已选”的 unresolved 候选，而这些候选第一次处理时已经取消选择，所以不会再写入记录，校验页的列表就没了。`revise`（`:1084`）的路径也一样。建议不用人造任务和 `w.skipped`，改为在校验页直接从账本或候选推导“unresolved 且未导入”的列表，也就不需要伪造任务。若坚持用 `w.skipped`，判断条件应改为“unresolved 且无产物”，而不是“已选”。
3. **旧草稿的恢复入口没有写明。** 已卡住的草稿处于 `import-scene/waiting`、`phase='select'`。重启后 `initialize` 只把 running、recognizing、publishing 改成 paused（`:388`），所以界面停在 `RunningFooter`，只有“暂停”可点（`NovelImportWizard.tsx:45-47`）。要回到 `runEntities`，只能先点暂停再点“允许并继续导入”，经 `wizardResume:1043` 重新启动。方案应写明恢复路径。可选做法：在 `wizardResume` 或打开草稿时，对 import-scene 的 waiting 状态先做延后处理再启动；或在该状态下直接提供“继续”按钮。方案还应为该路径加 RED 用例，前提是重启后 grant 已撤销。
4. `next()` 只按“已选且 unresolved”过滤（`:751`）。取消选择后，如果任务没有在同一个 checkpoint 内标为 skipped，它就能被领取，随后 `importEntity` 抛出“清单项目已取消”（`:977`），任务变成 failed。方案要求在同一个 checkpoint 中先完成取消选择、跳过任务及其依赖任务，再启动 worker，这个顺序需要写进用例。
5. 遗漏场景流程 `importSceneOmissions` 中，新出现的 unresolved 候选默认已选，仍会直接抛错（`:922`）。方案应说明该流程是否也套用决定1。

## B. 清单整理模式（3.2）

**接入点不止方案列出的两处白名单**
6. 服务端：`importAiResponseSchema`（`novel-import-ai.ts:431`）和 `sceneIdentityWireSchema` 需要增加 cleanup 分支。`generateImportAiJson` 的 `generationBase`（`:582`）目前只对 roster 和 links 使用 wire schema。`validateSemanticStage` 的阶段推导（`:823`）会把 cleanup 归为 `roster`，需要显式区分。越权字段的遍历列表（`:824`）也要加入 `sceneCleanup`，否则新键不会被拦截。
7. 主进程：`ai()` 中 `Object.hasOwn` 的越权列表（`main/novel-import.ts:1463`，目前只有 `sceneRosterRecords` 和 `sceneIdentityDecisions`）、第二个遍历列表，以及与 sceneLinks 同样的“唯一根键”检查都要补上。`ImportSemanticResult` 类型（`core/novel-import-semantics.ts:42`）和提示分发（`ai-payload.ts:42-43`）也要补。并发上限是 `WIZARD_SCENE_ROSTER_CONCURRENCY=31`，不是 32。

**设计缺口**
8. **合并后的组可能变成 unresolved，导致原本能导入的场景不再导入。** `regroup` 有两条路径会产生这种结果。第一，合并后的组内部只要存在一条 different-place 关系，整组标为 unresolved（`scene-identity.ts:115`）。第二，被合并的几个身份原来的上级不一致，或上级落入同一组内，`ids.size!==1||ids.has(i.id)` 成立，该组标为 unresolved 并清除上级（`:126-129`）。结合 3.1，这些地点会被静默排除。按“冲突组变 unresolved，随后由3.1处理”的写法，整理反而会减少已导入场景。建议应用前先预检：会连通 different-place 关系或作者拆分的合并不执行，单独记为“未合并，原因”。上级规则需要明确，例如上级一致时保留，不一致时置为 unknown，不把整组标为 unresolved。还要用用例证明整理前可导入的场景数不会因整理而下降，除非是被合并。
9. **传递合并会放大错误。** 并查集会把 A→B、B→C 连成一组，两个包可以各自完成链的一半。例如“廷根大学”→“廷根”、“廷根”→“廷根市”，结果大学和城市成了同一组。方案应规定目标必须是本轮不再合并到别处的根，否则改为指向最终根，或判为冲突后不执行。要有跨包成链和成环的用例，说明结果是确定的。
10. **证据门证明不了“同一地点”。** 现在的要求是 quote 在本项 focus 单元内唯一并包含本项名称。这只能证明本项的名称出现过，任何一处提及都能通过。至少应改用 `assertSceneIdentityEvidence` 加本项 membership 的 `ownedRanges`（与 `applySceneIdentityParentRepair` 一致，`:17`），防止引用同单元里另一个同名身份的提及。方案还应写明 merge 的依据性质：它是模型判断，basis 为 `model`。
11. **drop 的证据和结果没有持久化的位置。** 候选上只有一个布尔字段 `sceneExcluded`。drop 的证据校验完就丢了，作者看不到“原文依据”，这与决定2不符。`buildSceneWizardCandidates` 每次从账本重建；`revise('detect-scene')` 会删除候选（`:1088`）并删除非 `roster:` 的 coverage（`:1086`），所以排除标记会丢。排除结果和证据应写入账本，例如新增严格的可选字段并纳入 `ledgerHash`；或写入 wizard state 的专用字段，并配套 schema 和校验。
12. **`s.coverage['cleanup:scene']` 存哈希是误用。** coverage 的语义是单元 ID 列表。`novel-import-budget-policy.ts:44/50/60` 会把它计为已完成的分析单元，影响旧预算判断。`changeSceneIdentity`（`:362`）会删掉它，`revise` 也会删。应改用账本或 wizard state 中的专用字段。
13. **部分包失败时语义不清。** 整理针对整份账本。如果先应用成功的包，`ledgerHash` 和 `identityRevision` 会变，其余包按旧哈希构建，重试时会被判为过期。“已覆盖单元不重跑”说的是识别步骤的 coverage，不适用于整理。需要二选一并写明：全部包成功后一次 regroup 原子应用；或像 links 一样按身份 basisHash 记录结果，下一轮只重新规划未决项。
14. **只来自资料的身份没有 focus 材料。** 方案规定 focus 取“最早 1 个提及所在的工作单元”，但纯 source-block 身份在正文里没有单元，应改用 `sceneSourceBlockOwnedUnits`。另外，作者资料里的地点是否允许 drop 也要写明，建议不允许。
15. **预算。** 每个包都带完整名录。`requestSnapshot` 还会带 entities 和 chapters（`:1381`）。身份上限是 5000（`SCENE_IDENTITY_LIMITS`），名录本身可能超出预算。需要规定名录单独超出预算时怎么失败，并加上限用例。可参照 links 的 `fitsAlone`，把它记为 unknown 或 keep。
16. 应用时需要像 `applySceneIdentityLinkWave` 一样校验 `ledgerHash` 和 `identityRevision`，并逐项比对 catalog 和 focus 与当前账本是否一致。`name` 的选定规则“取组内最早提及的选择”需要有确定性用例。

## C. `defaultParts` 改动（3.3）

- 账本哈希不受影响。`regroup` 对成员完全相同的旧身份保留原 `nameParts`（`:123`），`ledgerHash` 按存储值计算（`:89`），已恢复的草稿哈希保持稳定。只有新身份或成员变化的身份才会采用新默认值。
- 现有用例：`tests/unit/novel-import-scene-identity.test.ts:160-164` 用显式 `label` 得到“东宅·书房”，不受影响。`changedNameParts`（`scene-identity-actions.test.ts:18`）已兼容默认值为 `[literal]` 的情况。没有找到断言默认名带“·”的用例，但仍需跑 `novel-import-scene-identity*`、`scene-roster-retry`（比较 identities）以及 `tests/browser/novel-import-wizard.test.ts`。
- 副作用：被保留为不同地点的同名场景，在清单和保存后的作品里会显示完全相同的名称。清单行应显示限定语作为辅助文字（不进入名称），否则作者无法区分两个“廷根”。

## D. 验证计划缺项

需补充以下用例：
- 勾选场景图片时延后 unresolved 不会卡住（问题1）。
- `retryKind` 和 `revise` 之后未导入列表仍然完整（问题2）。
- 重启后卡住草稿的实际恢复路径（问题3）。
- 遗漏场景流程（问题5）。
- 整理导致 unresolved 或上级冲突时，可导入场景数不减少（问题8）。
- 跨包成链、成环（问题9）。
- 证据引用同单元另一个同名身份时被拒（问题10）。
- 排除标记和证据在重建、返回修改后仍保留（问题11）。
- 部分包失败（问题13）。
- 纯资料身份（问题14）。
- 名录超出预算（问题15）。
- 两层白名单与唯一根键的拒绝用例（问题6、7）。
- UI 用例：清单页新提示、“非具体地点”标签、校验页未导入列表、只剩待确认项时的按钮状态。

此外：
- 同步更新 `docs/requirements-traceability.json`。
- 真实验证除检查名称外，还要记录整理前后的身份数、unresolved 数、整理调用次数，以及整理后可导入数是否下降。
- 建议只剩待确认项时允许“跳过导入场景”，不要继续禁用按钮。决定1要求向导能继续，目前作者只能先逐项取消勾选。

结论：需修改

1. 延后 unresolved 时级联跳过依赖的图片任务；`planEntityTasks` 不为未选中或已 skipped 的实体任务建图片任务。
2. 未导入列表改由账本或候选推导，或把判断条件改为与选择状态无关，保证 `retryKind` 和 `revise` 后不丢失；不伪造任务。
3. 写明已卡住旧草稿的恢复入口（重启后、grant 已撤销），并加 RED 用例。
4. 合并前先预检 different-place 关系和作者拆分，冲突的合并不执行并记录原因；写明合并后上级的处理规则，不让合并把可导入场景变成 unresolved。
5. 规定传递合并、成环和跨包链的确定处理规则。
6. merge 和 drop 的证据改为落在本项 `ownedRanges` 内（membership 校验）。
7. 排除结果及其证据、整理完成标记改存账本或 wizard state 专用字段，不用 coverage，不只放在候选布尔字段里。
8. 写明部分包失败时的原子性或按项重规划方案，以及应用时的过期校验。
9. 补全接入点：服务端和主进程的 schema 分支、越权字段列表、唯一根键检查、结果类型、提示分发。
10. 补上纯资料身份的 focus 材料，以及名录超出预算时的处理。
11. 按 D 节补齐用例和验证项。

## 第二轮审核（3R）

依据当前分支源码逐项核对第一轮的 11 项必改（未运行测试）。行号指当前文件。

**已解决**
- 必改1/2（删除任务、待确认列表）：删除方案可行。unresolved 候选的任务从未被领取（`main/novel-import.ts:751` 的领取门）；`changeSceneIdentity` 在已有场景任务时拒绝修改身份（`:352`），遗漏流程遇到已选 unresolved 会直接抛错（`:921`），所以这类任务只会处于 waiting/paused，不会有 failed、结果或已生成的图片（图片依赖实体任务完成，`:712`）。实体任务与依赖它的图片任务一起删除后，`validateImportWizardState` 的 dependsOn 检查（`wizard-state.ts:81`）仍然成立；`w.skipped` 中没有引用它们；`resolveWizardReferences` 只看 artifacts，删除不影响。任务 ID 由候选 ID 派生（`:965`），作者重新勾选后 `planEntityTasks` 会重建同名任务，状态是新的 waiting，没有冲突。待确认列表由账本推导（`core/novel-import.ts:411` 附近），`retryKind`/`revise` 不会丢失它。
- 必改5（传递合并）：“目标的决定必须是 keep”可以排除链和环，并且与包的顺序无关。
- 必改6（证据）：改用 `assertSceneIdentityEvidence(…,targetId)`（`scene-identity.ts:194`）和本项 ownedRanges，可以防止借用同一单元里其他身份的提及。
- 必改7（存储）：已改用 `w.sceneCleanup`，不再使用 coverage。
- 必改8：原子应用，与 links 的 `ledgerHash` 校验方式一致（`:692`）。作者修改身份要求步骤处于 waiting 且没有在运行的任务（`:351`），整理运行期间不会与作者修改并发。
- 必改9、10：接入点已列全；并发上限已改为 31（`:96`）。

**仍有问题**
1. **恢复路径的 RED 用例无法成立。** `initialize` 会直接删除没有 `publication` 的草稿（`main/novel-import.ts:377`），而 `publication` 只在保存时写入（`:1906`）。所以停在 import-scene 的草稿在重启后不存在，“重开 controller 后点继续”测试的是一个已被删除的草稿。第一轮问题3中“重启后 grant 已撤销”的前提也不成立。实际能恢复的只有同一进程内卡住的会话。方案应把用例改为：同一个 controller，构造 `import-scene/waiting`、`phase='select'` 且含已选 unresolved 及 waiting 任务的状态，点击“继续导入”后进入下一步。同时写明：重启后这类草稿会被删除，这是现有行为。
2. **`wizardResume` 中的图片授权检查在延后处理之前执行。** 只要勾选了场景图片且 `w.imageGrants.scene` 缺失，`:1033` 就会把 unresolved 场景的 waiting 图片任务算作待生成，要求重新授权图片；未配置图像模型时会直接抛出“尚未配置图像模型”。可能出现这种情况的路径之一是 `revise('work')` 清空授权后返回原步骤（`:1076`）。延后之后这些图片任务本来会被删除。应在 `wizardResume` 做图片检查之前，先对 import-scene 执行 `deferUnresolvedScenes`（在同一个 checkpoint 内），或在检查时排除 unresolved 候选的任务。其余路径已核对，可以走通：`phase==='select'` 被接受（`:1020`）；import-scene 不在 ROSTER_STEPS 中，不会进入 `:1039` 的 waiting 分支；之后经 `launch→wizardRun→runEntities` 到达开头的 checkpoint（`:541`、`:710`）。
3. **只剩待确认项时按钮仍禁用，与决定1冲突。** `RosterStep` 的禁用条件是 `!!unresolved&&!ready`（`NovelImportWizard.tsx:133`），3.1 保留了这一行为，3R 没有改。全部已选场景都待确认时，作者必须逐项取消勾选才能继续。应允许继续：`confirmRoster` 延后处理后 `selected=0`，导入步骤记为 skipped（`:1151`），提示改为“N 项归属待确认，不会导入”。
4. **合并预检还缺“成环”一项，失败兜底会造成永久失败。** 预检规则覆盖了 regroup 产生 unresolved 的全部路径，已逐条核对：different-place 冲突（`scene-identity.ts:115`）、新 same-place 与作者拆分冲突（`:116`）、拆分组被再次连通（`:118`）、继承上级不唯一或指向组自身（`:127-129`）。但 regroup 不检查上级成环，账本校验也不检查（`sceneParentCycleIds` 只在 `applySceneIdentityChange` 中调用，`:12`）。例如 A 的上级是 B，B 的上级是 C，A 合并到 C 后得到 {A,C}→B→{A,C}。这类环会交给之后的 `repairSceneParents` 处理，目标超过 32 个时整步失败（`main/novel-import.ts:677`）。应在预检中加入“合并后上级成环则忽略”。另外，“断言没有新增 unresolved，否则整次整理失败”是确定性的：重新识别会得到同样的结果，作者无法继续。应改为不采用违规的合并，保持原样并记录，而不是让步骤失败。“没有新增”也需要定义清楚，例如按 unresolved 身份的成员集合比较，因为合并后身份 ID 会变化。
5. **`w.sceneCleanup` 的重入规则不完整。**
   - (a) 记录的 hash 取自整理应用后，之后的上级循环修复（`:656`）会改变账本，下次 `runConcreteSceneRoster`（重新识别、`revise('detect-scene')`）判定 hash 不同，会重新付费整理。应在该函数末尾写入最终账本的 hash，或改为在整理开始前比对。
   - (b) “账本变化后保留仍存在的排除 ID”与重新整理的结果如何合并没有写明（并集还是替换），也没写模型改判 keep 时怎么处理。
   - (c) “被排除的候选应用时设为未选”在重跑时会覆盖作者已经重新勾选的项。应规定只把本次新增的排除项设为未选，作者的勾选由 `buildSceneWizardCandidates` 保留（`scene-identity.ts:8`）。
   - (d) `validateImportWizardState`（`wizard-state.ts:68`）需要写明：`excluded` 去重；ID 不在当前账本中时允许保留但不生效；evidence 用严格的 `sourceRangeSchema`。`ImportWizardView` 的 Omit 列表（`shared/novel-import.ts:163`）需要说明 `sceneCleanup` 是否下发给界面，以及作者在哪里查看排除依据。按决定2，排除依据应当能看到。
6. **应用时的过期校验没有重申。** 3R 只写了原子应用，没有写明应用前比对冻结的 `ledgerHash`/`identityRevision`，也没写逐项核对 catalog/focus 与当前账本一致（第一轮第16条）。建议照 `:692` 和 `applySceneIdentityLinkWave`（`scene-identity.ts:233`）写进方案，并加 stale 用例。
7. **名录和目标的范围有歧义。** 3R 把参与范围限定为“至少有一个正文提及”的身份，但没说 catalog 是否包含仅来自资料的身份。如果包含，这类身份不在任何 focus 中，没有自己的决定，规则1“目标必须是 keep”就无法判断。应写明：catalog 与 focus 的范围相同；或者仅来自资料的目标视为 keep。
8. **遗漏场景流程（第一轮问题5）没有回应。** `importSceneOmissions` 遇到新出现且已选的 unresolved 候选时仍会抛错（`main/novel-import.ts:921`），这一流程也不做整理。应写明是否套用决定1，以及整理是否覆盖该流程（不覆盖也要写明），并补上用例。
9. 小项：延后取消选择后重算 `w.selectionHash`（`:1154`）以保持一致；名录超出预算时直接让场景步骤失败，没有降级方式，真实验证时需要记录名录大小，确认第一部“小丑”不会触发。

结论：需修改

1. 恢复用例改为同一进程内的恢复，写明重启后草稿会被删除（`:377`）。
2. `wizardResume` 先延后 unresolved 场景，再检查图片授权。
3. 只剩待确认项时允许继续，不再禁用按钮。
4. 合并预检加入上级成环检查；后验断言失败时不采用违规合并，而不是让整步失败；用成员集合定义“新增 unresolved”。
5. 补全 `w.sceneCleanup` 的 hash 记录时点、重跑的合并规则、作者重新勾选的保留规则、schema 与界面下发方式。
6. 重申应用前的 `ledgerHash`/`identityRevision` 和 catalog/focus 过期校验。
7. 写明 catalog 的范围，以及非 focus 目标的处理方式。
8. 回应遗漏场景流程，并补用例。

## 第三轮审核（3R2）

依据当前分支源码逐项核对 3R2 对第二轮 9 项的回应（未运行测试）。行号指当前文件。

**已解决**
- 第二轮1（恢复范围）：与 `initialize` 删除未保存草稿（`main/novel-import.ts:377`）一致，用例可构造。
- 第二轮2（继续导入顺序）：`wizardResume` 的图片检查只统计未完成的图片任务（`:1034`），先 defer 删除这些任务后不再触发授权或“尚未配置图像模型”。之后 `launch→runEntities` 重新 `planEntityTasks` 只为已选候选建任务（`:964`），路径成立。
- 第二轮6（应用时过期检查）：写入 `commitSceneResult` 的 change 回调，与 links 的 `:671` 一致，可行。
- 第二轮7（名录范围）：名录与 focus 同范围，规则1可判定。
- 第二轮8 主体：新出现且全新的 unresolved 候选改为 defer，`additions` 只取已选项（`:923`），可行。例外见下文第4条。
- 全部待确认时跳过：`confirmRoster` 在 `selected===0` 时把 import-scene 标为 skipped（`:1152`），`wizardRun` 遇到 skipped 直接前进（`:537`）。`resolveWizardReferences` 只在 `runEntities` 结尾调用（`:779`），跳过时不会执行，也没有需要它处理的场景结果。校验时 `assertSceneOwnership` 的 expected 为空（`:328`），`wizardStructureChecks` 的 scope 检查只看已导入结果（`wizard-checks.ts:20`），都能通过。前提是第3条的图片检查顺序先修正。
- 逐条合并的 ID 变化：same-place 关系按成员键存储（`leftKey/rightKey`），`regroup` 每次按成员重算并查集（`scene-identity.ts:107-112`）。合并组的 ID 取最早成员派生（`:93`、`:123`），成员集合不变的身份保留原 ID 和 nameParts（`:123`）。只要实现时按冻结账本把每条 merge 解析为成员键，并用成员集合判定“新增 unresolved”，后续合并引用已改名的组没有问题。drop 项不参与合并，成员集合不变，ID 稳定，`excluded` 中的 ID 有效。

**仍有问题**
1. **已有上级环会让所有合并被回退。** 整理位于 `runSceneIdentityLinks` 之后、上级修复之前（`:653-656`）。`applySceneIdentityLinkWave` 不检查环（`scene-identity.ts:233`），所以 `:656` 才需要修复，也就是说整理开始时账本里可能已经有环。3R2 第4、5项写的是“出现上级环则回退/忽略”。按字面实现，只要基线有环，每条合并都会被拒绝，整理等于没有生效。应改为只拒绝“新增”的环：先记录基线环涉及的成员集合，合并后再比较；或者把整理移到 `repairSceneParents` 之后执行，整理结束后再检查一次环。
2. **`inputHash` 跳过规则在实际重入路径上不会触发。** 整理成功后，账本里已经写入 same-place 关系，之后还可能做上级修复。`revise('detect-scene')` 不删除 `w.sceneIdentity`（`:1086-1088` 只删 coverage 和候选）。`runConcreteSceneRoster` 遇到同一 scope 时直接沿用 prior（`:615-618`，`createSceneIdentityLedger` 在 `scene-identity.ts:134` 返回 prior 的副本），重跑 roster 和 links 后得到的是整理和修复之后的账本。它的 hash 不等于 `inputHash`，于是每次重新识别都会重新付费整理，并对已整理的账本再做一次判断。应同时记录 `outputHash`（在 `:657` 最终 checkpoint 时取的账本 hash），当前 hash 等于 `inputHash` 或 `outputHash` 时都跳过。另外，跳过时 `revise` 已经删除候选（`:1088`），重建后全部为 `selected:true`（`scene-identity.ts:8`）。所以跳过路径也要重新应用一次“excluded 减去 authorKept 设为未选”，否则排除项会默认被选中，与决定2不符。
3. **“跳过导入场景”在勾选场景图片时会报错。** `confirmRoster` 先检查图片授权（`:1146`），后计算 `selected`（`:1148`）。界面只在 `wanted.length&&ready` 时发送 `imageConsent`（`NovelImportWizard.tsx:133`），`ready===0` 时发送 `{}`，于是抛出“请允许把外观描述发送给图像模型”或“尚未配置图像模型”。应写明 `confirmRoster` 的顺序：先 defer，再计算 `selected`，只有 `selected>0` 时才检查和写入图片授权（授权 hash 用 defer 之后的已选 ID）。
4. **遗漏流程中已导入的场景可能变成 unresolved，并保持原 ID。** 新的上级关系可能让成员不变的已有身份得到多个不同上级。这时 `regroup` 保留原 ID，并把状态设为 unresolved（`scene-identity.ts:123`、`:129`）。如果原来没有上级，`:921` 的 id/name/parentId 比较能够通过。这时对它调用 `deferUnresolvedScenes` 会取消一个已有结果的场景，随后 `wizard-checks.ts:20` 报“未被选中却已导入”，`expectedSceneOwnershipKeys` 也会因为 `mixed` 失败（`scene-identity.ts:19`）。应限定遗漏流程只 defer 没有 artifact 的新候选；已导入的身份变成 unresolved 时，仍按现有方式抛出“请返回识别场景”。
5. **重新整理后，旧排除项被改判为 keep 时仍保持未选。** 3R2 第6项写的是新的 `excluded` 替换旧值，`authorKept` 保持选中，但没有写旧排除项不再被排除时怎么处理。`buildSceneWizardCandidates` 会保留上次的 `selected:false`（`scene-identity.ts:8`），于是这一项没有“非具体地点”标签，却仍然未选，作者也看不出原因。应规定：在旧 `excluded` 中但不在新 `excluded` 中的 ID，如果不在 `authorKept` 中，恢复为 `selected:true`。`authorKept` 也要写明维护规则：在 `selectCandidates`（`:1127`）中，对处于当前 excluded 中的 ID，`selected:true` 时加入，`selected:false` 时移除。这样“全选”等同于逐项重新勾选，“全不选”会清空 `authorKept`，这一行为需要写进用例。

**小项**（不阻塞）：逐条 regroup 每次都要复制账本，`regroup` 内部对 identities 做 O(I²) 查找。真实验证时记录整理应用的耗时。

结论：需修改

1. 上级环检查只拒绝新增的环（按成员集合与基线比较），或者把整理移到上级修复之后。
2. 跳过规则同时比较 `inputHash` 和最终账本的 `outputHash`；跳过时重新对候选应用 excluded/authorKept 的选择。
3. `confirmRoster` 改为先 defer，再计算 selected；只有 selected>0 时才检查图片授权。
4. 遗漏流程只 defer 没有 artifact 的新 unresolved 候选；已导入的身份变成 unresolved 时仍然抛错。
5. 规定旧排除项改判 keep 时恢复选中，并写明 `authorKept` 的加入、移除规则以及“全选/全不选”的语义，补上用例。

## 第四轮审核（3R3）

依据当前分支源码核对 3R3 对第三轮 5 项的回应（未运行测试）。行号指当前文件。

**已解决**
- 第三轮1（基线环）：环检查按成员键集合判定是可行的。`sceneParentCycleIds` 返回候选 ID（`wizard-roster.ts:9-22`），候选 ID 对应身份的 `memberKeys`，而成员键在 regroup 前后不变（`scene-identity.ts:107-123`），所以“基线环成员键集合”和“合并后环成员键集合”都能稳定算出，子集比较也有确定结果。逐条合并都和整理开始时的基线比较，不和上一步的工作副本比较。会被拒绝的情形是：把非环身份并入环内身份（环成员键增多），以及把两个环内身份合并、使上级指向自身（`:129` 设为 unresolved，3R2 第5项已经会回退）。这两种都属于既定的保守取舍，不影响其余合并。整理后照常执行上级修复（`main/novel-import.ts:655-656`）。
- 第三轮3（`confirmRoster` 顺序）：先 defer、再计算 `selected`、只在 `selected>0` 时检查图片，这个顺序成立。`imageGrants[kind].hash` 只在 `:1146`、`:1037` 写入，源码中没有任何地方回读或比对它（`:1118` 只比对模型 id 和 authRevision），所以授权 hash 用 defer 之后的已选 ID 不会造成不一致。`wizardResume` 在 defer 之后用同样的公式计算，两处一致。`selectionHash` 本来就在 skip 映射之后计算（`:1154`），defer 后再算，被延后的候选不会进入 hash。defer 先改动状态，之后如果抛出“识别失败”，`wizard-*` 动作的快照会回滚（`:416`、`:449`）。界面在 `wanted&&ready` 时才发送 consent（`NovelImportWizard.tsx:133`），这里的 `ready` 等于服务端 defer 之后的 `selected`，两边判定一致。
- 第三轮4（遗漏流程）：只 defer `s.artifacts` 中没有同 ID 的 unresolved 候选，这样 `:923` 现有条件 `c.selected&&unresolved` 只会被已导入的身份触发，与原有抛错一致。defer 必须放在 `:922` 写入候选之后、`:923` 判定之前。
- 第三轮5（`authorKept`）：加入、移除、全选、全不选都在 `selectCandidates`（`:1127`）中按 ID 处理，规则清楚。重新整理后的恢复规则覆盖了旧排除项改判 keep 的情况。

**仍有问题**
1. **上级修复失败后，“重新识别”不会命中跳过规则。** `outputHash` 只在 `:657` 的 checkpoint 写入。整理已经原子提交，但如果随后 `repairSceneParents` 失败（`:655`，例如 `:680` 超过 32 项、预算不足、重试用尽），步骤会走 `:658` 变为 failed，`outputHash` 没有写入。这时账本是“整理后、修复前”的状态，hash 既不等于 `inputHash`，也没有 `outputHash` 可比。作者点“重试”（`:439`，roster 覆盖完整，不会重新识别）后，整理会再付费执行一次，而且是在已经写入 same-place 关系的账本上重新判断，与“相同则不重跑”不符。应在整理提交时（`commitSceneResult` 内）同时写入整理后的账本 hash（例如写入 `outputHash`，到 `:657` 再覆盖为修复后的 hash，或者另设 `appliedHash`），跳过时三者任一相等即可。
2. **需要写明在哪里比较 hash。** 比较必须放在 `runSceneIdentityLinks` 之后、整理之前（`:653` 之后）。不能放在 `runConcreteSceneRoster` 入口。原因是 `revise('detect-scene')` 删除了 `roster:scene` 覆盖（`:1086`），但保留了 `w.sceneIdentity`。入口处的账本 hash 正好等于 `outputHash`，可是随后会重跑全部 roster 并追加新记录。如果在入口比较，就会在新的识别结果上错误地跳过整理。另外，即使比较位置正确，重新识别时 links 也会为合并后的身份生成新的核对任务：`basisHash` 包含 `memberKeys`（`scene-identity.ts:217`），旧结果不能复用，只要与其它身份共享限定词就会发出新的请求。新请求的结果只要不是 unknown 就会写入关系（关系 key 含证据，`:133`），账本 hash 随之改变，整理会重跑。这是输入确实变化后的正确行为，但用例应覆盖两种情形：没有新 link 结果时跳过，有新 link 结果时重跑。

**小项**（不阻塞，属于现有问题）：识别失败页的“跳过此步骤”发送 `{skip:true}`，不带 consent（`NovelImportWizard.tsx:112`）。按 3R3 的顺序，`selected` 在 skip 映射之前计算，所以只要本类图片已勾选、候选仍有选中项，跳过时仍会抛出图片授权错误。建议在重排时把 `action.skip` 视为 `selected=0`。

结论：需修改

1. 整理提交时就记录整理后的账本 hash，使上级修复失败后的“重试”能够跳过整理；`:657` 再记录修复后的 hash。
2. 写明 hash 比较位于 links 之后、整理之前，不在 `runConcreteSceneRoster` 入口；用例覆盖“重新识别后没有新 link 结果则跳过、有新 link 结果则重跑”。

## 第五轮审核（3R4）

依据当前分支源码核对 3R4 对第四轮两项必改和一项小项的回应（未运行测试）。行号指当前文件。

**(a) 整理已提交、上级修复失败后点“重新识别”**
- `wizard-redetect`（`main/novel-import.ts:439`）只把步骤置为 running 并重进 `runConcreteSceneRoster`。账本 scope 与 `workingRevision` 未变，不重建账本（`:615-618`）。roster 覆盖完整时 queue 为空，`save(true)` 不提交任何内容（`:647`），随后进入 `runSceneIdentityLinks`（`:649`）。所以执行顺序能走到 3R4 第2项规定的比较点。
- links 会在整理后的账本上第一次规划。合并后身份的 `memberKeys` 变了，`basisHash` 也随之改变（`core/novel-import-scene-identity.ts:217`）。只要与其它身份共享限定词，就会出现新的核对任务并发出请求（需付费）。这是 3R4 第2项已经接受的行为：
  - 规划时的 checkpoint（`:665`、`:666`）只改 `linkTasks`。`ledgerHash` 计算时不含 `linkTasks`（`scene-identity.ts:89`），所以 hash 不变。
  - 结果全为 unknown 时只写 `task.result`，不加关系；`finish` 只在 hash 改变时递增 revision（`:233`、`:90`）。hash 仍等于 `cleanedHash`，跳过整理，结论正确。
  - 有非 unknown 结果时会加入关系并 regroup，hash 改变，整理重跑。这时输入确实变了，重跑是正确行为。
- 结论：3R4 第1项所说的“重试时账本 hash 等于 `cleanedHash`”，前提是 links 没有新的非 unknown 结果。比较放在 links 之后，两种情形的处理都正确。用例按第四轮第2项覆盖这两种情形即可。

**(b) 修复提交内更新 `cleanedHash`**
- 修复提交位于 `:692`。`commitSceneResult` 先 clone 会话，在 `change(candidate)` 中修改，再整体提交（`:295-297`）。所以在 `change` 内能读到 `candidate.wizard.sceneIdentity.ledgerHash`（修复前）和 `candidate.wizard.sceneCleanup.cleanedHash`，相等时写入 `next.ledgerHash`。这一更新与账本写入是原子的，判定可以执行。
- 修复前的账本即 `:680` 读取的 `ledger`。场景识别运行期间没有其它写入，`applySceneIdentityParentRepair` 也要求 binding 与 `ledger` 的 hash 相等（`scene-identity.ts:14`）。用 `ledger.ledgerHash` 或 candidate 当前 hash 比较，结果相同。
- 如果修复提交成功、`:657` checkpoint 失败，`cleanedHash` 已经是修复后的 hash。重试时 hash 相等，跳过整理，结论正确。
- 修复失败（`:681`、`:688`、`:690` 抛错）时不提交，`cleanedHash` 保持整理时的值，与 (a) 一致。

**(c) `action.skip` 视同 `selected===0`**
- 现在的图片检查在 `confirmRoster` 第一行（`:1146`），排在失败判定（`:1147`）之前。识别失败页发出的 `{skip:true}` 不带 consent（`NovelImportWizard.tsx:112`），在现状下会误报授权错误。按 3R3 第3项与 3R4 第3项重排后，顺序是：defer，计算 selected（skip 时为0），仅在 selected>0 时检查图片，再做失败判定，最后 skip 取消全选（`:1153`），import 步骤标为 skipped（`:1154`）。skip 路径不再检查图片。
- 清单页按钮只在 `wanted&&ready` 时带 consent（`NovelImportWizard.tsx:133`）。空清单的“跳过”（`:118`）和全部待确认时的“跳过导入场景”在服务端得到的 selected 都是0，两端判定一致。

未发现会导致行为错误或阻碍实现的新问题。

结论：通过

1. 无必改项。实现时请把 (a) 的两种 links 情形、(b) 的“修复成功但 `:657` 保存失败后重试”和 (c) 的“失败页跳过且已勾选图片”各写成用例。
