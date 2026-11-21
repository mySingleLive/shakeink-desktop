# 场景复核冲突来源版本绑定方案

组合回归补记（独审scene_fix_review同意）：新增完整artifact索引信息后，ordinary scene semantic1的nonwizard legacy旧facts包可越过真实payload预算。仅对同一sceneScope，body调用原stageRequests时启用fullMetadata，facts不再使用legacy的requestFits豁免，均沿原per-unit/整包fits按冻结review profile重排。网络包数/边界可随新增metadata改变，原unit/fact任务几何、keys、coverage身份及全部原值保持；不裁材料、不扩额度。非scene、组合目标及旧semantic继续原legacy分支。

2026-10-31。本文件仅为技术方案，须独立审核及307用例独审后才实施。当前不修改产品、测试或构建，不调用模型。

## 已验证问题与范围

R23的924个场景均完成，场景阶段约6分40秒；该阶段通过不是完整导入通过。首个正文复核wave产生的原36项冲突均指向已有资料及其业务字段，其中20项source.value与当前完整字段一致，16项不一致。后续app正常提交新增冲突后，离线验证仍只选择原前36项中的这16项，未扩大集合。

原 `semanticDecision` 对这16项的32次合法决定分支全部以固定“冲突决定与当前设定版本不匹配”拒绝；15项setting-body使用source/inferred，1项source-source使用其合法等价分支a/b。模型调用、写入、网络均为0，原文件及私有owner不变。因此不能把这些冲突作为可直接接受的作者决定，也不能通过放宽版本比较或覆盖source.value制造成功。

R23另已确认在正文复核5589单元完成、facts复核尚未开始时，因“模型结构事实超过复核分片预算，请细分设定后重试”失败：某完整自由文本字段27529字符超过原piece16384。该独立问题由308/309处理；本方案不分割事实字段、不加入factRange、不改变分片或结构化JSON字段规则。R23原工作与冲突继续保留，不改phase、不清冲突、不伪造publication。

## 备选与选择

| 方案 | 能解决什么 | 边界 |
| --- | --- | --- |
| 仅提前严格比较raw source.value | 将本包可核验的错值送入原两次生成纠错，改动较小 | 模型仍须逐字复制长字段、换行、空值及真实外键，无法消除这类机械抄写错误 |
| 严格索引绑定，加raw完整值检查 | 已有字段由应用绑定其本包真实完整值；明确坏raw仍拒绝并可使用原一次纠错 | 需要显式的完整可绑定字段表及范围拒绝，不能拿片段或未展示内容补值 |

首选第二种。它改变来源值的编码与提前核验，不改变冲突是否真实互斥的判断，也不降低原作者决定版本门。

## 精确scope与协议

复用296的纯scope：semanticVersion=1、phase=review、selectedTargets恰为`['scene']`，conflict与intent均undefined。作者解释复核、其它目标或组合、旧协议及analyze/patch不变。原RA早期raw证据分支范围保留；296的unitIndex证据合同不变。

- source可使用严格且仅有一个自身键的`{artifactIndex}`。索引是本次完整request.artifacts数组的0-based位置，不能指entities目录、全书资料或其它包。缺失、非整数、负数、越界、多余键、混合artifactId/text/value/unitId/field以及undefined自身额外键均拒绝，不strip后接受。
- 索引只绑定根conflict.field对应的原字段，不在引用内新增field，不修正根字段名。字段必须属于该资料原kind/schema的业务字段或text。根id/hash/status/type/kind及其它字段沿用原base合同，不强制kind为scene，也不把body改成scene。
- 合法绑定恢复为原canonical alternative `{artifactId,text:完整字段值,value:完整字段值}`，不残留artifactIndex。相同文本但不同ID按索引区分；不按名称、别名、相似值或文本匹配选择资料。空字符串只有原本确实完整提供时才照抄，保留空白、CRLF、Unicode及超过512字符的值，不trim、不截断、不补默认内容。
- source-source的candidate可用相同严格索引形式；其已知已有资料的raw candidate也须完整核验。setting-body的candidate仍是实际待议提案，保留原raw合同，不把提案自动改成当前值，索引形式在该侧拒绝。无artifactId的body-body原unit来源形式保持原行为。
- 不给missingTargets新增artifactIndex或其它值绑定wire；其现有三元组、投影、证据及预算行为不变。

