# 场景复核全文索引引用用例独立审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。已先通过296方案独审，再审核297；未参与测试或实现，未读取真实小说、checkpoint或响应，未调用provider。

**UR01—03设计通过，可开始RED。** 关键正确性、范围隔离、预算和终末门均覆盖，不增加并发或模型设置变更。

- **UR01**：使用实际JSON桥及预定合成响应；两种结果数组、首末索引、>512字符全文/CRLF/前后空白/非BMP/首尾哨兵、同文异ID及跨请求index0的绑定覆盖合理。与合法完整raw证据基线比较，应保留原冲突hash/id规范化及全部其它字段；canonical不得残留unitIndex。首坏raw→次合法index必须证明真实拒绝及原两生成恢复，不能通过自动降级坏quote成功。
- **UR02**：小反例表每项其它条件须合法，证明索引/混合形状/额外undefined确由目标门拒绝。合法项后夹坏项及两种数组都整项失败，不能drop或strip。原短引文/排版及声明单位匹配继续由RA38覆盖；当前协议不借用analyze跨单元rebind。
- 范围隔离的黄金prompt/payload及raw行为需保留。建议将作者解释复核明确落实为三个断言：conflict请求不追加index且沿用原prompt/payload；unitIndex形式拒绝；坏明确raw quote仍进入原RA早期两生成纠错。新scope只限制新协议，不把原anchor分支误收窄。intent只测scope=false，不能用本来非法的review/intent组合冒充service隔离成功。
- **UR03**：基线只允许每个完整单位副本增加真实数组位置，全部原字段、原文、资料/facts、投影/锁定/章节/目录/确认决定保留；原对象不变。prompt须明确index表示完整原始单元的粗出处，索引有效不等于已证明互斥事实；不本地改写conflict.kind、source/candidate或缺失目标。
- 预算反例先证原输入可用，再计真实索引metadata及固定prompt；超限零模型调用，不在service内裁材料或追加隐式分片调用。实际review pin、单位/字符/payload及UTF8 wrapper门保持。合法索引仍须遭遇包外实体、遗漏投影/锁定/来源覆盖等原拒绝；末端撤权/取消经实际桥保留。

固定反馈检查实际第二prompt纠错段，不回显仅在坏模型输出中的合成quote/key/value/cause或来源/实体ID。完整原数据prompt本来包含已授权内容，不能删除材料满足该断言。保持review仅两次生成，无新增外层恢复。

本审核仅批准设计，未执行新用例或认证真实模型语义。既有待决冲突继续由作者处理；新会话仍须全部工作单元与reviewFacts覆盖、完整复核、正常发布/重开，不能以引用编码有效或场景阶段通过替代。
