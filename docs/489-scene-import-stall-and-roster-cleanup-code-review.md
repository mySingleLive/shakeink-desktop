# 489 · 场景导入卡住与清单整理 code review

日期：2026-11-02。范围：工作区未提交改动（`git diff` 与未跟踪测试），对照 486（3R4 > 3R3 > 3R2 > 3R > 3.1/3.2）与 487 修订4。488 的结论只作参考，以下均为本次读源码或运行结果。

本次执行（Node v24.18.0）：
- `node --import tsx --test` 跑 `novel-import-scene-cleanup-core`、`-scene-cleanup`、`-scene-deferred`、`-scene-identity-ui`：104/104 通过。
- 跑 `-scene-identity-service`、`-scene-performance`、`-scene-hierarchy`、`-scene-links`：64/64 通过。
- 临时探针三个（跑完即删，产品与测试文件未改动），结果写在下文 H1、M2 中。

## 高

### H1 证据门在服务端缺失，模型自选的合法 quote 会让整个识别步骤失败，且无法纠错
- 服务端 `validateSceneCleanupDecisions`（`desktop/core/novel-import-scene-identity.ts:250`，由 `desktop/service/novel-import-ai.ts:72` 调用）只检查三点：quote 在 focus 单元内唯一，quote 含本项名称，`unitId` 是本项 focus 单元。它不检查 ownedRanges。
- ownedRanges 检查只在应用时做：`applySceneCleanup` 的 `assertSceneIdentityEvidence(...,id)`（`:275`），位于 `commitSceneResult` 内（`desktop/main/novel-import.ts:698`）。这里抛出的 `SceneIdentityError('anchor')` 不会进入包级重试（`:691` 的重试只包住 `this.ai`），也不会走 `generateJSON` 的纠错轮，于是整个 detect-scene 直接 failed。
- ownedRanges 等于 roster 提及的 `evidenceRange`，也就是 roster 模型当初给出的那段 quote。cleanup 请求不向模型提供这些范围：`catalog`/`focus` 只有名称和 unitId，提示 `desktop/core/novel-import-ai-payload.ts:72-75` 也只要求“包含本项名称”。模型因此无从知道 quote 必须落在哪个范围里。
- 探针结果：roster 提及 quote 为“铜铃挂在门口”，cleanup 的 drop 证据为“铜铃挂在门口，风一吹就响”。`validateSceneCleanupDecisions` 通过；`applySceneCleanup` 抛“场景身份资料无效（唯一原文位置）”。真实模型的 quote 几乎不会与 roster quote 逐字重合，所以任何 merge/drop 都可能让步骤失败；“重新识别”只会重发同类请求，很可能再次失败。E4 真实验证大概率因此受阻。
- 测试没有覆盖这种情况。夹具 `tests/helpers/novel-import-scene-cleanup-fixture.ts:60` 的 `evidence()` 永远返回 roster 原 quote；B3（`tests/unit/novel-import-scene-cleanup-core.test.ts:54`）只测了“借用另一同名地点的 quote”。
- 要求：把本项在 focus 单元内的 owned 范围（或对应的提及 quote/片段）放进 cleanup 请求上下文，并在服务端 schema 内用 `assertSceneIdentityEvidence` 同等检查，让违规回复走两轮纠错与包级重试。提示中说明 quote 必须落在给出的范围内。应用时保留现有断言，作为防线。补一条用例：模型 quote 越过 roster quote 但仍在单元内唯一且含名称时，必须被服务端拒绝并纠错，不能让步骤直接失败；对应的合法 quote 能完成整理。

## 中

