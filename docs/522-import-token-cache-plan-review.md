# 522 方案独立审核（第一步为主）

审核对象：`docs/522-import-token-cache-plan.md`。依据：`src/lib/ai/generate.ts`、`desktop/service/novel-import-ai.ts`、`node_modules/ai@7.0.130`、`@ai-sdk/deepseek@3.0.61`、`tests/unit/*`。未修改任何源文件。

## 结论

**修改后通过。** 第一步方向正确、调用路径覆盖完整、映射来源正确；但“失败代次不写”与“未报告为 undefined”两处会使基线系统性偏低或失真，需在实现前修订。

## 发现

1. 【高】观察器包装位置与“失败代次不写”会漏计已计费 token。`novel-import-ai.ts:690` 中 ordinary 包装在场景 roster `finishReason!=='stop'` 时直接抛 `incomplete`；若观察器包在该包装外层，`length` 截断代次（场景 roster 最大的消耗之一）不会写日志。另 `generate.ts:206` 的 incomplete 也在返回后才抛。
   修订：观察器必须包在最内层，即 `deps?.generateText ?? generateText` 本身（`novel-import-ai.ts:688` 的 raw 调用处；非 ordinary 时 `generation` 为 `deps`/undefined，`:690`），只要 `generateText` 返回结果就写一行，含 `finishReason=length`。“不写”只限 `generateText` 自身抛错（网络/供应商/取消），并在方案中声明这部分无法观测。

2. 【中】“供应商未报告时为 undefined”对 DeepSeek 系不成立。`@ai-sdk/deepseek/dist/index.js:390` 为 `prompt_cache_hit_tokens ?? prompt_tokens_details?.cached_tokens ?? 0`，未报告时得 0、`noCache=total`，与真实 0% 命中无法区分；`provider.ts:85` 把 kimi、zhipu 也路由到 `createDeepSeek`。OpenAI chat 同样 `?? 0`（`@ai-sdk/openai/dist/index.js:427`）。仅整体无 usage 时才是 undefined（`ai/dist/index.js:2530` null usage）。
   修订：对 DeepSeek 额外取 `stream.providerMetadata` 中的 `deepseek.promptCacheHitTokens/promptCacheMissTokens`（`deepseek/dist/index.js:1002-1003`，原始字段，未报告为 undefined）作为权威值；或在方案中写明“0 可能表示未报告”，验收只认 DeepSeek 原始字段。

3. 【中】基线与后台口径未对账。`runWithNetworkRetry`（`generate.ts:112`）内失败的网络尝试、流中断（`:108` streamError）、取消代次可能已计费但无日志。DeepSeek 后台 68% 是全部计费口径。
   修订：验收增加“驱动运行窗口内日志合计 vs 后台增量”的对账一项，差额照实记录。

4. 【中】流式映射本身正确，需写明取值点。`generate.ts:102` 取的是 `stream.usage`（最后一步 `asLanguageModelUsage`，`ai/dist/index.js:2512`），导入为单步调用，与 `totalUsage` 相等；`inputTokens=prompt_tokens=hit+miss`、`noCacheTokens=miss`，与后台“命中/未命中”一致。若将来走多步，应改用 `totalUsage`。DeepSeek 流式已开启 `include_usage`（`deepseek/dist/index.js:848`）。

5. 【低】测试兼容性：新增字段必须“有值才出现”（条件展开），不可写 `cacheReadTokens: undefined`。全部单测使用 `node:assert/strict`，`deepEqual` 为严格比较，`{k:undefined}` 与 `{}` 不等。目前未发现对整个 `GenerateResult`/`GenerateJSONResult` 做深比较的用例（`novel-import-structured-buffering.test.ts:46,67` 只比单字段，其余 `deepEqual` 均比 `.data` 或请求快照），注入 `deps.generateText` 的用例返回无新字段的对象，可选字段不影响。

6. 【低】`GenerateJSONResult` 求和字段第一步用不到（观察是逐代次的），且“任一代次报告才出现”在部分报告时得出不完整和。建议第一步不改 `GenerateJSONResult`，只扩 `GenerateResult`，减少对 `scenario-ai.ts`、`sop/agents.ts` 等非导入调用方的接触面（方案 §4“不改非导入调用”）。

7. 【低】未开启调试时应不安装观察器（`generation` 原样传给 `generateJSON`，`novel-import-ai.ts:763`），而不是安装后判断 env；这样零行为差异，也不改变 `deps` 对象身份。`generation` 序号需观察器自行计数（`generateJSON` 不传 attempt，`generate.ts:201`），每次 `generateImportAiJson` 调用从 1 起。

8. 【低】泄漏面：`phase/intent/kind/mode/lane` 来自请求，`generateImportAiJson` 是导出函数，`request-schema.test.ts:73` 即用含 `SECRET` 的伪 kind 测试。建议日志对这些值做白名单映射（不在枚举内写 `'?'`，同 `:390` 现有写法），整行长度设上限（同 `:623` 768 字节约定）。不写模型 id、提示词、`options` 对象、错误消息，方案已列明，同意。

9. 【低】`promptChars` 不含原生结构化输出的 JSON Schema（`jsonOutputSchema`，场景 roster 原生模式下随请求发送并计入输入 token）。建议加 `schemaChars`，否则第三步分析时会把 schema 计入误判为正文膨胀。并发分批（`runImportGenerationLane`，`:1023`）下各行交错，建议附 `operationId`（随机 id，非内容）以便关联同请求代次。

10. 【确认】无绕过路径：导入全部 AI 调用经 `runImportAi`（`desktop/service/index.ts:127`）→ `deps.generate`（`novel-import-ai.ts:1072`）→ `defaults.generate` → `generateImportAiJson`（`:1023-1024`）；`desktop/main/novel-import.ts` 无直接模型调用。classify/analyze/review/patch 均覆盖。

## 第二、三步重大风险（方向级）

11. 【高】第二步把正文块置于阶段说明/防注入声明之后的结构会改变不可信资料与指令的相对位置；同时 `assertImportFixedPromptReserve`、各阶段预算（场景 roster 与其它阶段输入差约 6 倍）和纠错“前缀不变、尾部追加”的性质都依赖现有布局。规范块须按最小阶段预算切分，会增加调用次数和固定头开销；并行分批同时发送相同前缀时缓存尚未建立，命中可能低于预期。需以第一步数据验证跨阶段复用真实可达再定。
12. 【中】第三步改片段/ref 编码直接触及“未知引用直接拒绝”及证据锚定严格校验；方案已给保守版本，须保证旧会话按旧策略版本解析。

## 需修订项汇总

第 1、2、3 项须修订方案后实施；第 5–9 项可在实现与测试用例中落实。
