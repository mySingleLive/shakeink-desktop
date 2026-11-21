# 522 · 导入 token 消耗与缓存命中率优化方案

日期：2026-11-07。用户要求：
1. 降低导入流程 token 消耗；DeepSeek 后台 2026-11-04 输入命中缓存 356,715,612、未命中 166,513,077（命中率约 68%），要求 ≥90%。
2. 场景识别/导入必须成功；识别或导入失败自动重试三次（作者层面：驱动遇失败点“重新识别/重试”最多 3 次）。
3. 按顺序分三步，每步独立验收；某步质量不达标即回退为保守版本。

真实验证用《诡秘之主》第一卷（小丑，213 章，760 个工作单元，741,017 字），隔离根 `/private/tmp/shakeink-scene-import-486/app-data-parentfix-vol1-r3`。

## 0. 离线测量（本地失败会话，只计长度，不调用模型）

| 阶段（第一批 81,749 字正文） | 提示词字符 | 正文前的固定前缀 | 载荷首 60 字符 |
| --- | --- | --- | --- |
| 角色 roster | 99,072 | 3,636 | `{"phase":"analyze","kind":"character","units":…` |
| 场景 roster | 583,886 | 2,471 | `{"phase":"analyze","kind":"scene","units":…` |
| 物品 roster | 99,337 | 3,906 | `{"phase":"analyze","kind":"item",…` |
| 世界观 | 100,109 | 4,695 | `{"phase":"analyze","kind":"world",…` |

全卷场景片段表：81,509 片，平均 9.1 字/片，JSON 4,938,911 字符（正文的 6.7 倍）；每片 `{"index","text","ref":"ef"+16hex}`。

结论：(a) 场景 roster 输入膨胀是最大的单项浪费；(b) 各阶段提示词首字节即不同（阶段说明在前、载荷首字段是 kind），同一正文在 ≥10 个阶段重复发送却无法跨阶段命中前缀缓存；(c) 现有命中主要来自同一请求的纠错代次（前缀不变、末尾追加 correction）。

## 1. 第一步：真实用量记录（零行为变化）

目的：拿到逐调用、逐阶段的真实命中/未命中 token，作为第二、三步的基线与验收口径，取代估算。

（已按 `522-import-token-cache-plan-review.md` 修订：1 高、2–4 中、5–10 低。）

1. `src/lib/ai/generate.ts`（只改 `GenerateResult`，`GenerateJSONResult` 不变——审核 6）
   - `GenerateResult` 增加可选 `cacheReadTokens?:number`、`noCacheTokens?:number`。读取点：`stream.usage`（导入调用均为单步，等于 `totalUsage`；如将来多步改读 `totalUsage`——审核 4）。
   - 取值优先 `stream.providerMetadata.deepseek.promptCacheHitTokens/promptCacheMissTokens`（未报告时为 undefined）；没有该元数据时退回 `usage.inputTokenDetails.cacheReadTokens/noCacheTokens`（DeepSeek/OpenAI SDK 未报告时会给 0，此时 0 只表示“可能未报告”——审核 2）。另加 `cacheSource:'provider'|'sdk'` 标注来源。
   - 字段只在有数值时写入对象，不写 `undefined` 键（strict 断言——审核 5）。
   - `promptTokens`、`completionTokens`、`cost`、`recordUsage` 入参与计费不变。
2. `desktop/service/novel-import-ai.ts` `generateImportAiJson`
   - 仅当 `SHAKEINK_IMPORT_DEBUG==='1'` 时安装观察器；关闭时不安装，行为逐字节不变（审核 7）。
   - 观察器包在**原始** `deps?.generateText ?? generateText` 调用外（ordinary 包装内部、`:688` 处；非 ordinary 路径同样包原始调用），每个**返回**的代次都记一行，包括 `finishReason` 为 `length` 等随后被判 `incomplete` 的代次（审核 1）。`generateText` 自身抛错（网络重试耗尽、流错误、取消）的代次不可观测，不记录；其计费差额由真实对账反映（审核 3）。
   - 行格式：`import-usage {"op","phase","intent","kind","mode","lane","generation","inputTokens","cacheReadTokens","noCacheTokens","cacheSource","outputTokens","promptChars","schemaChars","finishReason"}`。`op` 为每次 `generateImportAiJson` 调用的随机 8 位十六进制，用于把并发交错的代次归组；`generation` 由观察器自行计数（审核 7、9）。
   - `phase/intent/kind/mode/lane/finishReason` 经白名单映射，非白名单值记 `'?'`；整行上限 768 字节（审核 8）。只含枚举与计数；不含提示词、正文、名称、模型 id、Key 或供应商原始错误。
3. 私有驱动（不入库）：`/private/tmp/shakeink-cache-522/`，复制 `shakeink-world-503/run-world.mjs` 全流程（角色→场景→物品→世界观，第一卷），`SHAKEINK_IMPORT_DEBUG=1`；结束后汇总 `import-usage` 行为 `evidence/<label>/token-usage.json`（按 phase/intent/kind/mode 分组的调用数、输入、命中、未命中、输出、命中率，并单列 `cacheSource` 与未完成代次）。识别/导入步骤失败时点“重新识别/重试”，最多 3 次，每次记录。

验收（第一步）：单元用例全过；全量 `npm test` 无新增失败；真实基线跑通并产出 `token-usage.json`（若场景仍失败，记录失败与已用 token，作为基线照实保存）。**对账（审核 3）：** 记录驱动运行起止时间，请用户核对 DeepSeek 后台同时段的输入/命中/未命中增量，与日志合计比较并记录差额（隔离测试期间不应有其他调用）。此步不改变任何提示词或分批，质量不受影响，无需回退方案。

第二、三步审核风险（11、12）：第二步须先由第一步数据证明跨阶段复用可行；防注入声明保持在最前（公共头内）；共享块须满足最小阶段预算；纠错“前缀不变+末尾追加”的模式保留；首波并行同前缀可能未命中，需按实测决定是否先串行首批。第三步旧会话按旧策略版本解析。

## 2. 第二步：统一请求前缀（依第一步数据细化，另出修订）

方向：所有走正文的导入请求改为「全阶段逐字节相同的公共头（含不可信资料/防注入声明）+ 本批正文块」开头，阶段说明、目录/上下文、输出契约置后；分批改为与阶段无关的规范块（按章边界、固定上限），使同一块在后续阶段命中前缀。新预算策略版本承载该分批，旧会话沿用旧策略。

验收：第一卷全流程实测命中率 ≥90%（或接近且给出剩余未命中构成）；各阶段结果数量（角色/场景/物品/世界观条目数）与证据拒绝/纠错次数不劣于第一步基线（允许 ±5% 波动，超出即回退到“仅公共头前置、分批不变”的保守版本）。

## 3. 第三步：场景片段压缩（依第二步结果细化，另出修订）

方向：每单元原文只发一次，片段边界用紧凑标记；保留“未知引用直接拒绝”的严格恢复。保守版本：保留不透明 ref、只删冗余字段（`index`、重复元数据）并缩短 ref。

验收：场景识别成功；场景数、证据拒绝率、纠错代次不劣于第二步；输入 token 显著下降。否则采用保守版本。

## 4. 不改

字段契约与严格校验、证据规则、发布映射、暂停/重试语义、计费口径、非导入调用。真实数据与 Key 不进入源码、日志或证据。
