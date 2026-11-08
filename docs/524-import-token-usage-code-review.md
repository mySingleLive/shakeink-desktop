# 524 · 导入真实用量记录代码审核（522 第一步）

审核对象：未提交改动中 `src/lib/ai/generate.ts`、`desktop/service/novel-import-ai.ts`（`observeImportUsage` 与 `generateImportAiJson` 接线）及新文件 `tests/unit/novel-import-token-usage.test.ts`。依据：`docs/522-import-token-cache-plan.md` §1（按 `522-…-review.md` 修订）、`docs/523-import-token-usage-cases.md`、`node_modules/ai@7.0.130`、`@ai-sdk/deepseek`。未修改任何源文件。

说明：同一工作区的 `novel-import-ai.ts` diff 还含 514/517 的设定修复、线索规整等改动（`repairSettingsReply`/`normalizeLinesReply`、`settingsRepairs`/`linesRepairs` 返回），不属本步，本审核不覆盖。

## 已执行

- `node --import tsx --test tests/unit/novel-import-token-usage.test.ts`：12/12 通过。
- 回归：`novel-import-ai`、`novel-import-request-schema`、`novel-import-structured-buffering`、`novel-import-structured-scene` 共 118/118 通过；`novel-import-scene-roster-native`、`…-root-recovery` 共 48/48 通过。
- `tsc --noEmit`：退出码 0。
- 未运行全量 `npm test`（按要求，另有一次运行在进行）。

## 结论

**修改后通过。** 实现与方案一致，调试关闭时的行为未变，未发现泄漏。第 1、2 项是测试缺口，涉及方案审核第 1 项（高）要覆盖的路径，需补用例。第 3 项建议修改，其余各项可选。

## 重点核查结论

A. `stream.providerMetadata` 加进 `Promise.all`（`generate.ts:117`）**不引入新的拒绝或挂起**。在 `ai@7.0.130` 中，`DefaultStreamTextResult.providerMetadata` 与 `text` 都是 `this.finalStep.then(...)`，二者同源于 `this._steps.promise`（`ai/dist/index.js:10079-10098`）。`_steps` 在 flush 时和 `_finishReason`/`_totalUsage` 同步 resolve（`:9180-9183`）。流错误、NoOutput 或取消时，`rejectResultPromises` 用同一个 error 一起 reject（`:10177-10195`）。所以新元素和原有的 `stream.text` 同时 resolve 或 reject，错误对象也相同，`waitWithAbort` 和 `.catch` 里的 `throwIfAborted`/`streamError ?? error` 照旧生效，也不会多出未处理的拒绝。非 DeepSeek 供应商的 `providerMetadata` 为 `undefined` 或不含 `deepseek` 键，此时 `cacheSplit` 退回 SDK 明细，或者不加任何键。

B. 生成结果的扩展不受调试开关控制，这符合方案：`GenerateResult` 本来就要始终带这些字段。字段只在有数值时才条件展开（`generate.ts:62-68,148`）。`recordUsage` 的入参和计费不变（TU-01 已断言）。`generateJSON` 的返回不含新字段（TU-04）。其他调用方（`scenario-ai.ts:719`、`conversation-title.ts:78`、各 handler）都只解构 `text`/计数字段，不受影响。

C. 调试关闭时：`generation` 在非 ordinary 路径仍是原 `deps` 对象，身份不变；ordinary 路径调用的 `rawGeneration===baseGeneration`（`novel-import-ai.ts:703-707`）。唯一差异是 `deps?.generateText??generateText` 从每代求值一次变为每次调用求值一次；`deps` 不会被改写，所以等价。没有新增 await。

D. 覆盖面：观察器包的是原始调用。ordinary 包装内，它位于 `rosterContract` 判 incomplete、设定修复和线索规整之前（`:706-707`）；非 ordinary 路径用 `{...deps,generateText:rawGeneration}`。`generateImportAiJson` 只调用一次 `generateJSON`（`:780`），所以每个返回的代次恰好记一行；`generateText` 抛错的代次不记，与方案一致。

E. 泄漏：六个字符串字段都经白名单过滤。白名单与类型定义一致：`phase` 对应 `shared/novel-import.ts:169`，`intent` 对应 `core/novel-import-semantics.ts:44`，`mode` 对应 `shared/novel-import-scene-identity.ts:60-63`，`lane` 对应 `:169`，`kind` 取自 `IMPORT_TARGETS`。其余字段只有计数、长度和随机 `op`，不含提示词、模型 id、Key 或错误信息。

