# 场景具体身份用例独立审核

2026-11-01，审核者 `scene_fix_review`。只读323最终方案、方案独审及324；未参与324编写，未改产品或测试，未执行测试、App、API或真实作者动作。本轮仅新增本文。

**CI01—13用例设计通过，无遗留阻塞，可依分工开始合成TDD。** 审核方案SHA256为 `c92019d222f442b4173683a52c0dc47f281920d76152c5b470d39879da2064c8`，用例SHA256为 `2cb278da1116029caf56a56dc8f56d5ce5e81bbaa0ef93fb95bbe3b5e22b6a33`。此准入不包含320B、聚合、318或实际导入通过。

## P2来源材料绑定增量复核

随后服务独审发现SourceMember仅过形状、未核本包完整block材料（见325），作者在实施前补齐合同。本次已复核方案 `e87d65ec6639a6e03800c943c8a6d5d7ff1ec68dba2de5cf3fa2e509512764be` 与用例 `16a2481cac22108422b597a1fade1a0b4b0d4957e84f7a1b4be665f11a73ad7b`，**CI04/12该最小增量通过，可先取得新增RED再实现。** 上段旧hash对应初次已审版本，不充当这次新增合同的执行证据。

app-only links row.sourceBlocks显式映射SourceMember到当前request局部ranges；各SourceMember恰一次、body-only省略/空数组、真实unit/hash/安全字符边界、原序恢复完整blockHash均有正负控。缺/错/未知/重复/不完整及重排映射，尤其同unit/同file绝对位置重叠且重复文本恰可凑同hash的反例，必须在生成前固定拒绝、调用0。unknown空reply不能绕过请求门；同ID slice不能Map覆盖。完整绑定仍计原预算，模型output wire、UR/native、role及原有限纠错不变，输入clone保持。

这些用例针对实际已证请求边界，不要求从标题、ID格式或任意concat猜来源，也不把core/main尚未完成的接线默认为已通过。此增量审只读文档/hash并更新本文，没有新增测试执行或产品更改；325仍需待实际修复及独立正负控后关闭P2。

## 内部Sources及工作版本增量复核

已复核方案 `a3c8d90b5a3194cc737496847062178ca3ce60531b285fa47fe8ce998c2709c4` 与用例 `93c95b9d6dfa48f1e76b59d57eb70d8d70f65c27377a99367dba39574c496dd0`，**CI12/13及pure API附录的最小澄清通过。** 仍是仅内部Sources的准确表示，模型wire/schema形状、原预算及归属义务不扩大。

同ID block slices之间若有真实gap，只可由同一原已授权file/kind的真实完整unit提供support。完整owned前缀包含空白、原序恢复block.text；后缀必须是同ID/file且真实包含该slice的非重复superset。`sceneSourceBlockOwnedUnits`明确校验并仅返回owned前缀，copy、entity归属和证据选项不得把support片外范围算作本地点所有权；links为了同ID材料恢复才使用完整支持。连续与gap正控、缺原值/伪superset/错file/重叠/不完整反例，以及非unknown源quote经过apply wave、显式assert、membership的闭环足以验证接口，不仅比较未知空回复或构包器自身输出。

sourceScopeHash的独立canonical预期新增workingRevision：正文偶然相同但工作版本变化时，新命名空间不能重放旧partition/label/parent；新scope保留旧决定审计，同scope正常revise保留有效决定。Sources按不可变快照使用，但显式assert仍必须重验实际来源/范围，不能靠缓存把原地改值冒认新版本。此处是用例准入，未执行或批准尚未冻结的core实现；前文325的P2后续已在325最终代码审核中关闭，其历史“待修复”描述保留为当时状态。

## 覆盖与可执行性

