# 场景复核有界并发独立代码审核

日期：2026-10-31。审核者：独立子代理 `scene_fix_review`。依据298/299，只读审核本轮`reviewWaves`、`reviewFactPackets`、main ai错误分类、共享lane协议及service调度接线，未参与产品或测试实现。未构建、启动应用、调用网络，未读取真实小说、配置、Key、journal或模型返回；296引用修复由另一审核者独审。

## 结论

**审核通过，无遗留阻塞。** 本轮发现的grant身份、legacy重复付费、提交前semanticState修改及真实RPC授权失败分类均已修复并复核。独立pool16项、追加RPC denial测试3节点及UR/RA49项分别通过；后续仍须主代理完成最终定向/类型/构建与正常新会话真实验收，不能把本结论当作全文已成功。

初版`reviewGlobalFailure()`只识别Error名称和`code`，遗漏`desktop/service/rpc.ts:18`仅发送`error.message`、`:21`重建普通`Error`的真实边界；`desktop/service/models.ts:44`还会把resolve固定code转为固定中文message。main公开目录快照不能代替Key/lease授权检查。追加合成RED真实证明：一包固定授权拒绝、其它30包成功、公开models不变时，初版会留下30包credit。

当前`desktop/main/novel-import.ts:53`以精确`Set.has`补充既有本地授权code、固定resolve中文和固定snapshot拒绝，原名称/code判断保留；不按任意provider内容、子串或来源值分类，不修改全局RPC。独立复跑固定英文`AUTHORIZATION_REVOKED`及既有密钥不可用中文message两种普通Error反例，整wave零新coverage、语义检查点不变、排空后无下一wave，均通过。此处测试模拟了真实RPC后的错误形状，未启动真实worker或调用供应商。

## 已核对并修复的发现

- **授权对象身份跨wave。** 最初`commitCandidate()`采用克隆后只恢复wizard对象，第二wave的原grant身份检查必然拒绝。当前成功提交后恢复原`analysisGrant`引用，并保留其身份、冻结hash、text/review快照和当前模型比较；没有删除门。
- **legacy重试重复付费。** 原串行分支对全部covered包有skip，初版parallel generator遗漏。当前`desktop/main/novel-import.ts:1630`恢复同一整包skip，不改legacy pending规则或原分包几何。RW02的原legacy夹具保留，精确成功credit和facts仅坏包重试已通过。
- **提交前语义检查点修改。** `semanticMissing()`会初始化semanticState及conflictBases。当前wave只在浅session验证视图中克隆该小检查点，真实owner到candidate成功前保持原样；未对每包克隆完整正文。RW03补充owner semanticState逐值保真。

## 主要实现核对

main精确限定wizard1/semantic1/targets恰为scene的普通review，最多31请求；正文仍由原`stageRequests`计划，facts抽出原装包逻辑，完整任务键由原`importReviewTaskKeys`排序。只持有一个wave，不预展开所有请求；正文全部排空、成功后才构造facts阶段。

每包沿原ai/source/model/runtime门，`allSettled`排空后独立校验证据、facts冲突引用和遗漏投影；普通坏包不丢后位成功，禁止后续wave。结果按原包序合并，coverage按原全序归一化；不改资料、正文、父级或作者决定，不清冲突、不放宽publish门。

最终提交在serial内部重新验证来源/current、原grant身份与冻结内容、workingRevision和当前text/review模型。候选保存采用原`commitCandidate()`：precommit失败owner无credit，rename后异常进入原candidateBlocked；成功恢复原wizard与grant引用，避免runVerify闭包及后续wave失效。post-rename测试在实际`save()`的成功onCommit回调后抛出，未再依赖会受runtime写入干扰的owner调用次数。

内部`executionLane`为唯一字面量，service入口同时校验标记和普通scene-only review条件，再进入`runInsideLongTask`。`lightImportGeneration`及`importGenerationModel`范围不变，审核模型/providerOptions保持原对象；无标记或作者解释不绕过共享slot，默认聊天并发设置不变。lane未进入模型payload，未增加生成次数或输出限额。

## 独立执行

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-scene-review-waves.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-scene-review-unit-reference.test.ts tests/unit/novel-import-scene-review-anchors.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='RPC denial' tests/unit/novel-import-scene-review-waves.test.ts
git diff --check -- docs/301-scene-review-waves-code-review.md
```

pool **16/16通过，0失败、0跳过，退出0，约44.55秒**；UR/RA **49/49通过，0失败、0跳过，退出0，约0.46秒**。追加RPC denial **3/3测试节点通过（父级及两反例），0失败、0跳过，退出0，约6.53秒**。私有合成日志分别为`/private/tmp/scene-review-waves-independent-pool-tests.txt`、`/private/tmp/scene-review-waves-independent-reference-tests.txt`和`/private/tmp/scene-review-waves-independent-rpc-denial.txt`。三次执行分别记录，不冒称最终19项在同一次独立进程全部执行；本审核者未重复运行主代理的类型检查或构建。文档限定diff检查退出0。

有效RED日志`/private/tmp/scene-review-waves-red-valid-fixture.txt`为16测试节点、2通过14失败，含父级节点；主要失败发生在31请求屏障与lane门，后置credit/故障断言尚未到达，不倒填为它们已执行失败。追加RPC RED日志`/private/tmp/scene-review-waves-rpc-auth-red.txt`为3节点均失败，两反例实际到达零credit断言，均显示错误留下30包成功credit。首版无效wizard夹具RED不作为功能RED。RW02直接再次调用controller私有`review()`，只能记为controller重试，不是普通UI恢复、journal重启恢复或真实全书通过。

本次没有实际性能或完整小说验收结论。R22仍是未发布失败轮；不得用本次合成GREEN、只读诊断或控制器续跑替代后续正常新会话的完整复核、冲突处理、发布、关闭和重开字段/正文核对。
