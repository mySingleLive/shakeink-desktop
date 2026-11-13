# 557 导入校验冲突的展示与解决方案 技术方案 · 独立审核

审核对象：`docs/557-import-conflict-choices-plan.md`。对照源文件逐条核实；另在 `/private/tmp` 跑了两个只读探针（直接调用 `runImportAi` 的请求校验，和用隔离会话 `~/shakeink-test-roots/stale-sessions/` 的资料调用 `validateImportSemanticArtifact`、`importNativeMappings`），跑完已删除。审核时未修改任何源文件或测试。

## 发现

1. **OK：三种方案在"只改值、记决定、建锁、重建检查点"这条主线上，能通过保存和 `assertPlan`。**
   - 决定后先 push decision，再 `createImportSemanticState(s,locks)`，`inputHash`/`decisionHash` 与当前决定一致（`desktop/core/novel-import-semantic-state.ts:13-16`）。
   - `wizardNext('verify')` → `keepForSave` 只在 `inputHash` 一致时保留锁，并去掉值已不一致的锁（`desktop/main/novel-import.ts:1403-1408`）；随后 `semanticCheckpoint` 断言锁（`:2305-2308`），设置 `stage='ready'` 与 `verifiedHash`（`:616`）。
   - `assertPlan` 要求冲突全部 resolved、锁与资料一致、`decisionHash`/`inputHash`/`verifiedHash` 匹配（`desktop/service/novel-import-publish.ts:70,76`），以上都满足。
   - `source` 不改值，锁值等于现值，现资料已能映射，所以 `source` 永远可提交。探针：隔离会话里 `roleType` 冲突的 `source` 通过、`inferred`（候选「地点/山脉，非角色」）报「角色类型缺失或无效」，与方案"预检置灰"一致。

2. **must-fix：v2 字段上的作者锁会让之后的复核请求被适配器整包拒绝，[修复] 和自动修复都会因此失败，一致性行无法再通过。**
   - `requestSnapshot` 把锁转发给复核请求，只要资料片段里有该字段（`desktop/main/novel-import.ts:2075,2088`）。
   - 适配器校验锁时用的是 v1 字段表 `IMPORT_SEMANTIC_FACT_FIELDS[a.kind]`，没有用 `importFactFields(kind,schema)`（`desktop/service/novel-import-ai.ts:939`）。向导资料是 `schema:2`，`backstory`、`appearance`、`exteriorDescription`、`effects`、主题定位字段等都只在 v2 表里（`desktop/core/novel-import-semantics.ts:86-92`）。
   - 探针：同一个复核请求，锁在 `roleType`/`text` 上能走到模型调用；锁在 `backstory` 上直接抛 `语义锁定字段或基础版本无效`。
   - 后果：作者对 v2 字段做出任何决定后，[修复] 重跑含这份资料的复核包（`reviewChapterPackets`，`:1450-1475`），每次都失败，3 次后记入 `failedPackets`，一致性行显示「N 段复核未完成」（`:1577-1582`）。`repairConflicts` 对同一资料其他字段的定向复核也会失败（`:1514-1518`，失败只 `bump`），这些冲突始终无法自动修复。
   - 方案需要二选一：适配器按 `importFactFields(a.kind,a.schema)` 校验锁（`:937` 的 fragments 字段检查同理）；或在 `wizard-review-v1` 通道不转发 `semanticLocks`（复核只报告冲突，不改资料，主进程已按锁过滤，见 §1）。另需补测试：v2 字段决定后点 [修复]，复核包成功。

3. **must-fix：`text` 被截断的资料，`inferred` 会用片段推出的值覆盖整段内容。**
   - 复核材料把超过 `WIZARD_REVIEW_TEXT=2000` 的 `text` 截成前 2000 字（`desktop/main/novel-import.ts:61,1440-1441`），模型给的 `candidate.value` 只依据这一段。
   - 主进程却把 `source.value` 改写成完整的现值（`:1465`），方案又按 `field==='text'` 直接写 `next.text=候选值`。结果是 2000 字之后的内容全部丢失。
   - 自动修复因此排除了长文本（`autoRepairable`，`:1487`），方案 §4 的可用条件没有沿用这条排除。超过 `WIZARD_REVIEW_FACT=1500` 的 facts 也不发给模型（`:1440`），同理。
   - 建议：`inferred` 的可用条件加上与 `autoRepairable` 相同的长度限制，不可用时显示「正文只核对了这段资料的前一部分，不能整段替换」。`merge` 照常可用（预填完整现值）。

