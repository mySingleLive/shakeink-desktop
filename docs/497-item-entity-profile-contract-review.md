# 497/498 · 物品资料契约对齐方案与用例审核

日期：2026-11-03。独立审核，只读源码与 496 私有证据（`/private/tmp/shakeink-item-493/evidence/item-perf-r1/`），未改源码/测试，未启动 Electron。

**结论：需修订。** 方案方向正确，范围也够小，§1 的四条事实逐条属实。需要修订的地方有三处：根因表述多推了一步；纠错反馈有 250 字截断约束，方案没写；用例没覆盖“表外字段经纠错恢复”这条真实失败路径。

## 1. §1 核对

| 497 §1 声明 | 核对 |
| --- | --- |
| 控制器写 `schema:2` 并校验 | 属实。`desktop/main/novel-import.ts:1050` 赋 `schema:2`，`:1057` 调 `validateImportSemanticArtifact`；item v2 字段在 `desktop/core/novel-import-semantics.ts:63`。 |
| 服务端只对 character/scene 加 schema 2 | 属实。`desktop/service/novel-import-ai.ts:378` 依赖 `indexedEntityRequest`（`:375`，仅 character/scene）。item v1 字段表在 `novel-import-semantics.ts:56`，只有知识归属字段；`:184-185` strict 模式拒绝表外字段。 |
| 生成期不反馈，最终才抛错，两级纠错都不进入 | 属实，链路如下。生成期 item 没有 profile superRefine：`:504-511` 只覆盖 character/scene，item 走 `indexedArtifact=requestedArtifact`。`identityBase`（`:606-612`）调 `validateIdentityLinks`，失败条目被放进 `deferred`（`:844`），`valid` 为空，`validateSemanticLinks` 在 `:864` 不检查它，所以不产生 issue，`generateJSON` 一次通过。`runImportAi` 的 `:1025` 用基础 schema 也通过；`:1062` 的 `validateSemanticLinks→:864` 按 v1 抛出原始错误。这个错误从 `this.ai` 内抛出，`received` 仍为 false；`entitySchemaFeedback(error,false,false)`（`novel-import.ts:76-87`）不匹配，返回 undefined，`:1059` 直接抛出。证据 `item-import-failed.json` 中 `attempts:1` 与此一致。 |
| 提示词只给角色 entity 换 schema 2 字段表 | 属实。`desktop/core/novel-import-ai-payload.ts:116`。item entity 走 `semanticPrompt` 末尾的通用返回（`:146`），字段表里 item 只有知识字段。 |

**为什么 493 之前没出现：** 当前未提交的 493 diff 只改了 roster category 和 `lightImportGeneration`（`novel-import-ai.ts:985`），没碰任何校验路径，所以 493 之前同一响应也会以同样方式失败。493 §5 已把它列为既有风险。按台账，496 之前没有完整跑通过向导第14步的真实记录。本轮已落盘的 8 项 facts 键只有 `reliability`/`temporalScope`（来自私有 session 统计），说明大多数响应遵守了 v1 字段表。失败取决于单个响应，并不是每个 item 都会失败。关闭 thinking 是否提高了发生概率，目前没有证据，496 不下结论是对的。

## 2. 发现（按严重度）

### 中-1 根因只证到“出现表外字段”，没证到“出现的是面板字段”
证据没有保留“钞票”的原始响应，facts 里具体是哪个键无从得知。候选的 `itemType:货币` 只在清单阶段出现过；`wizardEntity`（`novel-import.ts:137-141`）和 catalog（`:1041`）都不把它传给模型，但模型仍可能自行写出 `itemType`、`value`、`denomination` 这类键，这些都不在 v2 表内。497 §1 和标题容易让人理解为“补上面板字段就能修好”。实际上，表外字段要靠修改 2 新增的生成期纠错来恢复。
- 方案要写明：真实失败字段未知；面板字段契约用来减少模型发明字段，纠错用来兜底任意表外键。
- 用例要补：首轮带一个非面板表外键（如 `itemType`），次轮合法，应当恢复。改动前失败，因为最终 `:1062` 直接抛错；改动后通过，且第二轮请求带固定反馈。这是与真实失败最接近的回归用例。

