# 用户修订后的定向测试用例补充

日期：2026-10-28。本文只覆盖最新顺序与结构识别，不重复03全部用例，不表示执行结果；已纳入独立审核的防漏章/一致性要求。

## ORD：工作流与细纲

- ORD01：分析顺序为character/scene/item/world/theme/style/其他已选目标/foreshadow/trope/worldline/narrative/outline/review；body后结构步骤完成且早期无来源或推断outline调用/artifact。
- ORD02：outline-structure只含实际卷章数，不增加coverage.outline或outline artifact；最终coverage完整且每章有效细纲后才可review/publish。
- ORD03：章级细纲使用当前冻结快照的全书0-based chapterIndex；非法/重复index、同ID改绑、空细纲、错误证据均拒绝，merge/coverage/归属在提交前完整验证。
- ORD04：最终review/repair后仅按detailedOutlineIds同步空白回填值，非空已有值不覆盖；重开一致。第一卷summary仅含无chapterIndex的卷级/来源大纲，章级细纲进入Chapter/cards且不重复。
- ORD05：review前缺细纲、publish前篡改映射/Chapter、非法归属均拒绝；importPlanHash包含最终Chapter.outline和detailedOutlineIds。真实1402章全部有细纲并按12语义审核。

## STR：结构与格式

- STR01：两层标题第一级卷、第二级章；三层标题第二级卷、第三级章；称呼不决定层级。本地明确结构/仅本地分类零AI。
- STR02：TXT/Markdown/DOCX/PDF/HTML候选的邻接/格式/astral offset准确；start只能属于候选集合，标题/文件名只作元数据。
- STR03：多文件按目录、文件名、文件内标题的优先顺序形成整文件章界；按session.files顺序及body units拼接JS字符串，无自动分隔符；跨文件排除区、接缝、astral和移动文件均验证。
- STR04：每个候选必须cut或ignoredStarts，本地强制边界必须cut；忽略候选、删除中间真实章界、伪造/重叠/越界start、空title、重复卷名均拒绝且无部分提交。
- STR05：structure仅phase=classify；混有classifications/artifacts/conflicts/patches、invalid_json/incomplete/network/取消均不采纳。独立prompt/result hash与runtime组合，普通classify golden不变。
- STR06：暂停同进程可恢复；重开必须重新授权；set-chapters使structure授权/候选失效；模型变化不得继续。普通classify与legacy hash不回归。
- STR07：真实指定GB18030整书得到9卷1402章，再按新顺序完成细纲；旧H05正式重确认后coverage/artifacts/analysisGrant/语义状态/旧Chapter细纲全失效，下一次outline从零开始。

- STR08：真实前置宣传/简介形成非实质序言时，本地回退章界仍有对应的真实文件起点候选；确认编码、片段分类和AI结构核对不得以“本地章界缺少可核对候选”中断，不伪造成有标题的正文序言。
- PERF01：1402章均有阅读卡时，规划校验只按当前文档建立局部卡片索引；组织父卡排除、narrateSummary父卡计入、祖先章节继承、多线隔离及预算错误优先级不变，不降低任何审计断言。

- CLS01：普通classify返回合法JSON但漏项、重复/外部unitId或缺classifications时，在原批次内触发既有的一次纠错；第二次仍不完整必须拒绝且无部分信用。分类诊断路径不得重复拼接字段名；structure和其他阶段schema不变。

- CLS02：识别后仍有unknown时允许停留来源页并完成正式set-range核对，不得只等select；已确认编码不得重复应用，范围变化后须重新授权结构识别，不得用仅本地分类替代所要求的模型结构判断。

- CLS03：classify经两次纠错仍不完整时，仅对该失败批最多二分9次；父批无信用，成功子批原子记账，右批失败不重放左批，恢复只处理未覆盖ID；单单元仍失败、非覆盖错误、取消或授权变化均直接拒绝。

- CLS04：included的已知空白必须记分类信用但不重复发送；unknown空白仅在全序列本地规则能确定类别时采用并原子提交，仍未知的前缀留给人工/模型；excluded不发送。恢复后不得新增模型请求，原始ID、坐标、正文与排除区不变。

## 通过约束

合成用例只证明定向行为，真实整书、11目标和全部语义仍按修订后的03。结构步骤不得提前生成细纲；最终细纲不得改变正文、卷章或叙事披露顺序。
