# DeepSeek场景原生结构化输出方案

日期：2026-10-31。单目标只读复测在facts严格字段说明下两次成功、第三次仍因字段集合失败，说明仅靠自然语言纠错不足以支撑千项导入。不能增加无界重试、删除未知字段或把部分成功算完成。

## 实际能力与授权

[DeepSeek Responses API](https://api-docs.deepseek.com/api/create-response/)支持`text.format=json_schema`。当前已授权模型、原端点的纯合成实际探针经既有主进程网关调用`/responses`，SDK发出json_schema及strict:true，模型在要求添加额外字段的提示下仍返回符合单字段schema的结果。配置hash不变、正常退出；不发送小说、不展示Key。探针不是整书验收。

既有DeepSeek Chat SDK未向API提交业务schema；generateJSON只在本地校验自由文本。修订仅对官方DeepSeek根端点、已实证的deepseek-flash/文档列出的deepseek-v4-pro、openai协议、semantic/analyze/entity/scene且存在已验证引文选项的请求启用Responses结构化输出。使用同一模型ID、原配置端点和同一主进程Key出口；不新增模型、不改配置、不跨授权前缀、不改其它类别/普通scene/roster/聊天，不静默换供应商或失败后降级自由文本。

## 数据合同

接口wire只让模型返回`text`、`facts`、`references`、`primaryEvidence`、`additionalEvidence`。id/name/kind/origin/PLACE及确认parentId均由唯一已选目标绑定；wire不接受这些控制键，不能覆盖模型的显式坏值后通过。模型只生成资料。canonical artifact仍走原严格schema2、身份/父级/引用/Unicode/证据及最终授权门。

- facts包含现有schema2的8个非控制、非关联文本字段（全13字段减entityType/parentId/characterId/sceneId/itemId），additionalProperties:false，均required且为字符串；未知业务值以空字符串表示，与原生面板的未知文本表示一致。只有reliability选择字段空串规范为省略，其它字符串（含空串）逐字保留。未知键、非法形状或控制键不删除，直接拒绝。实体类型/确认父级从可信目录完整保留；普通canonical响应非法空值不兼容，新的未知值表示只属于专用wire。
- references包含characterIndex/sceneIndex/itemIndex三个整数，分别是**完整可信类型目录**的索引，-1为未知，其余用minimum/maximum约束到该类型范围；避免千余ID的巨大enum及机械抄写ID。发送目录副本为每个可见实体增加referenceIndex，完整可信目录保留在服务验证，不改变原请求。应用按原类型目录恢复非空合法ID，不丢弃或猜测引用。可靠性只允许原四值或空串；非客观可靠性须有据非空attribution，facts用anyOf及pattern约束，不强迫虚构归属。text也用pattern要求非空白，原字符串不trim，资料字段及全部原输入units不减少。
- primaryEvidence是一个已验证optionIndex对象；additionalEvidence为同样选项的数组，可保留多项引用。所有原有引文选项及其unitId/quote逐值保留，逐条恢复primary及全部additional，越界/未知键/混合形式直接拒绝，不能丢坏项取第一条。至少一条合法证据由primary保证，不依赖不受支持的minItems/maxItems。**这是专用的已验证选项表达协议，不泛称保留旧自由quote的所有表达方式**；完整原文units及既有选项不减少。
- server schema用object/string/integer/array/enum/anyOf及pattern/minimum/maximum；不使用DeepSeek工具schema文档明确不支持的minLength/maxLength/minItems/maxItems。本地继续严格校验全部语义条件，服务器约束不是免检。

## 实施边界

为内部generateText/generateJSON增加可选JSON Schema输出参数，只有显式传入时才给streamText设置Output.object；其它调用的参数和行为不变。scene专用模块生成schema/提示与严格wire→canonical适配，Responses模型仍通过bindModelFetch/localModelFetch及ModelService/ModelGateway授权，保留同一modelRecord、用量、取消、既有提取轻量策略（reasoning none）、store:false和保存设置。针对未知模型ID的OpenAI SDK适配使用forceReasoning:true，真实SDK outbound须证明reasoning.effort为none，不能仅凭options对象中有reasoningEffort断言关闭思考。完整wire schema须先做纯合成实际探针，单字段成功不代替完整schema兼容性。

将schema字节/字符成本纳入现有payload预算检查，不能靠裁减units或清单通过。最多2请求/4生成、现有31路/落盘/取消及停止门不变；HTTP、授权或不支持格式不自动降级或新增重试。

独立方案审核→用例审核→RED/GREEN→独立代码审核→受影响定向回归/类型/构建→失败目标只读复测→新session原件全文和所有候选全选导入→正常保存退出及重开逐项核对。历史失败及局部复测继续保留，不运行全仓测试。
