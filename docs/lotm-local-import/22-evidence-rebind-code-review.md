# 证据唯一逐字改挂实现（20/21）独立代码复核

日期：2026-10-29。对象：`desktop/service/novel-import-ai.ts`的`rebindEvidence`、schema早期检查和`runImportAi`晚期接纳，以及RB测试。已执行`tests/unit/novel-import-evidence-rebind.test.ts`（7/7通过）和`tests/unit/novel-import-anchor-diagnostics.test.ts`（59/59通过）。semantic-session中的RB08、RB15只做了阅读，未运行。全量测试未运行。

## 结论：有条件接受

判定函数与冻结规则一致，早期和晚期共用同一谓词，适用范围没有外溢。有一处晚期行为超出“规则变更仅此一条”，需修正或在方案中写明并配用例。另有几处用例缺口，不阻断。

## 阻断项

B1. 晚期分支对未改挂的证据也去重，并扩展`sourceUnitIds`（`novel-import-ai.ts:339-340`）。
- 第339行对整条evidence数组按`unitId+quote`去重。第340行把所有evidence的unitId追加进`sourceUnitIds`，不只追加被改挂的单元。
- 方案第13行和冻结补充第50、52行只允许“追加改挂单元”，以及“改挂后”出现的重复条目去重。
- 复现（合成，已运行）：请求单元为a、b；artifact的`sourceUnitIds=['a']`，`evidence=[{a,A全文},{b,'甲乙丙丁戊己庚辛'},{b,同上}]`，三条在声明单元内都逐字命中，没有任何改挂。改前结果：sourceUnitIds为`['a']`，3条证据。改后：sourceUnitIds为`['a','b']`，2条证据。
- 影响：模型本来配对正确的普通结果也被改写了。改写的是`sourceUnitIds`（review分片过滤用，见`core/novel-import-review-tasks.ts:27`）和evidence数组，后者又进入`importArtifactSemanticHash`。现有下游校验都能通过（控制器`main/novel-import.ts:611`本身也用同样的并集和去重口径），所以风险低。但这是未经审核的第二条行为变更。
- 要求二选一：
  - 收窄实现：只对`rebindEvidence`返回的unitId与原unitId不同的条目追加，去重也只在出现改挂时执行。
  - 或在20号方案中明确“普通分析一律把证据单元并入sourceUnitIds，并做精确去重”，再补一条无改挂的用例锁定该行为。

## 已核对、无阻断

1. 谓词：`rebindEvidence`（`:286-298`）先调用`anchorEvidence([entry])`。只有原因恰为`no-match`、非空白字符≥8、在其它单元中逐字出现、`indexOf(q,p+1)`计入重叠且合计恰好1次时，才返回`{unitId:owner,quote}`，quote原样保留。
   - 不做排版恢复、跨边界拼接或模糊匹配。
   - `unknown-unit`、`too-short`、`ambiguous`照原样抛出。
   - 声明单元内可经排版恢复唯一定位的，由anchorEvidence先行成功，不会移走（RB10）。
2. 计数和提前停止：for条件`matches<2`加外层`if(matches>1)break`。第二次命中时（同一单元重叠，或另一单元）owner会被覆盖，但`matches===2`仍抛出原错误。`owner`只在matches≥1时赋值，所以`!owner`的判断是冗余保险。
3. 空quote与短quote：空quote先被schema的`min(1)`拦下；即便放过，anchorEvidence也会给出too-short。`[...quote]`配合`\s`统计非空白字符，与`evidenceLayout`的口径等价（排版空白折成的`' '`同样被过滤）。能走到no-match的quote必然≥8，这一检查只是双保险。
4. 范围：
   - schema：structure、classify在`:119-126`提前返回，legacy、review、reconcile在`:127`返回base，requestedEvidence只挂在普通analyze的artifacts上。
   - 晚期：artifacts循环第一行（`:336`）对`phase!=='analyze'`直接抛错，所以`semanticVersion===1&&intent!=='reconcile'`实际只覆盖普通analyze。structure属于classify，不进这个循环。
   - artifactEdits、missingTargets、conflicts仍用anchorEvidence（`:352`等）。
5. 早晚一致：`runImportAi`的最终`safeParse`用同一个`importAiResponseSchema`，和晚期接纳调用的是同一函数，B1（21号）已经解决。
6. 不修改输入：`rebindEvidence`返回新对象，晚期只对`parsed.data`赋新数组，request和units都不被写。
   - zod的object解析会产出新对象。测试中假的`generate`直接返回raw，所以`run()`里对raw和request的序列化断言有意义：如果zod不复制，raw会被第339、340行改写，断言就会失败。
7. 诊断与归因：可改挂的条目不产生issue，`evidenceReason`和diagnosticCandidate只来自剩余的真实失败。no-match条目的otherUnitUnique在结构上恒为0，与冻结补充第53行一致。DIAG02的one-position族改为unknown-unit构造，期望值不变，改动正确。

## 非阻断（用例缺口）

1. RB16的标题写着“reconcile do not”，但没有reconcile用例。RB07要求的review、classify，以及semantic v1下missingTargets、artifactEdits的同类错配也都没有用例。建议至少补semantic v1 missingTargets和reconcile各一例。
2. RB11没有断言诊断`noMatch=1`（方案21要求）。
3. RB14的8字符用例不含空白，与21号的描述（quote含空白、在B逐字出现、恰8个非空白字符）不符。7字符用例的too-short实际来自声明单元的anchorEvidence，并未验证rebind本身。不过结构上rebind不可能拿到<8的no-match，风险很低。
4. 声明单元为ambiguous、同时在B中逐字唯一的情形没有用例，预期保持ambiguous。
5. RB17只靠`run()`的finally断言覆盖“不修改”，没有覆盖“合并后`assertImportSemanticLocks`通过”。RB08、RB15通过控制器完成，间接证明了这一点。
6. RB08没有直接断言coverage记录了整批；它以phase为completed、analyze只调用1次作为间接证据。RB15只断言sourceUnitIds包含两个单元，没有锁定顺序。
