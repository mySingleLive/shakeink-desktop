# 41/42 私有运行时证明实施记录

日期：2026-10-26。本轮只实现应用层 `options.ai` 原 Promise 与停机屏障的私有证明。未调用真实模型、用户 DB、CUA、真实 journal 或构建；未证明供应商内部状态、远端取消或计费停止，也不宣称 RB-LIFE01 通过。43 另作独立代码审核。

## 实现及隐私

- 新 helper `desktop/core/novel-import-runtime-proof.ts` 无 IO。`ImportRuntimeProofTracker` 在进入现有 `options.ai` 前预留/检查固定容量；只有该函数返回原生原 Promise 后才登记 token。双向 settle observer 仅同步更新本实例 token 的 `state/outcome/settledObservedAt` 和 token 集合，不写 FS、不进 serial、不改变业务信用。原 Promise 原值/错误继续由业务 await；同步抛错不造 pending，也不漏预留槽。
- 控制器先验证 owner/action，持 serial 仅跨一次 `setImmediate` 新 task。在其回调内纯核对 session 对象、epoch、processRunId、PDF generation，复制实际 pending 元数据，记录捕获时间，再同步 epoch++/stopping；中间没有 await、FS 或业务 hook。旧单 microtask 的 resolver→observer 反例不能通过。
- 取消和等待 jobs/PDF 均在 serial 外。同步取消异常转为该取消 Promise 的拒绝，仍等待真实原调用和 job。最后分别读取真实 `pendingCalls/operations/workflowJobs/pdfActive/pdfRequests`；全零且捕获调用全部 settle 才是 drained；没有捕获是 missed，非零/坏记录只能 unavailable。pause 自身 actions 不作为 AI 活动。
- `runtimeAiCall` 是最近调用的定位提示，磁盘可能滞后，不能独自证明仍 pending。最终只采信新暂停线性化点捕获及屏障后的证明。验证阶段仍占 operations 时，原调用已 settle 会明确 missed。
- 固定 v1 schema 为严格已知 key：UUID、非负 safe integer、既有枚举、64 位 SHA、最长 40 ASCII 合法 ISO 时间；没有自由说明/路径/模型/URL/grant/Key/正文/facts/prompt/响应/raw error。当前 token 最多 16，单 call 最多 1024 UTF-8 JSON 字节，call+proof 总体最多 16384 字节；只能通过测试参数下调。容量满在实际 invoke 前失败，不截断、不丢 token 来伪造 proof。
- 可选私有字段仅 `runtimeAiCall/runtimePauseProof/runtimeDiagnosticsStatus:'unavailable'`。每个 call 含 process/session/operation/epoch/phase/kind?/intent?/workingRevision/scopeHash/payloadHash/startedAt/state；settled 另有固定 outcome 和观察时间。proof 含 process/session/旧新 epoch/捕获与屏障时间/state/捕获调用终态/五项 remaining。
- `parseImportRuntimeDiagnostics(sessionId, diagnosticObject, lowerLimits?)` 返回严格有效白名单对象或 null；`sanitizeImportRuntimeDiagnostics(session,recovering)` 只隔离坏可选元数据。坏诊断不丢正文/source/coverage/artifacts/SEM/预算字段。恢复 pending 只变 interrupted，内存 token 从空开始；旧有效 proof 仅历史，不能凭 schema 有效就当本次新捕获。新调用生成新 processRunId；实际新 proof 还需匹配本次 action 的 epoch、operation 和时间。
- 持久化失败仍先完成取消和真实等待；内存清除本次 proof、固定标 unavailable 并报告错误。缺字段旧会话不补默认、不升级。诊断不入 payload/prompt、scope/plan/semantic hash、ContentVersion/公开 view 或回执。
- S10 fixture 经主代理明确批准，仅该编号内合成 AI 角色补严格必要 roleType/aliases/relationships；working-revision 的源角色改为明确“年龄：19/角色类型：主角”。正文与 patch start6–9、冲突/失效/revision/恢复全部原断言保留。全局 fixture 默认和生产解析未放宽，没有把新会话全改成 legacy。

## TDD 与执行范围

实现前修正隔离 app/target 路径后实际首次 RT RED：0/4（699 ms）：控制器实际调用后缺 runtimeAiCall、暂停缺 proof，以及 helper 尚未存在。该原始工具输出当时**未落盘**，不伪造为后续文件。实现中同步 cancel 抛错跳过 drain 的新增反例也实际先失败，再补 async rejection 收口。

以下 `*-red.txt` 都是**实现后故障注入/变异验证，不是实现前 TDD 原始 RED**。逐次 try/finally 恢复；各文件原/恢复 SHA 相等记录在 [变异命令元数据](evidence/runtime-proof-red-command-metadata.json)：

- [禁调用登记](evidence/runtime-proof-controller-uninstrumented-red.txt)：证明真实 controller 测试依赖实际 call token 接线。
- [单 microtask 栅栏](evidence/runtime-proof-single-microtask-red.txt)：精确 resolver 在前、observer 后排会误捕获，fresh-task 与 lineage 测试失败。
- [同步取消旧行为](evidence/runtime-proof-sync-cancel-red.txt)：必须继续等待原 Promise/job，而不是取消函数抛错就提前返回。
- [旧 S10 fixture](evidence/runtime-proof-s10-old-fixture-red.txt)：说明 age-only 产物不再满足 sem1、叙事年龄不再充当明确 source 字段；属于已授权测试适配。

