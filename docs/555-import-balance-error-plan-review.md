# 555 导入时模型余额不足的错误提示 技术方案 · 独立审核

审核对象：`docs/555-import-balance-error-plan.md`。对照源文件逐条核实；另在仓库外临时目录跑了两个只读探针（用现有 `tests/helpers/novel-import-wizard-fixture.ts` 夹具，和本仓 `node_modules` 里的 AI SDK），跑完已删除。审核时未修改任何源文件或测试。

## 发现

1. **OK：DeepSeek/OpenAI 协议下，文本 402 到达 `safeError` 时正好是 `模型接口请求失败（HTTP 402）`。**
   - 主进程丢弃供应商正文，改写成 `{error:{message:'模型接口请求失败（HTTP 402）',code:'HTTP_402'}}`（`desktop/main/model-service.ts:82-85`）。
   - DeepSeek 和 OpenAI 的 SDK 用 `error.message` 作为 `APICallError.message`（`node_modules/@ai-sdk/deepseek/dist/index.js:418-423,1045`；`node_modules/@ai-sdk/openai/dist/index.js:19-27`；`node_modules/@ai-sdk/provider-utils/dist/index.js:3838-3854`）。
   - 探针把这个响应依次交给 `createDeepSeek`、`createOpenAI().chat`、`createOpenAI().responses` 的 `streamText`，三者得到的 message 都是 `"模型接口请求失败（HTTP 402）"`，`statusCode` 都是 402。
   - 不会被重试改写。`generateText` 用 `maxRetries:0`，不会出现 `RetryError`（`src/lib/ai/generate.ts:111`）。`runWithNetworkRetry` 因为 `isProviderQuotaError`（`statusCode===402`）判为 `retryScope:'none'`，直接抛出（`src/lib/ai/network-retry.ts:129-133`，`src/lib/ai/error-classification.ts:174-176,275`）。402 也不在请求层可重试的状态码里。
   - 结构化场景路径另外把状态码规范为同一句话（`desktop/service/novel-import-ai.ts:822-829`）。worker 经 RPC 只传 `error.message`（`desktop/service/rpc.ts:18,22`），所以主进程收到的是 `Error('模型接口请求失败（HTTP 402）')`。
   - 用户这次的失败路径是角色清单 → `runRoster` 的 catch → `stepError=safeError(error)`（`desktop/main/novel-import.ts:770-773`）。探针复现：第一次失败后 `stepError` 正是 `"模型接口请求失败（HTTP 402）"`。

2. **should-fix：Anthropic 协议下，402 到不了 `safeError` 的精确匹配，方案的"现状"一节没有覆盖这种情况。**
   - Anthropic SDK 的错误 schema 要求顶层 `type:'error'`，并且 `error.type` 必须存在（`node_modules/@ai-sdk/anthropic/dist/index.js:6-15`）。主进程合成的正文没有这两个字段，解析失败后 SDK 退回 `response.statusText`（`provider-utils/dist/index.js:3856-3866`），这个值是空串。
   - 探针结果：`createAnthropic` 的 `streamText` 得到 `message:""`，`statusCode:402`。
   - 非结构化路径原样抛出这个错误（`novel-import-ai.ts:879`）。RPC 收到的是 `{error:''}`，而接收端判断 `if (message.error)`，空串为假，于是 **resolve(undefined)**，没有 reject（`desktop/service/rpc.ts:18,22`）。主进程拿到 `undefined` 后会在后续检查里抛 TypeError（`novel-import.ts:2178`，`Object.hasOwn(result,…)`），最终显示通用文案「导入处理失败，请核对来源、模型配置后重试」。
   - 仓库明确支持 DeepSeek 的 Anthropic 协议（`novel-import-ai.ts:1111`；Anthropic 预设见 `desktop/shared/model-catalog.ts:82`）。
   - 修改建议，二选一：
     - (a) 合成正文时加上 `type:"error"` 和 `error.type`（例如 `"api_error"`），让三种 SDK 都读到同一句 message。这是 `model-service.ts:84` 的一行改动，聊天路径也会受益。
     - (b) 方案在"不改的部分"里写明这个缺口，另立一项处理。
     - 无论选哪个，都应把 RPC 对空 message 的 resolve 行为记为已知问题。

