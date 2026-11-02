# 场景复核全文索引引用方案独立审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。只审核296及现有证据/复核相关源码；未编辑产品、读取真实小说或历史响应，未调用模型。并发方案已单独延期，不属于本次正确性审核。

**方案通过，无设计阻塞；待297用例独审通过后才进入RED/实现。** 现有ImportEvidence与anchorEvidence/validateImportEvidence没有quote长度上限，完整非空unit.text本身是该单元的精确连续引文，10–30字符是提示偏好。严格{unitIndex}从当前快照恢复完整原文属于既有合法canonical证据的另一种编码，可以接受。它表达粗粒度出处，不能声称索引有效就已证明冲突语义；原精确形式应继续可用。

必须保持：

- 纯scope精确限定semantic1、review、selectedTargets仅scene且无conflict/intent。scope只控制新索引编码和专用prompt；**原RA早期anchor分支不能收窄**，作者解释复核的旧两生成纠错及所有末端门保持。普通场景复核与作者决定/合并/正文diff处理分开。
- index为当前完整request.units的0-based整数，0有效，拒绝负数、小数、字符串/越界。每包从0开始，映射捕获同一不可变快照；不能使用provider裁剪后的另一数组、跨包或全书索引。同文不同ID按实际索引区分，恢复CRLF、空白、非BMP及完整长文本，不截取或按内容找替代单位。
- 新索引形式与旧{unitId,quote}为严格分离形式。混合、额外键含undefined、坏索引或坏明确quote均整项拒绝，不删除坏项/键，不在校验失败后改用整个单元。原精确形式继续使用原声明单元matcher，包括既有唯一排版恢复，不新增跨单元移动或模糊匹配。映射后的证据仍须通过原base及late门。
- 模型仍负责conflict/missingTarget所有其它字段和语义；不从index猜source/candidate、artifactId、kind、field或缺失目标。selectedTargets是输入范围，不强制把合法body-body等conflict.kind改成scene。原状态/hash规范化、投影/锁定/单位与实体范围、知识归属及最终授权/取消不变。
- 专用prompt保留本包全部数据、reviewProjection完整契约、确认决定、时序/回忆/传闻/歧义判断及不修改正文的限制；只去除其它类别的生成说明。provider-visible单位副本追加unitIndex，原request.units和全部材料不变，新增元数据和完整prompt纳入预算；不得删单位或资料凑预算。
- 指引与错误静态净化，不回显原文/ID/未知键和值；两次JSON生成、模型/思考/网络及并发不变。整单元恢复可能增加canonical证据和checkpoint体量，应验证完整保留和有界处理，不另加截断规则。

相较字符offset协议，此方案避免让模型计算UTF-16坐标。若以后要求更细证明，可另行设计源句/段落选项索引，但会增加元数据/预算与覆盖验证，不应混入本次最小改动。当前9个待决冲突仍由作者处理；引用有效或场景935项通过均不允许绕过verify/保存门。

当前重构包缺少历史payloadHash，方案已正确区分同范围生产重构与历史出站逐字节相同。R22仍为场景阶段通过、完整流程未完成；不恢复已正常关闭删除的草稿来伪造发布。最终须新会话覆盖5589工作单元及全部冻结reviewFacts任务，并完成正常发布/重开核验。