4. **should-fix：决定后紧接着跑 `fixStructure`，可能把刚锁定的值改掉，下一次 `semanticCheckpoint` 就抛「导入作者锁定字段发生变化」。**
   - `fixStructure` 会改写 `relationships`（去掉指向未导入角色的 `characterId`）、`refs`（去掉不存在的事件），映射失败时整份丢弃资料（`desktop/main/novel-import.ts:1551-1557`）。
   - 方案 §4 第 3 步先写锁，第 4 步再 `fixStructure`。如果作者对 `relationships` 选了 `inferred`，候选里的 `characterId` 又指向未选中的角色，锁值和资料值就不一致了。`keepForSave` 会自行去掉这条锁，所以保存不受影响。但 [修复] 的细纲补全分支会先调用 `this.semanticCheckpoint(s).locks`（`:1426`），这一步会抛错，并被记成一致性失败（`:1432-1434`）。
   - 建议：在克隆上先跑 `fixStructure`，再按结果取锁值；或者沿用 `keepForSave` 的过滤办法，丢掉不一致的锁。另外，预检通过的标准应该是"`fixStructure` 之后该字段的值仍是所选值"，否则这个方案应该置灰。

5. **should-fix：方案没有写明决定时不清 `coverage.review`。现有 `semanticDecision` 会清空它，如果照搬，[修复] 会重新复核全书。**
   - `semanticDecision` 设置 `s.coverage.review=[];s.coverage.reviewFacts=[]`（`desktop/main/novel-import.ts:2370`）。`runWizardVerify` 会把未覆盖的单位全部重新复核（`:1419-1420`）。
   - 方案 §4 第 3 步没有提到 coverage。实现时如果按 `semanticDecision` 抄过来，每次决定后点 [修复]，都会把全书重新发给审核模型。应在方案里明确写"不改 `coverage`、`verify.failedPackets`、`verify.repairs`"，并补一条测试断言 coverage 不变。

6. **OK（附带说明）：锁过滤可以挡住 `addConflicts` 按 hash 重开已决定冲突的路径。**
   - 语义会话里，`addConflicts` 遇到同 hash 的 resolved 冲突，会把它改回 pending（`desktop/main/novel-import.ts:2490`）。适配器的 hash 由模型回复内容算出（`desktop/service/novel-import-ai.ts:1201`），所以作者选 `source` 之后，同一个包重新复核很可能得到同一个 hash。方案 §1 在 `addConflicts` 之前按锁丢弃这些冲突，可以挡住这条路径。
   - `autoRepairable` 已跳过锁定字段（`:1485-1486`），不会自动改回去。
   - 有一个漏口，影响小：第 21 步 [修复] 补细纲时，`runLineParallel` → `mergeImportArtifacts` 只在合并时参考 locks，锁定字段不同值时仍会生成冲突（`desktop/core/novel-import.ts:340-345`），并经 `addConflicts` 加入（`desktop/main/novel-import.ts:1202-1204`）。缺细纲的章节本来没有细纲资料，所以基本不会命中。建议把锁过滤放进 `addConflicts` 本身（只对 `wizardChapterReview(s)` 的第 21 步生效），这样所有来源都一致。

