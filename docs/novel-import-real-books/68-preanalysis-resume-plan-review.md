# 分析前草稿重开恢复：独立方案审核

日期：2026-10-26。技术方案 **PASS**；限定用例方案 **PASS**。无 P1/P2 必修项。该结论允许按67进行限定TDD，不代表实现、真实S02恢复或整书流程已通过。

## 审核身份与范围

审阅 `67-preanalysis-resume-plan.md`，SHA-256：`b98704f5a1b637e845931c3f2645aa9e0c561c8c66cc6f97e23fa4ee6bb56a5d`。只读核对已知 `desktop/main/novel-import.ts` 的 initialize、action分派、start、resume、pauseAll/close，以及现有 NI-S12、NI-R02 测试接点；未修改生产或测试，未执行命令测试，未访问实际小说、用户journal、应用、模型或用户数据库。

主代理报告的实际失败是 paused / resumePhase=select / 无target / 零产物，且固定调用栈为 resume→start 缺target。本审核未读取该真实快照，也不以主代理实际证据冒充独立执行结果。

## 技术判断

现有旧reviewPolicy条件将无analysisCheckpoint的语义版分析前草稿提前送入start，start首先要求target，因而挡住其后原有 source/select/confirm 恢复分支。只将这三种resumePhase与recognizing并列排除，能够让原恢复分支到达；它仅回到核对阶段、清空resumePhase，并不授权发送或启动workflow。

该修改不调整分支顺序：targetNeedsAuthorization仍首先要求目录重授权，publication仍走原冻结计划恢复，pending冲突仍先于核对页恢复。运行态旧策略迁移继续走原条件；之后真正start仍执行prepareReviewPolicy，包括同意、目录、来源、模型、预算、作者决定/锁及提交边界校验。不能将此恢复修复解释为跳过旧策略迁移或补造reviewPolicy2。

生产范围应严格保持为main中这一条件，既有recognizing排除及其单独授权路径保留；不修改保存、检测器、UI、模型、来源或既有信用。

## 用例判断与执行边界

NI-S13应由实际controller公开操作构造 source、select、confirm 三阶段，选全12目标且infer=true，明确无target、未分析、无analysisCheckpoint；正常close、新controller initialize后，以缺省consent的resume回到原阶段。比较来源、units、正文、章节、选项、coverage、产物及决定；AI/publish计数均为零，resumePhase清空。不得写journal或用consent=true掩盖阻塞。

另一个已有target的分析前重开反例必须保留targetNeedsAuthorization，resume只能进入confirm提示重新授权，不能变为targetReady。原NI-S12保护人工章界，原NI-R02保护旧运行态迁移、作者决定/锁、发布优先和提交边界；不删减其断言。

仅批准67列出的两条精确命令，先现生产S13真实RED，再最小GREEN和独立代码审核：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-S1[23]:' tests/unit/novel-import-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-R02:' tests/unit/novel-import-semantic-session.test.ts
```

本报告未运行上述命令。全项目类型、构建及后续同S02实际恢复由主代理另记证据；原失败保留，不能追溯改记通过。
