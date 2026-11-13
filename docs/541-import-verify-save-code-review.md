# 541 · 导入校验提速、自动修复与保存作品代码审核

范围：docs/539 方案、docs/540 用例对应的未提交改动（不含 535–538 伏笔改动）。审核基于工作区源码、Node 24 下 `tests/unit/novel-import-verify-review.test.ts`、`tests/unit/novel-import-verify-session.test.ts` 运行结果（14/14 通过），以及一次临时探针（已删除）：把 fixture 的 `publish` 换成真实 `publishNovelImport`（PGlite 隔离目录），覆盖“复核包 3 次失败”和“矛盾修复 3 次失败”两种状态后点击保存，两例均 `completed`，说明 `keepForSave → projectOutlines → semanticCheckpoint → assertPlan` 在这两种状态下可以通过。缺细纲章、结构性丢弃后保存，没有用真实 `assertPlan` 验证。真实 E2E（VS-50/51）本次未运行，≤2 分钟没有验证。

## 发现

### 1. 高 · 暂停或崩溃发生在定向复核期间时，未经复核的修改留在资料中，作者也无法再处理这条矛盾

- 证据：`desktop/main/novel-import.ts:1446` 先在 checkpoint 中把候选值写回资料并落盘；回滚在 `:1455`（异常）和 `:1460`（仍报矛盾）中进行，也走 `checkpoint`。`checkpoint` 首先执行 `current(s,epoch)`（`:1981`），epoch 变化时抛出 `stopped()`。
- 失败场景：定向复核请求在途时用户点暂停。`stopAction` 先执行 `s.epoch++`，再中止请求，`ai()` 抛出 AbortError，进入 `:1455` 的回滚 checkpoint。此时 `current` 因 epoch 不符而抛错，回滚没有执行，journal 中保留的是候选值。进程在 `:1446` 与回滚之间退出时，结果相同。
- 后果：恢复后资料值已不等于 `c.source.value`。`autoRepairable` 在 `:1425` 返回 undefined，不再自动修复；“处理矛盾”走 `semanticDecision`，`:2280` 的版本比对抛出“冲突决定与当前设定版本不匹配”，作者也处理不了。最后只能靠 `keepForSave` 把它记为 `kept`（“保留导入结果”）。保存的却是模型给出、未经复核的值，违反“保存内容与成功导入内容一致”。
- 建议：在写入候选值的同一个 checkpoint 里，把 `{artifactId, original, nextHash}` 存进 `w.verify`（持久化）。`runWizardVerify` 开始时、以及 `keepForSave` 中，先把哈希仍等于 nextHash 的未决条目回滚。回滚不要依赖当前 epoch，可以在 `serial` 中只校验 `this.session===s`。补一条测试：定向复核期间暂停，恢复后资料等于原值，矛盾仍可自动修复。

### 2. 中 · 结构类字段也允许“以正文为准”自动改写，改写后可能让保存失败

- 证据：`:1424` 只排除了 `entityType`、`settingType`。`importFactFields` 中的 `chapterIndex`（outline/narrative）、`refs`、`people`、`parentId`、`worldId`、`relationships`、`touches`、`status` 等仍可修复。复核包会把值 ≤1500 的这些 facts 发给模型（`:1378`），契约也允许 field 取“facts 中本次提供的键”。
- 失败场景：模型对某章细纲报告 `field:"chapterIndex"`，candidate 写成相邻章号。`:1443` 的 `validateImportSemanticArtifact` 与 `importNativeMappings` 都不检查细纲章号重复，定向复核也不再报告，于是修复成功。之后 `assignments()` 抛出“细纲chapterIndex或实体ID重复归属”（`desktop/core/novel-import-outline.ts:10`），细纲检查失败。保存时 `projectOutlines` 在 `:596` 抛错，[保存作品] 实际无法完成。同理，修改 foreshadow 的 `touches`、`status` 后，`fixStructure → refreshForeshadowPlan`（`:1495`，`:1532` 解析 `t.content.quote`）可能抛错或改变伏笔。
- 建议：可自动修复的字段只放行文本类字段，即 `text` 和各类型的描述性字段。ID、索引、JSON 结构字段一律交给“处理矛盾”。