7. **should-fix：丢弃没有 `source.artifactId` 的冲突会丢掉真实冲突。实际样本里，模型把资料 ID 写在了 `candidate` 一侧。**
   - 隔离会话 `6e0e1964-…` 有 3 条待处理的 `body-body` 冲突，都是 `scene.parentId`：`source` 只有 `unitId`，值是正文说法；`candidate.artifactId` 是本包资料自身（阿霍瓦郡、白玫瑰区、南大陆拜朗帝国），`candidate.value` 正是资料当前的 `parentId`。`normalizeReviewReply` 允许这种形状（`desktop/service/novel-import-ai.ts:1252-1258`），`reviewChapterPackets` 的过滤只检查 `source.artifactId`（`desktop/main/novel-import.ts:1465`）。
   - 按方案 §1，这 3 条都会被丢弃，并计入「格式无效」，用户永远看不到。
   - 建议：只有 `candidate.artifactId` 指向本包资料、且 `candidate.value` 等于该字段现值时，交换两侧（资料一侧作 `source`，正文一侧作 `candidate`），然后照 §1 改为 `setting-body`。两侧都不指向本包资料时才丢弃。

8. **OK（附带说明）：引用了本包资料的冲突改为 `setting-body` 是安全的，但会改变自动修复的范围。**
   - `reviewMaterials` 跳过 `origin==='source'`（`desktop/main/novel-import.ts:1439`），`own.has(artifactId)` 又保证资料在本包里（`:1465`），所以不会误改来源资料。
   - 改类型发生在适配器算 hash 之后（`desktop/service/novel-import-ai.ts:1201`），不影响 hash 去重。
   - 副作用：这些冲突从此满足 `autoRepairable` 的 `type==='setting-body'`（`:1483`），会先经自动修复（带模型调用），剩下的才留给人工。这符合 docs/539"正文为准"的规则，但方案应写明，测试也应覆盖"原 body-body 冲突被自动修复"。

9. **should-fix：第 21 步的待处理冲突不只来自分章复核，方案没有说明其他类型如何映射到三种方案。**
   - 前面各步的冲突会推迟到第 21 步（`deferredConflicts`，`desktop/main/novel-import.ts:955,968,1137,1204,2460`）。这些冲突由 `mergeImportArtifacts` 生成，`type` 可能是 `body-body`（两份推断资料不一致）、`setting-body` 或 `source-source`，`source`/`candidate` 两侧都带 `artifactId`（`desktop/core/novel-import.ts:343-345`）。
   - 方案 §3/§4 只按"复核冲突"设计：`proposed`=`candidate.value`，选项为 `inferred/source/merge`。`source-source` 现有选项是 `a/b/merge`（`desktop/core/novel-import.ts:360`），`wizardDecision` 是否接受这一类、`inferred` 是否等同于 `b`，都需要写明，并补测试：第 21 步出现 `mergeImportArtifacts` 推迟下来的冲突时，三种方案都能完成。
   - 同一资料同一字段有多条待处理冲突时，方案把其余几条一并标为 resolved。建议也给每一条写一条 decision（与 `keepForSave` 做法相同，`desktop/main/novel-import.ts:1405`），保持导入记录完整。

10. **should-fix：现有测试的影响没有列出，NIW-C19/F2 取决于服务端是否还接受 `rewrite`。**
    - `NIW-C19/F2` 在向导第 21 步提交 `choice:'rewrite'`，再 `apply-patches`（`tests/unit/novel-import-wizard-session.test.ts:527-545`）。方案说"「修改正文导入副本」不在向导第 21 步提供"。如果只是界面不显示，服务端照旧接受，这条测试不受影响；如果 `wizardDecision` 拒绝 `rewrite`，就得改写这条测试。方案应明确选哪种（建议服务端保留，界面不显示）。
    - `NIW-C60/C63`（`:352-362`）提交 `source`+解释，断言之后全部通过、没有整书重分析。按新路径会直接通过，但"不发起模型请求"应作为新断言加进去。
    - `NI-U06` 用的是非向导视图（`tests/helpers/novel-import-ui-fixture.tsx:35`，没有 `conflictDetail`），旧界面保留，不受影响。
    - `tests/unit/novel-import-verify-session.test.ts:73-83`（未处理冲突在保存时保留）不受影响。
    - `wizard-review-contract` 的文字有单测引用（`tests/unit/novel-import-verify-review.test.ts`），加 `reason` 句子后要同步，并重新确认 `assertImportFixedPromptReserve` 预算。