- **CI01—02** 正确区分模型wire与应用canonical，覆盖公共roster/完整sidecar同序双parse、mode/stage隔离及原两代纠错，不让fresh旧reply进入名称定位fallback。literal与quote双唯一、重叠计数、同unit两个位置、quote窗口变化而member key不变，均有独立坐标/hash预期，能击中将唯一长quote误当唯一提及的缺口。显式undefined必须直接测schema对象，不能经JSON.stringify抹键后冒称覆盖。
- **CI03—05** 将规范主名、own-alias传递链、shared-third-alias、同父房间和同主人搬迁分别设例，避免仅靠不同显示名/ID掩盖后续重并。跨批有据归一、全组件different约束、unknown保留、冻结wave一次组合及stale拒绝可测；检索线索不冒充身份依据。完整records/tasks/引用材料与实际预算必须进入测试，容量夹具先保持键/范围/引用有效，不能让无关早门替代超一边界。全部ledger数组/总引用与原1GiB journal门已列明；使用原encoder的maxBytes及真实UTF8 N/N-1验证，不需分配1GiB或新增产品测试旁路。
- **CI06—08** 分清可正常导入的来源限定未知与必须保持待确认的混聚组。正常组件/bridge触发严格作者action，完整互斥partition、短NameParts、parent/defer、noop、save/授权/来源失败回滚、版本/epoch及失效清单都有前后完整clone/hash检查。详情及原文走有界正常读action，覆盖working-0、50成员、32768文字、邻接范围、旧hash和任意路径拒绝；无需创建另一套隐藏会话修改入口。
- **CI09—11** 超200成员、同unit多地点/比较对象、owned/context分离、8选项不等于全来源、registry按ID避免name+parent重并，形成取证至复核的纵向用例。ownership缺credit时须让原main planner实际重派而非只在最终报错；缺artifact/选中unresolved不能用空expected集合通过。新地点遗漏须先有据注册ledger再创建唯一entity任务，不能被旧清单过滤或借同名旧ID吞掉。
- **CI12—13** source-only完整等值复制与确需AI时原分片/投影并集分别验收，不把本地copy冒称AI语义复核。旧无版本journal、新版本恢复、来源/工作版本失效、原native/授权/知识/循环/发布门及非scene黄金均明确；mock发布不冒充真实保存重开、7分钟或完整全书通过。

## 本轮小补稿已关闭的三个接线缺口

1. **可信来源与slice映射。** `sceneIdentityMemberships(ledger,units,sources)`现显式接收真实source-block→unit/range对应；SourceMember本身不含unit范围，不能从unit ID格式或同标题猜归属。CI08/09/12同时验证沿用同unit.id但start/text已切片的实际情况：原完整范围/hash经可信绝对位置核原值后变成request局部range/hash，末端再反投原member/block，只给实际展示范围credit。其它同标题block或任意unit不得误归属。
2. **原sceneParents循环修复入账。** CI04保留原完整循环目标、图、证据、32上限及预算门；修复以model basis和真实证据进入ledger，省略parent变unknown并保留原证据，不伪造作者决定。成功后从新ledger重建candidate并失效ownership，坏图/证据/save回滚，明确禁止仅改candidate留下旧账本。
3. **混合目标复核闭环。** CI13增加fresh mixed targets包含scene的正常正控，ownership仅附scene归属并可完成其全部credit；原mixed raw wire、UR/SV/index/lane的exact-scene范围保持，纯非scene不新增field且黄金不变。该scope与可选索引编码scope必须分别断言，不能通过禁用混合场景规避最终coverage门。

上述均是已批准纵向合同的最小接线补全，没有扩大模型wire、重试、容量或免除归属义务。共享pure API应按324冻结复用，service/main/UI不另造独立ledger或union实现。

## 执行及证据要求

本轮实际只执行文档读取、`shasum -a 256`和 `git diff --check`，未运行测试。RED须记录实际到达节点、代数与后置未达范围；原正控本来通过无需人为造红。坏字段/引用/容量/保存用例须实际到达各自门，响应根据预定序列提供，不根据prompt关键词伪造成功。

通过合成测试只能证明严格形状、范围、绑定、排程和原子提交；不能证明供应商理解全部地点关系或作者已确认真实材料。默认全选、所有成员/全文/facts、实际内容、场景时限、正常作者动作、真实发布及重开仍须后续带冻结构建身份完整验收，未完成项如实保留，不以skip/drop、旧产物或局部绿色替代。