3. **must-fix：文案让作者「在设置中更换模型后重试」，但在向导里按这个做会走进死路。**
   - `ai()` 每次请求都比较授权快照和当前模型，不一致就抛 `模型配置或授权已变化，请重新允许`（`novel-import.ts:2166-2167`）。
   - 「重新识别」只是重跑这一步（`novel-import.ts:578`），不会刷新 `analysisGrant`。`wizardResume` 只在 `analysisGrant` 缺失时重新授权（`novel-import.ts:1715-1720`）。这句错误进入 `stepError` 后，界面不会出现「允许」按钮，因为 `ResumeConsent` 只看 `view.error`（`src/components/desktop/NovelImportWizard.tsx:44-46`）。
   - 探针结果：402 失败后切换文本模型，点「重新识别」得到 `stepError="模型配置或授权已变化，请重新允许"`。再点「重新识别」、调用 `resume{consent:true}`，结果都一样。只有「返回修改选择」退到 `tree`、再继续，`grantChapters` 才会重新授权（`novel-import.ts:660-669,1780-1786`）。退到 `detect-char` 会被拒绝，提示「只能返回到之前的步骤」（`novel-import.ts:1761`）。
   - 这个死路是已有问题，但新文案会把作者直接引进去。修改要求，二选一：
     - (a) 文案只给一定能走通的动作，例如「请到模型供应商充值后点重试；如需更换模型，请在设置中更换后返回修改选择重新开始」。
     - (b) 本次一并修复授权刷新：模型变化时把错误写入 `s.error` 并清除 `analysisGrant`，让界面出现「允许并继续」。这超出"只改映射"的范围，需要主代理决定，并补用例。

4. **must-fix：图像 402 确实会到达 `safeError`，但向导界面不显示图片任务的错误，方案第 3 条改了也看不到。**
   - 链路成立：`responseJson` 抛 `ModelAuthorizationError('IMAGE_HTTP_402')`（`desktop/main/image-generation.ts:38`）。`generateMainImage` 的 catch 遇到 `ModelAuthorizationError` 会原样重抛（`image-generation.ts:143-147`），前提是没有超时、没有取消。`startImage` 也会重抛（`model-service.ts:112-116`）。导入直接在主进程调用 `modelService.startImage`，不经过 RPC，所以 message 保持不变（`desktop/main/index.ts:206-210`）。图片 worker 把错误放进 `failures`（`novel-import.ts:997,1003`），随后写入 `task.error=safeError(error)`（`novel-import.ts:976`）。
   - 显示不成立：图片任务以缩略 chip 的形式渲染。失败时只有「重试」「跳过」按钮，加上屏幕阅读器文本「，头像失败」，**不渲染 `i.error`**（`NovelImportWizard.tsx:170`）。只有实体任务会显示 `t.error`（`NovelImportWizard.tsx:169`）。
   - 所以方案"现状"里"`IMAGE_HTTP_402` 显示为通用的…"这句不成立：当前界面上什么都不显示。修改要求：
     - 要么在方案里明确第 3 条只改存储内容，用户看不到；
     - 要么增加图片失败原因的显示。这属于界面变化，已批准的导入向导 v4 设计（`docs/implementation-boundaries.md:3-5`）没有这个元素，需要先请用户确认。
   - 另外，`IMAGE_HTTP_402` 到达时 `name` 是 `ModelAuthorizationError`。`runEntities` 的图片 worker 不把它当全局错误，所以一个 402 不会停掉其余图片任务。每个图片任务都会各自请求一次、各自失败。

5. **OK（附一处行号补充）：作者可见的导入错误都经过 `safeError`，只有下面两处例外，都不受本方案影响。**
   - 逐处核对 `safeError(` 的调用点：`773、824、956、972、976、1156、1303、1398（两次）、1432（三次）、1472、2015（两次）`。方案列出的行号除了漏掉 **976** 外都准确。976 正是实体和图片失败的主要写入点（`failed` 循环），应补进方案。
   - 第一处例外：`act()` 同步抛出的错误经 IPC 原文进入 store 的 `error`，在对话框 alert 里显示（`src/lib/desktop/novel-import.ts:55-62`，`NovelImportDialog.tsx:219`）。`act()` 里所有调用模型的工作都通过 `launch` 进入后台（`novel-import.ts:607,617,618,629,2189,2634,2638`），同步段不会遇到 402。
   - 第二处例外：`w.stepError` 有一处直接写死文案「仍有未分类的片段…」（`novel-import.ts:2244`），与模型无关。
   - 余额不足时有几条路径会**静默吞掉**错误，作者看不到任何提示（不是绕过 `safeError`，是根本没有提示）。建议在"风险"一节记录：
     - 主题定位遇到非 rerunnable 错误时 `break`，然后退回本地通道（`novel-import.ts:1107-1115`）；
     - 自动修复复核出错只记次数（`novel-import.ts:1518-1522`）；
     - 复核分包对 402 仍会重试到 `ROSTER_UNIT_ATTEMPTS=3` 次，因为 `reviewGlobalFailure` 不认 402（`novel-import.ts:156,1467-1471`），所以这句「重试无法恢复」的文案说的情况，程序自己还会再请求两次。

