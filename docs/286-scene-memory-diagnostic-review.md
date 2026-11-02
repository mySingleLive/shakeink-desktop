# 场景内存采样诊断独立审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。仅审核明确授权的私有通用observer/bootstrap及R20诊断驱动增量；未参与实现，未读取真实小说、配置、Key、journal、.ips或实际采样数据，未启动实际App或调用模型/API。

## 结论

**最终有限worker增量审核通过，无遗留代码阻塞。** 可先执行native worker bootstrap；实际确认至少一个worker、有效数值采样、本地GET200及Electron正常退出后，可执行R20隔离诊断。正常bundle无需修改，不能增加heap或更换业务参数；R20固定diagnosticOnly=true、acceptance=false，仍不构成整书通过。

## 隐私与生命周期核对

初版直接输出functionName并仅按字符regex过滤basename，且成功边界之外未统一stop、驱动保留通用发布入口。主代理已按反馈收窄：

- 不输出functionName、完整URL、workerInfo、对象值、原文或原始协议响应。file仅为有限可信basename、固定依赖标签ai-sdk/openai-sdk/prisma/pglite/zod或other；位置与scriptId为安全整数或null，分配大小为sampling协议计数字段。其余仅时间/pid、memoryUsage、V8及四个heap计数。采样文件独占创建、mode0600；异常只记固定unavailable状态。
- 仅使用HeapProfiler.startSampling/getSamplingProfile/stopSampling，不调用完整heap snapshot、对象读取、强制GC或增heap设置。每5秒采样，interval不保持进程存活；同一时刻共用inFlight，stop清timer并等待在途采样及append完成，再最终采样、停止和disconnect。
- worker使用NodeWorker.enable且waitForDebuggerOnStart=false，按顺序编号scope；转发指令只有上述三种HeapProfiler及Runtime.getHeapUsage，后者仅选择四个数值字段。没有worker Runtime.evaluate、脚本源码或对象内容读取。未知消息忽略，错误固定；pending请求有10秒清理，detach/stop清理待决项与连接。[Node官方协议](https://raw.githubusercontent.com/nodejs/node/v24.18.0/src/inspector/domain_node_worker.pdl)确认enable连接现有/新worker、false不要求等待启动、消息按session转发及disable会detach。
- 没有Module/SDK/数据库/Promise业务包装、数据或成功注入，不更改provider、模型、并发、DB、调用参数或原校验。采样自身会有分配和时序开销，不声称与未采样运行性能相同；其结果用于定位，不能算普通构建性能验收。

R20在启动前即写固定诊断标记，强制scene-only且排除其它模式；保存按钮、publishing/completed/done及通用verify发布分支均硬拒绝。完成场景证据或失败即退出，finally统一stop后沿用正常close及私有checkpoint保护，不进入后置review/publish。原驱动读取业务状态和私有checkpoint的流程属于隔离测试，不应与数值-only采样文件混为一谈；本次不重新审整个旧驱动。

## 启动实测与isolate边界

主代理报告首次Playwright主进程VM内require不可用，已改为process.getBuiltinModule('module').createRequire(process.execPath)加载已审helper。修正后的主线程bootstrap取得2次有效数值采样、本地GET200及Electron exit0；这是主代理实际执行结果，本审核未重复或读取其真实输出。

同PID的V8Worker崩溃线索不能据此直接认定主线程heap或某个service isolate为根因。故新增main与编号worker的独立数值/采样范围；native worker bootstrap须实际验证后才进入R20。合成场景完成和在途请求较小的观测不能代替真实网络/IPC负载定位，更不能替代整书验收。

## 独立验证与冻结

独立纯VM/内存fs探针退出0：未知functionName/URL/workerInfo/session秘密不回显，worker仅编号，四个heap数字精确保留；未知通知不输出；模拟worker profile及append分别挂起时stop均等待，之后完成最终采样、disable和disconnect。只允许固定Inspector方法；未启动真实inspector或写实际采样文件。两个worker helper仅destination不同，协议及净化逻辑相同。有限依赖标签增量同样只输出静态值。

六个指定文件的Node24 `--check`均exit0。最终审核SHA-256（均位于`/private/tmp/shakeink-scene-import-20261031`）：

| 文件 | SHA-256 |
| --- | --- |
| observe-scene-memory.cjs | 41036cdaa602b878603a96a8be1eba32f9ffa7318c245dba81db9bb69b6f38a9 |
| observe-scene-memory-bootstrap.cjs | 512fbb7fa6c4d7a9bc36a8db7ca579af5487562c5c47d10845b0052b58e81c05 |
| verify-memory-bootstrap.mjs | bed716e24ba78dfee2a2c7d0b7400aaebf07a0b5a537370eaf03fc116b318a3d |
| observe-scene-worker-memory-bootstrap.cjs | d2bfcbfc16125c512c2604049c819f892b1b3d0f23758eb8388ca81de0eeb585 |
| verify-memory-worker-bootstrap.mjs | 92492ef48f1140c435326e9e741389063aa36ecd39a682fc2488c2137c862d1d |
| run-r20-memory-diagnostic.mjs | 9caf85616bf17b44d3fb19db0df77eedcf4babef534a847591ff1b5fae1a8f1c |

本审核未改产品或驱动、未读取真实profile。正常构建14项哈希不变是主代理冻结要求，真实诊断前后仍应比对；正式验收须后续正常构建、新会话全文全选场景、完整复核、发布及正常重开核对。
