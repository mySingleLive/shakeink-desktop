# 场景输出容量修复与整书续验

日期：2026-10-31。完整导入的发布/重开验收仍未通过；R15场景阶段通过但后置复核失败，R16在859/913场景后未完整结束，均保留历史失败，见[275](275-scene-review-anchor-verification.md)。

依据[276方案](276-scene-output-capacity-plan.md)/[独审](276-scene-output-capacity-plan-review.md)、[277用例](277-scene-output-capacity-cases.md)/[独审](277-scene-output-capacity-cases-review.md)，为已限定的结构化scene请求补足输出容量：有效实际role容量能容纳完整prompt/schema UTF8字节上界、原JSON wrapper预留与32768输出token时才显式设置32768；容量不足或无效时省略参数、保留原默认生成。原材料与全部字段不裁减，原finish拒绝、两请求四生成、身份/原生/证据及最终授权门保留；其它阶段/模型及保存配置不变。

| 检查 | 结果 |
| --- | --- |
| SO/OC RED | 25项中16通过、9失败，指向SDK缺少输出上限。 |
| SO/OC GREEN | 25/25，包括真实SDK两次出站、精确UTF8临界值/非BMP、实际role、无效/不足容量默认生成、完整大wire不截断及完整JSON但length仍拒绝。 |
| 最终受影响定向组 | **273/273通过，0失败/跳过**；不叠加重复用例。 |
| 无增量TypeScript、桌面构建、git diff --check | 通过；构建仅既有MODULE_TYPELESS_PACKAGE_JSON提示。 |
| 全仓测试 | 未运行 |

[278独立code review](278-scene-output-capacity-code-review.md)通过，专项独跑25/25，无遗留阻塞。冻结[13项源/产物身份](scene-import-verification/build-identity-r17.json)。真实同失败目标的出站上限/完成状态复测及全新R17全文默认全选场景、完整复核、发布、正常退出/重开待实际完成补记；不能将局部恢复或R15旧时钟计作本构建整书通过。

续验结果：同R16失败目标的真实请求已通过，实际发送32768上限，stop结束，输出2402token，原范围及配置保持。R17完整批量在929候选中279项完成、3项通用失败提示，正常退出；独立重放首个失败请求却成功，不能据此声明全流程恢复。

R18仅诊断运行在951候选中210完成、1项失败，捕获5次原始Prisma P2028，指向真实用量交互事务（独立只读请求绕过该写入）。运行后已恢复正常产物并逐字节hash核对。[脱敏诊断](scene-import-verification/r18-batch-diagnostic.json)、[恢复证明](scene-import-verification/r18-artifact-restoration.json)、[诊断独审](280-scene-batch-diagnostic-review.md)。这些结果均未发布、未重开，不计作验收。后续修复见[281方案](281-scene-usage-transaction-plan.md)及[282用例](282-scene-usage-transaction-cases.md)。
