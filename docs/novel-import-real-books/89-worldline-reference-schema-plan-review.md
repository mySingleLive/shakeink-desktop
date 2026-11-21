# 世界线目录引用schema前置：独立方案审核

日期：2026-10-26。技术方案 **PASS**；限定用例方案 **PASS**。无 P1/P2 必修项。允许按88限定TDD，不代表引用或文学完整性已通过。

## 身份与范围

审阅88方案，SHA-256：`d903702a8844465fe1a6990f5250eee996fdc1e0a3268b8d91f29b351119f62d`。只读已知service schema/validateSemanticLinks、main.requestSnapshot、payload目录过滤及J04/J05接点；未编码、执行测试或访问实际run、小说、journal、应用、模型、账户或用户数据库。

rev242对应角色引用错误与43产物保持来自主代理报告，本审核未读取真实快照。固定诊断可说明该次拒绝的错误类别；无raw仍不知具体姓名/ID，不能追溯129/164/203原因。

## 技术判断

现requestSnapshot保留本地完整实体目录，serializer只向provider发送相关条目；两者不可混为一份目录。原validateSemanticLinks使用request.entities、上下文artifacts及本批候选，建立本地Map并校验类型/身份/父级/循环/角色和锁，不写入这些输入。仅对semanticVersion1普通analyze/worldline的非空候选数组，在响应级非变换复用该helper，能够前置相同约束，不必新增别名回退或另一套引用规则。

必须保持helper及所有late调用逐字不变：原native可通过但引用不合法的响应改由schema早拒；无新产物、空数组/notFound路径仍走原后续检查，不能吞掉本地目录错误。legacy、其它kind（包括narrative）、reconcile/review/patch/classify不增加该预检。

固定issue只陈述people的现有角色id/唯一name、同类型父级和身份约束，不传播动态catalog、catch消息、姓名、ID或原文。原一次格式纠正及反馈/wrapper界保持；指导应在原250字符message界内完整容纳必要限制。缺角色时允许原本合法的可引用子集，并在text/attribution保留有据事件、原称谓及认识归属，不授权删正文、伪造人物、任意别名映射或把事件变成无依据notFound。

这不会自动补齐角色或两线。空people或引用校验通过都不能证明完整；原角色遗漏、trope误判等文学FAIL仍待实际完整性修订及独立复核。

## 用例与旧前提适配

新增J06应通过实际生产bridge/真实generateJSON DI验证未知/歧义角色、非角色ID、错误父级、循环及身份冲突首坏次好2次、持续坏2次停止、首好1次，并验证合法角色id/唯一name和本批父节点。完整本地目录中被provider过滤的条目仍可引用，不能用有损payload反向作验证目录，也不制造catalog-only产物。固定反馈路径/不回显、request/raw、signal/role及原预算须实际断言。

两处旧适配合理且范围明确：

- J04仅将非法worldline引用的schema通过前提改为早拒，保留纯native格式通过、真实run拒绝及原全部其它断言。
- J05原worldline两fixture保留为早拒反例；新增格式合法、schema/native通过的narrative narrator未知/非角色ID，经过未改的同一validateSemanticLinks晚门捕获两个确切原Error后交main.safeError。必须保留真实生成/零有效结果及错误字面断言，不能手造Error或让章节/格式/身份早门冒充角色晚门。

先在未改生产上新增J06取得干净RED，再实施并作上述事前批准适配；不伪称原schema已早拒。仅批准88两条精确命令，本轮未执行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[123456]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[789]:' tests/unit/novel-import-ai.test.ts
```

其余J/A旧断言不减；代码审核须核对完整真基线差异及原晚门保留。构建和同草稿原目录/同模型范围授权恢复另记，逐项保留43产物/信用、正文/14章及预算。真实引用、全目标文学、落库/重开、其它书与LIFE均另验。