## 不可变的完整字段绑定表

拟使用一个纯helper供payload与service共用，先核对原reviewProjection，再从同一不可变request快照建立表。每份payload artifact副本仅增加artifactIndex与bindableFields字段名列表；不再复制任何字段值，不改原artifact/text/facts/projection、目录、章节、证据、单位、锁定值或作者已确认决定。

1. facts字段须在该entry中有自身字符串值，并由其对应projection.fields及fullFactKeys证明已提供。现有 `iterateImportReviewTasks` 的facts分片保留完整原子值，字段表不能把其误当可截断文本。未展示或缺省字段不由绑定器猜为空值；原本完整提供的空字符串可以绑定。资料schema的字段集合继续来自原 `importFactFields`。
2. text只有当前请求中同ID的投影范围共同完整覆盖`[0,fullTextLength]`时才可绑定。按可信UTF-16坐标恢复原文，起点、终点、范围长度及元数据须一致，无缺口；重叠内容必须一致，不能任选一片或拼接缺失部分。无textRange表示未提供文字；即使fullTextLength为0，也须有明确完整范围才能把空text当作已提供值。
3. 同ID各片的id/kind/name/schema/origin、semanticHash、fullTextLength、fullFactKeys须一致；schema不能因为现有projection检查未比较它而被遗漏。同字段的重复完整值不得互相矛盾。冲突元数据不能择一覆盖；静态拒绝，不进入模型。text的完整性可由同包同ID各片证明，但不能借其它包、磁盘完整owner或未发送资料补齐。
4. artifactIndex与可绑定字段列表都绑定这份快照与原数组顺序；不原地排序或修改输入。若字段不能完整绑定，索引引用静态拒绝，指示延后到完整资料复核阶段或选择本包已完整提供的正确字段。

## raw核验、固定纠错与原门

原合法raw alternative格式继续可用；不因为增加索引而覆盖显式坏值。对本scope内已知source artifact，根field若在本包不能证明完整可核验，raw source同样以固定范围说明拒绝/defer；不能继续接受将来无法按原版本门应用的来源值。source-source的已知candidate同理。该新增范围门须作为方案及用例独审的明确内容，不藏在“兼容旧格式”中。

字段完整可用时，raw `.value`必须逐字等于该字段当前完整值；不要求把原合法raw `.text`重写成value，保留其它原字段及后续unitId范围验证。不能拿短描述、摘要、某个text片段、地点名称代替ID或裁剪后的字符串参与比较。明确不等时只给固定说明，要求使用可绑定artifactIndex或完整真实当前值；不将坏raw规范化为正确值。无artifactId的纯正文unit形式及setting-body实际candidate提案不受此字段值绑定规则改写。

新wire先严格解析，绑定结果仍经过原完整base、证据/单位、来源/实体、投影/锁定、知识归属及末端授权/取消检查。原 `semanticDecision` 的source.value与当前字段逐字比较、conflictBases版本门、原生字段检查和后续修订/决定流程原样保留。

新增错误说明只含固定字段/形式及范围指导，长度符合原250字符反馈上限；不回显值、原文、未知键、资料名/ID或cause。通过既有generateJSON最多两次生成纠错，不增加外层review重试、不换provider/API、不改模型/思考、额度、timeout、并发或保存设置。索引正确仅证明来源编码精确，不证明模型所报事实互斥。

## 预算、验证与真实验收

完整artifactIndex/bindableFields及固定提示必须进入原payload字符/单位、固定UTF8说明和wrapper预算。原主进程planner和service共用同一新增序列化结果；超限时按原完整packet fits确定能否发送，不能删字段、压缩值或绕过guard向模型发送旧包。只读复测须重新用原planner取得合法包，不能声称与历史出站逐字节相同。

独立方案审核→307最小用例独审→真实JSON桥RED→最小实现/GREEN→独立代码审核→受影响定向组/类型/构建→同范围只读当前模型复测→全新会话原件全文默认全选场景、所有正文与冻结reviewFacts任务、正常发布/退出/重开完整材料核验。不运行全仓测试。

合成用例须证明新review产生的来源可通过原决定版本门，并且错误来源仍被原门拒绝；只过JSON不算成功。本修复不追改R23已有坏source.value、不删除既有冲突，也不以阶段绿色、离线32拒绝或局部模型通过代替完整导入验收。
