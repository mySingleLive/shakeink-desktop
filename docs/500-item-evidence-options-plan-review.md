# 500/501 物品引文选项方案与用例 · 独立审核

日期：2026-11-03。审核对象：`docs/500-item-evidence-options-plan.md`、`docs/501-item-evidence-options-cases.md`，以及工作区中已写好的 IE 测试（`tests/unit/novel-import-item-profile.test.ts:59-79`、`tests/unit/novel-import-item-performance.test.ts:97-130`）。未修改源码或测试。

**结论：需修订。** 方案方向正确：把 item 加入 `indexedEntityRequest` 和控制器 `indexed`，逐处检查后没有发现会让物品走错分支或破坏角色/场景的用法。需要修订的问题有三类：一条现有回归用例会在实现后失败但方案没有列出；提示词改法和 IE-05 断言之间有一处矛盾；几项改动没有用例约束。

## 1. §1 事实核对

| 方案声明 | 核对结果 |
| --- | --- |
| `main/novel-import.ts:1040` 只有 indexed 生成 evidenceOptions | 属实，见 `:1040` 的 `memberships?…:indexed?characterEvidenceOptions(units,names):[]`。`indexed` 在 `:1036` 定义，只含 character/scene。 |
| `:77,1058` 四类引文错误的纠错白名单只对 indexed 开放 | 属实。正则在 `:78`（函数从 `:76` 开始，方案写 `:77` 差一行），调用点在 `:1058`：`entitySchemaFeedback(error,indexed,…)`。 |
| `service/novel-import-ai.ts:374,493-506` optionIndex 和 sourceUnitIds 派生只对 indexed 生效 | 属实，见 `:374`、`:493-497`、`:501-506`。 |
| docs/246 r5 因 no-match 失败，加选项后解决 | 属实，见 `docs/246-character-performance-plan.md:35-41,65`。 |
| 496 r2 的失败原因 | 与 `docs/496-item-import-performance-verification.md` r2 节（第 36、39 行）一致。 |

我另外确认了三点：生成前的 `selectedEntityTarget` 已经接受并逐项核验 item 的 evidenceOptions（`novel-import-ai.ts:808,816`）；`lightImportGeneration` 已包含 item（`:991`）；最后把错误改写为 `模型证据无法定位（…）` 的 `:735` 对 item entity 已经生效（`ordinary` 在 `:596`）。r2 也确实是这条消息。

## 2. `indexedEntityRequest` 每处用法的判断（novel-import-ai.ts）

| 位置 | 加入 item 后 |
| --- | --- |
| `:381` semanticResultArtifact | 无影响。原来已经是 `indexed||itemEntityRequest`，加入后这个条件变得多余。 |
| `:479` 场景 facts 形状 | 无影响，有 `kind==='scene'` 守卫。 |
| `:493-497` options / wireEvidence | 正确，这正是要加的能力。混用、越界、小数和字符串索引仍走原严格 schema。 |
| `:501-506` indexedArtifact | 正确。sourceUnitIds 改为可选，由已核验 evidence 派生；`canonicalFacts` 有 `kind==='scene'` 守卫，对 item 无影响。 |
| `:508-516` 分支顺序 | 正确。第一支是 `characterEntityRequest`，item 不满足。第二支 `indexed&&kind==='scene'` item 也不满足。所以 item 仍会到 `:514` 的 `itemEntityRequest` 分支，497 的资料校验和 `IMPORT_ITEM_FACT_GUIDANCE` 保留，只是包裹对象从 requestedArtifact 换成了 indexedArtifact。 |
| `:615` SceneLinkValidationError | 无影响，有 scene 守卫，item 仍得到通用身份反馈。 |
| `:863`、`:881`（validateSemanticLinks） | 无影响，都有 scene 守卫。`validateIdentityLinks`/`validateSemanticLinks`（`:848-890`）里除这两处外没有按 indexed 区分的逻辑，item 的 characterId/sceneId/itemId 外键检查不变。 |
| `:932-933` importEvidenceFeedback | 正确，但需要改文案：现在是 `kind==='scene'?'场景':'角色'`，item 会显示成“本角色”。见 §4-M3。`:452`（最终 schema）和 `:596`（生成桥）用同一个函数取反馈，`:621-626` 按相同文本识别原因，所以改文案不会破坏原因提取。 |

## 3. 控制器 `indexed` 每处用法（main/novel-import.ts）

| 位置 | 加入 item 后 |
| --- | --- |
| `:1036` 把 `trimmed` 并回 `indexed` | 正确。`trimmed` 原本等于 `indexed||item`，并回后 `:1038` 的目录裁剪不变。 |
| `:1040` characterEvidenceOptions（`:88-96`） | 正确。按名称/别名截取上下文，最多取 8 段分布在输入范围内的片段；scene ownership 分支用 `memberships`，与 item 无关。原文没有命中时选项为空，这时 entityTarget 不带 options，服务端仍派生 sourceUnitIds。 |
| `:1041` roleType | 无影响，仅 character 携带。 |
| `:1058` entitySchemaFeedback | 正确。`allowEvidence=true` 开放四类引文错误；`allowScene` 仍只在 scene 时为真。 |
| `:1060` hint | 正确，两段 `indexed?` 文案都适用于 item，optionIndex 那段本身写的是“若提供”。 |
| `:753` coalesced、`:1785` evidenceAnchorFailure | 与本方案无关。后者是普通分析路径，不受影响。 |

