# 请求约束前置独立代码审核

日期：2026-10-26。审核者：`remaining_books_oracle`。依据48／49，独审AI service、新request-schema测试及主代理另外批准的SEM04 classify断言适配。**最终结论：PASS，无本范围必须修订的P1/P2。** 只认证代码及指定合成验证，不证明rev32实际坏字段、唯一原因或真实C1恢复成功。

没有修改生产／测试、原件、oracle、真实journal或DB，没有运行应用、真实模型、CUA或其它suite。独立原始日志与metadata均exclusive新建，保留实施者的初RED、行为RED及旧测试滞后记录。

## 冻结身份与差分边界

| 文件 | 最终SHA-256 |
| --- | --- |
| `desktop/service/novel-import-ai.ts` | `3329c8c51d5a017c7eef184e1ab5c0b3d34d1fe5ad4f326359d4da94d8d1dc05` |
| `tests/unit/novel-import-request-schema.test.ts` | `dff93ef7aad8d61b3cddc339f591c8f666303d913e1f59af4fbbb0cfc1a4a644` |
| `tests/unit/novel-import-semantic.test.ts` | `96a4d55ada73949086511752ffd2645dcaa990b144be218e0e251a6d3cb1adc8` |

三项在执行前及结束前均与交付匹配。内存反向差分撤回新增两个type import、factory／bridge、defaults接线及后解析接点后，service完整文件精确恢复为C1原SHA `803de671b3a9ec5e764d8b9bcabe081835750984acd862597fb5d87718e02599`。撤回SEM04唯一classify条件分支后，整个旧测试精确恢复为37冻结SHA `d822a3eed0f3ca1698d7326ffd70370269786fab0a95412a32e3efd3eee2787c`；其它stage原断言及文件所有其它字节未变。没有把untracked文件的空git diff当无改动证明。

静态证据见 [request-schema-independent-static-delta.json](evidence/request-schema-independent-static-delta.json)，SHA=`e6d9cf43f2a3047c8a7817bb2fa9e2032ef58de0448657830abca8ad815404ed`。该核对只读取／变换内存字符串和计算SHA，没有执行或写回生产源码。main仍为47的`b869c403…2250c9`、payload仍`4bc38491…2098e6`、generate.ts仍`51612305662fdbc383f01516c2fa5baf83c37e97123391752bdbdf3c9631fe22`。

## 生产约束与真实接线

service第20–29行factory仅在semanticVersion=1、普通analyze且非reconcile时加superRefine，其余直接返回原schema对象。约束与原联合晚门同义：kind匹配request.kind、origin为inferred、sourceUnitIds非空且每项属于本次request.units.id。合法／非法ID混合数组也拒绝；重复合法ID不新增去重或修复。不补字段、不改类型／来源／原文，未改source-copy既有资料。

新增issue只用artifact数字索引及固定kind/origin/sourceUnitIds字段路径，消息为固定文字，不附实际坏值、动态ID enum或原始响应。它不承诺native结构、证据、引用或文学语义正确；这些仍由原晚门检查。factory生成的Set来自本次输入，不扩大到其它批／全局实体来源。

第127–130行defaults实际把服务器解析的user/model、原signal及prompt传入同一 `generateImportAiJson`。第33–35行桥动态导入真实generateJSON，把factory schema作为本地选项，仅透传其既有generateText DI；生产调用不提供DI。它不新增IPC／网络／renderer指定schema入口，不改变当前模型解析／授权。

第148行runImportAi对生成后raw再次使用相同factory。原联合门现第159行完整保留，其后的anchorEvidence／validateImportEvidence、native／links／锁、阶段权限、notFound、最终模型快照／授权及取消检查也保持原字节。注入raw绕过生成仍不可绕过这些门。

generateJSON原实现不变：schema只本地safeParse，最多两次generateText／至多一次既有结构纠正，原配额／abort／用量路径不变；不新增外层retry或动态prompt来源列表。反馈仍最多6项、path100／message250及wrapper预算上限。本次只将四类既有请求契约错误纳入纠正机会，不能据此声称供应商内部调用次数或账单已核验。

## TDD与旧测试契约滞后