### M1 A3d 只断言了一部分，台账却按全部完成登记
- `tests/unit/novel-import-scene-deferred.test.ts:84` 没有断言 487 A3d 要求的“到达 verify 且 checks 全部 ok”，改为断言“进入 reconcile”。488 §4-3 给出的原因已在源码确认：`desktop/main/novel-import.ts:1720` 用 `importFactFields(kind,schema)` 构造 `fragments.fields`，包含 schema 2 场景字段；`desktop/service/novel-import-ai.ts:830` 只接受 `IMPORT_SEMANTIC_FACT_FIELDS`（v1）。这是既有缺陷。
- 486 改变了实际流程：以前遗漏流程遇到新 unresolved 场景会提示“请返回识别场景”并停下，现在会继续进入这条必然失败的 reconcile。也就是说，3R2-9 的场景在真实使用中仍然走不通。
- `docs/requirements-traceability.json:4390` 把 `487-A3d` 列入 testIds，`verificationLimits` 却没有提到它只完成一部分。这违反 AGENTS.md“不把未执行标为通过”的要求。
- 要求：在 NI-09 的 `verificationLimits` 中写明 A3d 只完成部分断言，以及阻塞它的缺陷位置；为该缺陷另立任务。或者在本次一并修复，并恢复 A3d 的完整断言。

### M2 B4 的服务端用例中有两项空过
- `novel-import-scene-cleanup-core.test.ts:83-84` 的 `roster + sceneCleanup`、`links + sceneCleanup`：探针把 `sceneCleanup` 键去掉后，同样的回复照样被拒。links 请求用 `records:[]/tasks:[]`，在请求校验阶段就以“场景身份阶段或上下文无效”失败；roster 回复 `{roster:[],sceneRosterRecords:[]}` 本身就是“响应结构”无效。所以这两项断言证明不了阶段隔离。
- 产品行为本身没有问题：探针用 `planSceneIdentityLinkWave` 生成真实的 links 包，合法回复通过，加上 `sceneCleanup:[]` 后被拒。`entity + sceneCleanup` 用例有效（去掉该键后能通过）。
- 要求：roster 与 links 两项改用真实规划出的合法请求和合法回复，先断言不带 `sceneCleanup` 时通过，再断言带上后被拒。

### M3 B7 依赖仓库外的临时文件
- `novel-import-scene-cleanup-core.test.ts:90` 读取 `/private/tmp/shakeink-486/prompt-baseline.json`。换一台机器或清理 tmp 后，这个用例会失败，“其它阶段提示字节不变”也就无法复核。
- 要求：把六个阶段的 sha256 常量写进测试文件，或放到仓库内的 fixture 中。

## 低

### L1 过期重整时 `inputHash` 没有更新
- `desktop/main/novel-import.ts:683` 的 `inputHash` 取自第一次的 `start`。C8 场景下，第二轮按变更后的 `frozen` 重新整理，写入的 `inputHash` 却仍是变更前的账本 hash，与 3R2-6“整理请求前的账本 hash”不符。后果不大，因为 `cleanedHash` 仍正确，但跳过判定会多一个永远不会命中的值。建议改用成功那一轮的 `frozen.ledgerHash`。

### L2 `options.unchecked` 测试入口
- `applySceneCleanup` 的第四个参数（`desktop/core/novel-import-scene-identity.ts:268,280`）绕过预检。生产代码只有 `desktop/main/novel-import.ts:698` 一处调用，且只传三个参数；IPC action 中没有任何字段能传到这里。生产路径到不了它。建议在注释或命名中标明仅供测试（例如 `__testUnchecked`），防止以后被误用。

## 已核对无问题

- **deferUnresolvedScenes**（`novel-import.ts:710-717`）
  - 删除未完成的实体任务和依赖它们的图片任务，不写 `w.skipped`，并重算 `selectionHash`。
  - 调用点：`confirmRoster` 在失败判定之后、计算 `selected` 之前；`wizardResume` 在图片授权检查之前（`:1076`）；`runEntities` 的首个 checkpoint（`:751`）；遗漏流程用 `withoutResult=true`，已导入的身份仍按原规则抛错（C14 覆盖）。
