# 场景结构化流的内存修复方案

2026-10-31。R19普通构建与R20只读采样均在场景中途V8 OOM，尚未发布/重开。崩溃线程为同一Electron进程中的V8Worker，非纯控制器主线程；主线程约70MB，R20服务线程由约74MB增至2.53GB。采样大部分分配位于script390的3318/2149/3513行，与已安装@ai-sdk/provider-utils的safeParseJSON/secureJsonParse/postJsonToApi三处精确一致。R20最后样本前两处约2.05GB/308MB。此为流式部分JSON解析的强定位证据，需真实SDK分块测试及修复后实际内存验证闭环，不能仅据位置宣称彻底修复。

独立合成控制器4,803,440字符、1402章、900场景/31并发在Node512MB old-space配置下全完成，场景heap约149–245MB，未复现该OOM；不涵盖SDK/RPC/数据库，不能冒充实际全文通过。主线程重建31在途请求均正常，最大约20万字符、heap峰230MB。

当前generateText只读取最终stream.text/usage/finishReason；显式jsonOutputSchema仅为结构化场景向SDK提供严格服务器JSON合同，却使用Output.object默认parsePartialOutput，SDK会对每个文本delta调用parsePartialJson（包含反复safeParseJSON/修补）。产品不消费这些部分对象。

拟仅在jsonOutputSchema明确提供时，保留Output.object原name/responseFormat/parseCompleteOutput/createElementStreamTransform，覆盖parsePartialOutput为async返回undefined。SDK在text-end/finish-step仍发布完整累积text；最终generateJSON原JSON/Zod/canonical/身份/证据/原生及授权校验全部保留。服务器strict schema、模型/端点/stream模式/输出上限/次数/用量/取消保持。其它文本路径不变，不改SDK依赖、不提高堆上限、不降低31并发、不删字段或裁正文。

先独立方案/用例审核，真实SDK分块流计数RED证明旧路径反复JSON.parse；实现后同流只在完整输出进行有界解析，同时证明完整最终文本与校验/纠错/取消不变。独立code review、受影响测试/类型/构建后，真实完整小说继续执行。

实际验收使用普通产品构建和全部默认场景，不跳过verify/publish/reopen。可在验收驱动中仅附加只读数值heap观察（NodeWorker固定Runtime.getHeapUsage，不采对象/函数名，不包装模型/DB或变更任何业务结果），独立审核该增量并冻结身份。完整任务/正文/落库/重启比对仍是通过门。R20提前止于场景边界、带allocation sampling且acceptance=false，永不升级为最终验收。
