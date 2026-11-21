# 结构化流缓冲用例独立审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。已先通过287方案独审，再审核288；未参与实现或测试编写，未读取真实数据或调用API。

**SB01—04设计通过，可以开始RED。** 关键是证明真实SDK不再解析未完成前缀，同时最终业务接受集合与普通文本路径保持。

- **SB01**：使用真实streamText和MockLanguageModelV4，提供大量小delta，不用单个完整text-delta或直接调用替代parser。计数包装只识别已知合成JSON的真实未完成前缀，并委托原JSON.parse，保持原参数、返回及异常；不能把正常SSE/元数据解析次数误当部分对象解析。try/finally精确恢复全局函数并隔离并发污染。旧代码须反复解析前缀，修后前缀计数归零；最终完整候选的解析有界，不强求所有JSON.parse总数归零。
- 同时核对实际doStream responseFormat/schema与原maxOutputTokens、最终原text、token/成本，以及仅一次真实usage回调。其它Output字段保持可由实现的原对象展开和实际SDK出站/完整接受共同核对，不以手工伪造输出格式代替。
- **SB02**：完整可解析但不符合业务Zod的JSON仍拒绝，并观察既有一次纠错及持续非法两次上限；最终坏JSON同样拒绝。完整、业务合法的JSON但finishReason=length也必须失败，防止只测半截JSON时被解析错误提前拒绝。不得新增外层重试或忽略供应商错误。
- **SB03**：大体量中文/非BMP及全部场景text/facts/引文等字段逐值完整保留；至少分别测试正常text-end及缺text-end但正常finish-step的SDK收尾，证明两个缓冲刷新分支。普通无jsonOutputSchema模式保持原text responseFormat、分块及预览；不能只验证最终拼接相同而漏掉普通预览退化。
- **SB04**：在中途、尚未text-end/正常finish时取消，观察原Abort身份、一次模型调用、无成功返回及该路径不错误记录完成用量。不要把“中途取消”泛化为改变已实际完成模型调用的原计费政策。保留原供应商错误及最终授权/快照/typed/evidence门的受影响回归，不绕过真实生成桥。

不使用provider或真实书稿，不修改SDK，不把Mock分块大小或合成用量称作真实供应商内存效果；不运行全仓测试。修复后真实全书内存可用另行独审的只读worker数值观察，仍须完整场景、复核、发布、正常重开及快照一致性通过。本文只批准测试设计，未执行新增用例或认证OOM已解决。