### 3. 中 · `fixStructure` 的原生映射兜底：多处坏引用时什么都删不掉，开销也是 O(n²)

- 证据：`:1494`。`importNativeMappings` 失败时，逐个尝试“去掉一项后整体能否通过”，只有单独去掉就能通过的那一项才会被删除。
- 失败场景 A：scope 检查丢掉一个未选角色后，两条以上 worldline 的 `people` 仍按名字引用它。推断资料的引用失效时，`importNativeMappings` 在 `:56` 直接抛错。任意只去掉一条都仍会失败，所以 `bad` 为空，什么都没删。随后 `wizardNext('verify')` 在 `:596` 调用 `importNativeMappings` 抛错，保存被拒，违反“保存始终可用”。
- 失败场景 B：约 1400 项资料、映射失败时，要做 1400 次全量映射，每次都含 prune 循环。这些都在 `checkpoint` 的 serial 回调中同步执行，主进程会长时间卡住。`runWizardVerify` 中这一步会跑 2 次，`keepForSave` 还要再跑 1 次。
- 建议：先按 `importNativeMappings` 的 prune 规则在本地确定性清理引用。worldline 的 `people`、narrative 的 `narrator`/`refs.character`、关系等，去掉悬空项而不是删资料。仍失败时，再按依赖顺序一次删一项，循环直到通过，并设置次数上限。

### 4. 中 · 回复规范化会把结构错误的回复当成“无矛盾”

- 证据：`desktop/service/novel-import-ai.ts:1198`。`root.conflicts===undefined` 时 `list=[]`，规范化结果是 `{"conflicts":[]}`。
- 失败场景：轻量模型返回 `{"矛盾":[...]}`、`{"result":{"conflicts":[...]}}` 或只有 `missingTargets`。该包被当作复核通过，单元写进 `coverage.review`（`desktop/main/novel-import.ts:1403`），之后 [修复] 也不会重发（`:1357`）。在定向复核里，这种回复会让 `ok` 为真（`:1452`），候选值被采纳。
- 次要：`locatable`（`:1201`）只接受逐字 `includes`。适配器的 `anchorEvidence`（`:1008`）能接受空白差异、长度至少 8 的引文，这类引文在规范化时就被丢弃并计入 `droppedConflicts`。定向复核中也会因此误判为“已修复”。
- 建议：根对象没有 `conflicts` 数组时返回 undefined，交给严格 schema 失败后重试。只有 `{}`、或只有已知可去除的键（`missingTargets`/`artifacts`）时，才规范化为空数组。evidence 定位改用与 `anchorEvidence` 相同的规则。

### 5. 中 · 自动修复按资料串行，每项矛盾最多 3 次，213 章 ≤2 分钟没有保障

- 证据：`:1473` 按 artifactId 分组，组内 `for … await one(id)`，每次尝试都是一次定向复核调用。
- 失败场景：主角资料有 5 处矛盾，每处都 3 次失败，要串行发 15 次调用。即使关闭思考、每次 15–20 s，也要 4–5 分钟，远超 2 分钟。分组是为了避免同一资料并发写入，这一点是对的，但缺少总时长或总调用数的上限。
- 建议：同一资料的多处矛盾合并为一次定向复核（一次修改多个字段）。或者给整步设调用预算：超出后余下的矛盾保持 pending，显示 [修复]。真实 E2E 要记录修复阶段的调用数和耗时。

### 6. 低 · 场景归属不再记账，与 VS-18 不符

- 证据：`:416` 对 `wizard-review-v1` 跳过 `sceneIdentity`，`creditSceneOwnership`（`:423`）因此直接返回；`publish()`（`:2538`）对这类会话也不再执行 `assertSceneOwnership`。方案 §2.1 写的是“归属复核照常记账”，用例 VS-18 要求 `ownershipReviewed` 有记账，测试中没有对应用例。
- 结果：向导全量会话的场景归属从“必须全部复核”变成了“完全不校验”。行为本身和用户“保存始终可用”的选择一致，但方案、用例与代码三者不一致。应修订 539/540 的说明，或者删除 VS-18。

