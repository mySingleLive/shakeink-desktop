# 场景复核波次准备阶段响应性方案

2026-10-31。仅处理298引入的场景复核wave同步准备窗口，保持296引用协议及所有原业务校验。本文为方案，待独立审核；不授权当前R23运行期间修改产品源码或构建。

## 已知事实与判断

主代理报告正在冻结构建上执行的R23：924场景全部成功，0失败/丢弃/跳过；原source到驱动观察verify的计时为400793.818084ms（03:05:58.556至03:12:39.350）。私有journal约03:11:18已进入verify，但驱动current返回到03:12:39才被观察；该约81秒窗口内current、pause及CDP状态读取均迟滞，随后31个review请求正常在途、CPU空闲。此处是主代理运行观察，本方案作者未读取私有journal或真实小说，不能把推算差值当独立性能测量。

源码`desktop/main/novel-import.ts:1574`当前在首次await前连续调用原同步iterator.next()，填满最多31包；每次next内部仍执行原stageRequests/contextArtifacts/requestSnapshot及完整预算判断。31包的准备成本因此合并成一个不能服务事件循环的窗口，符合上述现象。该响应性回归值得窄修，但不证明场景资料错误、不否定924项成功，也不阻塞当前冻结R23继续真实复核。R23全范围verify、作者冲突处理、publish与reopen尚未完成。

## 最小改动

只在已有精确scene-wave调用的reviewWaves中，每个有效packet准备并加入wave后，执行一次真实事件循环任务及current检查：复用已导入的`freshImportRuntimeTask(()=>this.current(s,epoch))`。它使用setImmediate，不以Promise.resolve/queueMicrotask代替。独审发现末包真实pause仍可能早于原stopAction的epoch捕获；故还需要下述仅控制调度的捕获屏障，不能仅加一次yield便声称尾包安全。

- 波首原current保留，准备下一packet前仍须有效。每个有效packet之后均让出，包括第31包及不足31包的最后有效packet；不能仅在前30包之间让出而在尾包准备后直接dispatch。
- fresh任务内检查原session/epoch/候选开放门；暂停、关闭或会话失效在让出期间生效时，立即沿原stopped路径退出，未发出的整波请求不再发送。不吞异常、不继续填包、不写coverage或成功结果。让出发生在serial提交锁之外，不等待整个pause动作完成，避免pause等待workflow排空造成互等。
- 不改变iterator、包顺序、预算、units/artifacts/projection/facts任务几何、完整输入、31上限、body/facts屏障、模型/思考/输出容量、有限生成次数或lane。仍只持有一个wave，准备完成后才沿原ai批量dispatch；所有源/模型/runtime门、allSettled排空及candidate原子提交保持原样。
- yield只提供packet之间的事件循环服务机会。单次原iterator.next()依然同步，某包可能耗时；本方案不声称单包可抢占、固定毫秒响应或总模型请求更快，不改stageRequests内部算法、网络并发或性能验收阈值。

## 已收到停止请求的epoch捕获屏障

增加controller私有、不序列化的捕获gate集合，仅包含完成Promise与幂等释放器，不含原文、Key、结果或任何模型参数。`act(pause)`在PDF取消/排空的第一个await之前注册；直接进入`stopAction`的关闭、返回修改等路径在该方法第一个await前注册，已有gate则复用，不能双重注册。

`stopAction`仍按原serial+fresh任务捕获完整runtime oldEpoch、设置stopping、更新epoch；不提前移动epoch、不伪造proof。捕获阶段serial回调的finally立即释放gate，**必须早于取消在途/等待jobs排空**。若捕获前失败/发布分支/候选阻断返回，也按原错误/返回行为幂等释放，不将其当暂停成功，不让gate泄漏或永久阻塞；原PDF reopen及错误传播顺序保持。

`reviewWaves`在准备一波首包前，以及每个真实yield之后、准备下一包或dispatch之前，仅等待当前待捕获gate（有新gate则继续等待），再运行原current检查。不等待整个pause完成，不持serial锁等待gate。这样正常收到的末包pause能先完成epoch捕获、旧workflow即退出，pause随后可排空jobs，避免互等；不改变其它生成器/聊天/模型的排队。未到达controller的UI事件与单次next本身不可抢占，不作超出此边界的承诺。

## 验证与实施顺序

304方案独审→305用例独审→独立新测试及真实RED→R23正常结束后才改最小产品点→GREEN/独立代码审核→受影响wave/runtime/引用/预算门回归及类型/构建→依据R23最终结果决定新构建的真实验证。当前R23进行期间可写独立新测试与取得RED，但不得热补源码、替换运行产物或修改冻结身份。

测试以真实事件循环回调、原packet计数及原current/pause动作证明控制机会，不用墙钟/RSS阈值，不靠检查源码包含await或统计helper调用次数通过。必须覆盖第31包及短尾包的真实pause捕获竞态，至少一项纳入原jobs生命周期且证明不互等、ai入口及options.ai都零；只直接改epoch不足。正常情况下原包内容/数量、最终覆盖和作者冲突门仍应与原planner一致。

本方案不会重算、扣除或美化R23的400793.818084ms记录；之后的新代码不能借用R23旧构建hash认证真实通过。保留当前R23全部原证据和最终状态，新的真实验收须记录实际使用的新构建及独立运行身份。
