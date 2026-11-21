# 唯一目标类别反馈独立代码审核

日期：2026-10-26。审核者：`remaining_books_oracle`。依据51／52，仅审核冻结的AI service及既有J01／J02增量。

**最终结论：PASS，无本范围必须修订的P1/P2。** 本结论限于代码与下列合成验证，不证明rev57实际坏值、唯一失败原因或真实world恢复质量。

未修改生产／测试、原件、oracle、真实journal或DB；未运行应用、真实模型、CUA或其它suite。独立日志及metadata均为新文件，未覆盖作者RED／GREEN及此前50的证据。

## 冻结身份与差分证据

| 文件 | 最终SHA-256 |
| --- | --- |
| `desktop/service/novel-import-ai.ts` | `f5a40da9ff693a1dd7e06b49d42375e6e509a8c0aa475c52885c223d54b90f4f` |
| `tests/unit/novel-import-request-schema.test.ts` | `ae6df2ab4089965fad4004127d5395ae402da61a33dc48f08f4d48a0d80bd9d8` |

执行前与结束前两项均匹配交付。J测试只在原两个测试内部增加三行反例；内存删除这三行后，全文件精确恢复50冻结SHA `dff93ef7aad8d61b3cddc339f591c8f666303d913e1f59af4fbbb0cfc1a4a644`，原断言没有删除或放宽。

service按现有完整源码核对factory、提前构schema、生成桥及全部后置校验；没有50完整源码快照，因此不声称完成其全文件反向SHA还原，也不把untracked文件的空git diff当作差分证明。保留实际可证明的边界：main仍`b869c4034c9eb86e3cee4f5fee642c5cd25f1b10feeaf7e06549d221672250c9`；payload仍`4bc384917f7a723375090cec38be180e561bfe7b2b5b3fba8317167a4a2098e6`；generate.ts仍`51612305662fdbc383f01516c2fa5baf83c37e97123391752bdbdf3c9631fe22`；SEM测试仍`96a4d55ada73949086511752ffd2645dcaa990b144be218e0e251a6d3cb1adc8`。

元数据见[kind-feedback-independent-static-delta.json](evidence/kind-feedback-independent-static-delta.json)，SHA=`8bd4525028bc3890d682e67b84693deabe56001443ab59871f23f5eb4570743f`。内存变换只用于SHA比较，没有写回生产／测试。

## 生产门控与反馈

service第20–29行仅对`semanticVersion===1`、普通`analyze`且非`reconcile`构造新schema。第23–24行通过IMPORT_TARGETS精确白名单取得kind；缺失、非法、非字符串或错误大小写均固定失败，不将原值插入错误、literal或默认world。第138行在model resolve、预算／prompt和生成之前构造responseSchema；直接调用生成桥时，其schema参数也在generateJSON执行前求值。因此无效请求不会先花一次生成再失败。

第28行kind使用白名单目标literal及固定唯一目标反馈；enum外值与enum内非目标值都获得如`kind必须为本次唯一目标 world`的明确约束。origin使用`inferred` literal。消息只含固定说明与已认可目标；字段路径来自固定属性及数字索引，不回显raw坏值、来源ID、原文或动态ID列表。

sourceUnitIds仍须为字符串数组、至少一项且每项属于本请求units.id。空、外来及合法／非法混合均拒绝；合法重复ID仍原样保留，不去重、不补值、不强转kind、不改text。字段级约束允许kind错误时同时报告来源错误，但未报告某个错误不等于获得该字段通过信用，完整schema与后置校验仍必须全部满足。合法请求的接受集合与50原四项约束一致。

第124–130行defaults仍将生产解析的user/model、原signal与prompt交给同一`generateImportAiJson`；第33–35行仍调用真实generateJSON，生产没有传入测试DI。第149行用入口生成的responseSchema再次解析raw。第160行原联合门完整保留；证据锚定／引用、native／links／父树／锁、阶段权限、notFound、最终授权／模型快照和取消检查继续执行。raw注入绕过生成也不能绕过它们。