最终实际命令，均绝对 Node 24，未扩其它 suite：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-RT0[12]:' tests/unit/novel-import-runtime-proof.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM08:' tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-S10:' tests/unit/novel-import-session.test.ts
```

| 最终原始输出 | 结果 |
| --- | --- |
| [RT01/02](evidence/runtime-proof-rt-green.txt) | 11/11，0 skipped，exit 0，1730 ms |
| [SEM08](evidence/runtime-proof-sem08-green.txt) | 6/6，0 skipped，exit 0，2496 ms |
| [S10](evidence/runtime-proof-s10-green.txt) | 9/9，0 skipped，exit 0，2222 ms |
| [5 owned TS 文件静态检查](evidence/runtime-proof-typecheck.txt) | 当前 tsconfig、noEmit/incremental:false，diagnostics 0 |

RT 包括延迟原 Promise/取消/PDF 资源、源验证尚未调用、同步抛错、已 resolve/reject 原 Promise、精确微任务竞态、磁盘 pending 但 raw 已 settle 且 operations 仍活跃、owner/epoch/PDF generation 变化、16/17 token、精确字节上下界、每项非零资源计数、未知字段/坏类型/跨身份/坏时间、异常保存、旧 pending/历史 proof/新实例和 source-only 0AI。

MD/PDF legacy scope/plan 冻结值由独立 Python canonical JSON/SHA 计算后写为 literal；测试不重用生产 hash 作为期望。新字段的发布快照排除调用现有 `publicationRecord` 的 AST 函数体，注入真实 pure 依赖；没有加载发布 DB 或伪称落库验证。

## S01 纯兼容核查

只读主代理授权的脱敏 observer rev177 副本及公共测试源，内存按原 units 补省略 file.text；新 `encodeImportJournal` 前后完整重建对象指纹不变，未增加 runtime/semantic 默认字段。结果见 [纯数据日志](evidence/runtime-proof-s01-pure.txt)：旧 plan `d51702f08aef8b33b736c6295acb369c9748a20418c6cfd092654528a610faee`，57 artifacts、215 facts+57 texts=272 review tasks、13 workingUnits；正文 SHA `b6360470a56ab29b0c8a1e327db72ac552651b206a63b1392dd94749e8381d4a`，所有输入文件与原 source SHA 前后不变。没有读取真实 journal/用户 DB；原 S01 语义 FAIL 结论保持。

## 最终 SHA-256（已冻结）

```text
04ef2051cc12c6b53b92b2b6787c166ed7f317bb89417115b89b732ed6585147  desktop/main/novel-import.ts
4b13236a2e14a0c55454fce4115784f8cb3145e6acd7a8b8fc193515b7754ef1  desktop/shared/novel-import.ts
ed77bbf8fe0f1c572e49e4d8178bbc27d712f56799616cc27ab4a6acf78bf5d7  desktop/core/novel-import-runtime-proof.ts
181e5e8d2deada5d6c4dd5958d76f73eb6bd15d8fd86ae94fea04777a0d32660  tests/unit/novel-import-runtime-proof.test.ts
617127bff8096f82b8d5300f72b092f8b2a7f76c9ef2db1d8fa4897a645c07c4  tests/unit/novel-import-session.test.ts
```

SEM08 文件、本轮以外 core/semantics/state/service/payload/publish/UI/worker/observer/audit 均未改；相关最终语义 SHA 与 37/38 基线一致。真实 RB-LIFE01 与组合构建由主代理在独立审核后执行。

## 43 P1：首次 pending 诊断持久化失败

43 独立审核发现此前 `recordRuntime` 只标 unavailable、未向 AI 失败路径传播，可能在写盘失败后继续采用返回结果。按主代理授权，仅 main 与原 RT01 增加一个子情形；helper ed77…、shared、S10 与 44 API 均未改变。

这是本轮**真实新反例先 RED 再修复**，不是前述实现后变异回放：在实际 options.ai 进入时，同步把本测试独占 session.json 移到保留文件，再在原位置创建目录，导致首次 pending 诊断真实写盘失败。冻结旧源码上只增加用例后 [原始 TDD RED](evidence/runtime-proof-first-pending-write-failure-tdd-red.txt) 为 9 pass/2 fail（父项和新子例，4072 ms）；控制器未发取消，受控窗口断言失败。

修复后 `recordRuntime` 返回可 await 的持久化 Promise；AI 自己的 catch 取消该 operation 并直接等待原 Promise fulfilled/rejected，绝不等待包含自身的 jobs。operation 和 job 在 raw settle 前继续占有；随后抛固定私有持久化错误，不采用结果、不发后续请求、不增加 coverage/artifact。launch 仅对该错误分类，在最终 failed 状态仍无法保存时保留核心数据与固定 unavailable/error、清 proof 并结束 job；其它错误路径继续原行为。没有原始异常、路径或凭证进入诊断/固定用户错误，也没有假称写盘成功。

[修后原始 TDD GREEN](evidence/runtime-proof-first-pending-write-failure-tdd-green.txt) 11/11（1319 ms）。同一子情形覆盖正常取消与同步抛错两种情况，持续保持目录不可写直到原 Promise settle/任务真实结束，断言零信用、无后续 AI、未签 proof、无未处理 rejection，保留文件中的原材料不变。随后最终三条批准命令再次执行的原始 GREEN 已更新上表链接；owned TS diagnostics 0。

先前 `*-red` 变异日志绑定此前 6cc71e… 主控制器及其各次原/恢复 SHA，不伪装成现在 04ef20… 的实现前历史。最终 43 应以本文件上方新 main/RTtest SHA 与新真实 TDD 日志复审；44 的 helper 依赖 SHA 保持不变，无需因该 main 接线修复重跑其它范围。
