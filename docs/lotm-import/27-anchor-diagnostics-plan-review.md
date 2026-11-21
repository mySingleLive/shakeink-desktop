# 连续证据失败诊断方案独立审核

日期：2026-10-28。审核范围为 [26-anchor-diagnostics-plan.md](/Users/dt_flys/Projects/shakeink-desktop/docs/lotm-import/26-anchor-diagnostics-plan.md) 与必要源码、现有定向用例；未实施、运行测试、操作应用或查看模型输出、运行 DB/journal。

**结论：方向有条件通过。**只输出固定诊断计数且不影响严格证据接纳的方案可用于定位失败；下列约束需补入方案及定向用例后再进入 RED。没有批准立即停止当前有界运行或为诊断重建。主代理报告的连续二分及十分钟进度停留能说明现有可见性不足，尚不能独立证明失败原因，也不证明当前流程一定无法继续；若流程先取得有效进展，应重新评估本次诊断的必要性。

## 与现有契约的衔接

- [novel-import-ai.ts:65](/Users/dt_flys/Projects/shakeink-desktop/desktop/service/novel-import-ai.ts:65) 的分类边界是 semanticVersion=1、analyze、非 reconcile；完整 `ctx.issues` 只有在全部属于四类固定 evidence custom issue 时才能获得纯证据归因。诊断应复用这一边界，不扩大到 review/classify/reconcile/legacy 或任意相似错误消息。
- [novel-import-ai.ts:84](/Users/dt_flys/Projects/shakeink-desktop/desktop/service/novel-import-ai.ts:84) 目前改写同一 `StructuredGenerationError` 的 message 后重抛，控制器据此识别严格二分。所谓保持原错误，应以**启用诊断前现有桥接行为**为基准，不应移除这一既有改写，也不将诊断分类变成新 message、错误属性或 RPC 字段。
- [generate.ts:188](/Users/dt_flys/Projects/shakeink-desktop/src/lib/ai/generate.ts:188) 允许两次生成；[generate.ts:235](/Users/dt_flys/Projects/shakeink-desktop/src/lib/ai/generate.ts:235) 对同次输出又可能解析多个候选。不能在 schema 回调内直接输出，否则同一错误会重复计数，首次失败随后成功也可能留下误导诊断。`invalidFields`/feedback 只保留前六条，不足以判断全体纯证据。
- [novel-import-ai.ts:187](/Users/dt_flys/Projects/shakeink-desktop/desktop/service/novel-import-ai.ts:187) 的权威 matcher 保留精确短引文，并只允许受限、唯一的排版恢复。诊断的原样字符串检索不是接纳器，不能替换或重复实现出另一套“通过”标准。
- [novel-import.ts:55](/Users/dt_flys/Projects/shakeink-desktop/desktop/shared/novel-import.ts:55) 的 ImportUnit 使用 fileId/start/end/text；连续性不能从动态 id 字符串或数组索引推导。

## 必需补充边界

### 1. 明确启用条件、输出结构和时机

实现前冻结具体日志前缀、全部固定字段、枚举、每个整数上限及单条字节上限。输出应要求显式诊断开关与明确隔离测试根同时成立；仅开发模式、`NODE_ENV=test` 或有模型配置不应启用。现有隔离根入口是 [index.ts:78](/Users/dt_flys/Projects/shakeink-desktop/desktop/main/index.ts:78) 的 `SHAKEINK_TEST_ROOT`，诊断不得打印根路径。真实启用时由主代理将进程日志放在本 run 私有目录，不增加日志路径参数、文件读写设施或通用日志框架。

建议每次桥接调用只在最终拒绝且满足既有纯证据分支时输出最多一条；保存最后一次有效完整 parse 的本地候选计数，重新生成和每次 parse 开始均清空。最终成功、取消、不完整输出、无 JSON、混合 schema issue、网络错误均不输出纯证据记录。只从本次请求和该最终失败 parse 临时取得所需数据，不把原值挂到错误、请求、结果或模块全局。

### 2. 精确定义次级分类，不作因果诊断

