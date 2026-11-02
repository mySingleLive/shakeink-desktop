# 442 独立用例审核

结论：441 最终版通过后，442 按序通过，可执行 PRIVATE TDD；产品用例仍受静态真实兼容前提约束。审核版本 SHA256：`440dcb5cbf4a77da3e96804774b59daae2b0826565a9117ebd3cbd1a2525976f`。

case1–2 覆盖同五任务/见证/strict=true 的实际 SDK 最终出口、A/B独立 schema 与原 tuple/production decoder、exactkey反投及全部只读/流/错误投影/保护门，不把本地 SDK/Ajv 当供应商通过。两例不满足既定实际前提则不实施、不补试。

case3–5 的 keyed/换序正控、缺多/01/错误根/getter/mixed负控、每键局部类型/范围/0/严格三record及旧 array/repairs兼容有意义。原 decoder 和业务 oracle 保留，Native拒绝不能遮蔽本地门；原 parser 无新增重复 JSON 键扫描，strict true仅恢复原scoped默认，不污染其它请求。

case6–8 已补足 unsafe provenance 反控：显式已验证 reject 导致外层移动后，唯一直达 replacement 才可定位context/evidence；patch内层压缩/多task/歧义不报内层号。原hasSource跨unit保守事实、同一原claimed、row.canReject/boundCanReject三条件须同时满足才给0提示。source-present、跨界可能存在、未知ref、不同称呼、入链/不可拒、较早拒绝均不得输出该说明。诊断只在原门拒后且最多六项，固定词/可信索引无私有键值或异常消息。

case9 保留原全部BD/source/retention/owner/工作限额/权限/版本门及130+256全材料预算，92/25只作捕获回复的本地规则对照，新提示不冒旧SHA或新模型效果。超预算不抬限/删包；正常fresh全书、完整资料、发布及重开另行实测。审核未改产品/测试、未调用 App/API。
