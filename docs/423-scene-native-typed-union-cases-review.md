# 423 独立用例审核

结论：422 通过后，423 按序通过。TU01–03 可执行 PRIVATE TDD；TU04–06 仅在 422 的候选②实际启动条件全部满足后准入，当前不得提前实施产品。

审核版本：`423-scene-native-typed-union-cases.md`，SHA256 `f1701aa405cd5d4fe1cb89063a0e131750a5ca1bb4e56b06e48a91516b62501b`。

TU01–03 覆盖固定节点 diff、纯 anyOf 关联展开/精确去重、原完整结构与三 record/别名边界等 Ajv 结果、实际 SDK wire 和原 R54 流/安全/存储/退出控制。各一次/全局两次硬限、HTTP not-run、原 tuple 与 witness 独立记录保留，没有把 fake 出口当供应商结果。

条件用例 TU04–06 有实际意义：0/1/multi 与三 replacement/multi-CF 保表达，尤其需让“wrong task 类型、仅别处可 0、局部范围越界但另一范围合法”等答案先通过新 uniform schema，再被真实原位置/后置门拒绝，避免用 Native 拒绝遮蔽本地门。0 task 占位不得转为可发请求。单 typed 叶直接 items 与多叶 anyOf 均应有完整结构断言。

原 uniform 基线与新 factory 的正反控不使用 tuple 作为等价基线；tuple 只用于更窄位置门控制。所有 source/retention/owner/旧 repairs/首轮和 root 恢复/generic/四代等回归继续保留。预算必须量测实际新完整 schema/prompt，不得省略重复展开后的字节；130 首轮+77/59 历史代无取样，原 CI16K 和 N/N±1 常量/拒绝保持。若不 fit 即未准入，不裁材料或抬额度。

实际诊断由主代理在 424 后执行，产品条件满足后仍须独立代码审核、构建及 fresh 全书复核/发布/重开。此审核只读文档，无 App/API 或真实资料读取。
