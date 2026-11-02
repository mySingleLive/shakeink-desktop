# 场景复核准备阶段让出用例独立审核

日期：2026-10-31。审核者：独立子代理 `scene_fix_review`。只读304/305及原controller/runtime代码；仅写本审核与304审核，不改产品/测试/构建，不启动应用或调用网络。

## 结论

**补充后审核通过，无遗留用例设计阻塞。** PY03已改为真实末包pause并覆盖31包/短尾及tracked jobs，PY01明确观察原current Promise实际完成，另补捕获前失败/阻断/发布分支无gate泄漏。透明原planner、macrotask而非微任务及无时长/RSS阈值的要求保留，可进入有效RED。

## 已补充并须实际执行的区分性断言

1. PY03已明确在恰31包及不足31包的最后有效packet之后，通过外部setImmediate调用原`act({type:'pause',...})`，不能仅直接改epoch。观察真实pause的epoch捕获，并证明原ai入口及`options.ai`均为0；不能让AI入口已触发、只因后续verify恰好慢而零网络出站冒称“零dispatch”。原`stopAction()`在serial内另有fresh任务，该用例能区分单次yield仍看到旧epoch便派发的错误实现。

2. PY03已要求至少一项让review属于实际launch/jobs集合，再发pause并同时等待二者排空，证明没有“review等完整pause、pause等review”的死锁。若用私有launch包装原review，应如实记为controller生命周期测试；不能将其称为真实UI验收，也不能用Promise.race成功掩盖遗留job。无AI调用时proof为missed是原合法结果，不要求伪造drained。

3. PY01已要求current通过原`act({type:'current'})`串行读路径，记录Promise实际完成时准备包数<31、出站0，不能只记setImmediate回调开始或私有`current()`调用。包装原stageRequests仅计数/转交原值，不能预先准备测试队列替代原预算几何。

4. 取消分支须捕获后续异步拒绝、释放所有deferred并等待workflow/pause，断言未提交coverage/conflicts/missing，资料/正文/作者决定逐值保真；允许原phase/epoch/runtime诊断变化。正常正控继续由RW01证明31并发、完整原包和正文/facts屏障，不能通过每包提前出站或降并发取得活性。

5. 已补捕获前错误、候选阻断、原发布不暂停分支的幂等释放，至少一个短合成用例实际证明无gate/job泄漏及后续请求不会永久挂起。代码审核应核对PDF drain在进入stopAction前失败也有act层finally释放；并发调用的token归属不能混淆。失败须维持原错误/返回，不冒称成功暂停。

## 可接受的限制

单次next内同步成本、跳过covered包的扫描、facts键全序枚举不因此可抢占；只证明packet之间让出真实事件循环，不声称固定UI响应时间、总耗时缩短或全文语义成功。只在真实达到准备包数/current完成/零dispatch断言时记有效RED，setup失败或超时不能倒填后续断言。R23冻结构建结果与后续新源码/产物验证身份保持分开。

## 审核证据

只读两份文档及`desktop/main/novel-import.ts:272`、`:287`、`:1116`、`:1568`、`:1677`和`desktop/core/novel-import-runtime-proof.ts:23`，核对原current串行读取、pause的异步捕获和fresh任务时序；参考现有waves测试但未执行或改写；补充后再次完整读取304/305。此次复审未新增读取真实资料、运行App、构建或调用模型。限定两份审核文档的`git diff --check`退出0，不把设计通过当任何RED/GREEN或真实结果。
