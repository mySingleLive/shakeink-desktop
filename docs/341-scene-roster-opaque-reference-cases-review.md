# 341 精确片段 ref 独立用例审核

前置：340 技术方案已按序独审通过。审核 SHA-256：`08b7e7d6ce0d7bd5b505ca12664188dd2c3c1b54c9b6325529bdf491076dbe4d`。

结论：通过，无用例阻塞，可进行合成 TDD。

- OR01 以真实 runImportAi/generation JSON 桥取得旧入口 RED，并对照合法 raw 的完整 canonical；首坏次好及持续坏两代证明有限纠错，不以缺新 helper 充作功能 RED。
- OR02 独立预期 hash/range、各绑定字段变化、当前表重建、整表重复拒绝、冻结目录/私 Map/Anchor 副本、单片与精确查找覆盖实现安全边界。大小写、空白、改 hex 或未知 ref 不得修正。注意单位重排应重建当前表/显示 unitIndex，但同一来源绑定的 opaque ref 按固定公式可保持原值；不能要求无关变号，也不能从同值 ref 推断使用了旧缓存。
- OR03 检查三种 record/anchor 的严格混用规则、直接 own undefined、后置坏提及、原 primary/full/raw 坏值、alias21 和重复 quote/literal；原显式半开/raw 备选仍可合法处理单片不能满足的证据，ref 本身绝不隐式扩大、取首好项或丢坏条目。
- OR04 保留完整片段/尾白和 metadata 的实际角色预算边界、同一 planner/worker serializer、非 scope 字节/反馈合同及 raw-only 隐私哨兵；最多六条、250 UTF-16 code units、安全已知路径和固定说明，不增加预算或重试。

既有 FA 只能适配获准新增 ref 表示，原完整文字/metadata/预算/旧协议断言保留。记录真实节点、RED 到达门与未达断言；必要 FA/RC/CI、tsc/diff 后冻结交独立代码审核。未运行 App/provider 或读取实际资料；真实当前包和 fresh 全文、作者决定、发布/重开须主代理另验，不能用预置 mock 成功代替。
