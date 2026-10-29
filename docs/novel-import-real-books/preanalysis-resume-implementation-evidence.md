# 67/68 分析前恢复窄修实施证据

日期：2026-10-26。67 方案经 68 独立 PASS 后实施；仅 main 的 resume 单一条件及新增 S13。两文件已冻结交 69 独审。未读取实际 S02、journal、源/oracle、模型或应用；实际阻塞历史保留，不把合成通过计成真实恢复或整书通过。

## 修改与真实 RED

真实基线另存 `/private/tmp/preanalysis-resume-67-baseline/`：main `a0acd1a2…9bcd7`，session test `68c79feb…7c814`，未覆盖此前基线。

先仅加 S13，在现生产 [真实 RED](evidence/preanalysis-resume-s12-s13-red.txt) 中原 S12 仍绿，S13 的 source/select/confirm 三个公开操作构造的草稿均在 close/new initialize/缺省 consent resume 时误入 start 并报缺 target。有 target 反例先正常要求重授权，但明确 choose-target 后又误入策略重建同意门。含父子例 1 passed/5 failed、exit 1；没有 journal 注入。

生产仅把 reviewPolicy 前置条件从排除 recognizing，改为并列排除 recognizing/source/select/confirm。原 targetNeedsAuthorization、publication、pending conflicts 与核对阶段恢复分支的顺序不动；真正 start 的 prepareReviewPolicy 及运行态旧策略/作者锁/候选提交门不动。不补造 analysisCheckpoint/reviewPolicy2、不传 consent:true 掩盖问题。

## 最终限定验证

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-S1[23]:' tests/unit/novel-import-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-R02:' tests/unit/novel-import-semantic-session.test.ts
```

| 最终日志 | 结果 |
| --- | --- |
| [S12/S13](evidence/preanalysis-resume-s12-s13-final.txt) | 6/6（含 S13 四子例），0 skip，exit 0，732 ms |
| [原 R02](evidence/preanalysis-resume-r02-final.txt) | 8/8（含子例），0 skip，exit 0，2121 ms |
| [必要静态诊断](evidence/preanalysis-resume-typecheck-final.txt) | 当前 tsconfig/noEmit/incremental:false，两个 owned 文件 diagnostics 0，exit 0 |

S13 经 choose/local 分类/select/set-title 公开流程准备三阶段，各全 12 targets、infer=true、无 target、无分析检查点；正常关闭和新 controller 初始化后，不给 consent 即回原阶段并清 resumePhase，AI/publish 均 0。逐项比较源/units/全文/章界/选项/信用/产物/决定/预算/授权及私有检查点不变。另一个已有 target 草稿连续两次 resume 都保持 targetReady=false 并回 confirm 提示；只有实际 choose-target 后才能回 select，仍不发送或生成策略标记。旧 S12、R02 和其它断言未删改。

## 冻结 SHA-256

```text
e5e6b028ccdad762366aa70cab06b3ee6d56836a1e23b1b0461dda2660145bf8  desktop/main/novel-import.ts
7ef8449b639f2102515aead9d08a06f994215cd938670a93498e0babe479a4c0  tests/unit/novel-import-session.test.ts
```

[完整两文件差异](evidence/preanalysis-resume-implementation-delta.diff) SHA `cd8b3745707ba86e708856da1d472247501270496aa99d417d3ed47f2f21b5ba`。core 仍为 `6a11e1ef…971ef`，其余生产/测试/检测器/UI未改；未运行其它 suite 或构建。独审后由 root 通过真实同草稿 UI 恢复、核对十四单元并继续原验收。
