# 具体地点清单：提示与安全纠错增量

2026-11-01。依据331的当前接口单包诊断；历史R28失败raw未保存，不能把本次探针等同历史失败包。当前探针第一代24条wire形状合法，但均未过原锚点门，涉及label不在quote、名称缺mention、quote不匹配、literal不属于名称及literal不唯一；第二代根类型错误。不能将问题归为单一label原因。

## 范围与提示

仅修改`desktop/service/novel-import-ai.ts`、`desktop/core/novel-import-ai-payload.ts`及新定向测试。仅新`semanticVersion:1 / analyze / intent:roster / kind:scene / sceneIdentity:{version:1,mode:roster}`的生成纠错；core/shared/main、links、ownership、旧清单及其它目标不变。

提示必须明确返回JSON对象，唯一根字段`roster`为数组；给`{"roster":[]}`及非空项的合成形状示例，明确示例不是资料，实际字符串必须取当前包。每项只含必需的`name、aliases、mentions、context、links`，未知aliases/context/links使用空数组。name及每个alias都必须是原文写法并各有mention；每个mention.literal只能为本项name或alias，不合成显示名。全部mention/context/link的quote都须逐字连续、唯一地匹配声明的当前包unit，保留Unicode、空白及换行，不拼接、不改字、不跨包、不取首同名。mention.literal在自己的quote中也须唯一。context.label是原文具体限定词或值，必须原样连续出现于其每条evidence.quote；不能填“位置/归属”等类别元标签或自造组合名。links仅引用本回复另一项的0-based targetIndex及原三种relation，有真实证据才给关系。完整保留有据提及、限定、时序和人物知识归属，不以删坏项或删原资料求通过。

## 生成纠错

原strict wire schema及`validateSceneRosterRecords`仍是唯一接受门，成功后仍只编译一次canonical sidecar并走原末端canonical/main门。先shape后semantic：形状失败不调用需要合法shape的语义诊断；原full validator失败后才作只读、失败专用诊断，复用现有`exactSceneAnchor`与同一精确literal规则。诊断结果不参与接受、修复、过滤或重新绑定raw。无法分类时保留固定总指导。

仅生成wire roster分支不再将所有错误压成path=[]。最多沿原`parseJsonOutput`的6条issue，路径只允许固定schema字段名与实际数组的非负安全索引；未知键不拼入路径。Zod原message/unknown keys/raw值不转发。使用静态reason说明（每条不超过250字符）：根object/roster数组、必需字段类型或额外键、name/alias的mention覆盖、mention.literal名称归属、声明unit的精确唯一quote、literal唯一、context.label逐字包含、links当前包非自身索引。shape错误只发固定形状说明；未知路径退到已知父路径或根，禁止回显名称、ID、quote、未知键和值。原canonical及其它mode的反馈合同保持不变。

不改wire合法集合、source材料、canonical数据、payload metadata、模型/role/thinking、输出cap、31并发或两代上限；不接受length，不模糊匹配、不修raw、不丢项。新增提示与实际纠错文本仍由原完整UTF-8预算及16KiB wrapper reserve计入，不新增预算豁免。

## 验证与准入

333独审通过后先真实JSON生成桥RED，再最小实现GREEN，独立code review；不构建/启动App或调用接口。合成测试不能证明供应商一定纠正成功。随后由主代理进行已审只读当前包探针及新鲜全文验收；实际仍坏必须原门拒绝。完整导入、作者决定、发布及重开仍未验收，不能提前宣称解决全书。
