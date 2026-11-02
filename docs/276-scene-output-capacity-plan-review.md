# 场景输出容量方案独立审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。审核276及公开脱敏`r16-finish-diagnostic.json`，核对现有生成桥和DeepSeek官方文档；未读取真实小说、配置、Key或私有checkpoint，未调用模型，未参与实现。

**方案通过，可继续用例独审及RED。** 公开记录显示同范围只读观测首轮length/output8192、第二轮stop/output832且完整artifact通过；这支持针对已观测输出截断增加显式容量，但不能把第二轮局部成功或该计数推断为整书成功、全部接口固定默认值或所有incomplete的唯一原因。

[Responses接口文档](https://api-docs.deepseek.com/api/create-response/)明确支持max_output_tokens，并说明其覆盖可见输出和推理token；[模型规格](https://api-docs.deepseek.com/quick_start/pricing/)当前列出最大输出384K。32768处于该范围内，且既有eligible scene适配已关闭思考；无需改变授权出口、模型、端点或保存配置。

实施须保持：

- 仅既有eligible严格scene/entity合同显式增加输出上限，不扩大到review阶段、其它模型/供应商、其它端点或普通生成。generic生成的可选参数未提供时不新增SDK参数。
- 能力与预算取本次实际role对应pin，不能重新固定为text，或用官方标称1M代替较小的实际配置。容量不可用、非有限值或不是有效正整数时不增加额度。
- 计算完整contract.prompt及JSON.stringify(jsonSchema)的UTF-8字节数，再加既有JSON wrapper/correction预留和32768输出token，只有总和不超过实际contextWindow才设置32768。这里采用字节作为保守输入token估计，并沿用预留覆盖纠错及包装；不能仅统计正文或使用UTF-16 length漏掉中文/非BMP开销。
- 不足空间时保留原默认请求参数；不裁units、目录、别名、证据、正文或facts，不缩减原输入预算来腾空间。原追加schema/index预算和固定提示预留检查也继续执行，不能用新检查替代。
- 上限应经原generateJSON两次生成保持一致到SDK，并由真实Responses出站测试确认max_output_tokens；不能仅检查服务层options。原finishReason检查保留，length或其它未完整结束即使包含可解析完整JSON也不能成功。
- 不增加网络或结构重试、不把原本两次incomplete失败扩展为新的外层恢复，不改变原schema/canonical/身份/证据/末端授权和保存取消门。额度只允许更长的合法输出，不是绕过结束或业务校验的依据。

R16仍应记录为913候选、859项完成后失败且未发布，不能叠加R15成绩。后续先完成独审/TDD/定向检查，再实际只读验证出站上限和完整结果，最后由新会话完成全文场景、完整复核、发布及正常重开验收。本审核仅批准方案，未认证真实修复效果。