### 7. 低 · `repairable` 没有实现，[修复] 显示条件过宽

- 证据：`:1499`、`:1502` 计算了 `repairable`，然后 `void repairable`。`src/components/desktop/NovelImportWizard.tsx:186` 中，只要 `w.verify` 存在且行失败，就显示 [修复]。
- 场景：剩下的只有原资料矛盾、body-body 矛盾或截断字段矛盾。点 [修复] 后没有可重跑的包或可修复的矛盾，结果不变，用户会反复点击。细纲行在 `wizardInfers(s,'outline')` 为假时也会显示 [修复]。
- 建议：把 `repairable`（包括失败包、可修复矛盾、可补细纲）写进 `w.verify`，UI 按它决定是否显示。

### 8. 低 · `fixStructure` 的副作用与残留数据

- `refreshForeshadowPlan`（`:1495`）每次都会用当前 `chapters[].outline` 重新规划伏笔。`runWizardVerify` 先修结构、再补细纲、再修结构，第二次规划时可能已有新细纲，导致伏笔 id 或证据改变。这些伏笔不会再复核，但两次结果都能保存，影响有限。
- 资料被丢弃后，`w.deferredConflicts`、`w.verify.repairs` 中对应的矛盾 id 仍然残留，`semanticState.locks` 也可能指向已丢弃的资料。`:1364` 中 `semanticCheckpoint(s).locks` 会因此抛错，补细纲被跳过。`keepForSave` 会过滤 locks，所以保存不受影响。

### 9. 低 · 复核包提交时，一条 evidence 无效会让整包重试

- 证据：`:1402` 在 `filter` 中调用 `validateImportEvidence`，抛错后整包计一次失败。适配器已在 `runImportAi` 中校验并定位 evidence，这里再出错基本只会是编程错误。方案写的是“校验 evidence 属于本包”，按条丢弃并计数更符合方案。

## 已核对、无问题

- 保存链路：`wizardNext('verify')`（`:596`）中，`keepForSave` 把 pending 冲突记为 resolved/kept 并写入 decision，清空 patches，用过滤后的 locks 重建检查点。随后 `projectOutlines` 运行，检查点 stage 设为 ready，写入 verifiedHash。`importPlanHash` 在 `publish()` 中计算。`assertPlan` 的 inputHash、decisionHash、stage、repairs、omissions、persistentConflicts 检查均能通过，已用真实 `publishNovelImport` 验证两种状态。动作失败时由快照回滚（`:573`）。
- 自动修复成功分支（`:1461`）在同一 checkpoint 内写 decision 并调用 `createImportSemanticState`，inputHash 与 decisionHash 一致。按资料分组后，同一资料不会被并发写入。复核包全部结束后才开始修复，修复与复核包之间不存在竞争。
- 复核包调度：worker 在队列为空但仍有在途任务时等待，`finally` 会唤醒。halt 后所有 worker 都能退出。重试拆分时 tries 随拆分继承，每个单元最多 3 次。`failedPackets` 在重跑前先清掉重叠项（`:1393`）。
- 非向导路径与仅场景向导路径：`wizardChapterReview` 要求 `wizardVersion===1` 且目标不是仅场景，仍走 `runVerify`/`review` 与 `assertSceneOwnership`。`wizardNext` 对这些会话仍要求检查通过。`validateSemanticRequest` 的通道白名单只放行 `wizard-review-v1 && review && !intent`，VS-02/VS-08 覆盖了这一点。

## 用例缺口

