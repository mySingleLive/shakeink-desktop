# R60 同schema严格模式对照：条件准入

固定新两例完全相同schema（a471…、1953B）、prompt（b42…）及五任务witness，真实SDK仅逐次providerOptions.strictJsonSchema不同，未手改HTTP正文。actual wire严格对应预定true/false，schema/input SHA均匹配。共2次final fetch、不重试、不发送小说。

strict=true控制返回HTTP400，闭合词序仍required/properties/must/other/all/properties/in/the/object/other；strict=false候选返回HTTP200/completed/stop，直接JSON、候选schema、其自身对应的冻结R49五task tuple及共同witness均通过，wire delta等于SDK文本。root独立从actual.text重跑冻结tuple Ajv，并deepEqual覆盖selection、三种合法record和0的witness，证据完整后才写入条件通过记录。

两例App正常exit0，无timeout/pageerror，108输入和明确的当前WIP368保护在运行前后同，状态及历史各批源/CJS未变，metadata/写失败0、broker关闭成功。WIP仍是预算失败的f2e1构建，不能把静态对照视为正常全文准入。

结果满足431/432已审SM04–06条件，可实施Native record hint构造和服务层可信bound-repair阶段逐次strict=false的最小TDD。应用原严格Zod三branch、每位置、source/retention/owner/版本/提交门、四代与全部预算不放宽。仅nativeRoster且成功activate后冻结的repair事务可选此设置；first/root/unparsed-before-activation、entity/generic、共享工厂及通用generate默认保持原样，不按prompt文本推断模式，预算先检查再activate。

该设置调整上游生成约束，不是程序接受约束等价或供应商普遍strict保证。必须补Native先接受而真实业务桥拒绝partial/mixed metadata、阶段隔离/并发不可污染及预算失败不激活等控制。随后独立435、根定向组、类型/构建、全部130首轮+136历史新预算均通过后，才可fresh全书。所有场景复核、发布和重开仍未通过。

证据：[安全标量](scene-import-verification/r60-native-strict-mode-observation.json)、[方案](431-scene-native-strict-mode-brief.md)、[用例](432-scene-native-strict-mode-cases.md)、[PRIVATE独审](433-scene-native-strict-mode-probe-code-review.md)。
