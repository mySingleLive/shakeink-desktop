# DeepSeek场景原生结构化输出方案独立审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。审核最终268版本（facts八文本字段、references三类型索引、primary/additional已验证引文索引）、公开合成探针摘要，以及现有provider/generate、授权网关和canonical校验代码；未参与实现、读取小说/私有journal/配置/Key或调用模型。

## 结论

**最终方案可执行，可继续独立用例审核及RED。** 这是限定模型/端点/阶段的新wire合同；唯一目标的控制身份由可信目录构造，业务资料继续由模型提取，canonical仍经过原严格门。它不通过覆盖模型显式坏控制值、删除未知键或放宽最终语义校验制造成功。下列边界应在实现和用例中保持。

## 能力来源与证据限定

官方Responses文档列出`deepseek-flash`/`deepseek-v4-pro`、`text.format=json_schema`及`reasoning.effort=none`；官方兼容指南给出根端点并说明format支持。这里只使用相同已授权服务的Responses协议适配，不授权修改模型、端点或调用其它服务。[Responses API](https://api-docs.deepseek.com/api/create-response/)、[兼容指南](https://api-docs.deepseek.com/guides/responses_api/)

方案使用的object/string/integer/array/enum/anyOf、pattern及数值范围属于官方严格schema文档列出的类别；避免不支持的字符串/数组长度关键字是合理选择。但工具严格模式文档不能单独证明完整Responses业务schema已实际可用，仍须完整wire的纯合成实测。[严格schema说明](https://api-docs.deepseek.com/guides/tool_calls/)

公开`structured-probe.json`记录一次单字段schema调用：`/responses`、json_schema、strict=true、finish stop、103输入/63输出token、配置未变及exit0。本审核仅核对该摘要，没有重放或读取私有请求/配置。单字段成功不能认证八字段知识约束、关联范围、数组及完整实际wire兼容，更不能认证小说导入成功。

本地已安装SDK声明支持`Output.object`和JSON Schema。另从其实际编码路径确认：未知DeepSeek模型默认不被当作OpenAI reasoning model，只有设置`reasoningEffort`可能不写出reasoning。方案已补`forceReasoning:true`及真实SDK出站断言，不能仅凭内存options声称已关闭思考。

## 数据与身份边界

- 严格wire只接受text、facts、references、primaryEvidence、additionalEvidence及各自固定字段。root或facts中出现id/name/kind/origin/entityType/parentId等控制键均拒绝；不能先strip再用可信值覆盖。通过wire后显式构造canonical，绑定唯一已选PLACE目标和确认父级，继续原身份/父级/Unicode/原生资料/知识/引用/证据及最终授权门。
- facts八字段全部required string。reliability空串仅作为该新wire的明确未知表示规范为省略；其它文本（含空串）逐字保留，不trim、不截断、不补无据默认值。text的可见性pattern及非客观attribution的pattern应与本地同条件验证；anyOf分支仍须完整required及additionalProperties=false，不能产生分支之间的可利用缺项。
- references三个整数的-1仅表示明确未知；非负值严格恢复原类型目录中的ID，越界、非整数、NaN/非法形状或额外字段拒绝，不过滤坏项。索引目录来自完整可信`request.entities`及合法`request.artifacts`所形成的同一身份集合，而非裁剪后的provider目录；保留上下文独有引用和合法自引用。
- 构造schema、可见目录referenceIndex及解析返回值必须绑定同一份不可变目录快照和确定顺序。不能发送时按一份目录编号、收到时按另一份目录查找，也不能对原请求数组原地排序。可见副本只增加index，不改变原ID/类型/名称/父级或输入units。
- primary保证至少一条合法引用；逐项恢复primary及全部additional，保持选项对应unitId/quote不变。越界、混合旧quote形式或未知键直接拒绝，不能取第一条或丢坏项通过。该新wire只表达已验证选项，不能称为保留旧自由quote的任意表达能力；这一限制不得借机裁减原文units、选项或已有业务字段。

## 调用、预算与失败边界

- 只在官方HTTPS根端点、允许的精确模型ID、openai协议、semantic/analyze/entity/scene、唯一有效目标及合法引文选项时启用。根端点判定应排除自定义host、非根路径、查询/凭证等其它目的地；不能剥离已授权`/v1`前缀后改走根路由。其它模型/阶段的序列化、prompt和生成参数保持原行为。
- 专用固定prompt应匹配新wire，不能继续把旧canonical artifact输出合同当作要求；原自由instruction/小说内容不能改变wire、目标或授权。控制元数据只能来自已核验目录，不由模型重新猜测。
- Responses必须继续使用bindModelFetch/localModelFetch→ModelService/ModelGateway。同一modelRecord、模型ID、端点、配置和Key出口不变；真实SDK合成出站捕获应证明route、strict JSON格式、reasoning none及store:false，并验证原有用量、取消与末端授权检查保留。
- 可选JSON Schema参数只影响显式调用，未提供时streamText参数和其它流程不变。应检查SDK输出失败/截断/拒绝等路径的静态净化，不输出request body、模型值或原始cause；HTTP/授权/取消/不支持格式不能被泛化成可重试schema错误。
- schema及新增目录index的实际序列化成本计入原预算，超过容量明确失败，不裁units、目录身份或证据选项。完整范围、schema和实际出站格式应有对应断言；一次单字段探针不替代这些检查。
- 现有最多2请求/4生成、31路、保存及取消排空门不变。API不支持或结构持续错误时失败，不切回自由文本、其它模型/供应商或增加无界重试。

## 后续验收

用例应分别验证完整wire→canonical逐值保留、控制键/未知键拒绝、三类目录索引及来源快照、空值专用表示、知识归属条件、全部证据恢复、预算不裁材料、未启用范围不变、真实SDK请求及有限错误次数。完成本地独立代码审核后，先实际执行完整wire纯合成探针，再做失败目标只读复测和新的全文全部场景会话。历史失败、局部复测与本次方案审核均不能替代正式保存及正常重开逐字段/逐章验收。
