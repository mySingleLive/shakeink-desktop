# 候选检查点提交边界补充方案与限定用例

日期：2026-10-26。状态：待独立审核；尚未编码。此文修正57/58中对“保存失败”的笼统表述，原始审核历史保留。

## 实际独审发现

59独审三条限定命令均绿，但发现P1：save(candidate,false)先rename替换journal，再await owner后验检查。若rename已经成功而后验失败，prepareReviewPolicy与planSemanticOmissions未采用候选，形成磁盘新信用/内存旧信用。R02原save入口失败只覆盖提交前，没有覆盖提交后。不能将原测试绿冒称该边界正确；当前七文件冻结版暂不通过。

## 最小修复合同

仅`desktop/main/novel-import.ts`及既有`tests/unit/novel-import-semantic-session.test.ts`的R02。其余六源文件不变，不新增suite/模型调用/IO服务/UI/预算；所有目录/归属安全复核保留。

1. 两个候选路径使用同一提交helper。候选先编码为可恢复的paused、resumePhase=running、固定安全错误提示及targetNeedsAuthorization=true。原正文、模型/来源边界、任务、锁和信用按各自已审计划组成同一候选，不拆成多个事务。
2. save为候选提供私有同步onCommit接点。保留提交前owner、临时文件fsync、再次owner；以`await rename`成功返回为唯一提交边界，立即同步采用候选到原live对象，中间不夹await；之后仍执行原owner后验。普通非候选save不改变合同。
3. 提交前任何失败：不采用、不改旧信用或policy、0AI。提交后的后验失败：抛专用固定CandidateCommittedBlocked错误；live和磁盘保持同一已提交暂停候选，不冒称旧信用保留，不回滚、不再写第二次phase/error。实例设置阻断latch，禁止新的发送、写入及会改状态的动作；包括异步checkpoint在fn之前检查，不能先改内存再在save才拒绝。current只返回已提交暂停视图，不刷新模型/PDF检查并暗中写入。允许安全只读以及取消/排空现有资源。
4. launch识别该专用阻断，只结束当前job，不能走普通failed→save。关闭仍正常取消/排空jobs/PDF，但不重写已暂停候选。阻断须由正常重开、目录归属重新校验并撤销旧授权后解除；单纯retry或current不能解除。不增加绕过owner的后备读写。
5. 后验成功才恢复live的期望phase/error/授权标记并启动或返回原workflow。磁盘保留paused恢复检查点是有意设计；随后原业务checkpoint照常持久化，不为恢复running额外制造第二候选事务。正常崩溃/重开会恢复该已提交业务候选并要求重新授权。此设计不得放宽同版本成功信用、作者锁、两轮上限或原文保真。

## 定向反例与验证

只在原R02内部增加两个真实post-rename反例：迁移候选与遗漏规划候选。包裹真实owner方法，提交前照常执行；实际读到disk revision已换为候选的后验调用精确拒绝一次，不用save入口throw冒充后验失败。

- 先在59冻结版实测RED并保留独占日志；未改原R01/SEM既有断言。
- rename后立即检查live与raw disk候选的业务信用、policy、phase/error/授权、修订任务/omission.done一致；0新增AI/发布，不能假称旧信用未提交。
- retry/current/关闭不能重写该候选或发AI；排空无死锁，异步checkpoint不能先改live。
- 恢复owner方法后，真实新controller initialize/reopen核对同一业务候选（正常epoch/revision/授权撤销除外），重新授权后才可继续。
- 原提交前save失败仍须旧磁盘/live信用完整、0AI，保持边界两侧分别断言。

仍仅57最终批准的三条命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-R0[12]:' tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM(?:08|09|10):' tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM04:' tests/unit/novel-import-semantic.test.ts
```

独立方案审核后才TDD，最终仍须59代码复审关闭P1；必要类型/构建另记。用户已再次解锁，旧实际应用已正常退出exit0；C1 rev178是失败状态下退出形成的paused，保留33材料/36冲突/正文原hash，不是正式LIFE。未再调用模型，待修复通过后按原UI恢复同草稿。