### 中-2 纠错反馈有 250 字截断，方案没写约束
生成期纠错的通道是：`parseJsonOutput` 把每个 issue 写成 `path: message.slice(0,250)`，最多保留前 6 个（`src/lib/ai/generate.ts:263`），`:213` 再原样拼进下一轮 prompt。这条通道没有白名单：普通分析的 `.check`（`novel-import-ai.ts:614-622`）遇到非 evidence 路径的 issue 直接 `return`，既不删除也不改写。角色/场景反馈也走这条通道，`characterProfileFeedback`（`:407`）各条都短于 250。新的物品反馈如果列出全部字段和 effects/aliases/tags 编码规则，很容易超过 250 字，被截掉后半句。
- 要求：固定物品反馈 ≤250 个 JS 字符，issue path 用 `['facts']`（与场景 `:510` 相同）。
- 不需要改 `entitySchemaFeedback` 的白名单。生成期纠错不经过它；控制器重试在 `received=false` 时也不会进入（见中-3）。

### 中-3 纠错上限和失败形态没写清，IC-02 无法判定
item 没有 `repair`，`maxGenerations` 取默认值 2（`generate.ts:190`；`novel-import-ai.ts:721` 只在有 repair 时设 4），也就是最多 1 次纠错。用尽后抛出的是 `StructuredGenerationError`，消息为 `模型返回结构不完整（artifacts.0.facts）`。`:727-761` 的改写只处理 character 和 scene，item 不改写。这个消息不匹配 `entitySchemaFeedback`，`received=false`，所以控制器不会重试。
- 方案应写明：持续非法时一共 2 次 provider 调用，任务失败一次，控制器不追加请求，并说明用户看到的错误文本。
- IC-02 应断言：`generateText` 调用正好 2 次；第二轮 prompt 包含完整的固定物品反馈；第二轮 prompt 不含模型原值；控制器侧 ai 调用 1 次，task `attempts` 为 1。

### 低-1 实现约束要写死，防止扩大范围
- `itemEntityRequest` 必须独立，不能并进 `indexedEntityRequest`。并进去会改变 evidenceOptions、`wireEvidence` 和 sourceUnitIds 派生（`:496-503`），以及 `:609` 的分支。
- 新 superRefine 必须调用同一个 `validateImportSemanticArtifact(semanticResultArtifact(request,item))`，并保留 `if(ctx.issues.length)return`。这样生成期判断与 `:1062` 的最终判断一致。evidence 重绑（`:1046-1050`）不改 facts，两处不会出现分歧。
- 改 `semanticResultArtifact` 的影响：它只在 `:507`、`:510`、`:844`、`:864` 用作校验副本，从不作为返回值；`item.kind===request.kind` 保护仍在。entity 请求的 `request.artifacts` 为空。普通 item analyze、review、reconcile 的 `itemEntityRequest` 为 false。所以 character/scene/world/普通分析的行为都不变。

### 低-2 提示词契约要写出静默截断的上限
`importNativeProfile`（`novel-import-semantics.ts:175-178`）对 aliases/tags 会静默修剪：aliases 最多 10 项、每项最多 50 字；tags 最多 8 项、每项最多 20 字。effects 是 strict 对象数组，name 最多 100 字，description trim 后 1–2000 字，最多 20 项。方案 2.3 只写了“最多 20 项、description 非空”。建议把这些上限写进 `<item-native-profile-contract>`，免得有据别名或标签被截断却没有任何提示。不要求改校验器。

### 低-3 用例细节
- IC-01 必须经过 `generateImportAiJson`（注入 `deps.generateText`），不能直接 stub `deps.generate`，否则新 superRefine 测不到。
- IC-04 的 sha256 基线必须在实现前从 HEAD 计算，并作为常量写入测试，方案要注明来源。还要补两点：普通 item analyze 带面板字段时，仍在 `:1062` 以原文案失败；item review/reconcile 不变。
- IC-05 加断言：item entity 提示里其它类别的字段表逐字不变，`assertImportFixedPromptReserve` 通过。
- IC-REAL 加记录：item 生成纠错次数和失败类别（只记计数和固定类别，不记字段值或原文），用来判断纠错对 30 s 预算的影响。

## 3. 四个问题的回答

1. 根因链路正确：生成期纠错和控制器单次纠错都被跳过。但“钞票”具体出了哪个字段没有证据（中-1）。493 之前的代码对同一响应同样会失败；失败取决于单个响应。
2. 修改够小且正确，character/scene/world/普通分析保持不变（低-1）。`semanticResultArtifact` 的其它调用点只受 item entity 请求影响，而这正是想要的效果：最终校验与生成期校验一致。
3. 生成期 superRefine 会直接进入有界纠错，不需要白名单。约束有两条：反馈 ≤250 字，上限是 2 次生成（中-2、中-3）。
4. 用例方向对，但缺“表外键纠错恢复”用例。IC-02 也缺次数和完整反馈的断言。补上后，每条用例在改动前都因 `:1062` 直接抛错而失败，改动后因纠错恢复或 v2 校验通过而通过，失败和通过的原因都对得上。
