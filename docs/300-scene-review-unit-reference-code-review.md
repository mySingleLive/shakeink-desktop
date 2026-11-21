# 场景复核全文索引引用独立代码审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。依据已批准的296方案与297用例，审核共享scope/指导、payload/prompt、service证据schema与生成桥，以及新增UR测试；未参与实现。仅写本文，未读真实小说、私有配置/Key/checkpoint或模型响应，未启动应用、构建或调用网络。本审核不包含另行设计的298并发池。

**审核通过，无阻塞问题。** 新编码只将当前完整单位索引恢复为原合同已经允许的完整连续引文；不替模型判定冲突语义，不自动解决冲突，也不替代真实整书验收。

- `desktop/shared/novel-import-scene-review.ts:4` 的共享谓词精确限定semantic1、review、selectedTargets恰为scene、无conflict和intent。payload与专用prompt使用同一谓词，作者解释、其它目标/组合及其它阶段保持原协议。
- `desktop/service/novel-import-ai.ts:82` 捕获本包各单位id/text的值副本；索引必须是唯一自身键、非负安全整数且在数组内。Reflect.ownKeys拒绝混合形式和额外自身键，包括undefined值；不strip未知键。严格联合保留原raw证据；明确坏quote不能转成全文或跨单位rebind。数组逐项解析，两种结果分支均不能丢掉坏项。missingTarget.safeExtend保留原三字段同现约束，canonical继续经过原证据schema。
- `desktop/service/novel-import-ai.ts:115` 保留原RA范围与anchorEvidence检查：作者解释请求虽然不启用索引，坏raw引文仍进入原早期纠错。既有唯一排版恢复、声明单位范围与末端anchor门均保留。新增生成桥只对已知静态anchor反馈追加固定索引指导；联合失败采用固定指导，不回显坏quote、未知键/值、单位ID或cause。原两次JSON生成、role/model/thinking/容量与网络设置没有改变。
- `desktop/core/novel-import-ai-payload.ts:25` 只在完整units副本追加当前数组位置。原资料、facts、投影、章节、目录相关性规则、锁定值和已确认决定保留，原请求不变。专用prompt保留完整reviewProjection及知识归属合同，明确时序/回忆/传闻/歧义、粗出处的含义、不改正文与不自动解决冲突；未强制conflict.kind为scene，原body-body等合法kind与其它业务字段不由索引推导。
- 原runImportAi预算仍使用实际role对应模型，完整新增metadata与固定prompt计入既有payload/字符/单位/UTF8 wrapper门；未裁资料或隐式重分包。原结果阶段、来源双向覆盖、包内实体、投影/版本/作者锁定及最终撤权/取消/配置快照校验均保留。正常冲突id/hash计算仍由原末端执行，canonical结果不残留索引。

独立执行：

```text
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-scene-review-unit-reference.test.ts tests/unit/novel-import-scene-review-anchors.test.ts
49 tests / 49 pass / 0 fail，约458ms
日志：/private/tmp/scene-review-unit-reference-independent.txt
```

UR11覆盖两种结果数组、首末索引、同文异ID/跨包index0、超过512字符全文、CRLF/前后空白/非BMP、原始对象不变、raw失败后第二生成恢复及持续非法恰两生成；另验证作者解释黄金payload/prompt、额外undefined键、完整材料与预算零调用、包外引用/来源覆盖/投影/锁定以及末端撤权和取消。原RA38继续通过，精确短引文及排版匹配接受集合没有扩张。此处49项为本代理实际复跑结果，未把主代理的其它回归或真实模型结果计入。

R22仍是场景935/935阶段通过、后置复核失败、未发布。后续仍须同范围只读模型复测与新会话的全部5589工作单元、冻结reviewFacts、正常作者冲突处理、保存/重开核验；整单元证据有效不能证明互斥事实本身成立，待决冲突不得被清除或跳过。
