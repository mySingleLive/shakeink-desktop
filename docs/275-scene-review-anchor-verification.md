# 场景复核证据修复与完整导入续验

日期：2026-10-31。当前完整导入尚未通过发布/重开验收。此前982场景导入阶段通过，但R15后置review证据定位失败，历史结果见[270](270-scene-structured-output-verification.md)及相邻脱敏证据。

## 最小修复及独审

依据[272方案](272-scene-review-anchor-plan.md)/[独审](272-scene-review-anchor-plan-review.md)、[273用例](273-scene-review-anchor-cases.md)/[独审](273-scene-review-anchor-cases-review.md)，仅semantic1、review、selectedTargets恰为scene的结果，把conflicts和missingTargets各证据项的原`anchorEvidence`检查前置为静态schema问题，忽略返回值。原文/quote不修改、不跨单元移动、不丢坏项；由既有generateJSON两次生成纠错，末端原校验、全部材料、模型/预算及思考配置保持。生产review无kind，scope不依赖kind。

[274独立code review](274-scene-review-anchor-code-review.md)通过，专项38项独跑通过，无遗留阻塞。

| 验证 | 实际结果 |
| --- | --- |
| RA专项RED | 38项，13通过/25失败；坏quote原先越过生成纠错在末端失败，两分支早期误接受均被复现。 |
| 专项GREEN | 38/38，含四定位原因、坏middle项、原短引文/排版接受、完整good基线、有限恢复、授权/取消和末端范围门。 |
| 旧兼容测试更新 | 原先“所有review共享同一schema且坏quote只末端拒绝”的两组预设已按批准scope修订；其它阶段仍共用原base，多目标review仍保留原末端拒绝，不删除旧覆盖。 |
| 最终定向组 | **242/242通过，0失败/跳过**，覆盖scene/AI/schema/语义及发布受影响组。 |
| TypeScript noEmit/incremental false、桌面构建 | 均通过；构建只有既有MODULE_TYPELESS_PACKAGE_JSON提示。 |
| git diff --check | 通过 |
| 全仓测试 | 未运行，遵守任务边界。 |

构建身份冻结为[13项hash](scene-import-verification/build-identity-r16.json)。后续只读复测使用原R15失败的生产方法重建范围（90单元/143场景投影，未缩减材料），不读取或保存原模型返回值；真实结果及新的R16完整流程待实际完成补记。不得跳过verify，或把场景阶段成绩当作发布/重开成功。

实际只读复测已通过同一当前DeepSeek接口的完整schema/证据/末端授权校验，返回3项conflicts及1项missingTarget，配置hash不变、Electron exit0。这些是待核对提议，不能称为已解决或完整流程通过。[只读结果](scene-import-verification/r15-review-after-anchor.json)。随后启动全新的R16全文/默认全选场景会话，继续验证全部导入、复核、发布与重开。

R16随后在913候选中859项完成后1项持续未完整结束，正常driver2/Electron0，未发布或重开。[R16失败记录](scene-import-verification/r16-incomplete.json)。只读同范围复测捕获一轮length/8192输出token、第二轮stop/832输出token；配置不变、正常退出。[白名单结束原因](scene-import-verification/r16-finish-diagnostic.json)。当前按[276输出容量方案](276-scene-output-capacity-plan.md)/[277用例](277-scene-output-capacity-cases.md)处理该已复现截断类别，不放宽finish门或删除资料；完整流程仍未通过。
