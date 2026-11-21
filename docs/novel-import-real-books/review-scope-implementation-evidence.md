# 57/58 审核范围与定向遗漏实施证据

日期：2026-10-26。按 57 最终方案（`9f20dfbe…693289`）和 58 审核实施，七文件已冻结交 59 独立代码审核。没有操作应用、真实模型/Key、用户库、journal、外部原文、UI或构建；没有撤销真实 C1 失败，也不声称真实遗漏、文学质量、发布或重开验收通过。

## 七文件变化

| 文件 | 本轮变化 |
| --- | --- |
| core/novel-import-ai-payload.ts | 仅新语义 review 加局部目录/有损传输契约和位置数组 reviewProjection；遗漏三元组说明；新元数据进入现有完整 serializer/3B 门。classify、legacy 和其它阶段固定提示保持。 |
| core/novel-import-review-tasks.ts | 在原确定性片段上保留真实文字范围，附完整对象来源的投影；原 key、顺序、证据批次和分片几何不变，同 ID 多片逐项保留。 |
| core/novel-import-semantics.ts | 定义并严格校验投影的位置、身份、hash/完整长度/完整键集合、片段范围及字段；遗漏 artifactId/field/baseHash 三元组及片内可证明范围门。 |
| core/novel-import-semantic-state.ts | 持久化遗漏三元组与可选任务 omissionKeys；新增 keys 的重复元数据计入原容量预检。旧无 keys 任务不改变。 |
| main/novel-import.ts | 从完整私有 artifact 生成/复验投影；完整对象、原资料及全量锁复验；新实体缺项传精确 reason/evidence/unitIds，拒旧 ID/本批重复 ID；已有实体按三元组聚合后排稀疏修订及额外来源任务。新增任务在 clone 上做容量和实际请求预算预检、候选保存后才标 done；旧任务 key/done/edits 保留。补全 merge 有 pending 冲突即原子落盘并停止后续工作。 |
| service/novel-import-ai.ts | 只校验新增可选合同和有据遗漏范围；原生成桥、一次纠正、知识/native/evidence/links/授权取消门保留。 |
| tests/unit/novel-import-semantic-session.test.ts | 新 R01/R02 及隔离 fixture 的只读观察/受控故障注入；原编号恢复、两轮、锁、全文等断言保留，无旧用例版本适配。 |

私有 `analysisCheckpoint.reviewPolicy` 当前为 2。只对新语义且需要 AI 的未发布分析生效：publication 优先；旧 pending 冲突早退不能绕过政策。明确 consent、模型、原目标、来源、预算预检后才在 clone 重建旧未绑定信用；decisions/locks 非空和未知版本均固定安全拒绝。候选必须在真正 `save(candidate,false)` 接点成功持久化，才提交实时对象并 launch；拒绝或首次保存失败同时验证磁盘与内存旧信用/阶段/epoch/授权不变、零 AI。正文、工作版本/单元、来源、边界/章节、目标、标题、预算保持。版本 2 的成功正文审核和事实任务恢复不重发；legacy、零 AI 和已发布恢复不迁移。

## RED 与限定结果

真实 56 完整原文基线在 `/private/tmp/novel-import-review-scope-57-baseline/`，未重建历史。先仅新增用例，生产仍在 56 时得到 [行为 RED](evidence/review-scope-r01-r02-baseline-red.txt)：两个顶层 R 均失败，含子例 2 passed/8 failed、exit 1。投影缺失、遗漏上下文未传、旧 pending 不迁移及未同意早退缺口均实测暴露。更早 [首轮日志](evidence/review-scope-r01-r02-red.txt) 含新增 seed 没准备 workingProse 的 fixture 错误，原样保留；修正 fixture 后才取得上述行为 RED。

实施期间补实际 adapter prompt 观察时，[review-contract RED](evidence/review-scope-review-contract-red.txt) 抓到固定范围提示漏接，随后修复。它是实施中的新增检查失败，不冒充实施前 RED。三元负例还补了“真正到达 review 响应”及坏包信用不变，防止前一阶段错误造成假绿。类型首检仅本轮测试局部变量缺显式类型，[原日志](evidence/review-scope-typecheck-fixture-red.txt) 保留；以实际 request 类型修正，没有放宽产品类型。

最后一次源码与测试修改之后执行的唯一三条测试命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-R0[12]:' tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM(?:08|09|10):' tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM04:' tests/unit/novel-import-semantic.test.ts
```

| 最终原始日志 | 结果 |
| --- | --- |
| [R01/R02](evidence/review-scope-r01-r02-final.txt) | 13/13（含子例），0 skip，exit 0，3333 ms |
| [SEM08/09/10](evidence/review-scope-sem08-sem10-final.txt) | 11/11（含子例），0 skip，exit 0，3386 ms |
| [SEM04](evidence/review-scope-sem04-final.txt) | 1/1，0 skip，exit 0，216 ms |
| [必要静态诊断](evidence/review-scope-typecheck.txt) | 当前 tsconfig/noEmit/incremental:false，七个 owned 文件 diagnostics 0，exit 0 |

R01 校验实际适配器收到的固定提示及 controller 位置投影；同 ID 多片和完整文字/事实严格对应，坏位置/hash/字段/范围及同 ID 不一致均零生成，片外字段不当判缺拒绝。已有实体两字段、不同额外单位经 reconcile，未争议字段和原文保留；同 base pending/committed 增补保旧信用并实际发送新原因/来源；超预算不截断、不标 done；新实体既有 ID 拒绝及三元负例均不提交坏包信用。R02 覆盖完整迁移拒绝矩阵、真正候选保存失败、正文和事实成功分片恢复、publication/legacy/零 AI，以及首个补全冲突后后续遗漏/修订/发布零调用。所有模型输出均为明确合成 DI；不代表真实供应商行为或文学语义正确。

## 冻结身份

```text
8edd5629d1f5153d00a5b4c0bfd90dd0bddcad29b7409f5b9546869ed6cb2d98  desktop/core/novel-import-ai-payload.ts
89e9c39e8a0c362d34baa5b393f44ca3dbfda1a52022ebc4ce66c9e6da566a82  desktop/core/novel-import-review-tasks.ts
e33fe475457e8829ed321fc428c108145ec441934db6017e83313d4aacab1874  desktop/core/novel-import-semantics.ts
592563c09ea0a12fed399a2f8eeef8016c5e9c099d46de9ab6f66e99a99f05d5  desktop/core/novel-import-semantic-state.ts
727cddac9037120c8162667c8ef213ad799da8ef43c82024ff7837910015e546  desktop/main/novel-import.ts
312fe64bf374168f6ec33267006a5c64d7e8b934093a33f4ef57398cf9271cd6  desktop/service/novel-import-ai.ts
e6809422606534cbd96ae207e40de9b20c984650a8d94079f6c2fc3165c89f85  tests/unit/novel-import-semantic-session.test.ts
```

[完整七文件差异](evidence/review-scope-implementation-delta.diff) SHA-256 `f8199fe22aa6a35adc03042cafc7128fbe6e4f8154e8cfeac09a331a5f3b061b`。没有修改范围外生产文件或运行其它 suite；后续独审、组合构建及真实 C1 同草稿重建/完整原文审读由主代理执行，旧失败证据与重做成本不得抵销。
