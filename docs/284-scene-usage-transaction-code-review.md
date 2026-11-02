# 导入用量事务独立代码审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。依据281/282最终maxWait-only修订，检查最小quota改动、隔离数据库专项，以及283所述checkpoint增量和一处兼容测试夹具修订。未参与实现或测试编写，未读取真实小说、配置、Key、私有journal或模型响应，未调用API。

## 结论

**代码审核通过，无遗留阻塞。** 可在主代理最终定向回归、类型及构建通过后使用正常冻结构建进入R19。旧数组方案和活动timeout30000提议均未进入本次产品实现或通过成绩；本审核不表示整书已验收。

## 最小产品改动

`src/lib/quota.ts`仅增加四个完整action的私有Set及原`prisma.$transaction`第二参选择：精确classify/analyze/review/patch传`{maxWait:60000}`，其它值为undefined，保持原客户端默认。对象不含timeout，也未改构造器或适配器默认。

原交互回调及模型upsert、UsageRecord创建、tokenUsed原子increment三写逐字保留；原作者/模型匹配、structuredClone、成本和快照字段选择、引用空Key/null地址/禁用配置及update:{}、return cost在事务成功之后等语义不变。recordUsage仍先保留显式或聊天turn/attempt，再outsideChatExecution，随后经原请求prisma/authority执行整次事务，不使用global/control或直接底层连接。

没有数组化、额外队列、事务或模型重试、吞错、减少并发或修改模型输入。只允许本次已证实的连接获取等待更久，不宣称本地活动SQL执行超时已被重现或修复。

## 独立数据库与兼容验证

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/integration/novel-import-usage-transaction.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='LOTM-L-ID04' tests/unit/novel-import-evidence-batches.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --check scripts/run-lotm-wizard-import.mjs
git diff --check
```

- 用量专项**7/7通过，0失败/跳过，退出0，约7.83秒**。使用正式迁移、生成Prisma及LocalPGliteAdapter；每个fixture为新建临时合成库，无provider、真实工作区或只读usage替代。
- UT-01真实31并发，31条独立用量、1023n token累计及逐项成本/归属正确，四action均保持callback且选项精确。
- UT-02实际连接先被外部事务占用，独立运行观测占用2402ms期间31个写入全未settle；释放后31个真实提交、0错误、31条用量及1023n累计。旧31个P2028为主代理RED记录，本审核独立执行的是最终GREEN，未改源重放旧版。
- UT-03真实novel外键失败及BIGINT计数溢出均保持模型引用、用量、计数共同回滚，之后正常写入成功。UT-04证明工作区不借global库、一次可信authority覆盖三写、authority失效时同一错误传播且零写入。
- UT-05/06核对四action与四近似/普通action选项隔离、聊天scope/显式turn及attempt、逐字段快照、原输入不变、新引用无Key/端点、价格缺失成本零，以及无上下文/身份不匹配拒绝。数据库连接收集仅用于断言后的fixture清理，不改待测SQL或产品适配器。
- 兼容夹具LOTM-L-ID04独跑**1/1通过，退出0，约0.49秒**。full范围每次失败使既有同范围指导重试之后才真正halving；首leaf与冲突leaf补合法chapterIndex0，outlineAssignments仅是合成响应生成器的去重状态，避免恢复时又制造同章资料。原部分提交、coverage/prose不变、失败前不发布及恢复完成断言全部保留；没有修改产品迎合夹具。

## 283 checkpoint增量核对

`scripts/run-lotm-wizard-import.mjs`的preserveSceneCheckpoint仅读取隔离journal，将完整副本独占写入解析后位于/private/tmp/的evidence目录，mode0600；reason均为固定调用常量，snapshot不进入console或仓库证据。conflicts、verify检查失败、driver异常及失败退出前可保存最新诊断状态。保全失败时不把该轮改成成功，而是保持错误并阻止本次正常close，记录固定keptOpen标志。

原计时/全选/任务与资料/正文/章界断言、待决冲突和verify checks门、正常保存及失败退出条件保留；没有自动消除冲突、跳过条目、改写session或注入通过状态。新增checkpoint只保全证据，不使场景阶段通过自动等于发布/重开成功。本次对283只复核该增量，没有另行认证其数据库路由结论或实际重开结果。

脚本语法及diff检查均退出0。主代理另报告最终290项回归、完整evidence-batches34项、类型和构建通过；未改称由审核者独立执行，亦未叠加重复用例为新增总数。R19仍须真实当前接口、正式用量写入、全文全选场景、完整复核、发布、正常退出和重开逐项/逐章一致性验证。
