# 431 独立方案审核

结论：通过，当前仅准入 PRIVATE SM01–03 合成 TDD。产品仍是条件准入，false 实际全部门满足前不得实施 SM04–06；实际两次请求须待 433 独审及主代理冻结。目前 WIP 预算失败，不准 normal 全文。

审核版本：`431-scene-native-strict-mode-brief.md`，SHA256 `65e74871bb0b5a5439e85fc21bbcf33701d9383b17daa5e062b58d6c3a377dc2`。

静态对照可执行：同一冻结 R58B 的 schema/prompt/witness，只有可信 case 的 expectedStrict 不同；原 Native factory 后经 SDK 合法逐调用选项覆盖，最终 body 不手工改写。actual strict 精确 matcher 及剥去唯一 strict 字段后的 body 深等，能防止开关没有生效或额外改变请求。SDK 可表达不冒充当前接口支持。

复制 ResolvedModel 时保持 model/modelRecord 身份及授权绑定，只复制 resolved 容器与 providerOptions/openai 容器，原选项和并发请求不变。不是持久化设置，也不改共用 factory/generate 默认。原 stream/tee/161 词/每例一次及全局两次/readonly/退出/WIP 保护保持；未满足观察不得补试。

条件产品范围清楚：Native 单函数采用已审 6props hint；服务 generation closure 仅在 nativeRoster 且应用已有 activate/frozen bound 事务时逐调用 false。必须使用可信内部状态，不能信任 prompt、schema 根字符串或模型自报。首轮、unparsed、root-envelope、无 active、entity 和通用业务保持原值；原 strict 本地三分支、逐位置/来源/保留/owner/版本门不改。该 false 不改变程序最终接受规则，也不保证供应商可靠。

false 实际 HTTP/stop/directJSON/候选/冻结 tuple/witness/delta/wire及所有保护门过后才替换 427 尚未满足的 strict=true 条件，不能回写 R58 失败。产品仍需原 CI16K、130+136、实际二三四代完整预算及独立 code review/fresh 全流程。本审核仅文档，未运行 App/API、未读真实数据或 Key。