`desktop/core/novel-import-ai-payload.ts:32` 的 entityTarget 选项编号只按 kind 判断，加入 item 是正确的；`desktop/service/novel-import-structured-scene.ts` 只处理 scene，不受影响。

## 4. 发现

### 高

**H1 · 方案没有列出 CP-11b 的物品负例，实现后它会失败。** `tests/unit/novel-import-character-source-index.test.ts:65-66` 断言：物品 entity 带 evidenceOptions 时，`{optionIndex:0}` 必须被拒绝（`/结构|证据/`）。改动后 item 进入 `:493` 的 wire 协议，这个请求能解析：facts 为空、索引在范围内、sourceUnitIds 由应用派生，所以 `assert.rejects` 会失败。IE-07 会跑 `novel-import-character-*` 并发现它，但 500 §3 和 IE-06 只写了 494 IP-06 要反转，并且说“其余 IP 用例不变”。498 IC-05 的反转也只出现在测试注释里（`novel-import-item-profile.test.ts:53`），不在 501 中。

修订：在 501 中把 CP-11b 第 65-66 行和 498 IC-05 列为显式反转。反转后改为正向断言（例如“物品索引被恢复为该选项”），并保留“无选项、ordinary 和 scene 路径拒绝索引”的负例。不能直接删掉这些断言。

### 中

**M1 · 方案的提示词改法会让 IE-05 失败。** 方案 §2.4 说把 `entityOutputContract` 等处的 `characterEntity` 条件扩展为 `characterEntity||itemEntity`。但 `novel-import-ai-payload.ts:142` 中角色分支本身包含 `角色roleType必须等于entityTarget.roleType`，而 IE-05 断言物品提示不含这句（`novel-import-item-profile.test.ts:77`）。我用当前代码实测：非角色分支也包含这句（现在物品提示里有，探针结果为 true）。所以物品必须用第三种输出契约：形状为 `[{optionIndex}]` 或 `[{unitId,quote}]`、不写 sourceUnitIds，并去掉 roleType 句。同时 scene/world 走的原分支字节不能变。修订：在方案中写明这一点，不能只写“扩展条件”。

**M2 · 有几项改动没有用例约束。**
- payload `:32` 的 `optionIndex` 标注：IE-02 直接调用桥接函数，IE-05 检查的 `[{optionIndex}]` 来自 `:142` 的契约文字，二者都不看序列化后的 entityTarget。漏改 `:32` 时测试仍会通过，但模型看到的选项没有显式编号，这正是 246 §65 修复的问题。修订：断言 `serializeImportAiPayload` 输出的物品 `entityTarget.evidenceOptions[i].optionIndex===i`。
- `:148` 末尾的两句（evidence 优先 optionIndex，以及 sourceUnitIds 由应用计算）：方案 §2.4 没有点名。IE-05 只要求出现子串 `sourceUnitIds由应用`，这个子串已由 `:118`/`:142` 满足。修订：在方案中点名 `:148` 两处，并断言物品提示含 `每项evidence优先引用提供的optionIndex`，且不含 `所有sourceUnitIds仅引用输入单元。`。
- 方案要列出不扩展的条件：`:144` 的 `if(characterEntity){…}` 专属角色提示和 `:131` 的 characterEncoding（IE-05 已断言不出现 `<character-import-contract>`，这一点没问题）。

**M3 · IE-05 的基线没有覆盖带选项的角色和场景提示。** `/private/tmp/shakeink-item-493/prompt-baseline-500.txt` 的 5 个哈希我已重算，与当前代码一致（BASELINE-OK），并已固化在 `novel-import-item-profile.test.ts:45-49`。但 `prompt-baseline.mts` 中的角色和场景用例都不带 evidenceOptions。这次要改的 `:118`、`:121`、`:142`、`:148` 恰好在 options 分支上，改错条件时最容易波及“角色+选项”的字节，现有哈希发现不了。修订：在实现前补测“角色+选项”“场景+选项”两个哈希。`importEvidenceFeedback` 中角色和场景的四条反馈文本也要做逐字断言（现在没有任何测试引用 `已有核验引用选项`），物品则断言为“本物品”。

### 低

- **L1：** §1 的 `:77` 应为 `:76-78`（正则在 `:78`）。
- **L2：** IE-03 只断言第二轮提示含 `optionIndex`（`novel-import-item-performance.test.ts:127`），这个子串来自 `:1060` 的 hint。建议同时断言服务端的反馈后缀（M3 中的“本物品…{optionIndex…}”），以确认 `:932-933` 已对 item 生效。
- **L3：** 实现后 `:381` 的 `||itemEntityRequest(request)` 变得多余。保留不影响结果，不要求清理（YAGNI）。

## 5. 用例的 RED 状态

我在 Node 24.18.0 下运行了两个 item 测试文件：12 个通过，4 个失败。失败原因都符合预期：
- IE-02：`Unrecognized key: "optionIndex"`，并缺少 sourceUnitIds。
- IE-05：第 76 行缺少 evidence-options 契约。
- IE-03：只有 1 次请求，纠错没有发生。
- IP-05/06（IE-01/IE-06）：请求没有 evidenceOptions，纠错提示仍要求复制 sourceUnitIds。

IE-04 在改动前就通过。这符合预期，因为它是负例回归。修复 H1 和 M1 至 M3 后，这组用例可以作为 GREEN 依据。IE-REAL 仍须新开 session 真实重跑，r1 和 r2 的失败结论保留。