- **confirmRoster**（`:1191-1205`）：`skip` 视同 `selected===0`；只有 `selected>0` 时才检查图片模型与授权；授权 hash 只含 defer 后仍选中的 ID（A3f 覆盖）。
- **合并预检与回退**：已逐条核对目标须为 keep、different-place、作者 partition、外部上级超过1个、上级指向自身、只拒绝新增环（与基线环成员集合比较）；逐条 `regroup` 后按成员集合检查新增 unresolved 与环扩大，不满足则回退。drop 只在本项未被已生效合并涉及时生效。名称取组内最早提及成员所做的选择。
- **跳过判定与 hash 更新**：跳过判定位于 links 之后、整理请求之前，同时比较 `inputHash` 与 `cleanedHash`。上级修复提交内同步更新 `cleanedHash`（`:733`）。
- **应用时过期检查**：比较 `ledgerHash`/`identityRevision`，在 `applySceneCleanup` 内逐值比较名录与 focus；第二次过期时步骤失败（C8 覆盖）。
- **authorKept**：单项勾选、取消、全选、全不选都正确维护（`:1177-1179`，C7b 覆盖）。重新整理时恢复改判为 keep 的旧排除项（C13 覆盖）。
- **w.sceneCleanup 生命周期**：返回到 detect-scene 或 `retryKind` 时保留；返回到 tree/kinds/files 时清除；视图中剔除；schema 为严格模式（C9 覆盖）。
- **sceneHint、defaultParts**：sceneHint 去重后以“、”连接，不超过60字，并处理代理对截断。defaultParts 只返回 literal，已有的作者 label 保持（D1–D3 覆盖）。
- **阶段隔离**：服务端 `validateSemanticStage`、`importAiResponseSchema` 与 wire 分支、主进程 `ai()` 的阶段表、越权键列表、唯一根键检查都已加入 `sceneCleanup`。`novel-import-ai-payload.ts` 的 diff 只有新增行，其它阶段提示没有改动。
- **既有测试改动**：四个夹具只新增中立的“全部 keep”回复，原有断言未改，属于新增阶段的必要配合。CIUI01 按 487 A7 改写，并新增点击调用断言，没有掩盖回归。
- **安全**：新增的调试输出（`scene-cleanup` 回退计数、`sceneDebug` 的包数、名录规模、合并/排除数、耗时）都不含名称或原文。C5b 断言了回退日志不含地名。

结论：需修改

1. （H1）cleanup 请求附上本项 owned 范围；服务端 schema 内检查证据落在本项 ownedRanges 内，使违规回复进入纠错与包级重试；提示中说明该约束；补“quote 越过 roster quote”的用例。
2. （M1）在 traceability 的 NI-09 中写明 A3d 只完成部分断言及阻塞缺陷，并为 reconcile 字段集缺陷另立任务；或修复该缺陷并恢复 A3d 的完整断言。
3. （M2）重写 B4 服务端的 roster、links 两项，确保去掉 `sceneCleanup` 后回复能通过。
4. （M3）把 B7 的提示基线 hash 移进仓库。

## 第二轮代码审核

日期：2026-11-02。范围：488“## 代码审核修复”所列各项，以当前工作区源码为准。本轮执行（Node v24.18.0）：`novel-import-scene-cleanup-core`、`-scene-cleanup`、`-scene-deferred`、`-scene-identity-ui`、`novel-import-ai` 共 134/134 通过。产品与测试文件未改动。

