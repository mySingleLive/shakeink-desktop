# 场景识别与导入定向用例

日期：2026-10-31。对应方案250。合成内容不含真实小说或模型配置。

- SI-01：scene roster 固定提示只有清单输出；严格 `{roster:[...]}`、上级未知省略、无原生 facts/entityType/parentId 契约。其它类别及阶段固定提示 hash 保持基线。
- SI-02：真实 `generateImportAiJson → generateJSON` 生成桥，首轮根级额外字段或 parent:null/空串、parentId 错字段，第二轮合法清单恢复；持续根级/条目错误恰好两轮失败，显示静态场景格式标签，未知键、正文、模型反馈和敏感哨兵不进入最终错误。网络/授权/取消不增加生成轮数。
- SI-03：实际 controller → runImportAi validator，多批至少12个全选场景、合法前向/链状父级；父节点晚于子节点返回并在前一批落盘后继续请求，必须全部保留，各一资料、全部done，父级原样可解析，全部 native 可映射，零 dropped/skipped。
- SI-04：服务层未知/错类型父级和循环继续拒绝；证据未知单元/虚构引文继续拒绝，不能删除父引用或证据制造通过。真实验收独立断言每个已确认 ID 的唯一资料存在。
- SI-05：多批识别成功部分保存、失败批次不记coverage；重新识别只请求尚未覆盖单元，保留stash、最终覆盖完整且合并清单无损。SI-02补数组根/缺roster/未知根字段及合法无parent正例。
- SI-06（R4确认null后修订SI-02）：仅scene roster的parent:null作为缺省上级规范化为省略；schema、真实生成桥一轮接受、runImportAi证据定位完整；有效上级、名称、别名、证据不变。空串、数字、对象、过长上级仍在SI-02严格拒绝；其它类别parent:null及普通scene分析不获得该兼容。此用例覆盖原SI-02中null失败的预期，其它非法结构不变。
- SI-07（R5调度）：scene entity独立导入通道不等待两满聊天槽，原模型thinking/options不变；64个场景实际并发≤31且达到31，最终全部ID/父级/内容完整。角色现有慢写合批、暂停/取消排空、写失败停止测试以同一机制参数化增加scene，验证真实journal而非保存次数推测；其它类别池和全局队列不变。
- SI-08（R5资料结构）：scene entity固定提示限定单目标及精确父级、PLACE和scene字段，无角色类型/其它类别原生合同；其它提示hash不变。真实生成桥的未返回单目标、错ID/多项、缺/错父级首轮错误可第二轮恢复；持续错误恰好两轮，最终静态场景标签不含任意反馈。全部合法text/facts/evidence/sourceUnitIds逐值保留，不删上级，不减少输入。
- SI-09（R6字段协议）：仅scene entity复用已核验optionIndex/直接引文、从证据派生sourceUnitIds与完整schema2四文本字段。合法native字段/父级/text/evidence逐值保留；越界索引/混合引用/伪造证据/未知字段/错父级仍拒绝。真实controller→runImportAi→generateImportAiJson前两轮非法第三轮有效能有限恢复，持续非法恰好4生成/2请求后失败；网络/授权/取消等不增加请求。普通scene analyze、world等不获得引用协议/字段兼容，已确认schema2字段的晚期严格校验保持。
- SI-REAL：原件全1402章，全文识别覆盖所有工作单元、候选全部默认选中，tasks/artifacts/candidates ID集合逐项相等，全done，零failed/skipped/dropped/映射警告/页面错误；有效父级且无循环；源hash、每章正文/卷归属及整体正文hash不变。正式校验→保存隔离作品库→关闭重开，数据库场景数量/名称/业务字段/父级与journal逐项一致。真实响应错误保留现场后修复，不用跳过或固定答案通过；受控选择器与已跳过的其它类别明确记录。

定向回归包括 roster/实体目标/角色资料和身份、向导业务/状态/发布、语义/证据/父引用。只运行受影响测试，不运行全仓测试。真实成功数量指模型识别清单全部完整导入，不能用数量证明小说中所有文学意义上的地点都已识别；全文覆盖与实际抽查另记。
