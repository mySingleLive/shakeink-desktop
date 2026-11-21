# 场景具体身份共享与纯计算代码独立审核（326）

2026-11-01，审核者`structured_generation`。未参与本范围实现或纯计算测试编写；只读源码、方案和用例，执行合成定向测试及类型检查，未改产品/测试、构建或启动App/API，未读取真实小说或Key。

**冻结版core/shared/state及registry接线审核通过，无本范围遗留阻塞。** 不认证主进程排程/持久化、自己实现的service或真实全书结果；主流程以327、界面以328及主代理最终验收为准。

## 审核范围与冻结身份

方案最终SHA256为`f6aee4a01d8816757b5be723c24da94908eb45ee9e0491a894acd0192d239788`。已按323/324核对：

| 文件/范围 | 审核SHA256 |
| --- | --- |
| `desktop/core/novel-import-scene-identity.ts` | `16c8f9b7d33f487328675f8fad71a61018d89675db12f6b798727125af43ced4` |
| `desktop/shared/novel-import-scene-identity.ts` | `1ba67acd4600937390a1ebc62942e9c55d0894714bf7c73db1cf98542420924e` |
| `desktop/core/novel-import-wizard-state.ts` | `b4403cbcf863a0a7cde5914098e96f893fa4375f6604e2007bd595ce8547e7e4` |
| `desktop/shared/novel-import-wizard.ts`，仅候选sceneIdentityState | `87999bcd86aac25a0cff43c10b03dd0f6a23d38bc266766009d88694d8685b65` |
| `desktop/core/novel-import.ts`，仅sameEntity/merge的可选registry接线 | `b8034dd5dd9cab780b4cbc974deab1d45991f0a47dea3ef9c41f3996dc31979d` |
| `desktop/core/novel-import-semantics.ts`，仅importSemanticIdentity函数 | `84c8172d0978f528cde605c8abbdfda04209941125a0b8de27eeab03e416256b` |
| `tests/unit/novel-import-scene-identity.test.ts` | `8d444e0b7d7159455549f34864855584ad7abf7b8dc7cbb992a9d9911e24f5a7` |

混合owner文件的整文件hash只标识当时快照，不扩大上表的审核区域。service请求/结果类型、main写入及view接线未算作本次独立代码审核。

## 已关闭的实际缺口

- **不同具体地点与已决定归属。** 字面/alias不直接union；相同具体context的全部相容组件进入有界核对，异名也不因AND同词被漏掉。无额外定位的纯共同字面不产生付费任务，保守来源限定，不声称专名已全书归一。模型传递关系不能偷改作者partition；机械互斥的完整原记录/关系保留为unresolved，不能继续生成混合PLACE。初审纯API的三记录同/不同矛盾曾直接抛mixed并丢失本次可显示记录，最终测试实际证明完整待确认及后续正常partition。
- **显示名与原始资料。** 全部context留ledger；默认组合超过native50限制时从已有parts选择可用短组合，不slice原词或丢原记录。真正互斥或作者defer的unresolved不会因改label便成为PLACE；候选/registry/expectedKeys仍阻止未确认项进入正常生成或以空集合完成。
- **跨批材料和严格服务接线。** 同ID多个source slices不再Map覆盖；原已授权superset可恢复真实gap，但owned前缀、copy/ownership和便利引文不扩大。重复、逆序、交叠源前缀及重复supports先拒绝；初审重复同一真实范围而拼成较长同值block的探针已由正式反例覆盖。非unknown源quote实际通过apply→完整assert→再计划/membership，不只测构包。作者拆分后请求只投影本part成员/字面别名，ledger完整raw记录保持；knownRelations仅在包内闭合，完整ledger仍作最终约束。最后正控实际经过runImportAi，证明没有用fits=true掩盖生成前服务拒绝。
- **工作版本与历史。** workingRevision加入sourceScopeHash，独立canonical哈希有预期；新工作版本即使正文相同，新member命名空间也不会重放旧partition。旧决定留审计。model parent cycle repair按原完整目标/图/证据门入ledger，保留历史而不伪造作者决定，unknown原证据仍在；后续追加/计划不复活旧父级。纯unknown task进度不改identityRevision/hash，也不重复付费。
- **身份判等、覆盖及容量。** 显式registry在省略可选legacy版本参数时仍权威，未注册ID拒绝；无registry旧行为保持。201条成员不被200截断，mixed review可按当前完整artifact hash及实际owned范围给proof；短片、旧hash、无artifact和未确认项不能借空keys过门。七类集合逐项结构max/+1、真实总引用50000/+1、otherwise合法唯一relations+decisions组合20000/+1，以及含新ledger的真实UTF8 journal N/N-1已验证；1GiB默认未提高，未分配1GiB测试对象。

## 独立执行结果

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-timeout=60000 tests/unit/novel-import-scene-identity.test.ts
```

exit0，**37/37通过**，fail/cancelled/skipped均0。日志`/private/tmp/scene-concrete-identity-core-independent.txt`。独立核对三个冻结hash与作者完全一致后执行，未在运行期间修改对应源码或测试。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-timeout=60000 tests/unit/novel-import-scene-identity.test.ts tests/unit/novel-import-scene-identity-service.test.ts tests/unit/novel-import-semantic.test.ts
```

exit0，**86/86通过**。日志`/private/tmp/scene-concrete-identity-core-integration-independent.txt`。37包含在86中，不叠加计数；service44只是互通回归，本人是其实现者，不把此命令当service独立审核，service独审为325。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node node_modules/typescript/bin/tsc --noEmit --incremental false
```

exit0，日志`/private/tmp/scene-concrete-identity-core-typecheck-independent.txt`。类型检查是当时全工作树的实际结果，不替代其它owner代码审核。

## 验证边界

用例是全合成材料，校验字段、范围、引用、版本及源值完整性，不证明模型理解全部空间关系或小说语义。SourceBlock supports必须由main按原文件/kind授权提供；source-copy等值proof、实际review/facts/ownership重排与最终credit仍由main原门落实。选择状态是wizard candidates的唯一来源，组件变化后的选中状态转移由main用old/new ledger处理，本文件不把该交接项冒作纯模块已验收。

完整默认全选、实际模型、所有正文及资料复核、真实作者必要决定、7分钟、出版/重开仍待主代理在冻结构建上完成，不能用本次37/86或结构容量用例认领真实全书通过。
