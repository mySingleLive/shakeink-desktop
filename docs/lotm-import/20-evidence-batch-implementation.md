# 证据失败安全小批次治愈实施

日期：2026-10-27。实施范围遵循17/18：仅 `desktop/service/novel-import-ai.ts`、`desktop/main/novel-import.ts` 和新定向测试 `tests/unit/novel-import-evidence-batches.test.ts`。保留已有卷结构修复，不改生成器、原证据匹配规则、模型、冻结预算、工作单元几何或旧审计器。以下是合成协议/控制器验证，不是本书实际模型导入结果。

## 改动

服务侧在当前普通语义analyze请求的本地Zod schema上增加公开preprocess/check观察：每次解析先清空状态，末尾只读观察完整issues，不修改value或issues。仅全部是custom、完整四段安全数组索引evidence路径、且message精确为本地四个锚定反馈时分类。类型abort使末尾check不执行，混合/未知/多于前6项的其它错误不能借此前状态；每次生成也清空状态。取消、非invalid_schema和其它阶段不消费该分类。

纯证据最终失败保留原 `StructuredGenerationError` 实例、kind、invalidFields及feedback，仅把message设为四种既有固定锚定错误文本。这样旧调用者的安全诊断类型/字段仍可用，而仅传message的真实RpcPeer可将固定原因交给main。其它错误不进入新转换分支；原有角色字段友好诊断逻辑保持原行为。

main只对四种固定message逐字全等识别。普通语义目标分析失败时按原单元顺序二分；每个子包从当前已提交session重新构造artifacts/entities/locks，仍经stageRequests完整预算封包、this.ai的来源/模型/epoch/阶段门及全部结果校验。每个成功叶包单独原子checkpoint，才累计该包确实处理的IDs；失败父包不获得coverage。冲突立即停止兄弟包。暂停/取消、授权变化、非白名单错误和单单元失败均终止。

本次目标执行内的RAM cap单调缩小，仅约束送入stageRequests的单元数组切片。它不改profile.maxUnits、字符预算、授权scope/plan或来源对象，也不写入持久化预算。每包继续携带完整原冻结executionBudget。恢复重开可丢弃RAM cap，但依已有coverage只处理未完成ID。legacy、classify、review、reconcile不进入新helper。

## 实际RED与兼容修订

初始未实现版执行新E用例，真实exit1：19项、7通过、12失败。E01实际generateImportAiJson→generateJSON两轮后只得到原结构错误；E02没有二分；E03没有左包检查点；单单元终止/暂停子包窗口因尚无拆包而失败。

首轮实现后25项中21通过，4失败归于三项测试夹具误假设：开始前workingProse本来为空；旧会话必须semanticVersion缺省，不能把小窗口预算当legacy；未完成classify的coverage键可以缺省。修正夹具，不改产品验收标准，25/25通过。再补完整issues混合、取消/不完整生成、合法合并冲突、授权变化及迟到右包关键边界，新E用例全部通过。

直接必要回归实际暴露旧J03/J10的错误类型兼容问题：25项中18通过、7失败。经主代理明确授权，采用上述保留原StructuredGenerationError实例、仅改固定message的最小修订，未改旧测试或生成器。兼容RED及所有中间失败日志均保留，没有抹除。

另补真实作者决定进入reconcile的排除回退用例时，最初合成review返回未随该包发送的artifact引用，现有门正确拒绝“冲突实体引用无效”。夹具改为只在确有该资料的合法review包提出冲突；同一个多单元reconcile固定证据错误只执行一次，不拆分。此失败属于夹具错误，不是放宽生产引用门。

## 最终验证

最终定向命令（Node24）同时运行E01–06与直接相关的既有取消/阶段合同/精确证据/角色字段/完整反馈/修订冲突回归：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^(?:LOTM-E0[1-6]:|NI-(?:A0[456]:|J0[39]:|J10:|R02:))' tests/unit/novel-import-evidence-batches.test.ts tests/unit/novel-import-ai.test.ts tests/unit/novel-import-request-schema.test.ts tests/unit/novel-import-semantic-session.test.ts
```

实际最终结果：**exit0，63项、63通过、0失败/取消/跳过，duration 4813.450875ms**。其中新E范围30项，直接必要既有回归33项。结果与脱敏日志指纹见 `evidence/evidence-batch-history.json`，原始合成日志留隔离目录。未运行全仓测试。

静态检查采用现有tsconfig与指定生产/测试root，并加入仓库现有 `desktop/shared/word-extractor.d.ts` 声明。最初自定义root漏掉该声明造成TS7016（`novel-import-files.ts:9`），属于检查调用配置，不称作产品既有错误；未修改声明。补齐后生产和依赖均0诊断。

## 交付指纹与边界

| 文件 | SHA-256 |
|---|---|
| `desktop/service/novel-import-ai.ts` | `7229da8f8841317ba46d393914943aacbf1f99ad93449cf84501ecd8f3bd169e` |
| `desktop/main/novel-import.ts` | `e4c25bcdf16ac4475ca8259961a1904a7318a31e99946798f68182064fff6c67` |
| `tests/unit/novel-import-evidence-batches.test.ts` | `050bd155647cb810fa516a8e917e829b803de0e31f4c96c9c3ecca5b66b9d05b` |

两生产文件已冻结交主代理安排独立代码审核。未操作真实应用、模型、journal、数据库或小说原件；没有更新旧run或把合成GREEN计为本书九项终验。实际B1需在独审与重建后，由主代理正常重开、重新授权并用同一完整来源复测；缩小请求不保证模型一定成功，单单元仍失败必须保留失败。