6. **OK：没有逻辑按 `stepError`、`task.error` 的文案做判断。**
   - `SCENE_FATAL`、`settingsFailureClass`、`ROSTER_OUTPUT_RETRYABLE`、`worldEntryRerunnable` 匹配的都是原始 `error.message`（`novel-import.ts:170-176,203`）。
   - 渲染端只对 `view.error`（即 `s.error`）做 `/重新允许/`、`/图片/` 的正则（`NovelImportWizard.tsx:44,50`）。新文案里没有「重新允许」，也没有「图片」（图像文案用的是「图像」），不会误触发「允许并继续」。
   - `finishWizardChecks` 只拼接显示文本，并截到 400 字（`novel-import.ts:1579-1580`）。
   - 测试里有断言旧文案的地方：NI-J05（`tests/unit/novel-import-request-schema.test.ts:259`），以及 UI 夹具里的固定 `stepError`（`tests/helpers/novel-import-wizard-ui-fixture.tsx`）。后者不受影响。

7. **OK：复核模型路径的错误会解包，402 原文能到达 `safeError`。**
   - 场景复核波次把错误包成 `ReviewPacketFailure`/`ReviewWaveFailure`（`novel-import.ts:149-150,2178-2179`），在 `reviewScenes` 里解包回 `.original`（`novel-import.ts:2557,2576`）。
   - 向导复核分包直接调用 `ai()`，不包装（`novel-import.ts:1462`）。
   - 方案因此用「更换模型」而不写「文本模型」，这个理由成立（`novel-import.ts:2069`）。但第 3 条指出的死路对复核模型同样存在。

8. **nit：402 的其他形态。**
   - `statusCode===402` 加上其他 message 的组合，在本仓的文本路径里不会出现：主进程统一改写，结构化路径按 statusCode 规范，Anthropic 是第 2 条的例外。
   - `StructuredGenerationError` 只表示解析或校验失败，不会携带 402（`src/lib/ai/generate.ts:221-236`）。
   - `'Insufficient Balance'` 只有在供应商用 200 响应、在流里返回错误时才可能到达。可以考虑复用 `PROVIDER_BALANCE_MESSAGE_PATTERN`（`error-classification.ts:166`），用完整匹配加长度上限，覆盖 `insufficient funds/credits`、`余额不足` 等写法。不做也可以，但方案应写明只认这一个英文串。
   - 文案「重试无法恢复。请…充值…后重试」前后读起来矛盾，建议改为「充值前重试无法恢复」。

9. **should-fix：流程与台账。**
   - 方案没有提 `docs/requirements-traceability.json`。按 AGENTS.md，需要追加本需求的条目，并且只追加、不覆盖台账里未提交的条目。
   - 真实验证的口径要先定下来：DeepSeek 账户已经充值，真实供应商的 402 现在复现不了。本地 402 桩只能记为"本地桩验证"，不能记为真实通过。
   - 方案只改主进程映射，不涉及 Web 组件复用或布局，符合 `docs/implementation-boundaries.md`。如果按第 4 条增加图片错误显示，就需要另外请用户批准界面变化。

## 结论

**approve with changes**：方案的主路径判断正确。DeepSeek/OpenAI 协议的 402 以精确文案到达 `safeError`，没有逻辑依赖展示文案，也不会自动重试。进入实现前必须先处理：

- 第 3 条：「更换模型后重试」会走进死路，需要改文案或修复授权刷新。
- 第 4 条：图片错误在界面上不显示，需要修正方案描述，或经用户批准后增加显示。

还应处理：

- 第 2 条：Anthropic 协议的 402 变成空 message，RPC 会把它当成功返回。
- 第 5 条：补上 976 行，并记录静默吞掉错误的路径。
- 第 9 条：补台账条目，定下验证口径。
