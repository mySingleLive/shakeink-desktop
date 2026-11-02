# 场景资料正文澄清定向用例

2026-11-01，依314方案及独审。只将静态指导送达、原数据与门保持记为单测；模型是否遵循与长尾是否改善只能由真实当前接口和完整新会话证明。

- SPG01：通过原 generateImportAiJson→generateText→真实AI SDK MockLanguageModelV4 捕获native responseFormat.schema及实际prompt；text.description与prompt明确当前目标场景资料说明、全部不同有据事实及相关关系/历史/时间/归属完整，原文正文由应用保存。注释在SDK入口仍存在，不仅检查helper返回值。旧代码应因缺少字段说明真实RED。
- SPG02：原完整units、target、目录、8引文及payload逐值/字节不变；复制schema仅剥text.description后与原固定文法逐值/字节相同。现有WG03只允许此明确注释差异，保留原payload哈希和剥注释后的原schema哈希，不删除其它断言。
- SPG03：预定完整wire包含超过27529字符的text及四个长字段、Unicode/CRLF；原适配和service末端校验逐值保留全部值/引用。无maxLength、截值或只收前项，不把全量接受依赖于缩短资料。PG01可与此组合，不复制测试实现。
- SPG04：预定首length后合法stop仍只使用原第二gen，业务字段说明和输入完整保留；持续length仍拒绝且无资料提交。既有SO/WG四gen及授权/取消、错误facts、知识/证据等负例照跑，不将说明当宽松接受门。
- SPG05：新增注释和prompt完整参与角色实际容量与payload预算；预算不足于generate前拒绝，边界cap保持32768或原默认，原OC/WG预算负例照跑。非native能力路径及普通review保持原通道，不增加模型、thinking或并发。

实现范围仅 structured-scene模块、定向新测试与WG03注释差异适配。RED记录不能把提前失败后未执行断言记为已执行。GREEN后独立code review、场景/结构化/预算/AI回归、无增量typecheck与desktop build；随后当前接口同目标只读测试及全新全文默认全选、全部复核/保存/重开。所有R25/R26失败记录保持不可覆盖。
