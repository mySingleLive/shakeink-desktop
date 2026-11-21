# 世界线目录引用前置到既有纠正：方案与限定用例

日期：2026-10-26。待独立审核，未编码。

## 新实际诊断

S02 rev242本次实际失败已显示“导入结果引用的角色不存在或同名不明确，请核对角色资料后重试”；worldline-unknown-character-failure-rev242.json SHAd1dfd310641bde596c3039bbdfcf6122f39d82612147d96e4110d5b988e0e5b0。服务调用rejected，43产物/覆盖/原文5310/14章保持，没有再次重试。该消息对应service.validateSemanticLinks的确切固定角色引用错误，但没有raw，不能知道具体姓名/ID，也不能追溯认定129/164/203原因。

现世界线native格式已在schema预检，而目录角色/父级/全图引用仍在generateJSON一次纠正之后检查。没有对应角色卡或使用非唯一名称/别名的引用不能通过；不能放宽到任意姓名、自动造角色或冒用现有角色。

## 唯一生产变化

仅`desktop/service/novel-import-ai.ts`的importAiResponseSchema：在现有sem1普通analyze、kind worldline分支，对非空新artifacts数组非变换复用原`validateSemanticLinks(request, artifacts)`做响应级预检。使用原完整可信catalog和本批真实候选，不改该helper或任何引用/身份/父级/循环规则，不用有损provider目录替代本地验证，不发明人物、介绍或别名回退。

失败只给固定安全schema issue（明确people只能引用已提供的角色id或唯一name，父级只能同类既有/本批节点，ID身份不可混用）；不回显catch/raw值/ID/姓名/正文，不列出动态目录。指导缺少可引用角色时保留有证据事件及人物原称谓/认知归属在text/attribution中，people仅填当前已存在可引用部分，不能伪造外键或为了通过而删改正文/丢失有证据事件。完整性审核仍必须补齐缺角色及相关线，不能以空people直接宣称完整。

只让原一次格式纠正接收到已存在的目录约束；不增加重试/改变prompt或payload/权限/预算。原validateSemanticLinks晚门以及main全图门都保留，不改legacy、其它kind、reconcile/review/patch/classify。无新产物时仍走原notFound和后续晚门，不把本地catalog错误吞为成功。

## 限定用例与事前批准的旧前提适配

仅`tests/unit/novel-import-request-schema.test.ts`新增NI-J06：真实生产bridge/原generateJSON DI的未知/歧义角色、非角色ID、错误类型父级/循环/身份冲突首坏次好2次、持续坏2次停、首好1次；合法角色id/唯一name与本批父节点通过。完整本地catalog条目即使provider过滤也不能被错判，不制造catalog-only资料。固定反馈路径/无秘密值或名字回显、raw/request/signal/role/wrapper保持。

世界线格式合法但目录非法的新响应schema应拒绝，原纯native validator仍可通过，说明只是引用门提前；所有晚helper正文逐字不变。其它kind（包括narrative）的非法角色引用仍经原真实late门拒绝，验证通用晚门未移除。

预先明确两处不可避免的旧前提适配，不删旧安全目标：

- J04原“格式合法但世界线引用非法schema true、仅晚门拒绝”改为明确schema false/真实run仍拒绝；纯native格式通过、全图约束继续保留。原其它native/legacy/门断言原样。
- 实施时明确的合法fixture口径：J04 people-raw-strings原值含带前后空格的姓名，pure native合法但原目录没有该逐字名称。只在这一合法行的局部request增加独立ID、逐字同名的可信character目录项，保留原catalog及全部原facts/空白/不变换断言，不改全局基准request，不trim姓名或加alias回退。该新增fixture用于让完整引用前提合法，不属于放宽生产接受规则；先新J06真实RED顺序不变，差异和独立代码审单列核对。
- J05原两个worldline fixture取得实际late角色Error的路径将被新早门阻断；保留这两个worldline为早拒绝反例，另用格式合法narrative的narrator未知/非角色ID，在未改的同一validateSemanticLinks晚门取得两个原确切Error并接main.safeError，保留实际错误通路、安全映射与零结果目的。不是手造Error替代或删断言。

先保存service/J测试真基线，新增J06干净真实RED；上述旧前提仅在生产变化后作批准适配，不用改预期伪造原来已早拒。最小GREEN和独立代码审核，只有两精准命令，不全量：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[123456]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[789]:' tests/unit/novel-import-ai.test.ts
```

必要类型/desktop build另记，UI/worker不变不全量。通过后同S02正常退出/新构建重开、原目录/同模型范围重授权，对43产物/信用/原文/14章/预算逐项保持，只恢复世界线。原角色遗漏及trope误判等文学FAIL仍保留，必须在实际完整性修订和独立最终复核中解决，不能拿本次引用格式通过代替全部目标/其它书/LIFE验收。