## 发现

1. 【中】`tests/unit/novel-import-token-usage.test.ts:71-76`（TU-06）没有走到方案审核第 1 项（高）要防的路径。`request()` 不带 `sceneIdentity`，所以 `rosterContract` 为 undefined（`novel-import-ai.ts:651`）；这一代的 `length` 是 `generateJSON` 自己判的 incomplete，不是 ordinary 包装里 `rosterContract&&finishReason!=='stop'` 抛出的。就当前代码看，观察器确实位于该 throw 之前（`:706`），但没有用例防止回归：如果日后有人把观察器挪到包装外层，`length` 截断的代次就会漏记，测试却仍然通过。
   修改：增加一个经 `generateImportAiJson` 的场景 roster 用例（`sceneIdentity.mode:'roster'`，第 1 代 `finishReason:'length'`，第 2 代成功；可沿用 `novel-import-scene-roster-native.test.ts` 的夹具），断言出现 2 行、`mode:'roster'`、第 1 行 `finishReason:'length'`，并断言 `schemaChars` 等于实际下发的 `jsonOutputSchema` 长度（含纠错代次的 bound schema）。

2. 【中】非 ordinary 分支 `usageDebug?{...deps,generateText:rawGeneration}:deps`（`novel-import-ai.ts:707` 末尾）没有集成用例。TU-12 和 TU-07 直接调用 `observeImportUsage`，没有经过这条分支。classify/review/patch/reconcile 的行能否写出、调试关闭时 `deps` 是否原样透传，现在都没有测试保证。用例 523 TU-07 写的是“场景 roster 一代、原生 schema”，当前实现是直接单测观察器，与用例描述不符。
   修改：补一个经 `generateImportAiJson` 的 `phase:'review'`（或 `intent:'reconcile'`）用例：调试开启时恰好 1 行、`phase:'review'`；调试关闭时 0 行，传入参数与开启时相同。

3. 【低】`observeImportUsage` 的 `row` 在 `try` 外构造（`novel-import-ai.ts:636-637`）。`JSON.stringify(schema)` 遇到循环引用或 BigInt 会抛错；注入的 generator 返回非对象时，读取 `result.promptTokens` 也会抛错。两种情况都会在调试开启时用诊断错误替换原结果，违背注释里“Diagnostics never change generation”。正常的 JSON Schema 不会触发，但建议把 `row` 的计算一并放进 `try`。

4. 【低】TU-05（`test.ts:63-70`）用的是场景 analyze，`intent:null`。用例 523 TU-05 规定的是“角色 roster”，期望 `intent:'roster'`、`kind:'character'`。断言模式等价，但请求形态不同，建议对齐用例或修订 523 的描述。

5. 【低】768 字节上限（`novel-import-ai.ts:638`）超限时整行丢弃，不留痕迹。按现有字段（全为白名单枚举和安全整数），单行最长约 450 字节，实际不可能超限，因此可以接受。若将来加字段，汇总脚本会把丢行误当作“没有该代次”。可以考虑超限时改写一行固定的 `import-usage {"op":…,"dropped":true}`，或者在注释里说明。

6. 【低】`cacheSplit`（`generate.ts:62-68`）要求 hit 和 miss 两个字段同时为数值才取 provider 来源，否则退回 SDK，这符合方案。kimi/zhipu 也经 `createDeepSeek`（`provider.ts:85`），元数据键同为 `deepseek`。它们不报告 `prompt_cache_hit_tokens` 时会退回 `sdk`，而 `sdk` 来源的 0 可能只表示“未报告”，`cacheSource` 已能区分。第一步的验收只认 `provider` 来源，汇总脚本需按此过滤。

7. 【低】`generate.ts` 的流路径没有新增“流错误/取消时仍保留原错误”的回归用例。本次核查 A 已从 SDK 源码确认语义不变，现有 scene-roster 和 structured 用例也通过，所以不强制，但可以给 TU-01 系列补一个 `doStream` 发出 `error` part 的用例，断言错误不变。

## 需修改项

第 1、2 项需补测试；第 3 项建议同时修改。改完后重新跑本文件和 TU-13 所列回归，即可进入真实基线（TU-REAL）。
