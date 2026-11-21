# 知识字段校验与安全提示独立代码审核

日期：2026-10-26。审核者：`remaining_books_oracle`。依据54／55，独审冻结的service facts校验、main.safeError及既有J01／J02增量。

**最终结论：PASS，无本范围必须修订的P1/P2。** 结论限于代码与指定合成验证，不认定rev83／103实际失败原因，不代表真实主题、十二目标或整书验收已通过。

没有修改生产／测试、原件、oracle、真实journal或DB，没有操作应用、模型、CUA或其它suite。独立日志及metadata均为exclusive新文件，保留此前RED和作者GREEN。

## 冻结身份与完整差异

| 文件 | 最终SHA-256 |
| --- | --- |
| `desktop/service/novel-import-ai.ts` | `816982eca792a4e3a6c2de0e87e1c646ef2442056456cda68285cd04b79de446` |
| `desktop/main/novel-import.ts` | `05a4d5d59484a4b46e09b3a66317ea1e1c623080673b2a161e8d471272b453a0` |
| `tests/unit/novel-import-request-schema.test.ts` | `29fa63a1a0b9746ebaa0dcc02a6a27e8acbcefd9193daade4880a6c5daf73868` |

执行前及结束前均匹配交付。本轮真实53基线在`/private/tmp/novel-import-knowledge-54-baseline/`，三项SHA分别为service `f5a40da9…90f4f`、main `b869c403…2250c9`、J测试`ae6df2ab…bd9d8`，与53冻结记录一致。

逐项完整diff及内存精确反向比较确认：service只增加IMPORT_RELIABILITIES导入、facts record的superRefine及将该字段接入requestedArtifact；main只增加三个完整静态消息映射，原前缀正则／长度／fallback全部原字节不变。测试只有新增行，没有删除或替换原断言。撤回这些明确增量后，三个完整文件均与上述真实基线逐字节相等，恢复其完整SHA；不是凭空重建历史，也不使用空git diff作证。

详见[knowledge-schema-independent-static-delta.json](evidence/knowledge-schema-independent-static-delta.json)，SHA=`63cb98f2576a430c4679ff1325bd4c5a6c831c334cc715f53eb0fb4730a43ae9`。这里只读源码并变换内存字符串，没有写回源码。

core知识文件保持SHA `30ea421c4c70008ca1b975a16bfc9a83b70ed7dfbab1c9bfc7bac1312ef704ab`；payload仍`4bc384917f7a723375090cec38be180e561bfe7b2b5b3fba8317167a4a2098e6`，generate.ts仍`51612305662fdbc383f01516c2fa5baf83c37e97123391752bdbdf3c9631fe22`，SEM测试仍`96a4d55ada73949086511752ffd2645dcaa990b144be218e0e251a6d3cb1adc8`。

## 生产门控与接受条件

factory原入口继续限制为newsem1普通analyze且非reconcile，并先对白名单目标kind校验。新增facts仍为字符串字典，依序按core相同知识规则判断：非worldline／narrative省略reliability合法；两线省略则拒绝；提供值必须精确属于core四枚举；有效非客观值要求attribution.trim()非空。

superRefine只加issue，不修改facts、删除未知值、补默认客观事实或trim输出。可靠性省略时提前返回，因而普通theme可继续带空白归属；客观事实也不新增归属必需条件。归属及temporalScope的原空白、完整Unicode字符串和其它合法字段保留，合法接受集合与原core条件一致。

issues只使用固定reliability／attribution子路径、固定文字及四个常量，外层附artifact数组索引，不回显raw坏值、ID、原文或动态目录。合法／非法来源混合、错误kind和知识错误同现仍全部拒绝，不以少一条issue授予通过信用。

defaults实际桥、真实generateJSON、生成后的同schema解析、原联合门、core/native/evidence/link及最终授权／取消检查都在完整diff中保持不变。legacy及其它phase／reconcile仍原schema；source-copy零AI分支及controller所有工作流程除失败提示外原字节未变，没有新增AI接点、worker、IO或产品测试hook。scope／plan／语义身份、工作单元和发布逻辑没有变动。

不覆盖nested narrative refs或全部native语法，原core仍是最终门。generateJSON保持最多两次generateText／一次既有纠正，schema仍只本地校验；反馈6项、path100／message250和wrapper预留不变，不新增外层重试或raw遥测。

