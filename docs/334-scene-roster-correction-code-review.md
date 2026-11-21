# 场景清单提示与失败纠错：独立代码审核

结论：**限定范围通过，无阻塞。**332方案及333用例已先由另一审核者通过。本轮只审核新scene roster的prompt和失败后静态诊断，未修改产品或测试，未构建/启动App、调用模型或读取小说、私有模型响应、Key。CodeGraph工具未暴露，依据已定位源码。

## 源码核对

- `desktop/service/novel-import-ai.ts:63`仍先以原`strictObject({roster:sceneRosterRecordsSchema.max(2000)})`解析，再调用原完整`validateSceneRosterRecords`。shape失败直接返回`z.NEVER`，不进入需要合法shape的语义诊断。完整validator成功后仍使用原`sceneRosterEntries`编译公共roster和完整sidecar，canonical/schema/main后置门未改；诊断不决定接受、不补值、不重绑引文、不丢坏项。
- 第78行的shape路径只保留固定字段token和非负安全整数，来源为Zod对当前真实数组的路径；未知键停止并退到已知父路径或根，不转发原Zod message/unknown keys。第95行的语义路径由当前records/mentions/context/links的真实数组索引和固定字段构造。名称/alias覆盖、literal归属与唯一、context每条label包含、link本包非自身索引均只在原门拒绝后解释；quote定位复用原`exactSceneAnchor`，literal规则与原完整门一致。
- 每条说明均为静态字符串，最多6项；message小于原250个UTF-16 code units显示上限，不会借错误值/未知键扩张反馈。原容量门失败而无法进一步分类时仍拒绝，使用固定总指导，不猜测来源坏值。
- `desktop/core/novel-import-ai-payload.ts:64`仅补新roster prompt：唯一JSON对象根、空/非空合成形状例、五个必需字段、name/alias的mention覆盖、每个literal的归属与唯一、每条context原样包含、精确当前unit引文、links索引及完整保留依据。示例明确不是输入资料；显示组合名仍由应用生成。原`IMPORT_KNOWLEDGE_CONTRACT`和完整payload仍拼入。
- serializer、wire schema定义、完整validator、canonical、main、模型/role/thinking、output cap、生成次数及`generateJSON/parseJsonOutput`均未更改。links、ownership、旧scene、其它目标仍走原分支。新增prompt完整进入原UTF-8 fixed reserve；原16KiB JSON wrapper reserve未豁免或扩大。

## 实际验证

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-scene-roster-correction.test.ts tests/unit/novel-import-scene-identity-service.test.ts tests/unit/novel-import-scene-identity-session.test.ts
```

独立实际**77/77、exit0**，日志`/private/tmp/scene-roster-correction-independent.txt`。其中新RC17项已包含在77内，不重复计数。实际桥验证首坏后预置好仅两代，第二次prompt出现安全字段路径/静态说明；成功时完整long quote、Unicode/CRLF、mentions/context/links、canonical sidecar与输入clone保持。持续两代坏输出仍StructuredGenerationError，无删坏行/坏证据；直接own undefined额外键仍严格拒绝。原full validator容量拒绝继续使用安全fallback。

RC03实际检查新prompt与原payload逐值、原strict grammar、原16KiB wrapper常量；fixed UTF-8 reserve边界N可装、N+1拒绝；text/review实际role的完整payload原预算边界可装、超一0 generation拒绝，未提高限额。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test tests/unit/novel-import-request-schema.test.ts tests/unit/novel-import-wizard-prompt.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

旧请求/提示组独立实际**54/54、exit0**，日志`/private/tmp/scene-roster-correction-old-scope-independent.txt`。完整类型检查实际exit0，日志`/private/tmp/scene-roster-correction-independent-typecheck.txt`为空；diff检查实际exit0。不与作者另跑的203或主代理176项相加成新的独立覆盖数。

已只读核对作者原RED日志`/private/tmp/scene-roster-correction-red.txt`：实际15节点、2通过13失败。RC01八个首坏→预置好已正常两代编译完整结果，之后在旧反馈缺根对象例/具体路径或说明处失败；不能说这些成功编译断言未达。RC02直接undefined和原容量拒绝两个正控通过；shape路径和后置坏证据反馈断言失败。RC03先因缺JSON对象示例失败，后续reserve/role预算子用例当时未注册执行；本轮GREEN才实际达到，总节点因这两个子项成为17，不倒填RED预算覆盖。

## 冻结身份与范围

独立执行前后下列三项SHA256一致，核对文件`/private/tmp/scene-roster-correction-independent-before.sha256`：

| 文件 | SHA256 |
| --- | --- |
| desktop/service/novel-import-ai.ts | c96c77bab881bd698bdd2bc237b60389307845e4259d6748700bb75d17bf1872 |
| desktop/core/novel-import-ai-payload.ts | 89456771604d98b9202ac1a3cfa78ca6e9aabea902f0b59fef3ca8042fb4a833 |
| tests/unit/novel-import-scene-roster-correction.test.ts | 502b83e3ae544f2f03944eec81a060f6c03a3336b873d218f50a419d330c2574 |

这些合成结果证明提示/诊断的机械通路及旧门保留，不能保证供应商下一代会纠正。R28历史raw未留，重建首包的当前接口探针不是历史精确失败重放。主代理须用包含本次service/prompt的新私有helper保留旧bundle/hash后进行单包实际复验，再做fresh全文、作者处理、发布与重开；本报告不提前记这些为通过。
