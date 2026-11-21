# 原文证据定位schema前置：独立方案审核

日期：2026-10-26。技术方案 **PASS**；限定用例方案 **PASS**。无 P1/P2 必修项。允许按70限定TDD，不代表代码或实际S02已通过。

## 身份与范围

审阅 `70-evidence-schema-plan.md`，SHA-256：`e0cdf723916d263217dc752d92276156af1720695b4ae305c3b37dc40670e6c3`。只读核对已知service请求schema、anchorEvidence及晚校验，现有J01/J02和generateJSON/parseJsonOutput接点；未修改生产/测试、未执行测试，未访问实际S02、应用、模型、journal或用户数据库。

主代理报告的rev26为大纲0/6、no-match、零产物/coverage空且正文及14章保留。本审核未读取真实快照。没有失败raw返回，不能判断具体坏引句、推断模型改写方式或排除其它原因。

## 技术结论

原anchorEvidence对每个entry独立定位，返回新对象；精确包含直接接受，排版路径再执行最短长度、唯一性、Han空白与Latin/digit词界限制，并由UTF-16范围恢复原文。新语义普通analyze的evidence字段逐entry调用同一helper、丢弃返回值，可将相同接受规则前置到schema，不必新写近似匹配逻辑，也不会提前替换raw quote或request。

必须按70保持非变换校验：定位失败仅产生固定安全issue，路径对应artifacts.N.evidence.N，不传播caught错误文本、unitId值、引句或来源正文。定位规则不改；原late anchorEvidence/validateImportEvidence及知识、native、引用、main门均保留。精确短引句、重复精确包含原本可接受，不能误用排版路径的长度/唯一性要求收紧它们。

生产defaults调用generateImportAiJson，生成及runImportAi最终解析共用importAiResponseSchema。原generateJSON只允许两轮生成，已有反馈限制为最多6项、路径100字符、message250字符；固定提示可进入该既有一次格式纠正，不增加外层重试、prompt或预算变更。legacy、其它phase及reconcile仍返回原schema对象，不能顺便扩展证据预检。

## 限定用例结论

J03须通过实际生产bridge和真实generateJSON、仅使用既有generateText DI，验证首坏后好恰好2次、持续坏2次后invalid_schema、首好1次；固定反馈字段、安全指导、相同signal/模型/role/action、wrapper预算及无原文/坏值/ID回显均需断言。另以原晚门对照精确短/重复、合法Han排版唯一回映射、未知unit、不匹配、too-short、ambiguous、Latin词界、跨unit/拼接反例；schema保留原quote，仅晚门恢复原文。独立坏kind/来源与坏证据应分别给出字段问题，不能以另一项前置失败造成假覆盖。

J02只允许调整既有“坏证据schema为true、晚门拒绝”这一过时前提为schema拒绝及runImportAi拒绝；native与link的原schema通过/晚门拒绝断言必须保留。J01、其它J02断言不减，legacy与其它phase原schema身份、晚门和原值保持均需保护。所有材料合成，不将bridge通过记作真实模型成功。

仅批准70的两条精确命令；先冻结生产真RED，再最小实现/GREEN及独立代码审核：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[123]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[356]:' tests/unit/novel-import-ai.test.ts
```

本轮未执行上述命令。后续真实同S02重测仍须重新明确目录及发送授权，核对来源、5310字正文、14章、预算与成功信用，保留rev26失败；大纲、全目标语义、发布及重开另行验收。
