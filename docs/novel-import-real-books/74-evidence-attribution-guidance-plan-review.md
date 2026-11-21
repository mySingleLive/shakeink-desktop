# 证据与叙述归属固定指导：独立方案审核

日期：2026-10-26。技术方案 **PASS**；限定用例方案 **PASS**。无 P1/P2 必修项。该结论允许按73限定TDD，不代表模型文学效果、旧产物修复或实际S02通过。

## 审核身份与范围

审阅 `73-evidence-attribution-guidance-plan.md`，SHA-256：`70498f14884087f98f9ad3b9c3cc9c2d5517a1b7bc22982fc4ef8aeac663963f`。只读核对已知payload固定提示、序列化/预算接点及A03/A05/A06、J03、SEM04的直接保护；未编码、执行测试或访问实际run、应用、模型、小说、journal或用户数据库。

主代理报告rev58物品证据两轮后仍失败，12成功产物、正文与14章保留，另有部分文学质量缺陷。本审核未读取真实快照或文学报告全文；无raw失败返回，不能判断具体坏quote或定位分支，也不能以提示不足作为唯一已证原因。

## 技术判断

仅在semanticVersion1的analyze（含reconcile）及review固定指令加入通用指导合理：优先短连续原引、同unitId逐项自核；区分框架/主故事/转述及说话者、观察者、被描述者；保留判断与证言归属、时间范围及开放结尾，不按常识补身份或把未到达地点写成到访。10–30是选择偏好，不能成为新增接受门；精确短引句仍由原anchor规则接受。

新增文字不得包含本书名字、人物、具体诊断、原句或oracle答案。原则必须位于固定指令中，来源和自由要求仍按原序列化进入不可信资料封套；不改source、payload、units、selectedTargets、输出结构或权限。reviewProjection的可见范围、既有实体缺口证明要求，以及reconcile目标/字段/锁限制须保留，不能以“完整性”指导授权片外猜测、全类重生成或改正文。

legacy、semantic classify/patch应逐字不变；原分类合同身份、证据schema/anchor/晚门、网关与一次纠正上限均不动。新指导不重置既有分析信用或追溯修改成功产物；旧文学缺陷仍待实际整书审核及独立复核。

## 用例判断与边界

新增A07经真实runImportAi、仅合成DI捕获实际传给生成接点的prompt，应覆盖ordinary analyze、reconcile及review的固定段与阶段角色/signal，验证资料中恶意自由要求未进入固定段，request/raw/source/payload及输出无变换。reviewProjection与reconcile边界和现有晚门仍须实际断言，不能只测试另造提示拼装器。

旧分支字节与序列化期望须来自真实修改前基线的独立literal/hash，不能调用修改后的producer生成自己的expected。长、非BMP和转义资料及所有相关phase须验证固定提示加原JSON wrapper满足原预留；不得提高65536固定预留或16384 wrapper常量。词面存在只证明合同接线，不证明模型会正确处理框架人物或判断归属。

仅批准73的三条精确命令；先真实生产基线新增用例RED，再最小GREEN及独立代码审核：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[3567]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J03:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM04:' tests/unit/novel-import-semantic.test.ts
```

本轮未执行上述命令。通过后真实同S02仍须正常恢复及目录/分析授权、比较12成功产物与覆盖、正文/14章/预算，实际复测未完成物品及后续目标；原失败保留，不随机无限重抽或投喂答案。
