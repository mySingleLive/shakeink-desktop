# 523 · 导入真实用量记录用例（522 第一步）

依据 `522-import-token-cache-plan.md` §1（已按 `522-import-token-cache-plan-review.md` 修订）。合成数据，不含真实正文或 Key。单元测试文件：`tests/unit/novel-import-token-usage.test.ts`。

| 编号 | 场景 | 期望 |
| --- | --- | --- |
| TU-01 | `generateText` 走真实 SDK（Mock 模型），finish 报告 `inputTokens{total:100,noCache:30,cacheRead:70}` 且 `providerMetadata.deepseek{promptCacheHitTokens:70,promptCacheMissTokens:30}` | 返回 `promptTokens:100`、`cacheReadTokens:70`、`noCacheTokens:30`、`cacheSource:'provider'`；`recordUsage` 入参键集合与改动前相同且 `promptTokens===100`。 |
| TU-02 | 无 deepseek providerMetadata，SDK usage 报告 `cacheRead:40,noCache:60` | `cacheReadTokens:40`、`noCacheTokens:60`、`cacheSource:'sdk'`。 |
| TU-03 | 无 providerMetadata，SDK usage 的 `cacheRead/noCache` 为 undefined | 返回对象不含 `cacheReadTokens`/`noCacheTokens`/`cacheSource` 键（`Object.hasOwn` 为 false）；其余字段与改动前一致。 |
| TU-04 | `generateJSON` 结果 | `GenerateJSONResult` 键集合不变（不含缓存字段）。 |
| TU-05 | `SHAKEINK_IMPORT_DEBUG=1`，`generateImportAiJson` 角色 roster 请求一代成功（注入 `deps.generateText` 返回带缓存字段的结果） | stderr 恰一行 `import-usage `+JSON；键集合恰为 `op,phase,intent,kind,mode,lane,generation,inputTokens,cacheReadTokens,noCacheTokens,cacheSource,outputTokens,promptChars,schemaChars,finishReason`；`phase:'analyze'`、`intent:'roster'`、`kind:'character'`、`generation:1`、`op` 匹配 `^[0-9a-f]{8}$`；数值与注入结果一致；`promptChars` 等于实际发送提示词长度。 |
| TU-06 | 同一请求首代 `finishReason:'length'`（ordinary 包装随后判 incomplete）、纠错后成功 | 两行，同一 `op`，`generation` 依次 1、2；第一行 `finishReason:'length'`，计数与注入一致。 |
| TU-07 | 场景 roster（`sceneIdentity.mode:'roster'`）一代，原生 JSON schema | `mode:'roster'`；`schemaChars` 等于 `JSON.stringify(jsonOutputSchema).length`（无 schema 时为 0）。 |
| TU-08 | 两个 `generateImportAiJson` 并发 | 两组行 `op` 不同，各自 `generation` 从 1 计。 |
| TU-09 | 不泄露 | 提示词、正文、实体名、instruction 中各放唯一合成标记串及合成 Key 形态串；请求 `kind` 为非白名单串（含合成秘密）：任何 `import-usage` 行不含这些串，`kind` 记 `'?'`；每行 ≤768 字节。 |
| TU-10 | 调试关闭（未设置或 `'0'`） | 不写任何 `import-usage` 行；传给原 `generateText` 的参数与返回数据与开启时完全相同。 |
| TU-11 | 代次中 `generateText` 抛错（如 `模型接口请求失败（HTTP 500）`） | 不写该代次行；原错误信息不变。 |
| TU-12 | 未报告缓存的结果 | 该行 `cacheReadTokens:null`、`noCacheTokens:null`、`cacheSource:null`。 |
| TU-13 | 回归 | `novel-import-structured-scene`、`novel-import-ai`、`novel-import-request-schema`、`novel-import-scene-roster-*` 单元测试及全量 `npm test` 无新增失败；`npm run typecheck`（若有）通过。 |
| TU-02b | provider 元数据存在但字段缺失、单字段、负数/小数/NaN/字符串，或与 SDK 不一致 | 两字段均为有效非负整数才取 provider（以 provider 为准）；否则回退 sdk，SDK 给的 0 照写（审核 6）。 |
| TU-06a | 普通 analyze 首代 `length`（`generateJSON` 判 incomplete）后纠错成功 | 两行；第二行 `promptChars` 大于第一行（`promptChars` 定义为每代观察器收到的 `options.prompt.length`，`schemaChars` 为该代 `jsonOutputSchema` 序列化长度——审核 4）。 |
| TU-06b/c | 场景 roster（有 `rosterContract`，ordinary 包装在 `length` 时抛 incomplete）首代 `length`；以及每代都 `length` 直到用尽 | 不论最终成败，行数等于返回代次数，`generation` 为 1..N，同一 `op`，首行 `finishReason:'length'`、`mode:'roster'`（审核 1）。 |
| TU-08b | 受控交错：A1、B1、A2 | 按 `op` 分组后序列为 `[1,2]` 与 `[1]`（审核 8）。 |
| TU-09b | 注入 `finishReason:'weird-<秘密>'` | 生成确被调用；行内 `finishReason:'?'`，不含秘密（审核 3）。缺省的 `intent/mode/lane` 记 `null`。 |
| TU-11b | 取消、流错误、日志写入函数抛错 | 前两者不写行且原错误不变；写入函数抛错时生成结果不变（审核 10，代码审核 3）。 |
| TU-12b | finish 的 usage 全为 undefined | `recordUsage` 0 次；无缓存键；行内 `inputTokens:0`、`outputTokens:0`、`cacheSource:null`（审核 5）。 |
| TU-14 | 非 ordinary 路径（旧版 classify）：注入 deps 与不注入（真实 `generateText`+Mock 模型带 DeepSeek 元数据）；调试值 `undefined/'0'/'true'/' 1'` | 开启时各恰一行，`phase:'classify'`，真实路径计数取自 provider；其余调试值均视为关闭、0 行（审核 2、9，代码审核 2）。 |
| TU-REAL | 真实基线（私有驱动 `/private/tmp/shakeink-cache-522/launch-cache.mjs <label>`，第一卷，角色→场景→物品→世界观） | 步骤/任务失败自动“重新识别/重试”≤3 次；产出 `token-usage.json`（逐阶段调用数、输入/命中/未命中/输出、命中率、cacheSource 分布、非 stop 代次）；记录起止时间；`token-usage.json` 含日志合计（输入/命中/未命中/输出）；DeepSeek 后台同时段增量由用户核对后补录，未核对前标“待对账”，不标通过；源基线根 `app-data-parentfix-vol1-r3` 的 `state.json` 哈希不变；证据不含正文与 Key。 |

审核修订：`523-import-token-usage-cases-review.md` 发现 1–12 已并入上表（TU-02b/06a/06b/06c/08b/09b/11b/12b/14）；`524-import-token-usage-code-review.md` 发现 1–3 已修（场景 roster 截断集成用例、非 ordinary 集成用例、行构造移入 try），4 在 TU-05 注明使用普通 analyze 请求，5 加注释，6 由汇总只认 `cacheSource:'provider'` 处理。
