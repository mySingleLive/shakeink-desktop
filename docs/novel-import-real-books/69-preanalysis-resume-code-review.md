# 分析前草稿重开恢复：独立代码审核

日期：2026-10-26。结论：**PASS，无 P1/P2**。本结论仅覆盖67/68批准的两文件改动与两条定向测试，不代表实际S02恢复、LIFE或整书导入通过。

## 冻结与完整差异

| 文件 | 最终 SHA-256 |
| --- | --- |
| `desktop/main/novel-import.ts` | `e5e6b028ccdad762366aa70cab06b3ee6d56836a1e23b1b0461dda2660145bf8` |
| `tests/unit/novel-import-session.test.ts` | `7ef8449b639f2102515aead9d08a06f994215cd938670a93498e0babe479a4c0` |

对真实只读基线 `/private/tmp/preanalysis-resume-67-baseline/` 独立重建完整统一差异，逐字等于 `evidence/preanalysis-resume-implementation-delta.diff`，SHA-256为 `cd8b3745707ba86e708856da1d472247501270496aa99d417d3ed47f2f21b5ba`。将main新增条件反替换为原条件，整个文件逐字恢复基线；从session测试去除唯一新增S13及其新增空行，整个旧文件逐字恢复。原core SHA仍为 `6a11e1ef0ba7b66a89a070b38b5e134302b920a379c86ef2b489b1b5959971ef`。

## 代码与用例判断

生产仅把resumePhase为source/select/confirm与原recognizing并列排除出旧reviewPolicy迁移条件。targetNeedsAuthorization及publication仍在前，pending冲突仍优先于核对阶段恢复；恢复只设置原phase、清空resumePhase，没有授权或启动AI。真正start的prepareReviewPolicy、旧running迁移、作者决定/锁及提交边界均未改动。

S13使用合成来源与实际controller公开操作，三阶段均有全12目标、infer=true、无target及无analysisCheckpoint的前置断言。正常close写paused，再用新controller initialize和缺省consent的resume，恢复原source/select/confirm；来源、units、正文、章界、选项、coverage、产物、决定及相关检查点保持，AI和publish为零。比较有意不要求revision/epoch/时间戳原值；这些是正常关闭和恢复的状态推进。

已有target反例先连续两次resume，均停confirm、targetReady=false、重授权标记及原select恢复点保留；实际choose-target后才允许回select，仍不发AI。无journal注入、consent=true掩盖或手工checkpoint。原S12人工章界测试和R02迁移/提交边界断言均保留。

作者实施前RED `evidence/preanalysis-resume-s12-s13-red.txt` 保留：S12通过；S13四个子例失败（计入父测试共5 fail），前三个复现resume→start缺target，已有target子例在重授权后的恢复误入策略同意门。该历史未改记通过。

## 独立执行

只执行以下67批准的命令，日志用独占新路径创建，未覆盖作者证据：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-S1[23]:' tests/unit/novel-import-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-R02:' tests/unit/novel-import-semantic-session.test.ts
```

| 独立日志（`evidence/`下） | 结果 | SHA-256 |
| --- | --- | --- |
| `preanalysis-resume-independent-s12-s13.txt` | 6/6，exit0，0skip | `23afeb7275bc9601ccd81cd56d146052a86ef318ed710d82be36669a431e8478` |
| `preanalysis-resume-independent-r02.txt` | 8/8，exit0，0skip | `3481ac708e0c92ae9ef05ead9efc35e377d0cfa94420ce16572020389af85d42` |

独立源hash、基线hash、差异核验与精确argv见 `evidence/preanalysis-resume-independent-review.json`，SHA-256：`681024b457b6427e04f8cfcbb6e80fde0c812118d20d6a354b38d9e0e4c2023f`。

本审核未改生产/测试、未扩大suite，未访问实际S02、用户journal、应用、模型或用户数据库；未自行运行构建或另行类型检查。主代理构建与同草稿实际恢复证据须另记，原实际失败继续保留。
