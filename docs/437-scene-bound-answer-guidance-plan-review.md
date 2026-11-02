# 437 独立方案审核

结论：通过，可按 438 完成独审后开始 TDD。范围仅 provider 显示投影和原拒绝后的安全指导，不涉及新的协议接受分支、Native/strict 模式、解码或来源规则。

审核版本：`437-scene-bound-answer-guidance-brief.md`，SHA256 `c51da6ba41cd705bc66516213c2d44431f7b7b2bde436b16e88f74b161cc0387`。

源码依据：`novel-import-ai.ts` 的 active answers 解码/record/apply catch 共用旧 repairs/choiceRef 指导，而最终 bound 提示要求 answers；共享 choices 已有显号，tasks/options 没有。显式 answerNumber 及 `[optionNumber,完整 assignment]` 只投影现有冻结表，可消除两套数域的隐式下标，不重排、裁剪或预选任何来源/方案。

独立 0API 重构 R61 的 27 请求/60 代，所有实际 prompt SHA 匹配、20 接受/7 拒；31 个 bound 提示中 16 个含旧 repairs 强指导。按**实际 parseJsonOutput** 路径，两个事务各三代首先数量不符，共 6 代；早先仅直接 JSON.parse 的统计漏掉 fenced 候选，不能用于归因。潜在类型/局部与共享编号问题没有越过数量首门，不称这些都是实际首因，更不声称解释全部七包。

新诊断只能在原严格门已经拒绝后，依据可信冻结表输出最多六项闭合任务/count/type/range/三种 replacement 指导；原 root shape 门先于 decode，count 先失败时只报 count。不得回显错误键/值/引用或自动补齐、截断、挪位。旧 repairs 显式兼容分支保持原反馈，active 的其它错误 root 指导 answers；原来源/保留/owner 安全反馈继续保留，UI 只精确识别可信指导类别。

编号新增字节和反馈必须完整计原预算，包括原草稿/current/keep/全部目录。130 首轮及 R46/R47/R61 新提示重算不再声称旧 SHA 相同；70/20 只是同捕获回复下的本地规则回归，不是新模型效果。原四代、模型、权限、来源/保留/owner 及所有最终门不变。独立代码审核与新构建 fresh 全文仍必需。

私有诊断标量保存在隔离目录 0600，正文不进仓库或公开报告。本审核未改产品/测试、未运行 App/API。

replacement 指导窄补审通过：当前 437 SHA256 `9101dba6c9208a8ed46d605b9c91522a3c3d2cd2ac2d6cbff41a38839c01bf79`。新增段准确维持原结构：mention.evidence 是单个 `{choice:共享号}` 对象，context/link.evidence 是非空对象数组；旧 ref、mention 数组、缺三数组及未知字段仍由原门拒绝，不能自动展开、合并或补齐。所述九次 strict-record 首拒的 6/1/2 细分来自同轮精确 guard 诊断，不把后置 source/retention/owner 当已触达首因。变化仅为既有结构的固定指导，非新协议或 gate 放宽；原准入结论维持。
