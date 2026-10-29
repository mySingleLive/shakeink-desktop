# 角色结构失败安全诊断：独立代码审核

2026-10-27。**PASS，无P1/P2。** 绑定103/104已审范围；只审两份冻结交付及真实基线，独立执行批准的J01–08，没有操作app/M01原件/私有journal/用户DB或调用真实模型。

| 冻结交付（执行前后均匹配） | SHA-256 |
| --- | --- |
| desktop/service/novel-import-ai.ts | `3dba02c56f7572c49366bc7a6be9fd09a07bdf6fdc60235cdd997da76cdf7a94` |
| tests/unit/novel-import-request-schema.test.ts | `e0ce2d2f3a6eb2bcfaea17b5c369a3c39aa5df68ffdb8b7b88bb5190b6c39404` |

真实/tmp基线service为`20b80cc2…c1ea`。完整差异仅generateImportAiJson函数：原调用和返回.data不变，新增typed最终拒绝catch。该函数外全部service字节严格相同，包括schema/defaults/所有helper/晚门。原J01–07完整73346字节前缀SHA仍`4485611f…bfa6`，仅追加J08。generic generate/main/payload/semantics/core控制SHA均保持。

转换严格限定未abort、普通semanticVersion1/analyze/character、非reconcile、实际StructuredGenerationError.invalid_schema；其它错误原对象透传。只看前6条、长度≤100的字符串路径，用完整段数、规范安全整数索引和character字段白名单选择固定中文标签；索引及未知路径不输出。Object.hasOwn防继承键，标签去重最多6个，静态文案长度<180，可直接经过现有main安全门。没有读取原message/feedback或附cause，无raw值/路径回显，也没有新schema、第三次生成、成功转换或授权/预算变更。

唯一独立执行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[1-8]:' tests/unit/novel-import-request-schema.test.ts
```

**34/34、exit0、fail0、skip0、cancel0，887.076042ms。** 独占日志`evidence/character-schema-diagnostics-independent-j01-j08.txt` SHA `fb3fafa8e7af59379874f64c6db8d6671c815d13aa8af2332822fe8d12713b42`。元数据`evidence/character-schema-diagnostics-independent-review.json`记录完整基线、控制、历史和命令SHA；没有额外suite/独立类型检查或构建。

主反例实际走runImportAi→生产桥→真实generateJSON/Zod→两次仍坏→真实main prototype.safeError；别名/关系数组仅为合成反例，不是实际M01根因。首坏后好2次、首好1次均保完整成功对象/输入和signal/role，原defaults实际桥接由旧J01保护。真实未知/超长/换行/Unicode事实键无回显；另列typed恶意元数据覆盖首6项、安全索引、重复、继承键与错误形状；不冒充主要Zod通路。已abort不映射，legacy/其它阶段与kind、provider/Abort/同形对象、invalid_json/incomplete保持原错误身份及原两轮上限。

TDD历史保留：初混合RED因新DI漏model参数为29/34；修正夹具后原20b80干净RED为30通过/4失败。首次实施32/34的失败来自新`__proto__`反例错误预期；原Zod record对此键跳过，作者未修改接受集，仅把它移入明确单列typed安全反例，最后34/34。旧测试未删改，未把这些夹具问题计为生产缺陷。

本结论只批准安全诊断实现与定向验证，不认定rev29具体坏字段/网络或其它原因已查明，更不证明实际角色/场景完整。真实同草稿的一次授权诊断恢复、全部目标及文学审核仍由主代理后验，既有来源入口PASS与失败历史保留。
