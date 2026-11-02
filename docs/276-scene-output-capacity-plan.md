# 场景结构化输出容量方案

日期：2026-10-31。R16新会话全1402章/5589单元、913候选，859项完成后1项在既有有限纠错内持续`incomplete`，正常driver2/Electron0、未发布。不能用R15阶段成绩代替本轮成功。

## 实际证据与原因

用原生产importEntity/requestSnapshot/预算方法从私有失败checkpoint重建14单元/913目录的同范围请求，隔离只读、同已授权DeepSeek接口，未记录原文/模型正文。使用实际generateText/JSON桥及原提取策略，仅观察白名单结束原因和token计数：首轮`length`、output=8192、textCharacters=12516；第二轮`stop`、output=832、textCharacters=1489，完整artifact通过所有门。配置不变、正常退出。此局部复测不是整书成功。

生成层未显式设置输出上限；当前响应实际在8192截断。[Responses接口](https://api-docs.deepseek.com/api/create-response/)支持max_output_tokens；[模型规格](https://api-docs.deepseek.com/quick_start/pricing/)给出允许输出上限384K。SDK仅在未完整结束时拒绝，不能把半截JSON当成功或删字段缩短输出。

## 最小改动

- 仅内部generateText/generateJSON增加可选maxOutputTokens参数，显式提供时传入SDK，未提供保持原默认行为；不修改模型保存设置或其它生成路径。
- 只有既有eligible结构化scene请求，且实际role模型配置容量能够容纳完整prompt/schema、既有JSON纠错wrapper预留及32768输出token时，显式设置32768。用UTF8字节作保守输入token上界；不裁units/目录/资料/证据、不缩文本。能力scope仍为既有严格DeepSeek模型/官方root/semantic scene entity，不扩其它阶段/供应商。
- 不足以安全增加时保留原请求默认参数。不得把输入预算降低、重分片、场景取消勾选或清空有据字段当作输出容量修复。现有JSON/schema/原生/身份/证据/末端授权、两请求四生成上限、31路/落盘/取消门保持。

独立方案/用例审核→RED→实现/GREEN→独立code review→定向组/类型/构建→原失败目标只读实际复测（捕获SDK出站max_output_tokens及白名单结束原因）→全新会话原件全文全选场景、完整复核、发布和正常重开。仍保留未完整结束为失败，API截断不能伪装成正常stop。
