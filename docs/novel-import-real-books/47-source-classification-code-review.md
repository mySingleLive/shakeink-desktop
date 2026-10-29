# 正文来源分类窄修复独立代码审核

日期：2026-10-26。审核者：`remaining_books_oracle`。依据45／46，独审两份生产文件及新分类测试。**最终结论：PASS，无本范围必须修订的P1/P2。** 仅覆盖本窄实现与指定定向验证，不代表当前模型已正确识别真实S01；C1旧rev5分类FAIL及所有后续未执行结果保持。

本代理只新增本报告及独立metadata／原始日志，没有改生产／测试源码、工具、原件、oracle或真实结果；没有访问真实journal／用户DB、运行应用／模型／CUA或其它suite。生成独立原始日志采用noclobber新建，没有覆盖实现者RED／GREEN。

## 最终冻结身份与实际delta

三项与交付SHA严格匹配，结束前复核未变：

| 文件 | SHA-256 |
| --- | --- |
| `desktop/core/novel-import-ai-payload.ts` | `4bc384917f7a723375090cec38be180e561bfe7b2b5b3fba8317167a4a2098e6` |
| `desktop/main/novel-import.ts` | `b869c4034c9eb86e3cee4f5fee642c5cd25f1b10feeaf7e06549d221672250c9` |
| `tests/unit/novel-import-classification.test.ts` | `af6ed4761e9fa21c0372158f380f1c60d676c61538fc4199975727d14502558d` |

对当前源码只做内存字符串反向差分与SHA核对，未执行生产模块或写回文件：main撤回importClassificationUnits导入、classificationSourceHash的条件指纹、requestSnapshot的副本接点三处后，完整文件恰为43冻结SHA `04ef2051cc12c6b53b92b2b6787c166ed7f317bb89417115b89b732ed6585147`。payload撤回本次中性副本helper、相关units引用、classify专用分支及固定契约函数后，完整文件恰为C1所用SHA `9e26d2c5751550b6410b3b6d00a3e220e4b917ac7b5124fad493e25b75e76051`。

这确认两生产文件没有夹带其它差异，不依赖本仓库untracked文件的空git diff作证明。静态metadata见 [classification-independent-static-delta.json](evidence/classification-independent-static-delta.json)。原session测试仍为 `617127bff8096f82b8d5300f72b092f8b2a7f76c9ef2db1d8fa4897a645c07c4`，本次没有继续改S10或LB05断言。

## 生产行为核对

**阶段与用途。** payload第27–29行只把semanticVersion1的classify转到固定sourceClassificationPrompt，其它phase仍走原分支。第42–43行契约明确识别“原资料用途”：小说叙述、对白、人物／地点／社会背景、回忆与评论仍属body；独立单列的卡片、设定、规划、编年或叙事安排才为相应kind。合法类别全部列明，unknown保留核对；不按书名／人物／词／语言／扩展名硬编码body，不自动吞或剔除版权／日期／注释。新分支不附native、facts及两线生成规则，保留不可信资料和只返回classifications的阶段约束。

**中性副本与输入完整性。** 第10行helper仅对新语义classify逐unit浅复制并把kind设unknown；id、fileId、原start/end、text、part和顺序保持。main第288行在请求快照接入它，序列化第15／20／21行也使用该副本；双次复制只更换对象与同一枚举，不改原字符串／几何。legacy及非classify直接保留原units。没有提前写s.units或在代码中把模型合法world结果强转body。

**缓存身份。** main第45行仅对semanticVersion1条件加入classificationContractHash，值为新语义classify空payload固定prompt的SHA-256。没有正文、当前kind、session、时间、epoch或随机值进入这个新增指纹；legacy条件展开为空，保留原scope／units公式。分类身份仍只写既有classificationCheckpoint.sourceHash，并与原resultHash共同决定preserve；没有新增全局scope／plan／semantic字段或修改发布快照。