**H1 已修复。**
- `cleanupOwnQuotes`（`desktop/core/novel-import-scene-identity.ts`，位于 `planSceneCleanup` 之前）取本项在 focus 单元内各 body 成员的 `evidenceRange` 原文。条件：属于本身份，unitId 与 unitHash 都与 focus 单元一致，在单元内唯一；去重后最多8段，取不到时 `fail('source')`。请求 schema 增加 `ownQuotes:z.array(str()).min(1).max(8)`（`desktop/shared/novel-import-scene-identity.ts:63`）。`fits` 预算判定使用含 `ownQuotes` 的完整上下文。
- `validateSceneCleanupDecisions` 新增检查：quote 的范围必须完整落在某段唯一出现的 `ownQuotes` 内。该函数在服务端 schema 的 superRefine 中执行，因此违规回复会进入 `generateJSON` 纠错轮和包级重试。应用时的 `assertSceneIdentityEvidence` 仍保留。
- 提示要求 quote 取自本项 `ownQuotes`，不得越出、不得借用其它地点原文。其它阶段提示 hash 与基线一致（见 M3）。
- 用例：core 的 H1 断言了请求中的 `ownQuotes`、宽 quote 被服务端拒绝、一轮纠错后恢复并能应用排除。控制器的 H1 首次调用两轮都返回宽 quote，经包级重试完成，排除生效。这与第一轮探针复现的故障相对应。
- 泄漏检查：`ownQuotes` 只来自本身份成员、且位于 focus 单元内的证据窗口，而该单元原文本来就整段在 `units` 中，所以不会带出新原文，也不会带出其它单元的内容。这些窗口与应用时比对的 `ownedRanges`（`sceneIdentityMemberships` 中的 `evidenceRange`）是同一组范围。窗口内可能出现相邻地点的名称，但 quote 仍须含本项名称，且必须落在本项自己的范围内。这符合 3R“证据完整落在本项 ownedRanges 内”。服务端无法自行确认 `ownQuotes` 的归属，只能信任主进程；伪造的、不在单元内的片段 `occurrences` 为0，任何证据都无法通过，结果是安全的。
- 过期检查：`applySceneCleanup` 对每个 focus 重新计算 `cleanupOwnQuotes` 并逐值比较，不等时 `fail('stale')`。主进程提交时另外比较 `ledgerHash` 与 `identityRevision`。

**M1 已处理。** NI-09 `verificationLimits` 写明 A3d 只完成部分断言、哪些已证、哪些未证，以及阻塞缺陷的两处源码位置，并说明 3R2-9 场景在真实使用中仍会在校验步骤失败、需另立任务。`status` 仍为 `implemented-targeted-verified-real-target-pending`，没有夸大。

**M2 已修复，所述限制属实。** roster 用合法记录，links 用 `planSceneIdentityLinkWave` 规划出的真实包。两项都先断言不带 `sceneCleanup` 的回复被接受，再断言加键后被拒，现在能证明“仅加这一键就被拒”。488 说明了一个限制：去掉服务端的显式越权判定后用例仍通过，因为严格 wire schema 会先拒绝。所以服务端的显式判定只是第二道防线，没有被单独覆盖；主进程 `ai()` 的判定另由 `novel-import-scene-cleanup.test.ts:31` 用绕过服务端的方式覆盖。这个限制可以接受。

**M3 已修复。** `PROMPT_BASELINE` 内联于 `tests/unit/novel-import-scene-cleanup-core.test.ts:93`，测试文件中已不再有 `readFileSync` 或 `/private/tmp`。核对结果：六个 hash 与原 `/private/tmp/shakeink-486/prompt-baseline.json` 逐项相等，所以基线没有被改写来迁就新提示。

**L1 已修复。** `desktop/main/novel-import.ts:700` 写入 `inputHash:frozen.ledgerHash`，即实际应用那一轮的账本 hash。C8 单次变更子用例断言了该值（`novel-import-scene-cleanup.test.ts:145`）。

**L2 已修复。** 参数改名为 `options.testOnlyUnchecked`，注释写明生产路径不传。生产代码仍只有 `desktop/main/novel-import.ts:698` 一处调用，且只传三个参数。

结论：通过

1. 无必须修改项。
2. 遗留事项（不阻塞本次）：reconcile 字段集缺陷需另立任务（见 M1）；E4 真实目标验证尚未执行，按 AGENTS.md 须完成后才能做总结。
