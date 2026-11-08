# 523 用例独立审核

审核对象：`docs/523-import-token-usage-cases.md`。依据：`docs/522-import-token-cache-plan.md` §1、`docs/522-import-token-cache-plan-review.md`（以下“审核 N”）、HEAD 版 `src/lib/ai/generate.ts`、`desktop/service/novel-import-ai.ts`（HEAD 行号）、`node_modules/ai@7.0.130`、`@ai-sdk/deepseek`、`tests/unit/novel-import-structured-scene.test.ts`。只写本文件，未改其他文件。

## 可行性核实

- MockLanguageModelV4 的 finish 部件可以带 `providerMetadata`：类型见 `@ai-sdk/provider/dist/index.d.ts:3340-3343`；`streamText().providerMetadata` 取最后一步（`ai/dist/index.js:10093-10094`）。我用 Node 24 跑了一个临时探针（已删除）：finish 部件为 `{finishReason:{unified:'length'}, usage:{inputTokens:{total:100,noCache:30,cacheRead:70}}, providerMetadata:{deepseek:{promptCacheHitTokens:70,promptCacheMissTokens:30}}}`，结果是 `usage.inputTokenDetails={noCacheTokens:30,cacheReadTokens:70}`、`finishReason:'length'`、`providerMetadata.deepseek` 原样返回。TU-01/02 可以用真实 SDK 实现。kimi/zhipu 也经 `createDeepSeek`（`src/lib/ai/provider.ts:85`），元数据键固定为 `deepseek`（`deepseek/dist/index.js:1081,1001`），所以只认 `deepseek` 键是对的。
- 最内层观察器能看到 `length`：`generate.ts:102,133` 返回结果里带 `finishReason`，不会抛错。ordinary 包装先拿到 raw（`novel-import-ai.ts:688`），之后才在 `rosterContract` 下抛 incomplete（`:690`）。非场景 roster 的请求要等回到 `generateJSON` 才抛（`generate.ts:206`）。两条路径下 raw 层都能拿到 `length`。

## 发现

1. 【中】TU-06 混淆了两条 incomplete 路径，也没覆盖审核 1 的关键位置。TU-06 写的是“同一请求”（承接 TU-05 的角色 roster），说“ordinary 包装随后判 incomplete”。但 `:690` 的包装只在 `rosterContract`（场景 roster，`sceneRosterFragmentRequest`）下抛错，角色 roster 的 incomplete 由 `generate.ts:206` 抛出。审核 1 的高风险点正是场景 roster 在 `:690` 抛错前那一代的行不能丢。
   修改：拆成 TU-06a 和 TU-06b。06a 是角色 roster 首代 `length`，走 `generate.ts:206`，之后纠错成功。06b 是场景 roster（`sceneIdentity.mode:'roster'`，有 `rosterContract`）首代 `length`，走 `:690`。另补 TU-06c：每一代都是 `length` 直到 `maxGenerations` 用完（场景 roster 是 4，`:763`），最终抛 `StructuredGenerationError('incomplete')`，此时仍要写满 N 行，`generation` 为 1..N。06b 要说明首代 `length` 之后 repair 可能抛“场景清单无法定位定点修复记录”（`:723-735`）。期望写成“不论请求最终成败，`length` 那一代的行已写出”，不要假定第二代一定成功。

2. 【中】非 ordinary 路径没有用例（审核 1 修订后的明确要求）。`ordinary=false` 时（phase 为 classify/review/patch、`intent:'reconcile'`、`semanticVersion!==1`），`generation` 就是 `deps`，可能是 undefined（`:690`）。方案要求这时也包住原始调用。现有用例都是 ordinary 的 analyze。
   修改：补 TU-14：至少覆盖 `phase:'review'` 和 `intent:'reconcile'` 各一代，分别在注入 `deps.generateText` 和不注入两种情况下跑（不注入时用 `resolvedModel` 接 MockLanguageModelV4，走真实 `generateText`），都要求恰好写一行，`phase`/`intent` 与请求一致。再补 `context.structuredScene===true` 的结构化场景路径一例（`:675-686`），它会带 `jsonOutputSchema`，与 TU-07 合并即可。

3. 【中】TU-09 的“非白名单 kind”可能根本到不了生成，用例会空过。roster 请求遇到非法 kind 时，`importAiResponseSchema` 在生成前就抛“当前识别类别无效”（`:476`），一行都不会写，“不含秘密”也就自然成立。`request-schema.test.ts:73` 的伪 kind 走的也是生成前校验。
   修改：期望里先断言注入的 `generateText` 至少被调用 1 次，再断言 `kind:'?'`。非白名单值换成能进入生成的字段：finishReason 用注入的 `'weird-SECRET'`，期望记 `'?'`，因为 `:690` 只在 rosterContract 下转换；lane 用非法的 `executionLane` 值，或者对导出的映射函数直接做单测。再补一个 `intent`/`mode`/`lane` 缺省时的期望值，`null` 或 `'?'` 二选一并写死，例如设置车道 `intent===undefined`（`:1029`）。

