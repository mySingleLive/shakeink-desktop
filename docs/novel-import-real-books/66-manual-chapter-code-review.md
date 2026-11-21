# 人工章界保持独立代码审核

日期：2026-10-26。审核者：`remaining_books_oracle`。依据64／65，仅审core helper、CH04与S12增量及两条定向命令。

**最终限定PASS，无本范围必须修订的P1/P2。** 不代表实际S02章界后验、12目标或整书流程已经通过。没有修改源码／测试、访问真实S02／journal／应用／模型／DB，没有运行其它suite。

## 冻结身份与完整差异

| 文件 | SHA-256 |
| --- | --- |
| `desktop/core/novel-import.ts` | `6a11e1ef0ba7b66a89a070b38b5e134302b920a379c86ef2b489b1b5959971ef` |
| `tests/unit/novel-import-chapters.test.ts` | `006fcd00a9be86ea4e5dae864192317720229eea916b9cdc8777bf137732298a` |
| `tests/unit/novel-import-session.test.ts` | `68c79febb1c96ba8cf9593ac6070c5927dfa753e75eb6c365f84b2751017c814` |

执行前后匹配交付。真实三基线在`/private/tmp/manual-chapters-64-baseline/`；独立重生成完整diff与作者逐字节一致，SHA=`a0d32fc978906105caf5fd32febaa67b62ad7581e813af70d21a015c45bf12fb`。

生产完整文件仅新增helper内一行guard，内存删该行后精确恢复原SHA `854c734df935bb7631e71bf3c7e9d9a1f70a1c582a6d50ba102d5ba491793dbc`。旧CH01–03测试正文原字节保留；session测试只有S12插入，旧断言未改。main／service／主题CSS身份也维持原冻结值。独立metadata见[manual-chapters-independent-review.json](evidence/manual-chapters-independent-review.json)，SHA=`449cf828c40dc025fc930b498d8159b02f33c06ad4627c1ffdcab8b670a21369`。

## 行为核对

legacy及显式cuts仍先走原分支。新增guard仅在sem1、无显式cuts、manual、当前正文及章节非空、每项content为字符串且拼接逐字等当前text时生效；不去空白、不按长度或hash近似复用。

复用只将旧start／title交原importChapters(text,cuts,1)，继续检查起点顺序、标题、字符边界和全文覆盖；没有catch、默认修复或绕过校验。正常返回保持原构造的ID／标题／位置／内容，manual及既有diagnostic不被改写。正文变化、auto、空章节或不能完整复用的状态仍原自动检测；不改检测器、主进程、授权、预算、保存／发布、UI或schema。

CH04覆盖精确保留、显式新cuts、追加及同长度改字不复用、auto／空章节／legacy原行为，非法负起点／emoji中间／重复起点／尾部及空白标题在**同正文**下仍原门拒绝，未用提前auto分支制造假绿。

S12用真实controller及临时合成journal，经choose／本地分类／select／set-chapters创建前记＋13记事共14单元；再次local保持14与manual且0AI。合成classify(ai)实际完成后同样保持，回调断言仅classify，完整分类覆盖／grant撤销正确；真实close／新controller initialize／再次local仍保全部章界、模式、原文／hash、文件、units和选项。没有手改journal、开始analyze／review或发布，未调用真实模型。

## RED与独立执行

作者CH03／04实施前RED为1pass／1fail，CH03保持绿，CH04失败于原三个人工章节被合并成一个未分章；S12为0pass／1fail，原本地分类把14单元合并成一个。两份记录分别SHA `c5f1536ad3f3c055b4e00a4170f18d1891308065525ae8b27c777189d3f194ab`、`8a3f2a6ffa0ea90ab6c186676d212417d07782b13b47edf6e43bb81027d2157d`。这是直接行为RED，不是API缺失或实现后变异；本代理只读取历史，没有切换代码重造RED。

仅独立执行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-CH0[34]:' tests/unit/novel-import-chapters.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-S12:' tests/unit/novel-import-session.test.ts
```

| 范围 | 独立实际结果 | 新原始日志／SHA-256 |
| --- | --- | --- |
| CH03／04 | exit0，2/2；fail/cancelled/skipped均0；157.348834ms | [manual-chapters-independent-ch03-ch04.txt](evidence/manual-chapters-independent-ch03-ch04.txt)，`63912c558b3f4cfbed071eddd009d906d3824e370081d276f54f9249b77350a0` |
| S12 | exit0，1/1；fail/cancelled/skipped均0；332.046917ms | [manual-chapters-independent-s12.txt](evidence/manual-chapters-independent-s12.txt)，`2d3c91114d27ff5df6e4ac3fd024eff14dfc8b169e958148d78b8409db5d51ab` |

日志及metadata均exclusive新建。没有额外typecheck／构建或扩大矩阵；作者及主代理必要类型／desktop构建另作其自身证据，不能冒称本代理执行。

主代理可在新构建中通过原UI重新确认S02的14单元，再本地确认并独立比较完整章界／标题／内容、manual及正文hash。rev13真实失败永久保留，不手写journal恢复；实际后验通过后才继续12目标与全书验收。合成绿色不回填实际S02结果或正式LIFE。
