# 场景复核准备阶段让出独立代码审核

日期：2026-10-31。审核者：独立子代理 `scene_fix_review`。依据304/305，只读main新增capture gate、逐packet macrotask及PY测试；未参与本轮产品或测试实现。未构建、启动App、调用API或读取真实小说/私有journal；SV/LF分别由310/311独审，本审核不替代其结论。

## 结论

**审核通过，无遗留阻塞。** PY实现及306/307补记的两处完整预算接线均已复核，最终独立原三文件组合**38/38节点通过**，保留原8000窗口legacy夹具与全部断言。主代理仍须完成其余受影响组合检查、类型及新构建，再冻结R24实际身份；本结论不代替真实模型、安装版或全文验收。

## 实现核对

- `desktop/main/novel-import.ts:219`的`beginStopCapture()`为每次调用创建私有Promise及幂等finish，删除后再resolve；`:224`循环等待集合，涵盖等待期间新注册的gate。数据仅存在controller，不进入session、journal、payload或模型参数。
- `act(pause)`在`:297`的PDF cancel/drain之前创建本次token，并显式传入`stopAction`；外层finally涵盖PDF drain等前置失败。没有任意复用其它调用的gate，也没有因新增门改变原PDF reopen/错误传播分支。
- `stopAction()`在`:1690`为无token的直接调用自建gate；原serial+fresh捕获仍唯一负责epoch与runtime old/new证据。serial回调finally在`:1693`释放，随后才取消AI并等待jobs。外层finally再次幂等释放，涵盖捕获前错误、candidateBlocked及publishing返回，不将这些分支伪造成暂停成功。
- `reviewWaves()`在`:1582`波首及`:1587`每个有效packet后的真实`freshImportRuntimeTask`之后等待capture，再运行原current；包括第31包与不足31包的末包。没有持serial锁等待capture，也不等待整个pause，原jobs可退出，pause随后可排空。单个iterator.next()、其它同步枚举仍不可抢占。
- 原planner、完整来源/预算/模型thinking、31上限、body/facts屏障、allSettled、错误分类、原子candidate及发布冲突门未改变；没有每包提前派发、降低并发或提前移动epoch。

## 测试及RED证据核对

PY01透明包装原stageRequests，仅计数转交；外部setImmediate调用原act(current)，以Promise实际完成时准备数<31及options.ai零出站为断言，非仅回调开始或helper调用次数。

PY02与PY03通过原launch登记真实jobs，再由原act(pause)执行停止。PY03分别覆盖31包及2包短尾，原ai入口和options.ai均0，等待pause与workflow实际排空；无AI调用时原proof为missed，不伪造drained。PY04实际触发PDF drain失败和错误session，随后空wave能够完成，证明gate不遗留；candidateBlocked/publishing分支本轮由finally控制流审核，未声称这两分支已专项执行。

作者原RED为8测试节点、3通过5失败（含父级）；PY01实际到达current完成计数，PY02到达准备数断言，PY03实际记录ai入口31/2而失败。仅增加macrotask的中间版本为8节点、5通过3失败，末包ai入口仍31/2，确实暴露独审指出的捕获竞态。最终作者记录8/8、tsc退出0；本审核者只读取这些合成日志，没有把后置未达项回填为RED已执行。

## 独立执行与组合修复

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-scene-planning-yield.test.ts tests/unit/novel-import-scene-review-waves.test.ts tests/unit/novel-import-runtime-proof.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-scene-planning-yield.test.ts tests/unit/novel-import-runtime-proof.test.ts
```

首轮实际**38节点，33通过5失败，0跳过，退出1，约49.88秒**，日志`/private/tmp/scene-planning-yield-independent-review.txt`。PY8/8及runtime-proof11/11通过，RW01及RW02三个子项（加父级共5失败节点）在`sequentialPlan()`的非wizard legacy串行基线中，被原ai的`assertImportPayloadBudget`以“导入请求超过模型预算，请继续分批”拒绝；该轮尚未达到它们的wave/重试断言，不能倒填为这些断言已执行失败。

为隔离该组合预算失败，独立再执行仅PY与runtime-proof：**19/19节点通过，0失败/跳过，退出0，约17.87秒**，日志`/private/tmp/scene-planning-yield-independent-focused.txt`。这是必要的失败定位执行，不与其它轮次累加为独立用例总数。

基线删除wizardVersion及wizard，但保留semantic1/scene-only编码。新增artifactIndex/bindableFields计入payload，而原`reviewFactPackets`的`fits`对非wizard legacy分支跳过完整requestFits，会合并出超payload上限的包，ai发送前再拒绝。这是实际普通scene legacy的新增元数据组包回归，不是yield时序或应删除的测试；没有提高超时、context窗口或换v2夹具掩盖。

### 306/307组合补记与接线复核

补记明确网络包边界可为完整metadata重排，但原unit/fact任务几何、task keys、已有coverage身份、完整材料和review预算不变。两处main修复严格沿同一普通semantic1/scene-only谓词：正文`stageRequests(..., sceneReview)`仅对该scope启用原fullMetadata/per-unit完整fits；facts的legacy豁免仅在`!sceneReview`时保留，scene scope始终检查原序列化payload。没有新增组包算法、使用更大text模型、截断或移动字段，也没有放宽`2×budget`原资料与`3×budget`payload门；其它legacy/旧semantic/组合目标保留原分支。原并发lane、source/角色、有限生成和所有末端门保持。

复核补记及冻结增量后，再次独立执行原三文件命令：**38/38节点通过，0失败、0跳过，退出0，约68.88秒**，日志`/private/tmp/scene-planning-budget-independent-final.txt`。RW01与RW02保留原8000 legacy条件，原wizard与nonwizard完整预算下请求逐值比较、精确成功credit、facts空洞补齐及仅坏包重发现在实际到达并通过；PY真current及中间/31包/2包真实pause、RW取消/授权/前后提交/真实RPC拒绝、runtime容量及证据门继续通过。本次数值仅为合成测试耗时，不是实际性能结论。

主代理报告本组合38/38、完整tsc退出0，未冒认为本审核者独立执行的类型检查。限定本审核文档的`git diff --check`退出0；未运行全仓用例或构建。

未执行构建、实际性能或完整小说验收。R23仍属于原冻结构建的受控停止失败实验，保全及清理记录不等于PY实现或新构建通过。
