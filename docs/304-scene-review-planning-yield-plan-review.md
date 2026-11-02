# 场景复核准备阶段响应性方案独立审核

日期：2026-10-31。审核者：独立子代理 `scene_fix_review`。只读304/305和已定位的controller/runtime源码；仅写审核文档，未改产品、测试、构建或R23冻结身份，未启动应用、访问网络或读取真实小说/私有journal。

## 结论

**补充后审核通过，无遗留设计阻塞。** 每个packet后真实macrotask，加上仅等待epoch捕获的controller私有gate，已覆盖初审指出的末包真实pause竞态。单次`next()`仍同步、总时长不作承诺、R23证据不追溯改写的边界保留。可先写新合成测试取得有效RED；实现及验证仍须遵循原顺序，不把本设计审核当代码或真实性能通过。

## 初审发现及已落实的补充

`desktop/main/novel-import.ts:287`的真实pause动作先等待PDF排空；`stopAction()`在`:1677`取得serial后还等待自己的`freshImportRuntimeTask()`才递增epoch。假设第31包产出时安排的外部setImmediate先发出真实pause，随后本包yield的current回调仍可能在同一check阶段看到旧epoch；review恢复后立即进入`wave.map(ai)`，pause自身的epoch捕获下一轮才执行。短尾包同理。现305 PY03直接改epoch只能证明“已失效”被识别，不能证明实际pause动作收到后尾包零dispatch。

304现明确：`act(pause)`在PDF排空的首个await前注册私有、非序列化capture gate；直接stopAction路径在自身首await前注册或复用本次调用已有token。原serial+fresh捕获仍负责更新epoch和runtime证据，不提前更新epoch。捕获serial回调finally即释放，必须早于取消在途和等待jobs；review在波首及每次真实yield后循环等待待捕获gate，再运行原current。等待发生在serial之外，**不等待整个pause完成**，因此原workflow可退出，pause再排空jobs。

捕获前错误、候选阻断、发布不暂停分支均须按原行为释放，不把失败当暂停成功。实现时act到stopAction应传递同一本次调用token，不应任意复用另一并发请求的gate；PDF drain在stopAction之前失败时，act层也需finally幂等释放。此为方案“捕获前失败”规则的具体落点，代码审核仍须验证。

305现以中间包及恰31包/短尾包的原`act(pause)`验证：真实epoch捕获先于dispatch，至少一项进入launch/jobs生命周期，证明无互等；已有资料/正文/决定不变，暂停诊断与phase按原流程更新。无调用时原proof可为missed，不能伪造drained。未到达controller的UI事件、单次next内成本和其它同步枚举仍不在此承诺内。

## 可保留的最小范围

- 仅精确scene-wave的包准备阶段让出；原planner、完整材料、请求顺序/几何、31上限、正文/facts屏障、模型thinking/预算/有限生成和提交门不变。
- 让出在serial提交锁外，`freshImportRuntimeTask()`（`desktop/core/novel-import-runtime-proof.ts:23`）真实使用setImmediate，Promise.resolve或queueMicrotask不满足目的。
- 不将一个同步`iterator.next()`内的规划、已覆盖包跳过扫描或facts全序键计算说成可抢占；本次不承诺固定毫秒UI时延、总模型耗时更快或消除所有同步窗口。
- 当前R23继续使用原冻结构建；独审后可只加合成测试取得有效RED，产品修改及构建等待该实际运行结束。924项及400793.818084ms是主代理报告，未经本审核者独立复测；完整verify/publish/reopen仍须以真实最终证据判断。

## 审核证据

只读`cat docs/304-scene-review-planning-yield-plan.md`、`cat docs/305-scene-review-planning-yield-cases.md`，及定位源码`sed`/`rg`：`desktop/main/novel-import.ts`的act/current/serial/reviewWaves/reviewFactPackets/stopAction，`desktop/core/novel-import-runtime-proof.ts`的fresh helper，以及已有waves合成测试作为回归边界；补充后再次完整读取304/305。此次复审未新增读取私有数据，未执行测试、构建、真实调用或UI操作。主代理已报告R23受控清理结束，属于该冻结构建的失败实验及清理记录，不是新方案真实验收。
