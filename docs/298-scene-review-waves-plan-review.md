# 场景复核有界并发方案独立审核

日期：2026-10-31。审核者：独立子代理 `scene_fix_review`。只读审核298及原controller、service、runtime与long-task实现；未改产品、构建、测试，未读取真实小说、配置、Key或模型返回，未启动应用或调用网络。296引用修复由另一审核者负责，本审核不替代其结论。

## 结论

**补充后审核通过，无遗留设计阻塞。** 初审提出的四项边界已写入298，并由299安排区分错误实现的用例。固定31包、`allSettled`排空、正文/facts屏障、原请求几何及审核模型thinking均保留；可进入RED/GREEN，代码正确性和实际性能仍待后续独审与真实系统验证。

## 已补充并确认可实施的边界

1. **失败重试后按完整任务全序保存coverage。** 原`review()`在`desktop/main/novel-import.ts:1572`直接追加`pack.keys`，会在保留后位成功、重试前位失败时乱序。298现明确按原body单位顺序和`importReviewTaskKeys(s)`全序归一化，允许只缓存任务键；不丢成功credit、不重新请求成功包、不改变planner分包。299 RW02覆盖facts空洞补齐后的严格全序。

2. **真正串行提交内末端复核，原子候选保存。** 原`checkpoint()`在`desktop/main/novel-import.ts:1106`先修改再保存，不能直接满足新wave的失败原子性。298现选择现有`commitCandidate()`（`:224`）提交克隆候选：取得serial提交权后复核来源、epoch、授权快照，成功前不改owner的coverage/conflicts/semanticState。保存前失败无新credit，post-rename异常沿原`candidateBlocked`阻止继续。原`runVerify()`持有wizard对象闭包（`:662`），方案明确该wave不改wizard并保留其原对象引用，避免后续checks写入脱离owner的旧对象。来源、授权、epoch、runtime持久化或业务持久化异常均全局失效，不按普通返回失败给同wave信用。实现审核须核实这些检查确在serial内部、引用保留和提交失败门实际执行。

3. **service lane可验证的精确范围。** 原请求没有wizard来源字段（`desktop/shared/novel-import.ts:144`、`desktop/core/novel-import-semantics.ts:41`）。298现明确仅main精确pool门生成内部字面量`executionLane='scene-review-wave-v1'`，共享类型/边界schema限制值，service再同时核对标记和普通scene-only review谓词；作者解释、无标记或其它范围保持原slot。标记仅决定调度，不替代模型授权。lane与`lightImportGeneration`分离，原`:522`的thinking调整范围不变。

4. **每包late validation也独立分类。** 原正文包在`desktop/main/novel-import.ts:1559`校验证据和`semanticMissing`，facts包在`:1569`还校验冲突引用。298现明确逐包捕获这些末端验证失败，再将全部有效成功按原序提交，中间坏包不能丢后位成功；任意包失败都不发下一wave。不得弱化任何原验证，错误选择应按原包序确定而非完成先后。

## 已确认的可行边界

- `stageRequests()`及facts原装包逻辑继续惰性消费，只持有一个wave，正文全部成功后才构造facts请求；不更改预算、上下文选择、projection、原任务键或输出限额。
- 31低于`desktop/core/novel-import-runtime-proof.ts:3`现有32调用容量；保留每请求真实operation/runtime token、原生Promise及取消排空，不提高证据容量或把网络结果当runtime持久化成功。
- service只用独立lane绕过`src/lib/long-task.ts:44`的共享聊天名额；不改默认队列、provider、审核模型或thinking，作者解释仍走原路径。
- 本轮新发现pending conflict不停止同轮复核，仍保留发布冲突门；已有pending conflict时`runVerify()`在`desktop/main/novel-import.ts:666`不会进入review，不能以自动清冲突制造“正常重试”。

## 审核命令与证据

只读执行`cat docs/298-scene-review-waves-plan.md`、`cat docs/299-scene-review-waves-cases.md`，以及定位后的`sed`/`rg`读取`desktop/main/novel-import.ts`、`desktop/service/novel-import-ai.ts`、`desktop/core/novel-import-runtime-proof.ts`、`desktop/core/novel-import-semantics.ts`、`desktop/shared/novel-import.ts`和`src/lib/long-task.ts`；补充后再次完整读取298/299。未运行测试或构建；本结论是设计审核，不是真实性能或全文语义通过。
