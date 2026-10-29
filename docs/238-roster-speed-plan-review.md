# 238 角色识别提速方案 独立审核

日期：2026-10-30。审核对象：`docs/238-roster-speed-plan.md`，对照源码（含工作区中已落地的实现）。审核时发现 A–E 已基本实现，下文行号以当前工作区为准。已执行定向用例：`novel-import-roster-ai`、`novel-import-wizard-prompt`、`novel-import-stage-batches`（15/15 通过），`novel-import-wizard-session` 中 RS-*（4/4 通过）。未运行全量与真实导入。

## 高

**H1. 非 DeepSeek 分支整体替换 `providerOptions`，丢掉 OpenAI Responses 的 `store:false`（隐私回退）**
- `src/lib/ai/provider.ts:83` 只把 `openai.store=false` 合并进 `instantiateModel` 返回的 `providerOptions`。
- `desktop/service/novel-import-ai.ts:359-365` `importRosterModel` 返回 `{...resolved,providerOptions}`，用 `buildThinkingProviderOptions` 的结果整体覆盖。对 Responses 线路且有思考档位的 OpenAI 模型，覆盖后 `store` 消失。`@ai-sdk/openai` 在缺省时取 `store ?? true`（`node_modules/@ai-sdk/openai/dist/index.js:6144`），整批小说正文会被供应商留存。
- 现有 `withLightReviewThinking`（provider.ts:39-43）用的是同一种覆盖写法，新代码照搬了这个缺陷。
- 要求：与原 `providerOptions` 逐 provider 键深合并，或在覆盖后重新施加 `store:false`；补一条 RT 用例，断言 Responses 线路的识别请求仍为 `store:false`。

## 中

**M1. 来源核对从"每请求前后"放宽为"整轮首尾各一次"，未核对的结果会落盘，之后还可能不经核对就定稿**
- 改动前 `ai()`（novel-import.ts:1087 起）在 `verified=false` 时于请求前后各核对一次，覆盖只记录核对通过后的结果。
- 现在 `runRoster` 以 `verified=true` 调用（:414），只在 :405 和 :424 各核对一次，中间结果由 `flush` 持续写入 stash/coverage。
- 如果结尾核对（:424）失败，步骤标为失败，但 stash 与 coverage 已保存。之后"重新识别"时全部单元已覆盖，`planned===0`，:405 和 :424 都跳过，直接用未核对的结果 `buildWizardCandidates` 定稿。
- `runEntities` 的先例是每 30 s 或每 16 次调用核对一次（:443），识别现在一次运行可能持续数分钟，期间完全不核对。
- 要求：`infer` 时在构建候选前无条件核对一次（不受 `planned` 影响），运行中复用 `runEntities` 的周期核对。

**M2. 并发 16 正好等于运行时证据硬上限，没有余量**
- `ImportRuntimeProofTracker.invoke` 的判断是 `this.pending().length+this.reserved>=maxTokens`（runtime-proof.ts:29），按整个进程计数，不分会话。`maxTokens` 被 `limits()` 限制在 ≤16（:14）。
- 第 17 个调用会抛出"运行时调用证据容量已满"。这个错误不是中止错误，会把识别步骤直接标为失败。任何新增的并行调用都会触发它，例如以后在识别期间允许其他导入请求，或者旧 epoch 的令牌尚未结清。
- 字节层面没有问题：16 个调用的证明实测 10,030 B，小于 16,384 B 上限。
- 建议：并发取 `maxTokens-1` 到 `-2`，或在 worker 取请求前检查 tracker 余量，用排队代替失败。方案中"等于上限"的说法需要附上这一风险说明。

**M3. 首个错误会取消全部在途批次，浪费接近完成的结果**
- :414 在第一次失败时对 `this.operations` 全部调用 `cancelAi`。按方案估算，16 路中其余 15 个请求很可能已接近返回，它们的输出会全部丢弃，"重新识别"时要重新付费并重新等待。
- 方案已经把限流（429）列为 16 路下的主要风险，这种情况下整步失败加全部取消的代价最大。
- 建议：失败后停止取新批，让在途批次完成并落盘（暂停/中止仍走取消）。如果希望自动重试，至少把限流错误放回队列一次。

**M4. 分批快速路径"所有阶段结果不变"的论证不成立**
- `importStageBatches`（budget-policy.ts:93-104）只检查每个贪心批次整体是否 `fits`。要与逐单元算法等价，前提是 `fits` 对前缀单调：完整批次装得下，它的每个前缀也必须装得下。
- 识别（`artifacts:[]`）、touches、classify 满足这个前提：`chapters`/`entities` 不变，`serializeImportAiPayload` 选出的相关实体随前缀单调增加。
- 使用 `contextArtifacts` 的阶段不满足（:1445）。它按 `s.artifacts` 顺序贪心挑选，遇到超出预算的就 `continue`。正文变长后会命中更多排在前面的小实体，可能挤掉一个前缀里原本能放下的大实体。这样就可能出现前缀的序列化结果比完整批次更大，即"前缀装不下、整批装得下"，两种算法的切分随之不同。
- 结果仍然符合预算，所以不是正确性错误，但"产生相同批次"的结论和 SB-01 都只对单调阶段有效。
- 要求：要么只在 roster/touches/classify 启用快速路径，要么把方案和用例改为"结果满足预算，批次可能不同"，并确认没有按批次键做的缓存或续跑依赖逐单元的切分。

