# S01 publication-01 · 独立最终语义与业务投影复审

日期：2026-10-26（Asia/Shanghai）。审核者：独立子代理 `unified_picker_review`。

**结论：S01整体语义/业务导入验收 FAIL，不能因completed及35条机械断言通过而记为整书通过。** 原文保真、已存业务记录与回执一致得到文件证据支持；旧审查的Q01–Q03、R01/R02仍存在，PRED-C01–C03已由发布后的实际业务记录确认，已不只是代码预测。

## 范围、身份与只读边界

只读用户测试目录 `执行证据/S01-20261026-0355/` 中冻结oracle、expected-body、`completed-checkpoint-rev177.json`、`before-live-pause-rev73.json`，以及 `publication-01-audit/{business-records.json,assertions.json,ordered-body.txt}`；对照前一阶段独审及现有业务schema。未打开数据库、调用应用/CUA/模型、读取Key或其他作品，未改数据/基线/代码，未运行测试suite。主代理正常退出/重启和UI观察沿其操作记录，本审核没有独立重做UI步骤。

| 身份 | 值 |
| --- | --- |
| session/request | `ef97e681-df26-420b-a7ff-2c42758548b1` |
| checkpoint | revision177，completed，正文workingRevision=0 |
| work / novel | `6d6d3c82-bc69-4641-b710-5efdba574200` / `cmvobvvvt000loo6vdretjykm` |
| importHash | `d51702f08aef8b33b736c6295acb369c9748a20418c6cfd092654528a610faee`，与实表导出身份相符 |
| frozen oracle SHA-256 | `592ae1cf511506706b7eeb4f19a9bab285b8ea1fa94fa34221291e28ce4b3417` |
| completed checkpoint SHA-256 | `32e7e1d1ad2b5086521fe816cabda9683210e29e276a51b3aa52c4cce6b84f47`，等于实表审计绑定值 |
| business-records SHA-256 | `c9f67b07c95ee2d4ef7a582071e201cced0ec43ceaf1cee955510741bac663ce` |
| assertions SHA-256 | `87f4837f01cfd342bbd325d3178a455ddbfa95114b1fca89fb0f579fd770f262` |

文件级独立核对：expected-body、checkpoint original/working、实表导出Chapter.content按序拼接、ordered-body完全相同，2723字符，UTF-8 SHA为 `b6360470a56ab29b0c8a1e327db72ac552651b206a63b1392dd94749e8381d4a`。十二目标各13个unit、全文review13、reviewFacts272，57项artifact；176条evidence均精确包含于其指定unit并列入sourceUnitIds。上述是机械覆盖和定位事实，不是语义支持性证明。

更直接的复审依据：revision73阶段48项artifact与最终177对应对象逐项深相等；最终新增9项narrative，原48项text/facts未因最终review或两项作者决定而更正。因此此前缺陷不能被“后来已经review”自动关闭。

## 发布业务投影：三项预测均已实际确认

| ID/优先级 | 实际记录证据 | 验收判断 |
| --- | --- | --- |
| **S01-PUB-C01 · P1**（原PRED-C01） | 六个Character全部`roleType=SUPPORTING`，包括孔乙己；occupation/personality/appearance/clothing/catchphrase全部空，relationships全部[]，extra仅importArtifactId。原artifact的traits/duties/actions包含外貌、衣着、职业行为等，但未映射到这些正常业务列 | 角色结构映射失败，并将主角错误默认作配角。schema已有PROTAGONIST；不能把“bio留了一部分叙述”当完整角色卡片导入成功。**facts仍在NOVEL_IMPORT snapshot.materials内**，故不声称从全部存储中丢失；但审计JSON不能替代正常业务字段/面板可用 |
| **S01-PUB-C02 · P1**（原PRED-C02） | 五个Scene全为根节点、coordinates空；四项直接名为到店受嘲、教字分豆、断腿后最后来店、长久不见与欠账，其location事实均归同一酒店/柜台/门槛，实际内容是情节事件 | 剧情片段被落入地点树。该应用Scene是可递归地点/小空间实体；此判断不要求任意固定地点数量，而要求保留地点与事件的类型区别。不能以文学上也叫“场景”免除业务契约 |
| **S01-PUB-C03 · P1**（原PRED-C03） | 七个World全部parentId=null，分别是温酒习俗、顾客分层、酒价、记账、科举、丁家权势、看客文化；Setting只有一条STYLE、worldId=null，无相应社会/文化/概念设定 | 将同一世界内规则/习俗主题建成独立世界根，未进入已有Setting领域。不是要求所有作品必须一个World，而是这些产物本身没有独立世界身份，却被错误投影为World；需按正式领域契约处理所属世界和设定类型 |

