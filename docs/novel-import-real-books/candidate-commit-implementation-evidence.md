# 60 候选提交边界窄修实施证据

日期：2026-10-26。对应 RS-CR01；60 方案 SHA `52ce8f9f801f0be6f1693d8aa1c7a47342b25bfda3243b4324ded4ab51404b7d`。仅修改 main controller 与原 R02 内部新增子例，交 59 增量独审；R01、旧用例断言及其余五个生产文件保持。没有操作应用、真实模型/Key、用户库、journal、原文或构建。

本记录修正 57 实施证据对“保存失败”的笼统表述。此前 59 实际发现 rename 成功后 owner 后验失败会导致磁盘新候选、live 旧状态；原测试绿不能覆盖该窗口，旧报告与原日志保留。

## 明确提交点

迁移与遗漏规划共用 commitCandidate。候选整体写为 paused、resumePhase=running、固定安全提示和需重新授权状态；以真实 rename 成功返回为提交点，私有 onCommit 立即同步采用候选到原 live 对象，无 await、通知、验证或外部 hook。之后仍执行原 owner 后验，提交前归属检查、临时文件 fsync 和再次归属检查全部保留。

提交前失败不采用候选，旧磁盘/live 信用与政策保持。提交后后验失败承认候选已提交，live/raw disk 保持同一暂停候选，使用专用固定错误与本实例阻断 latch；不回滚，不用普通 launch failed 路径二次保存，不再尝试清理已被 rename 消耗的候选 temp 路径。固定提示不附 raw error。

阻断在 checkpoint fn、private current、ai、动作入口及 serial 回调首部检查；public current 只返回已提交视图，不刷新模型或检查 PDF。已排队的 preview/report 回调也先检查新 latch，防止先改文件字段再在 save 拒绝；false 分支及 PDF 算法/worker/resources 未改。关闭仍取消/排空 jobs/PDF，对该已暂停候选不再保存。单次 retry/current 不能解除，只有新 controller 正常重新核验归属、撤销旧 grant 并重新授权才继续。

后验成功才在 live 恢复期望 phase/error/授权标记并继续原 workflow；磁盘 paused 是刻意的崩溃恢复检查点，不额外保存一次 running 制造新候选窗口。普通非候选 save 保留原合同。

## 真实 RED → GREEN

修改前另存真实 57 基线于 `/private/tmp/novel-import-candidate-commit-60-baseline/`，未覆盖 56 基线：main `727cddac…5e546`，test `e6809422…89f85`。

先在原 R02 加迁移、遗漏规划两条反例，包裹真实 owner 方法并照常执行原复核；只有实际读到 disk revision 已替换为候选的后验调用才拒绝一次。原始 [RED](evidence/candidate-commit-r02-post-rename-red.txt) 中两条新反例均失败，12 passed/3 failed（含父 R02）、exit 1：迁移 live 未采用候选，遗漏规划随后还被普通 failed 保存覆盖。这是生产修改前的真实执行，不是 save 入口 throw 或事后变异。

GREEN 在相同后验接点检查 live 与原始 disk JSON/字节一致、paused/error/授权/policy/任务及 omission.done 一致，且零新增 AI/发布。原 precommit 失败保旧状态断言保留。阻断后实际 private checkpoint 的 fn flag 不执行，current/retry/私有 ai/save 不触发后续 owner/写/发送；close 调用真实 drain、无死锁且字节不变。新 controller 真正 initialize/reopen 后业务候选保持（正常 revision/epoch、撤授权与运行时诊断变更除外），重新授权后两条流程均完成。

最后一次源码与测试修改后，仅执行批准的三条命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-R0[12]:' tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM(?:08|09|10):' tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM04:' tests/unit/novel-import-semantic.test.ts
```

| 最终日志 | 实际结果 |
| --- | --- |
| [R01/R02](evidence/candidate-commit-r01-r02-final.txt) | 15/15（含两条新后验例），0 skip，exit 0，5162 ms |
| [SEM08/09/10](evidence/candidate-commit-sem08-sem10-final.txt) | 11/11，0 skip，exit 0，4411 ms |
| [SEM04](evidence/candidate-commit-sem04-final.txt) | 1/1，0 skip，exit 0，285 ms |
| [必要静态诊断](evidence/candidate-commit-typecheck.txt) | 当前 tsconfig/noEmit/incremental:false，两个 owned 文件 diagnostics 0，exit 0 |

没有执行其它 suite，未为实际模型、文学质量、真实 C1 或发布/重开验收追加通过信用。

## 冻结身份

```text
a0acd1a282eea4dc874ff45fa4b4b143cc2c2fe688880a235399bcff1d49bcd7  desktop/main/novel-import.ts
8c9df1bcec64315bd6a585e89e994ec7f1bde302a5df169ddccafb3104ce6d6f  tests/unit/novel-import-semantic-session.test.ts
```

[完整两文件差异](evidence/candidate-commit-implementation-delta.diff) SHA `90670692eaa7b37815c4468c38dc249b2af244d0e888b2c9d7e14ebd2e60108a`。其余五个生产 SHA 逐项与 57 冻结一致。后续由 59 关闭 P1、主代理组合构建与实际流程验收。