4. 【中】`promptChars`/`schemaChars` 的口径在纠错代次上不精确。`generateJSON` 发出的提示词等于原 prompt 加 `JSON_OUTPUT_INSTRUCTION` 再加 correction（`generate.ts:192,201`），repair 还可能把 `jsonOutputSchema` 换成 bound schema（`:217`；`novel-import-ai.ts:761` 返回 `current.boundSchema`）。TU-05 的“实际发送提示词长度”没写明是哪一层，TU-07 用的是首个 `jsonOutputSchema`，第 2 代以后就是错的。
   修改：统一定义为每代观察器收到的 `options.prompt.length`（UTF-16）和 `JSON.stringify(options.jsonOutputSchema).length`，没有 schema 时为 0。TU-06 的第二行要断言 `promptChars` 大于第一行。补一例场景 roster 原生模式进入定点修复代次，断言第二行的 `schemaChars` 等于 bound schema 的长度，而不是 `nativeRoster.first` 的长度。

5. 【中】缺少“完全没有 usage”这个边界。SDK 拿不到 usage 时 `inputTokens/outputTokens` 为 undefined（`ai/dist/index.js:2529-2537`），这时 `promptTokens=0`、`cost=0`，`recordUsage` 不调用（`generate.ts:121-123`）。TU-12 只说缓存字段为 null，没规定计数。
   修改：补 TU-12b：finish 的 usage 全为 undefined。断言 `recordUsage` 调用 0 次，返回对象不含缓存键，日志行 `inputTokens:0`、`outputTokens:0`（或 null，与实现保持一致后写死）、`cacheSource:null`。

6. 【中】provider 与 sdk 回退的边界不够。TU-01/02 只测了“两者齐全”和“完全没有元数据”。审核 2 的要点是 DeepSeek 没报告缓存时 SDK 给 0、给 `noCache=total`，原始字段为 undefined（`deepseek/dist/index.js:1002-1003`，`?? void 0`）。
   修改：补几种情况：
   (a) `providerMetadata.deepseek` 存在，但两个字段都是 undefined，SDK usage 为 `cacheRead:0,noCache:100`，期望 `cacheSource:'sdk'`、`cacheReadTokens:0`，并确认 0 被写入而不是被丢弃；
   (b) 只有 `promptCacheHitTokens` 一个字段，期望回退到 sdk；
   (c) 原始字段为负数、小数、NaN 或字符串，期望不采纳原始值；
   (d) 原始值与 SDK 值不一致（如 70/30 对 0/100），期望以 provider 为准。

7. 【低】TU-01/03 的“与改动前相同”不可直接断言。要写出确切键集合：`recordUsage` 入参为 `userId,novelId,modelId,modelSnapshot,action,promptTokens,completionTokens`（`generate.ts:124-130`）；TU-03 返回键为 `text,promptTokens,completionTokens,cost,finishReason`（`:133`）。TU-01 还要断言 `cost` 等于 `recordUsage` 的返回值。

8. 【低】TU-08 的并发不确定，可能串行完成，用例空过。修改：用受控的 deferred 让 A 的第 1 代、B 的第 1 代、A 的第 2 代依次交错写行，断言按 `op` 分组后各自的 `generation` 序列分别为 `[1,2]` 和 `[1]`。再补两次顺序调用的 `op` 不同、`generation` 都从 1 起（审核 7）。

9. 【低】TU-10 没体现审核 7 的“不安装”。修改：调试关闭时，传给 `generateJSON` 的 `deps` 与调用方传入的对象 `===` 相同（非 ordinary 路径），或注入的 `generateText` 收到的 `options` 与改动前快照 `deepEqual`；`SHAKEINK_IMPORT_DEBUG` 为 `'true'`、`' 1'` 时也视为关闭。

10. 【低】TU-11 只测了 HTTP 500。修改：补 abort（`signal` 取消）和流错误各一例，都不写行、原错误不变。再补“日志写入函数抛错时，生成结果和错误都不变”（实现已用 try/catch 包住）。

11. 【低】审核 3、4、10 没有对应用例。
   - 审核 3：TU-REAL 只写了“记录起止时间”，期望里要加上 `token-usage.json` 含日志合计（输入/命中/未命中），并写明后台增量与差额由用户核对后补录、未核对时标“待对账”，不能标为通过。
   - 审核 4：可在 TU-01 加一句，单步时 `stream.usage` 与 `totalUsage` 相等。
   - 审核 10：补一例生产入口，`runImportAi` 用默认 `deps.generate`（`:1040-1041`），不注入 `generateText`，接 MockLanguageModelV4，调试开启时恰好写一行，证明真实入口没有绕过观察器。

12. 【低】TU-REAL 的“隔离根 `state.json` 哈希不变”有歧义。导入会写入运行根，所以这里应该指“源基线根 `app-data-parentfix-vol1-r3` 不变，运行在副本上”。复制根时要按约定移走 inbox lease receipt，否则启动会报 AUDIT_CHANGED。TU-13 里 `typecheck` 脚本确实存在（`package.json:8`），“（若有）”应删掉。

## 覆盖对照

方案 §1 第 1、2 项，以及审核 2、5、6、7、8、9 都有用例，但细节不足，见发现 3、4、6、7、9。审核 1 只部分覆盖（发现 1、2）。审核 3、4、10 没有用例（发现 11）。TU-04 正确，没有冗余或不可能实现的用例；TU-03 与 TU-12 是返回对象和日志行两个层面，不算重复。

## 结论

**修改后通过。** 按发现 1–6 修订用例后再进入 TDD，7–12 可以在写测试时一并落实。