四类主原因可分别计数；“唯一其它单元命中”和“跨界候选”只是原样文字位置现象，不能据此宣称模型失败已查明或引文事实正确。

- 唯一其它单元命中应明确为本次其它单元中仅一个原样命中位置；同一单元多次命中或多个单元各命中，不算唯一。没有本批全部范围就不能外推至全文。
- 跨界检测只针对本批中同 fileId、UTF-16 offset 连续的两个单元。先验证 offset 为非负安全整数、`end-start===text.length`、前 end 等于后 start；严格原样拼接后，命中区间必须真正横跨接缝，不能把落在一侧的命中误报跨界。
- 不同 fileId、间隙、重叠、倒序、offset/text 长度不符均不得算连续。补充平面字符必须按 JS UTF-16 边界计算，不能按 Unicode 字符个数替换 offset。
- 冻结计数是否互斥及优先级，避免同一条证据被其它单元与跨界重复算作两个失败。无法唯一定位或未达到检查预算时保留未分类/截断计数，不能猜测。
- 所有次级检索仅 literal 字符串；不用排版归一化、模糊相似度、错字/标点修复，也不回写 quote/unitId 或额外给模型反馈。

### 3. 日志有界之外，附加工作也须有界

固定整数上限不能单独约束逐 evidence 扫全批正文的工作量。需冻结最多检查的 issue 数和附加检索预算，达到上限只计截断/未分类，不加请求、不延长重试、不中断权威校验。首先检查启用与最终错误条件，再做附加检索。诊断解析/序列化/写日志失败均被本地吞掉，不能替换原异常；无需扩展为通用故障隔离框架。

## 定向用例补全

26 的 DIAG01..05 足以承载本次范围，不需要扩大生产文件范围；至少补入以下明确断言：

| 原用例 | 必需具体反例/断言 |
| --- | --- |
| DIAG01 | 两开关条件的真值组合；首轮证据失败次轮成功；review/classify/reconcile/legacy；同最终输出多候选 parse 不重复记。 |
| DIAG02 | 四种主原因；其它单元一处/同单元两处/两个单元各一处；真正 straddle 与只命中一侧；不同文件、gap、overlap、倒序、长度不符及 UTF-16 补充平面字符。开启前后错误对象/既有 message/kind/invalidFields/feedback 相同，原请求/响应不变。 |
| DIAG03 | 将秘密样本分别放进原文、quote、unitId/fileId、artifact 名称、配置、动态 issue path/message；输出严格等于固定键集合、枚举及范围内整数，字节上限固定，无额外属性/原文/hash。 |
| DIAG04 | 前六条纯证据而第七条混合或类型 abort；首轮纯证据后次轮 invalid JSON/incomplete/网络异常/取消；大量 issue 截断；附加检索或 logger 抛错仍重抛同一原错误且不新增调用。 |
| DIAG05 | 通过真实 `generateImportAiJson` 边界及原 E01/E04 必需分支验证两次生成上限、严格错误类型/二分白名单、失败无产物/coverage；不以只测独立计数 helper 替代。 |

现有 [novel-import-evidence-batches.test.ts:29](/Users/dt_flys/Projects/shakeink-desktop/tests/unit/novel-import-evidence-batches.test.ts:29) 已具完整 issue、混合、第七条类型中止、新轮清空、取消和 RPC 约束，可作为最小回归依据；本次未运行这些测试。按补全后的方案先实际 RED，再最小 GREEN 和独立 code review。合成计数测试通过只能证明诊断边界，不能消除首叶语义错误或证明全书导入通过。

## 补充复审

已只读复核 26 新增的“27独审后的冻结补充”：双启用门、最终失败一次输出、严格 JSON 键与 768 字节上限、计数饱和、100 issue/2,000 UTF-16 quote/2,000,000 搜索位置上限、未完成检索不得宣称唯一、相邻几何、互斥分类及吞诊断异常均已具体化，原条件已解除。**方案与 DIAG01..05 可进入 RED/TDD；实际实施及重建必要性仍由当前有界运行结果决定。**主代理新报告又接纳一叶，故不能将本次复审解释为立即中断现有运行的要求。此处仍无实施或测试执行结论。