- VS-11：只记录了 `peak`，没有断言（`tests/unit/novel-import-verify-session.test.ts:30` 是 `void peak`）。
- VS-12：fixture 资料较短，没有覆盖 text>2000 截断后的 textRange，也没有覆盖 fact>1500 时不发送；`autoRepairable` 对截断字段的拒绝也没有覆盖。
- VS-15、VS-16、VS-18、VS-22、VS-23、VS-25、VS-32、VS-43：没有对应测试。
- VS-40/VS-42：使用的是 fake publish（`f.published`），没有逐类比对数量和名称，缺细纲章、结构丢弃后的保存也没有走真实 `assertPlan`。建议仿照 `tests/integration/novel-import-wizard-publish.test.ts` 增加真实发布用例。
- 新增：定向复核期间暂停或恢复（发现 1）、结构字段矛盾不自动修（发现 2）、多处悬空引用后仍可保存（发现 3）、缺 `conflicts` 根的回复会重试（发现 4）。
- VS-50/51/52 真实 E2E 与计时：未运行，≤2 分钟没有证据。

## 结论

**不通过。** 发现 1 会在常见的暂停操作下，把未经复核的模型修改作为“保留导入结果”保存，作者也无法再处理这条矛盾。发现 2、3 会让 [保存作品] 在可预期的情况下失败。修复 1–4，补上对应用例，并完成真实 E2E 计时后复审。

## 修订记录（主代理，2026-11-09）

| # | 处理 | 位置 | 验证 |
|---|---|---|---|
| 1 | 修复候选值不再先写入会话：定向复核在会话视图上构建（`ai(…,view)`），通过后在 checkpoint 内核对资料仍为原基础版本再写入；暂停或崩溃时会话保持原值。 | `desktop/main/novel-import.ts` `repairConflicts`、`ai()` 的 `view` 参数 | `541-1`（暂停于定向复核中，资料不含候选值） |
| 2 | 新增 `WIZARD_REVIEW_STRUCTURAL`：身份、归属、顺序、外键、引用类字段（chapterIndex、refs、people、relationships、touches、status、worldId、parentId 等）不自动改写，留给“处理矛盾”或保存时保留。 | `autoRepairable` | `541-2`（relationships 冲突保持待处理，真实发布通过） |
| 3 | 兜底改为 `mappableArtifacts`：按依赖顺序（世界→角色→场景→物品→其余）分批加入，失败批次二分，逐项剔除；最多 4 轮。多处坏引用可逐一剔除，单次检查只映射已保留集合。 | `fixStructure`、`mappableArtifacts` | `541-3`（两个角色各两条悬空关系，真实发布通过） |
| 4 | 缺少 `conflicts` 数组的回复不再改写成空数组，交给严格 schema 纠错或重试；引文定位改用与适配器相同的 `anchorEvidence`。定向复核回复中有被丢弃的条目时不判定为通过。 | `normalizeReviewReply`、`repairConflicts` | `541-4` |
| 5 | 自动修复总预算：60 次定向调用或 45 s，先到为准；剩余项保留给 [修复]。 | `WIZARD_REPAIR_CALLS`、`WIZARD_REPAIR_MS` | 单元用例中修复轮次照常完成；真实时长见 vf-r1 |
| 6 | 已在审核前回退该跳过（`sceneRequest` 不再因复核通道跳过 ownership），CI-C02/13 断言改为通道 `wizard-review-v1` 且仍为 ownership。 | `sceneRequest` | `CI-C02/13` |
| 7 | `repairable` 由待自动修复矛盾、失败包或缺章细纲决定，UI 仅在其为真时显示 [修复]。 | `finishWizardChecks`、`VerifyStep` | `VS-40`、`VS-25` 断言 `repairable` |
| 8 | 伏笔计划仅在触点检查失败时重算。 | `fixStructure` | 既有伏笔用例 |
| 9 | 单条 evidence 无效或指向包外资料的矛盾单独丢弃并计入 `droppedConflicts`，不再整包重试。 | `reviewChapterPackets` | 单元用例 |

用例缺口补充：VS-11 并发峰值断言、VS-12 截断与长事实、VS-15 授权失败不重试、VS-32 运行中拒绝 [修复]；VS-40/42/25/24 改用真实 `publishNovelImport`（`tests/integration/novel-import-verify-publish.test.ts`）逐类比对保存内容。VS-16/18/22/23/43 由既有用例或 CI-C02/13 覆盖，未单列。