main.safeError仅在`error instanceof Error`取得message后对三条完整字符串作`===`映射，返回固定安全文案。没有contains／startsWith或正则放宽，没有附原错误。三消息的近似、空白、换行、secret后缀、非Error对象及未知异常不能通过新增分支；原有受控安全错误仍按原规则处理。

## RED与类型适配记录

[实施前行为RED](evidence/knowledge-schema-j01-j02-red.txt)为0/2、fail2、skip0，SHA=`66205a21e746dc13dc45e0a238e1c7a854b5a1447adc645b384acc2457dbb28f`。J01已经调用真实生产桥／generateJSON，但未知reliability未经纠正即被返回；J02隔离调用实际safeError却仍得到generic。这是明确行为反例，不是API缺失或实现后变异。本代理没有切回旧代码重跑制造RED。

[fixture类型记录](evidence/knowledge-schema-typecheck-fixture-red.txt)的3项诊断是合成案例数组被推断为含可选undefined属性的联合类型，不能作为Record<string,string>传参。最终只改为显式Record案例数组类型，运行值和断言不变；该记录是类型适配，不能冒称功能TDD RED。作者最终owned TS诊断0，本代理未另行typecheck，不将作者结果标为独立执行。

## 独立实际验证

仅执行54批准的三个精确命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-J0[12]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[356]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM0[1234]:' tests/unit/novel-import-semantic.test.ts
```

| 范围 | 独立实际结果 | 新日志／SHA-256 |
| --- | --- | --- |
| J01／J02 | exit0，2/2；fail/cancelled/skipped均0；905.515833ms | [knowledge-schema-independent-j01-j02.txt](evidence/knowledge-schema-independent-j01-j02.txt)，`54b242af991ef4e15cd6be58919afdab0b4a8ed7add6eceaa37a7144f68ef2b9` |
| A03／A05／A06 | exit0，3/3；fail/cancelled/skipped均0；165.604875ms | [knowledge-schema-independent-a03-a05-a06.txt](evidence/knowledge-schema-independent-a03-a05-a06.txt)，`525a8bcbe9bdd18c7f68eb7d937374d9a42fdf96f74e1a2397634599162aa3d2` |
| SEM01–04 | exit0，4/4；fail/cancelled/skipped均0；208.619084ms | [knowledge-schema-independent-sem01-04.txt](evidence/knowledge-schema-independent-sem01-04.txt)，`8a4ca3444157c880897150b781cab431b6f072724840bfb73f162b8c19017e1f` |

J01经生产同桥／真实generateJSON，仅注入既有generateText，覆盖未知／空可靠性、缺失／纯空白归属及世界事件／叙事缺可靠性；首坏后好恰2次，两坏恰2次拒绝，首好1次。追加反馈含固定facts路径和四值指导，不含合成秘密、ID、原文或endpoint，字节量在原wrapper预留内。普通theme省略可靠性、客观事实及三个非客观合法值的完整字符串均原样保留，不追加默认或trim。

J02以factory及真实runImportAi受控raw拒绝知识错误，检验kind／source／知识并发错误不通过；普通合法facts穿过最终core仍保持原值，legacy facts schema保持旧接受条件。原native／证据／引用、其它phase／reconcile、重复来源、取消／授权等断言全部保留，A与SEM精准回归继续保护其直接契约。

safeError通过`Object.create(NovelImportController.prototype)`调用实际生产方法，没有constructor／initialize、PDF对象、真实IO依赖或新产品hook；调用前后实例无自有属性。三条精确消息各得固定提示，近似／secret后缀／换行／非Error／null走generic，原受控提示保留。

## C1恢复限制

实际rev83／103只保存通用失败，没有raw或原始异常；仍不能断定知识字段就是原因、猜实际可靠性坏值或排除网络。两旧FAIL保留，72.198秒不推导供应商次数或费用，未知观测项不回填通过。

主代理可组合构建后在同C1正常重新授权原目录，先逐项比对14完整成功artifact、五类coverage、源／工作单元、2723字符正文与`b636…`及检查点身份，再恢复未完成目标。真实主题和其余目标、完整复核、独立文学语义、发布／查表／重开仍需实际完成；本报告的合成GREEN不代替它们。