- [初始RED](evidence/request-schema-tdd-initial-red.txt)：0/2，因生产桥／factory出口尚未实现，SHA=`79c9924933843228578c99b1e8fef1da946c6d484bf6b0b0407997531bd9517f`。它证明接口缺口，不冒称已检验纠正行为。
- [桥接静态base行为RED](evidence/request-schema-bridge-base-tdd-red.txt)：0/2，已进入真实generateJSON／受控generateText，但wrong-kind第一次就返回world而非scene，factory仍接受坏kind，SHA=`a4482a3b6e0d1125479dd8b47e7d6c3f444bedf42476527e1aa4fb5e127af7f1`。这是前置约束实施前的行为反例，不是仅API缺失或实现后变异。
- [SEM适配前记录](evidence/request-schema-sem01-04-pre-adaptation-red.txt)：3/4，SEM04旧helper无条件要求classify也带roleType／PLACE／WORLD／SETTING，与45／47已批准独立来源分类契约相冲突。主代理明确授权仅该classify分支改验来源用途／unknown／无native及中性副本；其它阶段两条原断言逐字保留，生产不为迁就旧测试而倒退。

本代理读取上述原始历史，没有重跑旧缺陷代码或改源码制造RED。新J测试从准备阶段到最终冻结SHA不变；SEM适配的唯一范围由反向全文件SHA进一步核实。

## 独立实际验证

只执行49三个精确命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-J0[12]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[356]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM0[1234]:' tests/unit/novel-import-semantic.test.ts
```

| 范围 | 实际结果 | 独立原始日志／SHA-256 |
| --- | --- | --- |
| J01／J02 | exit0，2/2，fail/cancelled/skipped均0，670.019791ms | [request-schema-independent-j01-j02.txt](evidence/request-schema-independent-j01-j02.txt)，`88d00b1060c9d3746866cd459d387a3a624b244b21aa071d89f9db91c4a17b69` |
| A03／A05／A06 | exit0，3/3，fail/cancelled/skipped均0，204.406583ms | [request-schema-independent-a03-a05-a06.txt](evidence/request-schema-independent-a03-a05-a06.txt)，`4ecf80f3fcaf5386794149e3ea587d32b914e8a516ec172b40c06d36baa43f35` |
| SEM01–04 | exit0，4/4，fail/cancelled/skipped均0，232.527209ms | [request-schema-independent-sem01-04.txt](evidence/request-schema-independent-sem01-04.txt)，`28d8f8e03e5c6a5b8183a03d09451a325701b49542c2bb5e2078630953514438` |

J01动态运行生产同一桥／真实generateJSON，用既有generateText DI控制合成文本；另以AST检查defaults终端实际调用该桥和schema接点，避免单独手造factory→generateJSON路径。kind／origin／空IDs／外来IDs／混合IDs分别验证首坏后好恰2次、两次仍坏拒绝，首好1次；纠正反馈有固定字段路径但不含合成秘密、坏值、unit/entity ID、正文或endpoint。schema未传给generateText或远端response_format，signal、user/model角色及原prompt保留，追加字节在既有wrapper预留内。

J02经真实runImportAi受控raw验证四类拒绝、重复合法IDs原样保留，native／错误quote／外来parent通过前置schema后仍被原晚门拒绝；legacy及其它阶段返回原schema对象，原接受／拒绝行为不变。初始／迟到取消、最终授权撤销和模型revision变化仍拒绝，输入与既有artifacts不变。A06继续保护唯一版式证据恢复，SEM01–04继续保护各类native内容和阶段权限。

本代理没有另行typecheck或其它suite；实施者3 owned TS诊断0仅作为作者证据，不冒称独立执行。所有合成次数只说明本地纠正边界，不代表真实供应商次数。

## C1真实恢复边界

可以由主代理组合构建后，在同C1现有UI重新授权原目标并只补未完成阶段；恢复时必须逐项比较rev32已有大纲／三角色完整对象与覆盖、2723字符正文／hash及源hash不变。原rev32失败及具体坏字段未知状态继续保留，不新取raw响应／遥测来回填原因，不把前置schema通过当四项已有产物的文学语义通过。

真实场景重试、十二目标／完整复核、独立语义、发布／查表及正常重开仍需另行验收；本报告不宣布这些已完成。