11. **should-fix：`publicView` 的成本和详情计算有几处需要修正。**
    - 成本：探针中 891 份资料的 `importNativeMappings` 首次调用约 81 ms，不是方案写的 35–50 ms。按 `revision+conflictId` 缓存可以，但只有引用类字段（`characterId`、`sceneId`、`itemId`、`parentId`、`worldId`、`relationships`、`refs`、`people`、`narrator`）才需要跑完整映射。其他字段只需 `validateImportSemanticArtifact`，建议按字段区分。
    - 显示哪一条：`toImportView` 原样复制 `conflicts` 的顺序（`desktop/core/novel-import.ts:402`），与 `ConflictScreen` 的 `find(pending)`（`src/components/desktop/NovelImportDialog.tsx:120`）一致，这一点没问题。
    - 现值：`current` 应取资料的当前值，不取 `c.source.value`。`fixStructure` 可能在冲突入库后改动 `relationships`/`refs`（见第 4 条），这时两者不一致。`semanticDecision` 也是用现值做的过期检查（`desktop/main/novel-import.ts:2361`），`wizardDecision` 的前置条件应加上同样的检查，不一致时报「冲突决定已过期」。
    - ID 换名称：正则 `/^[a-z]{1,2}-[0-9a-f]{16}$/` 能覆盖 `c-/s-/i-/w-/ws-/wl-/nr-/ol-` 的 ID（`desktop/core/novel-import-wizard.ts:85-88`，`desktop/main/novel-import.ts:118,128`），但只认整串都是 ID 的值。`relationships`、`refs`、`people` 是 JSON，里面嵌着 ID，按方案会原样显示。建议对 JSON 字段解码后逐项替换，或者用 `importNativeMappings` 的 decoded 结果来显示。
    - 章节定位：工作正文单位 ID 是 `working-<rev>:<start>:<end>`，`unit.start` 与 `chapters[].start/end` 都是 `workingProse` 上的偏移，按 start 查找可以定位。

12. **should-fix：结构字段上，`source` 总能通过，但有两种 `inferred` 应置灰而方案没有排除。**
    - 隔离会话 `14161c26-…` 中 `scene.sceneId` 冲突的候选值就是资料自己的 ID（「廷根」的 `sceneId` 指向自己）。探针显示 `validateImportSemanticArtifact` 和 `importNativeMappings` 都放行，所以按方案 `inferred` 会显示为可用，写入的是一个自指引用。建议候选值等于资料自身 ID 时置灰（`parentId`、`characterId`、`sceneId`、`itemId` 同理）。
    - `merge` 对 `tags`、`effects`、`bigFive`、`motivations`、`arcStages` 这类 JSON 字段（不在 `WIZARD_REVIEW_STRUCTURAL` 里，`desktop/main/novel-import.ts:63`）打开的是一个纯文本框，用户几乎填不出能通过校验的值。建议 `merge` 只对纯文字字段开放，JSON 字段只提供 `inferred/source`。
    - `roleType` 这类枚举，候选不合法时只剩 `source`，满足"选任何一个都能通过"。但用户看到的真实问题是"这个角色其实是地名"，方案没有给出处理办法。这超出本次需求，可以在不可用原因里提示「可返回识别角色取消选择」。

13. **OK：`reason` 字段的添加方式可行。**
    - `conflict` zod 是 `.strict()`（`desktop/service/novel-import-ai.ts:38`），复核的 `reviewConflict` 最后 `.pipe(conflict)`（`:472-484`）。所以 `reason` 必须加在基础 `conflict` 上，`normalizeReviewReply` 重建对象时也要带上（`:1259`），否则会被当成未知键删掉。方案这两处都写到了。
    - 会话日志不按 schema 校验冲突形状（`validJournal`，`desktop/main/novel-import.ts:529-532`），旧会话没有 `reason` 也能照常读取。

## 结论

方案的主线可行：决定后建锁、重建检查点、不调用模型，保存能通过 `assertPlan`。但第 2、3 条必须先改，否则"选任何方案都能通过核对"不成立：v2 字段锁会让之后的复核整包失败；长文本的 `inferred` 会丢失内容。第 4、5、7、9、10、11、12 条建议在实现前补进方案和测试用例。
