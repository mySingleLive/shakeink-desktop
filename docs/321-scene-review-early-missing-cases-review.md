# 场景复核遗漏早校验用例独立审核

2026-11-01，独立审核者 `scene_hierarchy_review`。已先通过320阶段A设计，再审核321。仅新增本文，未参与本轮用例编写或产品实现，未写/执行新测试、运行App/API或读取真实小说与私有reply。

**EM01—04设计通过，无阻塞，可开始阶段A TDD。** 仅把request可证明的既有missingTargets门放入原两代纠错；没有阶段B、版本/wire新形式、聚合、作者决定或旧会话迁改授权。

- **EM01**每类bad→good与持续bad能区分原JSON桥已过、service一代晚拒，以及新两代恢复/invalid_schema拒绝。八类夹具均要求其余条件合法，特别是text部分投影须由完整owner的原函数创建，避免用坏请求或预算错误遮蔽目标门。合法/坏/合法数组证明整包拒绝与完整修正，不容drop坏项。实际新增反馈段的250 code units、静态路径和canary净化断言合理，不能误删第一代完整输入满足“不回显”。
- **EM02**保留原三正控与duplicate-unitIds原拒绝；raw、unitIndex、多项引用、CRLF/非BMP及Han排版恢复继续按原接受集合。早校验只能验证副本，最终quote仍由原末端还原，不去重或改写显式坏unitIds。这些控制可能旧实现本来就通过，应如实记录，不要求所有用例人为全红。
- **EM03**合法service结果进入原main纯后置，当前owner变动控制使用合法当前语义state，能实际到达完整owner/baseHash比较。不得用无关inputHash/锁定错误冒充该门。晚门保留可结合源码接线及EM04的非scope原晚拒控制证明；不为测试在产品引入跳过早schema选项，也不通过修改可信request或替换原校验为成功去制造到达。代码独审仍须确认eligible路径的原service末端循环及main门均在。
- **EM04**作者解释、非scene/组合/缺semantic及legacy对照保持原合同；尤其author/非scene坏范围仍是一代晚拒，不偷偷扩展新纠错范围。legacy使用原本支持的响应作对照，避免将不支持missingTargets的JSON基础拒绝当范围隔离。第一代prompt/payload、完整材料与原review pin保持，新增反馈计原wrapper reserve；原预算、length、网络、授权/abort身份及次数回归继续执行。

三元组正控必须使用完整owner hash而非fragment hash；片外字段不猜空，修正响应须保留待核目标与所有有效项，不能靠空数组或省略证据“纠正”成功。纯main clone不得调用save/commit或模型，不把合成入队结果记为实际会话已修订。

执行记录须说明真实RED到达的固定错误/代数与未到达的后置断言。321设计尚未运行；原12类人工audit只是选例依据，8类早晚门差异不是历史R27失败reply，历史generic原因仍未知。GREEN后还须独立代码审、受影响定向/类型/构建及有构建身份的实际接口/全新完整导入，不能据此批准作者选择或宣称发布重开通过。
