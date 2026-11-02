# 场景wire资料字段说明修复方案

2026-10-31。R21在1164候选中658完成、1项持续字段结构拒绝，正常退出，未完成验收。worker内存峰553MB、末次246MB，OOM未再出现。保留该失败，不能以局部内存改善称完整成功。

以生产importEntity/requestSnapshot/executionBudget重建同一失败目标完整26单元/1164目录，只读当前接口复测：首轮完整成功，另3次均最终通过，其中一次首生成明确复现 `facts / unrecognized_keys`、既有第二生成恢复。诊断仅保存固定路径/类别/计数，不保存返回原文或额外key名。原失败轮4次结果未保存，故不声称已经还原其每次拒绝的确切字段。

当前native prompt仅说facts有八字段而不枚举；facts严格对象的额外key错误又共用只列顶层五键的WIRE_GUIDANCE。模型收到的本地纠错不清楚facts的封闭字段集合。拟在 `desktop/service/novel-import-structured-scene.ts` 从既有textFields生成一份固定八字段说明，用于native prompt与facts strictObject错误；说明全部字段均为字符串、未知用空字符串，控制身份和三个关联引用分别由应用/references绑定，有据其它描述保留text。文字长度受既有250字符反馈上限约束，不回显额外key或任何输入值。

仅改说明，不改八字段集合、wire/server schema、canonical适配、全目录/原文/引文、最终验证、原两请求四生成或额度/网络/模型/思考配置。不得过滤未知key后通过，不改变合法输出集合。完整payload保持逐字节相同，新增prompt计入原预算/UTF8 headroom。DeepSeek官方[Responses API](https://api-docs.deepseek.com/api/create-response/)支持json_schema输出，但实际客户端仍严格校验每份响应，不能假定模型永不出错。

按独立方案/用例审核→真实JSON桥RED/GREEN→独立代码审核→定向测试/类型/构建→同范围只读复测及全新全文正常产品验收执行。正常全文仍默认全选、无跳过、完整verify/publish/reopen和全材料比对；不运行全仓测试。
