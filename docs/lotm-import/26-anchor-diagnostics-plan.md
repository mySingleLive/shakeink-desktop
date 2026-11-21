# 连续证据失败的安全诊断方案与定向用例

日期：2026-10-28。状态：待独立审核，尚未实施；不更改证据接纳规则。B3真实运行在同一未完成大纲范围反复二分，从19:00:03至19:10:03仍只有此前23单元/1产物。只有输入窗口变小无法说明究竟是单元配对、跨边界引用还是文字错误。等待现有有界流程终止或取得更多实际结果，不先把任何原因写成事实。

## 最小方案

只在明确隔离测试环境且发生既有四类严格证据校验失败时，向私有运行日志输出固定字段和整数计数，帮助后续真实复测定位。普通安装环境不输出，不增加任何外发。候选范围为desktop/service/novel-import-ai.ts和专用定向测试；不改生成器、RPC协议、预算、请求排序、来源、章界、正文、schema、错误类型/原message及控制器二分白名单。

诊断只读本次原请求及完整已解析schema issues，不记录或输出原文、模型回复、quote、unitId、实体ID/名字、配置、Key、自由错误消息或hash。输出阶段/目标使用既定枚举，字段固定，数字有界。诊断不能改变parse结果、异常身份或被接纳数据；诊断失败自身不得替换原错误。每次模型重新生成清空临时状态，取消/未知/混合错误不冒充纯证据问题。

建议分类仅帮助后续研究：未知unitId、声明单元存在但无法定位；其中再标记quote是否逐字唯一存在于本次其它单元、是否逐字跨本次相邻且源文件相同/offset连续的单元。分类结果不自动修复或重定向证据，不进行模糊匹配、补字、删字、跨来源拼接或放宽引文规则。未能严格识别时记未分类计数。相邻连续性的判定必须使用当前真实ImportUnit定义和UTF16offset，不能只凭数组相邻。

## 定向用例（仅本次诊断必要范围）

| ID | 条件 | 预期 |
|---|---|---|
| LOTM-DIAG01 | 普通环境/成功响应/无关schema错误/取消 | 无诊断或不进入纯证据分类，不影响旧结果 |
| LOTM-DIAG02 | 纯证据失败，包含唯一其它单元逐字命中、合法连续跨界候选、均无命中 | 计数准确；旧错误仍同实例、同message/kind/invalidFields/feedback；无接纳、无coverage |
| LOTM-DIAG03 | 输入含诱导文字、秘密样本和动态ID/配置/自由消息 | 日志仅固定常量、枚举和有界整数，不含样本文本/ID/Key；最多固定长度 |
| LOTM-DIAG04 | 多次生成/混合错误/类型abort/过多issue/诊断内部失败 | 无陈旧状态泄漏，不误报纯证据，原错误/取消行为保持 |
| LOTM-DIAG05 | 真正导入生成边界回归 | 原E01等严格接纳/二分用例仍过；不得用诊断输出将无效产物导入 |

先独立审核方案/用例，再RED→最小实现→独立代码审核→定向验证。合成诊断GREEN不抵扣真实全书导入或语义错误修复。若现有实际流程先通过可评估取消此轮，不为加入诊断而丢弃有效进度。

## 27独审后的冻结补充（尚未实施）

- 启用门必须同时满足`SHAKEINK_IMPORT_ANCHOR_DIAGNOSTICS=1`和非空绝对`SHAKEINK_TEST_ROOT`；不能仅NODE_ENV或仅其一。进程日志仍由主代理重定向到本run私有目录，代码不新增路径参数或文件写入。
- 仅既有ordinary语义analyze、非reconcile、未取消、最终StructuredGenerationError/invalid_schema且完整issues全部为当前四类精确custom证据错误，桥接调用最多输出1条。首轮失败后二轮成功不输出；schema每次preprocess与每次新生成开始清空。多候选parse只保留最终失败候选；其它阶段/混合/abort/无JSON/不完整/网络异常无诊断。
- 固定前缀`[novel-import-anchor-diagnostics] `，JSON固定键：`version:1, kind:<ImportTarget enum>, issues, inspected, unknownUnit, tooShort, ambiguous, noMatch, otherUnitUnique, adjacentBoundaryUnique, unclassified, truncated`。除kind与version之外全部为0..1000安全整数，不增加属性、原值或hash，整行UTF8不超过768字节。issues为完整问题数饱和至1000，最多检查前100条，其余计truncated；主原因分别计数，次级分类互斥。
- 次级只针对unknown-unit/no-match进行原样位置检索，优先唯一其它单元位置，其次唯一合法相邻跨界位置，否则unclassified；同一单元多次或多单元多次、或多个cross位置均不算唯一。其余too-short/ambiguous不据诊断尝试恢复，保持unclassified。附加扫描按字符串长度计预算，总计最多2,000,000个UTF16搜索位置；单quote上限2000 UTF16，超出或预算不足计truncated/unclassified，不能将未完整检索结果报unique。
- 相邻需在本次原数组中、同fileId、非负safe整型start/end、end-start严格等于text.length、左end严格等于右start；跨界位置须start<左text.length且start+quote.length>左text.length。不同file/gap/overlap/倒序/长度不符一概不算；JS UTF16不替换成Unicode codepoint计数。只查两单元的合法边界候选，不扫任意多单元或其它来源。
- 不改变任何原请求、响应、单位、schema、接纳规则、错误message/instance/kind/invalidFields/feedback、RPC和控制器白名单，不新增请求。诊断计算、JSON编码或logger自身失败本地吞掉，仍重抛启用前既有同一原错误。
- DIAG01..05补入27表中的全部真值/重生成/多候选/混合第七条/取消/secret样本/严格键集合和字节上限/位置唯一/非法几何/UTF16/饱和计数/扫描预算/logger失败反例；通过真实生成边界与E01/E04直接必要回归，不只测helper。若实际流程先取得有效进展，再评估是否仍需要实施和重建，不能为诊断丢弃有效进度。
