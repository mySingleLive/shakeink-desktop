# R46 正常全文及实际回复离线诊断

394 限定审核通过，主代理最终私有控制独跑 20/20；R45 产品源 55、bundle 8、renderer 303 全部哈希相同。正常 driver 仅加入旁观器 start/stop，未改业务、模型请求、校验、预算、全选或时钟。全部 1402 章、5589 工作单元正常 fresh 导入，当前接口及资料传输沿用用户已有明确授权。

2026-11-01 03:59:05.405 UTC 允许分析，04:00:09.466 场景识别失败，04:00:12.228 正常退出码 0，驱动因业务失败退出 2。实际 38 RPC 中 31 成功、7 失败；成功覆盖 1288 单元、494 成员、381 清单记录、376 身份、23 关系。固定业务标签为修复事务 6、原文限定 1。

私有生成观察器关联 38 请求、77 传输，77 个生成文本均完整，全部 providerEvent=completed；77 次 deltaText 均与 completedOutputText 一致。pending/unmatched/ambiguous/observationFailures/limitFailures/writeFailures/retainedBytes 全部为 0，方法已恢复。此项只说明本轮观察完整和文本相同，不能追认 R45 历史，也不证明所有未来供应商流无问题。原始生成文本仅保存在 0700 隔离目录下的 0600 文件。

从同一结束快照重新执行完整 130 包规划，38 个实际 payloadHash 全部匹配，保留同一 operationId。将同次实际 deltaText 原样交给当前生成桥逐代离线回放：每一代 input_text SHA 均与实际传输一致，0 次供应商调用，准确复现 31 成功、7 invalid_schema 失败，全部拒绝路径为 repairs。下一步据原 frozen draft/repair plan/实际 replies 定位具体校验分支，再单独审核最小修复；不增加盲目尝试，不宽松接受或丢资料。

[固定标量与回放结果](scene-import-verification/r46-normal-captured-replay.json)。全部场景、完整正文/事实/归属复核、发布及正常退出重开仍未通过，任务未完成。

## 已定位的限定窗口错配

在唯一“原文限定”失败包的第四代实际 reply 中，修复计划第 2 行（零基）的 replacement.context[0] 选择了目录内真实 CF。以 JavaScript UTF-16 slice 重建其完整窗口，长度 10，但不包含返回 label；同一来源单元包含 label，原计划已有 5 个包含 label 的合法窗口。该错误是可用目录中的窗口选错，不能据此将 label 判为全包无来源；原 label-in-each-quote 门拒绝正确，仍须修复生成选择而不能放宽门。真实文本及计划仅留私有目录。

## 私有副本逐门诊断

在不改正式产品的私有源码副本中插入固定 guard 编号，再用同一 actual input/reply 回放，各代输入哈希仍匹配、0 API。六个事务失败包末代首先命中的门：3 包为 mention 的 oldMembers/newMembers 位置重复检查，1 包为固定 context.label 不在所选窗口，1 包为把已证 owner+label+完整 anchor 当作新 claim，1 包为 CF 的原始来源/literal 校验。没有以 reply 结构检查作为这六包末代首拒门。重复检查仍需进一步区分 old/new，CF 仍需区分具体来源条件；不能由泛型“事务”或源码行号作更强推论。

唯一原文限定包第二、三代也先被 mention 位置重复检查拒绝；逐项包含检查另证其 context claim 所选窗口同样缺 label。第四代切换 replace 后由原 label-in-each-quote 门首先拒绝。不能只凭后一个错误忽略前一个错误。

私有 v2 继续保持每代输入哈希一致，已精确拆分上述首门：3 个 CP106 包均为 old=true/new=false，其中 2 包复用本行旧 occurrence、1 包复用另一 owner，仍分别有 3/1/9 个非旧 occurrence 选项。CP108 包在完整目录中有 1 个覆盖固定 label 的窗口；CP111 包复用同 owner 的旧事实，仍有 1 个覆盖 label 的非旧窗口。CF94 包的 CF 与来源 quote 都真实且唯一，但第二代 literal 在所选窗口出现 3 次，第三、四代出现 0 次，且所选单元亦无 literal。故不能通过放宽原门解决；可评估展示严格候选与固定定点反馈。唯一限定包第二、三代的更早 CP106 也属本行旧 occurrence，仍有 18 个非旧选项。这里的可选计数只证明候选存在，不证明任意组合满足联合事务或全部业务门。