legacy、classify／review／patch及reconcile直接返回原schema对象，没有加新目标约束。未改prompt、main、core、分类缓存身份、gateway、预算、scope／plan、工作单元或发布。generateJSON源hash未变，仍本地safeParse、最多两次generateText／一次既有纠正；schema不传给远端response_format，不新增外层重试。原6项反馈、path100／message250与wrapper预留继续适用。

## 实施前RED与独立执行

作者保留的[真实RED](evidence/kind-feedback-tdd-red.txt)为0/2、fail2、skip0，SHA=`771e0d315f2d162cc0538dd4a9286e829b81522d53df703d475db9ad4150e6b6`。J01失败于旧反馈未给唯一world，J02失败于缺省目标实际生成1次而期望0；与本次窄修复对应。没有把API缺失或实现后故障注入冒充此处行为RED。本代理只读取该记录，未切回旧代码重跑或制造历史。

仅实际执行51批准的三条精确命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-J0[12]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[356]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM0[1234]:' tests/unit/novel-import-semantic.test.ts
```

| 范围 | 独立实际结果 | 新原始日志／SHA-256 |
| --- | --- | --- |
| J01／J02 | exit0，2/2；fail/cancelled/skipped均0；719.379ms | [kind-feedback-independent-j01-j02.txt](evidence/kind-feedback-independent-j01-j02.txt)，`e0432950c8b035e7da7f79de935838a6259a0e0034ddf894c64f458ff2df85a2` |
| A03／A05／A06 | exit0，3/3；fail/cancelled/skipped均0；154.497917ms | [kind-feedback-independent-a03-a05-a06.txt](evidence/kind-feedback-independent-a03-a05-a06.txt)，`f9a32fe52a9d8e38fa4761649c71ae218f67fb305aaa67d284203777aef8dd04` |
| SEM01–04 | exit0，4/4；fail/cancelled/skipped均0；197.406209ms | [kind-feedback-independent-sem01-04.txt](evidence/kind-feedback-independent-sem01-04.txt)，`a1f9ad50fffc878d5b612782ee658acfb5f2ca9064c82b2a3e99bda245d9588f` |

J01经生产同桥／真实generateJSON，仅以其既有generateText DI返回合成文本。world请求分别以enum外秘密kind、enum内非目标scene为首坏，反馈都包含唯一world及准确kind路径；origin枚举外值反馈inferred。并发坏kind／混合来源同时显示两条约束，后追加反馈不含坏值、ID、source或endpoint，字节量在原wrapper预留内。首坏后好恰2次、两次仍坏恰2次拒绝、首好1次；没有以单测自己构造的另一条生成路径替代生产接线。

J02检验缺失及五类非法request.kind在runImportAi中0 resolve／0 generate，桥中0 generateText，固定错误且输入不变。factory及受控raw同样拒绝并发错误；中性WORLD可保留空text，不擅自补文。旧混合／重复ID、native／坏quote／错误parent晚门、legacy／其它phase、早晚取消、最终授权撤销及模型revision保护均保留。A和SEM命令继续直接保护原证据恢复、阶段权限及native内容。

本代理未另行typecheck或构建；作者owned TS诊断0只作为作者证据，不冒称独立执行。没有扩大为其它suite或实际供应商调用。

## 真实恢复边界

rev57仅有字段路径错误，没有失败raw；仍不能猜实际返回WORLD／SETTING等值或认定唯一原因。原FAIL及不可覆盖检查点保留。本次合成GREEN不将实际内部纠正次数／tokens／cost从未知改为通过。

主代理可在组合构建后于同C1正常重新授权原目录，从world恢复；恢复前后应逐项核对12个成功artifact完整对象、四类coverage、2723字符正文／`b636…`及源hash不变。真实world结果、其它目标、完整复核、独立文学语义、发布／查表／重开仍需另行实际验收，本报告不宣布这些已完成。