planning实际保留9个事件、9张叙事卡及其引用；但这只证明规划结构存在，不能替代下述事实、因果及知识来源正确性。尤其讲述条目统一`reliability="客观事实"`，没有结构化保留酒客转述层级；同时被引用世界事件仍以无条件fact保存。

## 最终语义：旧问题未关闭

| 原ID/优先级 | 最终产物与冻结原文对照 | 结论 |
| --- | --- | --- |
| **S01-Q01 · P1** | outline-1、孔/丁角色、world-ding-juren-power、worldline-kong-yiji-leg-broken仍把偷丁家、服辩、受刑因果写成无条件事实；丁的traits更概括为对偷窃者的一般处理程序。原文该段是“一个喝酒的人说道”，叙述者没有亲见受刑 | 事实来源/确定性仍丢失。第二项作者决定明确要求按酒客转述理解，但只留在decisions/explanation，没有更正各产物及实际bio、World.description、planning.events.fact。不能用一条总说明代替全书关联设定的一致性 |
| **S01-Q02 · P1** | 实际规划事件`import-event-worldline-kong-yiji-accused-theft-beaten.fact`仍称酒客指认并因此吊打。原文酒客是在店中回述此前见闻，并未叙述此时指认导致此前受刑 | 新增因果和时序错误已发布。新narrative文字虽正确写成“酒客当众说前天亲眼见…”，仍引用该错误世界事件；两线因果没有自洽 |
| **S01-Q03 · P1** | 孔的traits/duties仍无时间范围地写从不拖欠、不出一月定还清；后段事件和原文反复保留十九文未清 | 早期还款习惯被写成贯穿全书的稳定事实，与后段欠账变化冲突。需保留“以往/早期”范围；最终facts审计中也仍是原值，未由review修正 |
| **S01-R01 · P2** | 逐项检查57项artifact的text/facts，未记载“姓孔/绰号/描红出处”；角色业务aliases也空 | 冻结requiredFact `characters.kong`的最低召回仍缺。姓名叫孔乙己、相关整段被发送或evidence可回查都不等于已导入其绰号性质/由来 |
| **S01-R02 · P2** | 四个foreshadow仍只有缺席欠账、可有可无、末次来店衰败、年关端午索欠；没有早期反复伤痕与后段断腿的关系，也无明确排除解释 | 冻结requiredFact `foreshadow.wound`未满足。角色traits孤立写伤痕不能代替所选伏笔目标的铺垫关系 |

不把所有推断一概判错：结尾相关worldline/narrative仍写“大约/推测”，没有声称目击死亡或编造确切日期；goldenFinger为notFound，未凭茴/回字写法虚构能力，三个情绪项为TEAR，没有把旁观哄笑强写成主角胜利爽点。第一项作者决定关于茴/回字的解释保留原文，也未改正文。这些有限正确项不能抵消以上已证实失败。

## 如何使用35条机械通过结果

实际表为1小说、1主题、1卷1章、6角色、5场景、9物品、7World根、1STYLE、4伏笔、3泪点、1规划及各1个导入版本/mutation。35条通过可支撑本次作品归属、正文一致、回执/引用和现有发布投影按代码执行；**“投影与实现一致”并不证明实现的业务映射正确。** 本审核不改写这些机械通过，也不将它们扩写成语义通过。

S01应保留为“真实流程/发布持久化已完成，语义与业务投影验收失败”。后续修复须保留本run、原始产物/作者决定和冻结基线，并有明确针对性的产品映射/知识来源方案、用例及新证据；不得人工改数据、降低oracle或借容量/PDF补丁覆盖本记录后宣称旧run已自动通过。