## 低

**L1. 提示中仍有关于 evidence 的通用指令，与新契约矛盾**
- roster 契约与 `evidence-attribution-guidance` 已经去掉 evidence（payload.ts:63）。但固定尾部 payload.ts:74 仍对所有分析阶段写着"每项evidence引用真实输入unitId，quote逐字保留单元内原文…"。实测 roster 固定提示中 `evidence`、`quote`、`逐字` 各出现 1 次。
- WP-01/WP-04 只检查了契约片段，没有检查完整提示。这会诱导模型继续输出引文，削弱 B 的提速效果。建议在 `listIntent` 时省略这句话，并让用例检查整份提示。

**L2. 本地定位只要求名称或任一别名出现在原文，模型可以造出不存在的主名**
- `locatedRoster`（novel-import-ai.ts:322-328）只要别名命中就保留条目，主名完全不需要出现在原文。单字或常见词也能作为别名或名称命中（用例 RA-07 本身就用了"雨""风声"）。
- 旧机制同样允许 quote 是任意短子串，所以总体强度没有明显下降，但方案"名称必须真实出现在原文才保留"的说法不准确。
- 在"不可信模型输出"的前提下，建议要求主名本身出现；或者只靠别名命中时，要求别名至少 2 个字符且候选名在 `buildWizardCandidates` 中有出场章数。也可以在方案中如实写明这一点。

**L3. 绕过全局长任务名额，也就绕过了配置项 `maxConcurrentTasks`（1–8）**
- `runInsideLongTask` 让 `acquireLongTask` 直接返回空释放函数（long-task.ts:41），识别请求不再受管理员配置的并发上限约束，与聊天请求叠加后最多 16+2 路。同时会跳过 `retainDatabaseTask`。这一点已核实是安全的：`runWithGlobal('inbox')` 在整个调用期间都持有槽位（workspaces.ts:376 起）。
- 建议在方案中说明，这个配置项从此不约束导入识别。

**L4. `rosterFound` 的口径与最终清单数不一致**
- `wizardRosterFound`（core/novel-import.ts:377-380）只合并正文返回的条目。最终候选会加入资料文件条目；物品还要经过 `keepWizardItem` 过滤；世界观由 `buildWorlds` 按世界加设定叶子计数，不使用别名合并。所以界面上"已识别 N 个物品/世界观"可能与下一屏的数量不同。
- 视图只多一个数字，没有泄露。每次推送都要执行一次 O(条目×组) 的合并：1,193 条实测 14 ms，全书预计 2–6 千条时约数十 ms，可以接受。
- 建议把文案或用例限定为"正文识别到的名称数"。RS-02 的"最终值等于候选数"只对角色且无资料文件时成立。

**L5. DeepSeek 关闭思考只对 OpenAI 协议生效**
- 对照 `@ai-sdk/deepseek` 3.0.61 核实：schema 接受 `thinking.type:'disabled'`（dist/index.js:51-55）。`getArgs` 在 disabled 时发送 `thinking:{type:'disabled'}`，并省略 `reasoning_effort`（:724-776）。所以方案 C 用法正确。
- 但只有 `providerFamily==='deepseek'` 时生效。如果 deepseek 供应商配置的是 anthropic 协议，会走 `createAnthropic`，`deepseek` 键被忽略，同时原有思考选项被清空，实际效果不确定。
- kimi/zhipu 也走 DeepSeek SDK，取最低档 `low`，结果正确：GLM-5.3 不能关闭思考，这样处理是对的。
- `defaults.generate` 是否真正接上了 `importRosterModel` 没有用例覆盖，RT-* 只直接调用了这个函数。

**L6. 1 分钟目标的估算偏乐观**
- 每批输入约 8 万字符，相当于数万 token 的预填充。59 批分 4 轮，每轮还要加首包延迟。方案按"约 25 token × 2000 条"估算输出，没有计入每批的首包延迟和尾批效应。
- 方案已经承诺"超时如实记录"。建议真实运行时同时记录每批首包延迟与总时长，用于判断是否需要改用更大的批次（1M 上下文允许）。

**L7. 其他观察（不阻塞）**
- 暂停/epoch 语义经核实正确：`ai()` 在返回后执行 `current()`，`checkpoint` 也会再检查 epoch，迟到结果都不会写入。`stopAction` 先等作业结束再生成证明，证明中的 `calls` ≤16。
- 一次非中止的保存失败（:415）会设置 `halt`，但不会取消在途请求，所以要等在途请求自然返回（可能长达数分钟）才会结束。
- `flush` 在 `checkpoint` 之前已经执行 `splice`，保存失败时这一组结果会丢失，只能靠重新识别补回。可以接受，但应在方案中写明。

## 结论

**有条件通过。** 必须完成 H1、M1，以及 M2 或 M3 中至少一项（建议都改），并在合并前修正 M4 的等价性表述或收窄适用范围。L1 改动很小但直接影响提速效果，建议一并处理。其余低级别项可以作为说明或后续改进。真实《诡秘之主》验证尚未执行，本审核不代表达到性能目标。
