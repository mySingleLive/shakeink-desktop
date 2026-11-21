# 场景复核遗漏早校验代码独立审核

2026-11-01，审核者 `scene_fix_review`。依据已独审通过的320阶段A及321用例审核实现；未参与本轮产品或测试编写。本轮只新增本文，未修改产品/测试、构建或运行App/API，未读取真实小说、模型配置、Key或私有reply。

**阶段A代码审核通过，无阻塞；独立指定定向测试92/92通过。** 结论只覆盖既有遗漏机械校验进入原两代纠错，不包含阶段B、聚合、身份拆分、作者决定或完整导入发布验收。

## 接线与接受集合

- `desktop/service/novel-import-ai.ts:33—42` 的 `checkedMissingTarget` 保留旧末端的判断顺序与条件：选中kind/本包unitIds、原 `assertImportMissingProjection` 和合并锁、原 `anchorEvidence`/`validateImportEvidence`、证据单位与声明单位双向完整对应。没有补ID/hash、丢坏项、去重或猜片外字段。
- `desktop/service/novel-import-ai.ts:277—286` 仅经原 `sceneReviewUnitReferenceRequest` 添加生成期 `superRefine`。其条件仍是semantic1、review、selectedTargets恰为scene、无conflict及intent（`desktop/shared/novel-import-scene-review.ts:4—5`）。其它基础schema issue先维持原拒绝；新遗漏门不扩大author、其它目标/组合或legacy纠错范围。
- 早门只使用helper返回的临时副本做验证，不采用其结果修改schema输出。`anchorEvidence` 自身逐项复制；raw排版差异留到末端恢复，unitIndex仍由原严格wire还原本包完整text，没有跨单位rebind。EM02的CRLF/非BMP/Han排版、多项raw/index证据与RA/UR接受集合均通过。
- `desktop/service/novel-import-ai.ts:666` 仍在原末端逐项调用同一helper，并且仅此处写回已恢复quote。EM03用受控直接generator绕过JSON生成桥后，错误baseHash仍在原末端拒绝；这是既有依赖注入的负控，没有新增产品旁路。
- 原 `assertImportMissingProjection`（`desktop/core/novel-import-semantics.ts:83—94`）及main完整owner版本门（`desktop/main/novel-import.ts:1389—1392`）均未修改。EM03实际通过合法service结果，再使合成当前owner字段和完整hash变化，准确得到“已有实体遗漏与完整设定版本不匹配”，owner保持不变。不能由bounded request预测的当前完整版本继续由main判断。末端授权/snapshot/取消门也仍在 `desktop/service/novel-import-ai.ts:673` 执行，RA04/UR03/SV03回归通过。

新增指导为固定有限常量，issue路径仅 `missingTargets` 与数组位置；catch不拼接原错误值。实际第二代追加反馈的canary断言覆盖ID、hash、非法field、名称、reason、引文和完整正文，尾句完整保留且受原250 code units限制。原两次生成循环未变；持续坏例恰两代 `invalid_schema`，无成功返回或额外重试，合法/坏/合法包不会过滤坏项后通过。

## 最小差异与预算

在内存中逆转本轮import类型、固定指导/helper、生成期superRefine及末端helper复用，所得service SHA256为 `c5dd87b7b4fa7979b09219ccb4f4c8b723e3c4a01e4530a3c2634df631787600`，与R27冻结源完全一致。当前service SHA256为 `2fe4b007b35e76e9b5b4fbfa06897b9d5bf6f8f73cc6d208a59e68b472791e95`；逆转仅在内存计算，未写源文件。

另核对原payload、semantics、main、shared请求、scene-review scope及generate六文件仍匹配R27冻结hash。由此确认本轮没有新wire/version/flag、材料或metadata变化，也没有cap、model、thinking、并发和重试改动。EM04冻结首代prompt/payload，完整预算超限在生成前调用0次；第二代保留完整原prompt及资料，新增反馈计原wrapper reserve。author/非scene/组合坏范围仍是一代晚拒，legacy仍使用原支持的响应。

## 实际执行及证据强度

独立执行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test \
  tests/unit/novel-import-scene-review-missing-validation.test.ts \
  tests/unit/novel-import-scene-review-anchors.test.ts \
  tests/unit/novel-import-scene-review-unit-reference.test.ts \
  tests/unit/novel-import-scene-review-source-reference.test.ts \
  > /private/tmp/scene-review-missing-validation-independent-review.txt 2>&1
```

exit0，92/92通过，fail/cancelled/skipped均0（EM31、RA38、UR11、SV12）。另执行只读源hash/内存逆转检查及本文 `git diff --check`。作者另外129项和typecheck不是本次独立执行，不能相加冒称独立221项。

已只读核对作者RED：31节点中12通过、19失败；EM01八类各两条叶子均真实到达bridge返回一代后原service对应晚拒。恢复后的canonical/main等断言在该RED尚未到达，不补写为已失败；GREEN才实际覆盖。额外投影矩阵在RED遇首失败即退出，也不把其后未达变体冒称RED证据。

所有新增用例均为预定合成JSON经真实生成桥及原service/main纯后置的测试，证明校验时机和有限纠错机制，不证明真实供应商会正确推断遗漏。先前12类人工审计没有发现service最终接受/main拒绝；R27历史generic坏reply仍未直接复现。下一步仍须主代理完成组合检查、构建身份冻结及实际接口/完整新会话验收；此结论不表示作者已批准冲突、已发布或重开成功。
