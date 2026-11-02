# 场景复核冲突来源版本绑定最小用例

组合补记：保留RW原8000窗口legacy夹具，不换v2、不删除断言。其真正组合RED五节点来自nonwizard普通scene facts包漏计新增metadata；接线修复后需原PY/RW/runtime组全绿，原wizard/nonwizard对应包在同一完整预算下比较，全部原task keys及已有body/fact credit身份保持。网络包边界可重排；非scene/旧semantic legacy黄金和真正超预算拒绝负控继续通过。

2026-10-31，依据306。当前仅用例设计，待方案与用例均独立审核通过后才编写测试和执行RED；不改产品、不构建或启动app，不调用provider，不读取真实书稿/响应内容。

## SV01：真实JSON桥绑定完整来源，并通过原决定版本门

使用实际generateImportAiJson→generateJSON→runImportAi及预定合成响应，不以伪模型“看到说明才成功”声称供应商保证。

- setting-body source用`{artifactIndex}`绑定根field；source-source两侧分别绑定原当前完整字段。结果与同一合法完整raw response经过原流程的canonical基线相同，保留原冲突hash/id、type/kind/status及全部其它字段；setting-body candidate仍保持真实提案原值，不被改成当前值。至少使用一个超过512字符、含CRLF/前后空白/非BMP和首尾哨兵的完整字段，另覆盖已提供的空字符串。
- 同文异ID及跨包相同index明确选择各自当前资料。payload只给原artifact副本增加index与字段名列表，原facts/text、全部材料、投影、锁定与已确认决定不变，不重复传输值；所有原对象及response不被原地修改，canonical中无artifactIndex残留。
- 将真实桥已接受的合成冲突用于原controller.semanticDecision，选择该type允许的合法source/inferred或a/b分支；通过原版本比较后到达受控的后续合法决定/修订边界，例如semanticRepairs的fail-closed钩子，在clone尚未assign回owner或任何writer之前中止，证明owner不变且AI/写入为0。不能仅断言JSON解码成功。对显式错误旧source.value另作正控，原固定“冲突决定与当前设定版本不匹配”仍须在该后置边界、模型/写入前拒绝；不修改该比较。

## SV02：完整性、严格wire和明确坏raw保持拒绝

- 一张最小反例表覆盖负/越界/非整数/字符串索引、混合raw键/内嵌field/未知键、undefined自身额外键，以及根field不在目标字段表或未完整提供。持续非法通过真实JSON桥最多两次生成；不得strip、换字段、丢坏项或用猜测值接受。
- facts必须是本entry完整提供且投影确认的原子值；缺失字段不猜为空，重复同ID字段值矛盾不择一。同ID元数据冲突反例至少包括schema不同而semanticHash及其它投影一致，避免被原本已有的别门提前遮蔽。text的多个片段连续完整覆盖、重叠内容一致时可接受；缺口、无textRange、缺失片段及重叠不一致不得重建；不能借其它packet或完整owner补值。原始全文保真，不裁为512或其它示例长度。
- 已知source artifact的raw field未完整可核验时固定scope拒绝/defer；完整可用但raw source.value不等时固定版本说明拒绝，不能静默改成索引结果。source-source已知candidate同样核验；setting-body candidate提案维持原合同。首坏raw→第二次合法index的预定响应必须真实恢复，证明只有既有一次纠错；实际纠错段含完整固定指导且≤250字符，无额外键秘密、值、原文/ID或cause回显。
- 作者conflict复核、其它target/组合、旧协议、非review或含intent者不启用新source编码/核验，旧payload/prompt黄金及合法raw保持。body-body无artifact的unit来源、kind=body和原RA证据早期分支不收窄；不强制conflict.kind=scene，不向missingTargets增加新wire。已有RA/UR组覆盖原证据接受集合，避免重复整套矩阵。

## SV03：完整预算及原语义/授权/决定保护

- 冻结合成payload基线，只允许artifact副本增加真实数组位置和完整可绑定字段名；资料全文、完整facts、reviewProjection、所有units/目录/章节、semanticLocks及作者决定逐值保留。新metadata与固定提示进入原完整payload和UTF8 wrapper预算；先证明原输入可用，再构造新增metadata使其超限的反例，零模型调用，不能删内容或隐式新分片通过。真实review pin与主进程/service序列化一致。
- 正确索引不能绕过包外实体/单位、投影与锁定、阶段、知识归属或最终模型授权/取消。选一个不完整字段范围与一个包外引用反例，再以末端撤权或abort验证无可提交结果、无新增模型重试。作者决定时若来源随后变更，仍由原版本门拒绝，不能因引用曾有效免检。锁定只按原有修改/遗漏/决定规则检查，不把“锁定字段上报告矛盾”擅自改成一律非法，也不自动解决该冲突。
- 独审时同时检查生产默认生成接线使用该绑定/早期raw门，而非仅测试独立helper；验收须包括canonical来源回到原决定流程。模型返回的互斥判断仍需语义核对，索引值正确不等于冲突真实。

只运行必要定向组，既有严格字段、证据、投影和author决定回归复用，不用RSS/墙钟阈值或更大heap伪造单位通过。真实模型复测与新会话全场景、全部正文/冻结reviewFacts、正常发布和重开另由主代理执行；R23原16拒绝证据和独立长自由文本分片问题保留，不以本组通过声称完整导入已成功。
