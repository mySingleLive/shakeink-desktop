# 引用定位失败：分类纠正反馈方案与限定用例

2026-10-27。待110独立技术与用例审核。继续原M01草稿，不删除、不换来源、不改正文或已成功产物。

## 已证事实与边界

M01同session439f1633-9d21-40f5-9d8b-7f165cc66265的rev62已有outline1、character18、scene9，各覆盖25工作单元。rev63物品生成最终被invalid_schema拒绝，四个安全路径为artifacts.6.evidence.0、artifacts.16.evidence.1、artifacts.17.evidence.0、artifacts.25.evidence.0。runtime073296d6-0d3a-4e9a-9bbd-7d0af525a24a于19:49:51.272Z开始、19:52:30.787Z rejected。失败快照SHA afd45c3de96b8afbec865429a157fa84df41d1e769463c3d2027fd8ff6a36374已独占保存；原文23257及manual9、成功产物/覆盖保持。没有获得被拒输出，不认定实际为错单元、改字、拼接、短引文或歧义，也不反推29/41角色失败根因。

已读service：requestedEvidence调用实际anchorEvidence，但无论unknown-unit、too-short、ambiguous或no-match，都给同一句泛化纠正。generic generateJSON原本最多两次生成（一次纠正），本次不改变次数。现有精确匹配接受短引文；只有需要恢复排版的非精确引文才要求至少8个非空白字符且唯一命中。不能为绕过失败跨单元查找、更换unitId、改引文文字、忽略证据或删掉有据资料。

## 最小实现

只改desktop/service/novel-import-ai.ts，测试在tests/unit/novel-import-request-schema.test.ts追加NI-J10，并仅更新NI-J03已列明的泛化提示字面量前提；UI/payload/main/generic生成/工作单元/预算/发布不改。

引入模块内部的固定reason类型与Error子类，reason只允许现有四值unknown-unit、too-short、ambiguous、no-match。anchorEvidence原有所有判断顺序/匹配算法/quote返回值/中文Error.message保持字节不变；原fail改抛该内部类型，reason不从输入或Error.message解析。不得增加外部接口或保留raw值。

仅在原requestedEvidence.superRefine中，实际内部错误映射为四条固定中文纠正信息；其它意外异常仍按原静态泛化文案拒绝，不把异常内容回显。范围沿用现有semanticVersion1、普通analyze、所有实际目标种类的request-bound证据校验；legacy、reconcile、review/classify/patch不受新反馈影响。不是扩大schema接受集。

固定反馈须说明：

- unknown-unit：unitId必须逐字取自本次输入单元，quote必须来自同一单元的text；不附真实ID列表。
- too-short：非精确引文的非空白字符不足8，不能进行排版恢复；重新从声明单元复制连续原文，保留换行、空格、标点；精确存在的短引文仍允许。不声称已搜索证明不唯一，不谎称全部短引文禁止。
- ambiguous：排版恢复有多个命中；复制声明单元内可定位的连续原文，保留原排版，必要时加原文上下文；不随机选一个位置。
- no-match：在声明单元找不到；核对unitId与quote配对，并从该单元text原样复制，不概述、跨单元、拼接或改字标点。

所有反馈为固定常量，单条不超过160字符，避免原generateJSON每条250字符裁剪；不含源文、名称、ID、endpoint、未知key或异常message。保留原字段路径供已有一次纠正定位。无新的最终产品提示/UI设计；最终失败仍按现有安全门处理。

## NI-J10限定TDD

先冻结当前service c1bc6dc6、Jtest2dc40c44和控制hash，在真实旧service上执行新增J10得到RED，随后实现。首轮独审EF-TR01已据代码确认：旧NI-J03有两处issues.message严格等于generic guidance的前提，不能和本次细化同时保持。仅预批这两处分别改为四reason固定映射（literal acceptance循环按item.error，逐entry unknown-unit按固定文案）；原guidance可作为所有新文案共同前缀，原feedback.includes(guidance)保持。两处是旧的数组message严格断言，不是接受集断言。保留全部旧case、路径、接受/拒绝、晚门、不泄漏、次数及输入不变断言；其它J01–09字节保持，J03除上述两处及为它们提供的固定测试映射常量不变。不得测试特判生产逻辑、删断言、修改其它旧夹具或以新测试替代旧安全用例。

1. 使用真实生产generateImportAiJson→真实generateJSON→既有generateText DI，分别构造四个可实际触发matcher原因的合成样本；首坏后好恰2次，纠正反馈有对应固定原因，不带输入值；第二次仍坏恰2次后拒绝，无第三次。通过runImportAi的晚门输出仍为精确原文。
2. 精确短引文、CRLF/汉字排版恢复、Latin词边界、补充平面汉字的既有允许集合保持；unknown单元、跨单元、非唯一排版匹配、改大小写/简繁/标点、拼接/补字仍拒。输入请求和raw结果逐对象不改，不重定向unitId，不静默替换引文内容（允许的原排版恢复仍按旧算法）。
3. 原ordinary analyze各12目标的证据schema均得到相同静态原因；kind自身资料约束仍照旧。legacy/review/reconcile/classify/patch不进入新反馈；只验本次证据路径，不伪造这些阶段的完整业务通过。
4. 合成secret/换行/引号/未知单元ID/endpoint及源文不进入纠正追加部分；同一坏结果最终仍错误，预算reserve和Abort身份保持。
5. 运行新增J10与相关J01–09，以及NI-A03/A06实际晚门旧回归，均0skip；必要类型与desktop构建。禁止全量测试，UI未改不重复Next构建。

命令：`node --import tsx --test --test-name-pattern='^NI-J(?:0[1-9]|10):' tests/unit/novel-import-request-schema.test.ts`；`node --import tsx --test --test-name-pattern='^NI-A0[36]:' tests/unit/novel-import-ai.test.ts`。

## 真实重测

110技术/用例审核与111代码审核通过后正常退出、构建、重开同一M01；保留原source/body/manual9/workingUnits/全部已成功产物/coverage/预算/目标及目录身份，对原目标按现有UI重新授权。只恢复首个未完成item一次，不重抽角色或场景，不修改journal或注入grant。若仍失败保留新失败并据证据另作决策，不把本次反馈完善称为实际根因已修。若成功继续剩余类别和最终独立文学审核；已知大纲与角色/场景遗漏保留到最终对照，不把机械成功计文学PASS。
