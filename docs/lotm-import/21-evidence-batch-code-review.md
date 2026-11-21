# 证据失败小包治愈独立代码审核

日期：2026-10-27（Asia/Shanghai）。审核者：独立子代理 `lotm_test_review`。范围：17/18批准的完整证据错误识别、普通语义分析小包执行策略、E01–06及直接证据/恢复回归。未修改生产，未操作UI、真实模型或运行中数据库。

## 结论

**最终两文件冻结版本的代码及定向验证通过，未发现剩余阻断项。** 完整issues观察不依赖截断诊断，原错误类型兼容保留，RPC消息严格匹配，完整单位分包、原预算和逐包提交/恢复门保持。此结论不保证真实模型在小包下必定成功，也不证明上下文长度就是原失败原因；原始B1失败和正式全文/八类语义验收继续保留。

生产指纹在独立命令前后相同：

| 文件 | SHA-256 |
|---|---|
| desktop/service/novel-import-ai.ts | `7229da8f8841317ba46d393914943aacbf1f99ad93449cf84501ecd8f3bd169e` |
| desktop/main/novel-import.ts | `e4c25bcdf16ac4475ca8259961a1904a7318a31e99946798f68182064fff6c67` |

## 静态链路核对

- **完整schema错误的归属。** generateImportAiJson只在semanticVersion1普通analyze使用局部preprocess/check；preprocess每次实际schema解析清空reason，generateText包装每轮生成前再清空。最后check只观察已有完整issues，不改value、不增删issue。只有全部为custom、四段完整artifacts/数字安全索引/evidence/数字安全索引路径，且message逐字匹配本地四种证据反馈时设reason；结构abort跳过check时仍为undefined，混合或未知问题不设reason。外层还要求最终错误确为当前StructuredGenerationError(invalid_schema)且未取消，JSON语法/incomplete/网络等不会消费前轮reason。
- **兼容与脱敏。** 完整纯证据错误只替换原StructuredGenerationError实例的message，保留kind、invalidFields、feedback及其原安全路径；混合/未知未进新分支，原角色友好字段分支保留。generateJSON内部的两轮及纠错prompt未改，引文匹配/排版恢复、原文、预算和费用路径未放宽。RPC实际仅传message，main四种固定文本使用全等比较，不靠class/属性或contains；未知reason、追加字符不识别。
- **普通分析范围。** 新helper仅由semanticWorkflow的普通按目标分析调用；legacy workflow、classify、review、patch及reconcile/遗漏修订仍走既有路径。普通analyze越权conflicts在this.ai/服务阶段合同拒绝，不作为可采用的结果。合法artifact合并产生的未决冲突提交后立即停止，不进入兄弟、下一目标、review或publish。
- **有限完整单位分包。** 失败请求至少2单元且固定证据错误才按原顺序二分；子包来自该确切request.units切片，不改单位内容/字段/ID/位置。单单元失败原样停止。cap只属于当前helper执行，在失败后单调缩小，既不进入session/coverage/scope/plan，也不修改冻结ImportExecutionBudget；每轮只对待处理数组slice后送入stageRequests。
- **新鲜上下文与完整预算。** 每次只取当前stageRequests的下一包，成功提交后重新构造下一包的artifacts/entities/locks及章信息；this.ai再次验证当前epoch、来源、模型/授权、原冻结预算、payload及固定提示词预留。右包不会复用父包已过时的实体目录。预算或授权错误不转为证据回退。
- **逐叶原子采用与恢复。** 结果先通过来源ID、证据、语义/native/锁等完整校验，然后artifact合并、冲突及该包unit-ID coverage同一checkpoint提交；父失败不计覆盖，右侧失败保留左成功。递归捕获前先检查当前epoch；暂停后迟到结果不能写入或继续发送。重开按已持久化coverage筛未完成ID，仍需重新核对模型/目录并同意；RAM cap丢失不会把已成功ID重发。

## 独立执行

最终命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^(LOTM-E0[1-6]:|NI-J03:|NI-J10:|NI-R02:)' tests/unit/novel-import-evidence-batches.test.ts tests/unit/novel-import-request-schema.test.ts tests/unit/novel-import-semantic-session.test.ts
```

实际exit0，**tests50/pass50/fail0/cancelled0/skipped0**，duration2224.197ms。日志：`evidence/evidence-batches-independent-final-review.txt`。新E文件 SHA-256 `2dd0ca28dbb40bb858fde9e7f60c343ab218b061fefc9f05522e65bba9a74b80`。

覆盖了四种reason、超过6条完整issues、混合类型/未知根字段/其它custom拒绝、第二轮JSON与incomplete及取消不借旧状态、实际RpcPeer往返、完整单位/原预算/新鲜实体上下文、不回扩、左成功右失败后的保存/重开/新同意不重发、单单元终止、认证/非证据错误不拆、合法merge冲突停止、阶段越权拒绝、模型授权变化、暂停和迟到结果，以及legacy/review/classify保持原路径。旧J03/J10同时证明原StructuredGenerationError类型和固定纠错/精确锚定合同兼容；R02验证修订策略迁移、未决遗漏冲突、已有复核credit与重开边界。

此前本代理在首个service版本独立执行新E文件29/29通过，日志 `evidence/evidence-batches-independent-code-review.txt` 保留；随后作者的精准旧回归发现更换错误类型不兼容，最终按批准方式修复后才执行上面的50项复验。不得把前一日志当作最终兼容通过，也不能累加为不同业务验收数量。

组件输入均为合成文本和隔离临时controller文件，无供应商调用。本代理未运行全仓或真实整书；20实施说明初稿尚待落盘，说明性内容另核对。正式B1/B2重建后须追加实际构建身份、通过真实UI重新授权再继续同一完整1394章，不复用旧进程授权或替换成测试响应。

## 追加核对20及reconcile负例

已读取 `20-evidence-batch-implementation.md`，核对其最终service/main指纹与本报告一致，实施说明区分了夹具修正、错误类型兼容修复和真实全文待验；作者63项组合与本代理50项命令范围不同，不能累加为业务数量。

作者随后仅追加多单元reconcile负例，生产文件未再变化，新E文件SHA为 `050bd155647cb810fa516a8e917e829b803de0e31f4c96c9c3ecca5b66b9d05b`。本代理额外独立执行 `node --import tsx --test --test-name-pattern='^LOTM-E06:' tests/unit/novel-import-evidence-batches.test.ts`，exit0，含四个子场景的5/5通过；日志 `evidence/evidence-batches-independent-reconcile-followup.txt`。该reconcile经过真实合成作者决定，失败请求确有多个单元，实际只发一次且不出版，补充证明排除回退；不与上面重叠执行简单累加。最终代码审核结论保持通过。
