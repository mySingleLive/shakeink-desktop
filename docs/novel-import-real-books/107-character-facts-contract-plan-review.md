# 角色facts字符串编码：独立方案审核

2026-10-27。**技术方案PASS；限定用例PASS，无P1/P2。** 绑定106 SHA-256 `dfd6184a20f0f1abe6a2057f2bed4132d07caaf152200e3f41959aaf790aa158`。本审核只读既有payload/service/generic生成与旧测试接点；未实现或执行测试，未操作实际app、模型、DB、原件或journal。

现service普通分析确为`z.record(z.string(),z.string()).superRefine(...)`，既有知识校验附在同record上，requestedArtifact保持完整原shape。新分支只为普通semanticVersion1/analyze/character的value z.string指定固定编码error，可保持key、值接受集合、text空串兼容、strict/optional、其它响应字段及知识/证据/kind/origin/source全部校验；不得以重建facts或artifacts为由漏掉原refine、required或晚门。原105映射、defaults真实桥、generic两轮/一次纠正均无需更改。

当前native提示同时陈述字符串字典和aliases/relationships数组结构，补充外层JSON字符串与字段内JSON文本的区别有静态依据。新合同仅匹配普通character请求，白名单来自既有character规则；示例只说明编码，不能建议清空有据内容、删人物或造可选值。其它kind/phase、reconcile、legacy或上下文恰含character均不触发。原段保持字节，payload数据不变，不改变模型、预算或重试。此为通用格式澄清，不是M01答案，也不证明rev41确由数组/关系/别名导致。

A11须保护旧A07–10完整前缀、至少9个无关prompt hash、原native/指导/封套及原定额fixed reserve；新固定文案必须自身适配预算，多字节/emoji和边界输入验证不能靠增大reserve通过。J09主要通路必须使用实际生产桥→generateJSON/Zod→runImportAi，检查各类非string的固定编码反馈及2次纠正上限；成功值、原输入、signal/role完全保持，不自动coerce/stringify/trim。用真实旧基线对照string/非string、可选缺省、其它字段/顶层shape及未知key（含原__proto__行为），并保留知识/来源/native/外键晚门。105未知路径保守安全提示和旧J01–08完整前缀保持。两用例先在当前真实基线取得干净RED；不预批旧用例适配。

仅批准以下两条定向命令，禁止全量：

```sh
node --import tsx --test --test-name-pattern='^NI-A(?:07|08|09|10|11):' tests/unit/novel-import-ai.test.ts
node --import tsx --test --test-name-pattern='^NI-J0[1-9]:' tests/unit/novel-import-request-schema.test.ts
```

本次读取基线：payload `87b9c0c1…855d6`、service `3dba02c5…f7a94`、AI测试 `401630f0…d2d28`、J测试 `e0ce2d2f…39404`。必要类型/desktop构建另记，UI不改不重跑Next。108代码审核通过后才按106保留原稿/九章/正文/预算及既有大纲信用，重开授权一次新合同重测；prompt变化不能用相同JSON payloadHash冒称同prompt。实际原因及文学完整性仍待后验，rev29/41负证据和来源入口PASS保持。
