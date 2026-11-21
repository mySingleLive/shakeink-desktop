# 场景wire字段说明方案独立审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。先审核292，再审核293；仅读取方案、用例及当前structured-scene相关源码，未参与实现，未读取真实数据或调用API。

**方案通过，无设计阻塞，可进入RED。** 当前代码确实仅在prompt说facts八字段而未枚举，且facts严格对象额外key错误共用只列顶层五键的WIRE_GUIDANCE。增加事实字段专用的静态指导有明确对应，不需要改变数据合同。

实施边界：

- 从现有textFields生成固定八字段集合说明：coordinates、reliability、attribution、temporalScope、exteriorDescription、interiorDescription、backstory、entryMethod；不得重新定义集合或混入控制/关联字段。控制身份及父级由应用绑定，三类关联使用references，额外有据描述由模型重新完整表达在text，不做本地搬移/过滤。
- native prompt与facts strict错误使用同一固定说明；长度须完整不超过既有250 UTF-16 code unit反馈上限，不能slice截掉字段名。其它根/引用/证据对象仍保持原固定指导，不把facts说明无差别扩散。
- 保留原record形状检查、strictObject及全部字符串/知识条件；未知key、undefined额外key、坏类型或缺项仍拒绝。不strip、catch、补空、删内容或改变合法输出集合来取得通过。
- server jsonSchema与完整payload逐字节不变，说明仅进入固定prompt及静态错误；原输入不可变。原预算和UTF-8输出headroom须使用包含新说明的实际prompt，不裁units/目录/别名/选项，也不改schema描述或结构来夹带本次变更。
- 原native适配/canonical/引用/证据/授权、模型/端点/严格格式/额度/思考及两请求四生成保持。错误指导不能回显未知key/value、来源或实体内容。

只读复测确有facts/unrecognized_keys相邻类别，但原失败四次结果未保存，不能据此还原其具体key或每次原因，更不能推测索引/enum等无证据问题。R21无OOM与658项完成不等于全书通过；新说明的真实效果仍须同范围实际复测及新会话全部场景、完整复核、发布和重开核对。本审核未认证这些真实结果。
