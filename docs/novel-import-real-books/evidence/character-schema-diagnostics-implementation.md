# 103 角色字段安全诊断实施证据

作者版冻结待 105 独立审核。仅修改 service 的 `generateImportAiJson` 桥，测试仅在旧 J01–07 全部原字节之后追加 J08；未改 schema/helper/晚门、main、payload 或 generic generate.ts。完整真实基线在 `/private/tmp/character-schema-diagnostics-103-baseline/`。

桥 dynamic import 实际 `StructuredGenerationError` 与 generateJSON；只有普通 sem1 analyze/character、非 reconcile、signal 尚未 aborted、最终错误为该 class 的 invalid_schema 时转换。只读最多前六项、各不超过 100 字符的已知完整路径。数组索引须为安全整数的规范十进制字符串且丢弃；facts 字段再经过现有 character 白名单，输出仅静态中文业务标签，去重最多六项。未知/空/截断/非法路径不猜字段，采用固定概括。不会显示 raw path、message、feedback、值、名字或来源 ID；不附原 Error 为 cause，不加日志。

原 generateJSON 两次上限、纠正反馈、schema 接受集合与成功数据均未改变；没有自动将数组 facts stringify。其它 phase/kind/legacy、typed invalid_json/incomplete、Abort/普通 provider Error/同形对象均透传原错误；取消已生效时同样不做新映射、不改变 reason。固定中文通知小于 180 字符，由未修改的 actual main.safeError 原安全门展示。

真实主回归为 runImportAi → production bridge → actual generateJSON → actual Zod（仅 DI generateText）→ actual main.prototype.safeError，无初始化、文件/模型/DB操作。合成数组 aliases/relationships 连续两次失败，最终显示“别名、人物关系”，没有第三次调用；首坏次好恰两次，首好恰一次，完整输入、成功结果和原始坏结果都不被修改。真实未知键/类似前缀/换行/Unicode/超长路径及单列 synthetic typed metadata 边界覆盖第一组六项限制、重复去重和无已知字段的固定兜底。既有 J01 对 defaults.generate 实际调用共享桥的源码断言继续通过。

唯一执行命令及原始日志身份详见 `character-schema-diagnostics-freeze.json`。干净实施前 RED：34 项中 30 通过、4 失败，生产仍为 20b80；新 J08 的三个诊断子项及其父项失败。首次 mixed RED 有新增 fixture 忘记 generate 的 model 参数，原日志保留；纠正后再在原生产取得干净 RED。首次实现 32/34 的唯一剩余问题是新 fixture 错误假定原 Zod record 会拒绝 raw `__proto__` 键；实际既有 parser 忽略它，因此保留在单列 typed metadata 反例，不修改 parser 或接受集。未将这些 fixture 问题当生产故障。

最后源版 J01–08 为 **34/34、0skip、exit0**，owned TypeScript 诊断 **0**。service SHA `3dba02c56f7572c49366bc7a6be9fd09a07bdf6fdc60235cdd997da76cdf7a94`；Jtest SHA `e0ce2d2f3a6eb2bcfaea17b5c369a3c39aa5df68ffdb8b7b88bb5190b6c39404`。delta SHA `733b500281ad69a4c567e0da4c9fb3699d1551dd91dd5ac3b3986ddd49189c8d`，将桥 body 逆替即整文件恢复真实 20b80；main92ed、payload87b9、generate516123 三控制根未变。未跑其它测试、构建、实际应用/模型/用户库或读取实际 M01/私有 journal。M01 原实际坏字段仍未知，本次是诊断改进，不证明其生成问题已经修好。