**提交与恢复。** recognize仍先按完整合法批响应核对数量、ID唯一／归属和合法kind，再经当前epoch的原子checkpoint更新源kind／coverage／sourceHash／resultHash。请求pending、缺失／重复／外来ID、非法kind或越阶段响应均不改已有源分类；旧契约失配重发原单位，同一新契约重开后保留成功批且只补未完成，迟到旧epoch无信用。既有源验证、预算／模型授权、runtime持久化失败收尾、PDF、AI服务和发布路径没有借机改变。

## 基线独立性与实施前RED

[preimplementation literals](evidence/classification-independent-preimplementation-literals.json) SHA为 `ad10837cc5979b4b69be428cb363a296c094c3aae35212ad98f6765d3a167850`。其元数据记录独立手写固定字符串及Python ordered JSON／SHA方法，不导入生产helper；测试GOLDEN为静态literal，独立读取确认与该JSON全等，运行中没有用生产函数回写期望。legacy分类source hash、几何／工作几何和旧phase的prompt／payload均使用这些预存值。

本代理没有重跑实现者的reference生成脚本，生成方法按其元数据归属记录，不伪称独立重生成。另有可核对依据：实施前真实RED已执行C01的旧phase literal循环并通过，随后才失败于新语义classify仍带native契约；C02旧契约全coverage因不重发而失败，正常恢复与legacy正例已通过。RED原始输出为2pass／3fail，SHA=`cb1d95e2b959ae86fdec7fa49eaa2298e411e075788245d429fc37a680667f39`，见 [classification-tdd-red.txt](evidence/classification-tdd-red.txt)。新测试从准备阶段到最终冻结保持同一SHA，不把实现后变异冒充此实施前RED。

## 获准的独立实际验证

只执行45列明的三条命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-C0[12]:' tests/unit/novel-import-classification.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[35]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-LB05:' tests/unit/novel-import-session.test.ts
```

| 范围 | 实际结果 | 独立原始日志 |
| --- | --- | --- |
| C01／C02 | exit0，5/5，fail/cancelled/skipped均0，1330.069583ms | [classification-independent-c01-c02.txt](evidence/classification-independent-c01-c02.txt) |
| A03／A05 | exit0，2/2，fail/cancelled/skipped均0，394.694417ms | [classification-independent-a03-a05.txt](evidence/classification-independent-a03-a05.txt) |
| LB05 | exit0，5/5，fail/cancelled/skipped均0，2144.866208ms | [classification-independent-lb05.txt](evidence/classification-independent-lb05.txt) |

C01经真实runImportAi适配器捕获prompt，用CRLF／非BMP合成文本核对完整字符、ID／范围／顺序、旧phase literal不变及固定提示预留；明确合法world／unknown原样返回，越阶段／非法结果仍拒绝。C02用临时目录真实controller验证91个单位／90012 UTF-16字符的旧全credit失效，pending和五类非法响应后原journal单位完整不变；合法world提交保持world。相同新契约81个已完成单位在暂停／重开后不重发，余下单位只补未完成且旧epoch结果无信用。legacy旧公式／原kind及工作几何保持，source-only为0AI。合成RPC只认证这些机械行为，不证明真实模型的来源角色判断。

没有额外运行typecheck；实现者 `classification-typecheck.txt` 的owned诊断0仅作为作者证据，不计本代理执行。也没有因本窄变化重跑已审核的其它SEM／runtime／PDF／browser／打包suite。

## 真实C1后续边界

本PASS允许主代理组合构建并在现有C1草稿、同一原件和当前模型上重新授权识别。新契约会使旧分类信用不匹配，不能拿rev5的26/26跳过真实请求。仍须保存新构建身份、新调用及不可覆盖检查点，再逐段对照事前oracle；旧rev5自动分类FAIL、原source和oracle保持。

不得手工重标正文、改期望、删失败草稿或反复随机重抽来充当这次修复的自动识别通过。实际结果若仍错误，继续如实FAIL；标题／作者／注释边界随后仍按固定基线人工核对并单独记录。真正分析、十二目标、独立语义、完整正文、发布和重开验收均未由本代码审核完成。
