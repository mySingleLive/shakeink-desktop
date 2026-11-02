# 场景冲突来源版本绑定方案独立审核

2026-10-31，独立审核者 `scene_hierarchy_review`。先审核306方案，再进行307用例审核；未参与本方案编写或产品实现。仅读方案及既有projection、alternative、semanticDecision相关源码，未读真实小说、配置/Key、私有journal或响应，未调用模型或启动App。

**方案通过，无设计阻塞。** 明确区别于原始坏raw的自动修补：模型显式选择新的严格artifactIndex编码时，应用只恢复本包已完整提供的真实当前字段；原raw格式的明确错值或不完整来源则拒绝，不能静默替换。这项raw范围收紧已在306公开，不以“原格式兼容”掩盖。原semanticDecision版本比较与conflictBases门保持，索引正确不代表互斥判断正确。

审核确认的必要边界：

- scope与296相同，只有普通semantic1/scene-only review。索引引用当前request.artifacts完整数组的位置、只绑定根field，原kind/schema字段表或text以外不得绑定；无名称/别名/跨包/磁盘owner猜测。body-body无artifact的unit形式、kind原枚举、作者解释复核及原RA早期证据分支不收窄，missingTargets无新wire。
- facts须为本entry自身完整字符串且投影确认，缺省不补空；text须本包同ID可信UTF-16范围完整覆盖，重叠一致、无缺口才恢复。schema已在独审后明确加入同ID身份比较，不能只依赖旧assertImportReviewProjection（其没有比较schema）。元数据或同字段值冲突整包静态拒绝，不择一覆盖。
- 严格单自身键、混合/未知/undefined键均拒绝。恢复完整值及原artifactId，保留空字符串、CRLF、Unicode与长值；原raw.text不强行改写。source-source candidate按同一完整来源门，setting-body candidate保留真实提案，不能应用当前值替代它。
- binding表与payload/service共用同一不可变快照。payload仅追加index和字段名列表，保留全部原值/投影/证据/目录/章节/锁定/确认决定，不为方便抄写复制字段值。新增metadata和固定prompt计入原完整预算，超限重新走原planner，不能删内容或修改模型/思考/容量/并发/两生成上限。
- 所有原base、证据/单位、来源/实体、投影/知识/锁定、授权/取消及作者决定门继续执行。原semanticDecision只接受当前源版本的比较必须实际回归；来源随后改变仍应拒绝，不能拿曾经有效的索引作为豁免。

固定错误/范围说明须完整落入实际第二轮反馈的250字符限制，不回显值、未知键、原文、名称/ID或cause。未完整展示的已知字段采用固定范围拒绝/延后，不从owner补值、不本地删除坏冲突。该策略与原正文/facts全部覆盖和作者处理门共同验证；不能因此宣称所有冲突均真实或可直接决定。

306正确区分两份实测证据：原16项来源不一致在32个合法分支被版本门拒绝；R23本轮完整流程的精准失败是另一个长fact piece尺寸门，交308/309处理。上述私有运行证据由主代理报告，本审核者未独立读取或复测，不将其写成自己执行。

本审核仅批准设计。待307独审、RED/GREEN及代码独审后，仍须受影响回归/类型/构建、合法重排包只读模型复测和新构建完整导入/作者冲突处理/正常发布重开；旧R23冲突不追改、不清除，旧冻结hash与失败状态保留。
