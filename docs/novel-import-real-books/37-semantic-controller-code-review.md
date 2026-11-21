# SEM控制器独立代码审核

日期：2026-10-26。审核者：独立子代理 `unified_picker_review`。依据21/24及33，静态读取本轮 `desktop/shared/novel-import.ts`、`desktop/core/novel-import.ts`、`desktop/main/novel-import.ts`、新 `desktop/core/novel-import-semantic-state.ts` 和两个semantic unit文件；对照已审核的实际AI adapter与预算/章节/PDF接点。未修改生产代码、测试或真实数据。

## 当前阶段

**最终结论：PASS，仅限本文最终冻结实现的SEM控制器/共享纯合同与批准定向验证。** 初审四项P1及两项相关边界均已闭环；最终资源门/raw结构门增量已静态核对，独立30/30定向用例通过、0跳过，执行前后11个SHA全部匹配。下文保留初审历史，最终证据见末节；不代表38发布实表、真实模型/整书语义、原生应用或跨平台验收通过。

## SC-CR01 · P1 · 关联闭包漏掉跨单元单向引用

初审 `NovelImportController.semanticRelated` 只把“其引用指向已入集合的产物”加入集合，不把已入种子自身引用的目标加入。决定角色A，A.relationships.characterId指向另一证据unit中的C，C没有反向引用且不共享证据时，C不会被修订。people/narrator允许唯一角色姓名，但该函数直接以姓名对比artifact ID，也会漏掉这类合法关联。

原SEM06各主要实体共享同unit，不能覆盖此缺口。已要求在原SEM06内增加跨unit的单向关系、唯一姓名people/narrator和不关联对象，按已知typed ID优先、角色唯一姓名解析建立双向引用与共享证据闭包；不做正文名字搜索或无差别全目标重抽。实现owner已确认处理，等待最终SHA/结果。

## SC-CR02 · P1 · 决定应用后排队失败留下部分内存状态

初审 `semanticDecision` 先改artifacts、conflict.status、decisions与semanticState，随后才调用 `semanticRepairs`；后者的授权/预算/证据检查可抛错。初始化恢复明确撤销analysisGrant，因此“重开→重新授权原目录→直接resolve”可在executionBudget拒绝前已经应用字段/决定/锁。act的该异常路径不会rollback，后续操作可观察或持久化这个部分状态。

body-only解释分支也先记录决定再排队，属于同类问题。建议在克隆的会话上完成决定与全部排队校验，再一次提交；或等效地在改原对象前完成所有可能失败的前检。沿SEM07/08验证：缺新授权的决定失败时，字段/决定/锁/覆盖不变且零AI；授权后同一合法决定可正常执行。

## SC-CR03 · P1 · 修订工作项笛卡尔积缺少构造前上限

初审 `semanticRepairs` 用 `ranges.flatMap(piece=>batches.map(...))` 同步物化完整“产物文字片×证据批次”工作项，没有乘积/累计任务数前检。来源允许2500万字符，派生累计允许5000万字符；在legacy B=5000时，合法上界可形成数万文字片及上万证据批次，先分配上亿任务，才可能走到1GiB journal编码检查。主进程可能先耗尽内存/同步阻塞，暂停动作无法及时进入。

应在构造前按安全整数乘积、既有累计任务数及保守工作量上限明确拒绝并保留草稿，不得截断/跳过任务或提高网络预算。可在SEM08原编号内验证小范围的计数边界/前检，避免测试实际分配巨量数组。该项只针对新增修订队列，不要求扩大旧业务或运行长书/全suite。

## SC-CR04 · P1 · 作者锁在真实adapter的包/分片边界不可达

初审主进程与33已通过的adapter契约不一致：

- 普通请求把semanticState.locks全集写进semanticLocks，但当前request.artifacts通常只有部分context/reviewFacts分片。adapter逐锁要求目标artifact在本包且值一致；另一artifact的包会在调用模型前被拒。
- reconcile把全文text锁原值放入reconcile.locks，实际artifact.text却是当前片段；adapter的text值相等检查必失败。较长的锁还可能提前耗尽2B预算。普通reviewFacts含同ID片段时也有同样问题。

现session夹具的options.ai只检查预算后注入返回值，不进入真实runImportAi，因此普通字段锁的绿测不能覆盖这两个接线缺口。须按当前包/片段安全投影transport锁，并用合成provider注入的真实adapter验证长text作者决定及包外锁情形；不能放宽adapter的本包校验。

**调整传输锁时仍需保留完整服务器锁门。** reconcile最终apply已有state全量锁检查；普通/遗漏analyze在完整合并产物上也须校验全量锁再记信用。否则过滤包外锁后，另包返回同ID产物可能经merge把作者明确锁定的空字段填成新值（previous为空时不会生成冲突）。不能以修复可达性为由让作者锁失效。

## 另外反馈的边界（不擅自定为最终阻断）

- `importNativeMappings` 先完成坏引用drop闭包，随后才移除source父环；source环A↔B下的source后代C可能仍留projectable，最终全引用校验因缺父失败。主代理可按批准合同选择对显式非法typed结构清晰拒绝，或让已采用的raw/warning退化继续传播；若做后者应覆盖SEM09的全source环与后代。不能把未知原资料伪装为native实体。
- requestSnapshot直接从raw facts复制typed元数据；某source因坏native内容/父引用已退为未映射，仍可能被送成WORLD/SETTING目录项。后续主进程完整mapping仍会拒绝坏引用，当前是fail-closed的可达性/上下文问题；若收敛，应只给真正projectable native节点投影typed字段，不扩大目录协议。

## 已静态确认的其余约束

- 仅新choose创建semanticVersion:1，initialize不升级legacy；未知语义版本/不匹配checkpoint有明确拒绝路径。legacy工作流仍独立，scope/plan只在新版本存在时纳入语义项；章节检测与手动cuts也按版本分派。
- PDF来源完整ledger/proof、原页决定、发送前后verify和发布前check保持；未见本增量去掉25/27门控。预算profile、已完成classification/analysis checkpoint、原workingUnits与B/2B/3B/fixed reserve仍保留原入口。
- AI前后核对来源、模型授权和epoch，checkpoint前再次current；修订提案按任务暂存，聚合完整artifact差量及全部引用/锁验证后才提交，不把片段成功当半个artifact的native完成。
- 变更后review/reviewFacts信用清空，原全文和全部facts的确定性分片复核仍在；missingTargets限定所选目标与真实来源/精确证据，成功任务耐久保存。
- 新addConflicts会将resolved的同hash冲突重开pending，不再由历史决定静默消音；普通retry/reopen保持两轮状态，新作者决定/批准正文版本才是新输入。最终须用冻结测试核对持续冲突、两轮上限和零迟到信用。

## 最终验证待办

等待主代理/owner冻结SHA后，仅执行批准的SEM01–10两个semantic unit文件、CH01–03、旧D01/A03的锚定名称/明确文件命令。P01–03由另一审核者处理，不在本报告代签；没有扩全suite、真实模型/数据库或应用验证权限。进行中的绿色日志和本次静态观察均不替代最终冻结版本的独立验证。

## 最终冻结复审与问题关闭

初次冻结曾因38提出SP-CR04知识限定预分配问题撤回，本审核当时尚未启动测试，没有把旧版本结果当最终绿灯。本节依据 `semantic-implementation-evidence.md` 最后一次11文件清单：主进程/原core/shared/service/payload未在末次增量变化，semantics/state及原测试的最终SHA已重新核对；作者明确停止写生产/测试。

| 初审项 | 最终源码与独立验证的关闭依据 |
| --- | --- |
| SC-CR01 关联范围 | semanticRelated从完整已验证mapping建立typed双向边，ID优先、允许的角色唯一姓名单独解析，并扩展共享真实证据。SEM06跨五个独立unit覆盖A单向关系、people/narrator姓名、关联两线；无关C未修订，正文不变 |
| SC-CR02 决定原子性 | 先检查新授权/模型身份，在完整session clone上核对冲突/baseHash/field/evidence、应用决定/锁及排队，成功后才Object.assign提交原owner。SEM07重开撤销grant后resolve被拒，artifacts/decisions/state/coverage逐项不变且零新AI；新授权后同决定正常完成 |
| SC-CR03 本地任务上限 | semanticRepairs先生成有界ranges/证据batch计划，再按累计乘积前检，最后才分配task矩阵。10,000任务、64MiB保守调度元数据、安全整数及单独range上限明确拒绝；SEM08验证10,000/10,001、乘法溢出、宽unit-ID元数据边界，不实际创建巨大任务矩阵 |
| SC-CR04 锁与实际adapter | 普通请求仅投影当前包实际字段；reconcile text锁使用当前片段值，私有state保留全文原值。ordinary/omission合并、修订包preview/最终提交及恢复checkpoint均核对完整state锁，空值不豁免。SEM07经过真实runImportAi的合成generate依赖，13k以上全文text锁多片/包外review成功；遗漏包试填作者锁定空职业失败，零新增artifact/coverage信用 |
| source父环后代 | 父环source退为raw/warning之后再次prune，使后代及引用未映射实体的源两线递归退出projectable；strict derived/confirmed仍抛错。SEM09核对全source环/后代、坏业务字段/知识及依赖两线原对象不改、警示逐ID可追溯、0AI、无假投影 |
| raw typed目录 | requestSnapshot只对真正projectable节点提供typed元数据，坏source保留普通材料目录项；adapter对source context使用可信目录，实际新结果仍严格解码/校验。SEM04/09和SEM07真实adapter情形覆盖坏source与合法strict同kind并存，不把raw资料伪装成WORLD |

修订包仍先用完整原对象校验稀疏差量/baseHash/范围/before/证据及完整锁，全部分片提案暂存后才提交单一artifact。主进程为兼容明确raw source采用“field primitive→完整importNativeMappings→全锁”的组合门；它没有删除primitive的版本/字符/字段/源不可改约束。完整公开wrapper仍执行原全引用合同，未为adapter分片或raw来源放宽。

## 最后资源门与raw基础结构增量

独立读取 `assertImportWorldContentProjectionBudget`：在projector structuredClone和重复附限定之前按JSON持久表示流式计量。计入对象键/标点、字符串引号/控制转义、反斜杠、UTF-8多字节及surrogate pair；对象undefined键省略，数组等按JSON规则计量。知识前缀只持有固定片段与既存字符串引用，先计escaped bytes，再以实际描述字段数乘算增量，没有先拼出大前缀×大字段集合。

门为输出16MiB、100,000个描述字段，另有1,000,000结构访问节点/256深度保护，全部加乘及输入limits校验安全整数；测试limits只能缩小。SEM04独立通过含换行/引号/反斜杠/emoji的精确字节边界、少一字节/字段拒绝、放大门拒绝，以及超限0次clone的spy。此为小合成边界证明，没有分配超大对象或以压力测试代替前检。

importNativeMappings在计划/审计映射时同门前检，strict derived/confirmed超限失败，source超限只能完整raw+warning/excluded；source缺content的原字fallback按不加前缀实际内容计算。published consumer再次检查由38负责，本报告只静读该共享门，不代签P01–03数据库结果。

`isImportRawSourceArtifact`在source fallback之前要求plain原对象与facts、合法kind、非空id/name、完整UTF-16字符串、合法sourceUnitIds/evidence必要字段；坏基础形状不能利用catch降级。SEM09原编号内实际覆盖facts字符串/数组/Date、坏id/name/kind、坏数组/evidence与UTF-16均硬失败；坏aliases/reliability等业务值才可在基础raw完整的前提下保留为未映射资料。新门没有让derived/confirmed绕过严格native、引用或空内容门。

## 持久状态、版本与组合边界

- 新choose才创建semanticVersion:1；initialize只恢复现有值，缺版本旧journal不升级，未知版本/不匹配状态保留草稿并拒绝。scope/plan的新增字段仍按版本条件存在，旧prompt/payload分支保持；SEM04的旧payload字节/完整prompt黄金及旧A03/D01保护实际通过。
- inputHash绑定实际scope、决定集和workingRevision；repair task绑定baseHash、范围、证据与输入身份。成功提案/遗漏completedUnitIds耐久保存，暂停epoch后迟到结果不提交；SEM08暂停重开只补pending、坏第二分片不记信用、末哨兵/原正文保留。
- 决定/变更后清空旧review与reviewFacts，仍完整覆盖所选正文/非正文来源与全部设定字段。missingTargets仅限selected targets与真实精确源证据；SEM10实际覆盖普通/非正文遗漏、无关成功分析不重做、越范围不新增产物或信用。
- 新addConflicts将已resolved的同hash冲突重开pending，保存历史决定；SEM08重复retry/reopen不能消音或重置两轮。新作者决定/明确正文版本才作为新输入。
- PDF proof/sourceTextDecoding/逐页决定、AI前后verify/模型授权、发布前来源/目标检查及生命周期分支静态保持；v2/legacy预算、workingUnits与2B/3B/fixed reserve没有被新语义路径删除。按授权没有复跑旧PDF/LB套件，不能把静态保持写成这些套件的新组合实测通过。
- 实施证据中的旧S01脱敏快照只读核验属于作者结果，本审核未重读真实书/journal/DB；原S01文学语义FAIL不变。本轮没有把尚未实施的41 runtime诊断方案当作当前代码。

## 独立执行命令与结果

仅执行下列四个精确文件/名称组合，全部使用Node24绝对路径；stdout/stderr保留为独立日志。SEM06–10使用隔离临时目录和合成AI返回，新增SEM07确实调用实际adapter但generate仍为明确合成注入；publisher是单元夹具，未调用真实模型/用户DB。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-SEM(?:0[1-9]|10):' tests/unit/novel-import-semantic.test.ts tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A03:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-D01:' tests/unit/novel-import-domain.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-CH0[123]:' tests/unit/novel-import-chapters.test.ts
```

| 范围 | 独立实际结果 | 日志 |
| --- | --- | --- |
| SEM01–10（含原编号子情形） | exit0，25/25 pass，0 fail/cancel/skip，4555.933ms | [semantic](evidence/semantic-controller-independent-final-sem.txt) |
| 旧A03 | exit0，1/1 pass，0 fail/cancel/skip，200.560375ms | [A03](evidence/semantic-controller-independent-final-a03.txt) |
| 旧D01 | exit0，1/1 pass，0 fail/cancel/skip，196.714209ms | [D01](evidence/semantic-controller-independent-final-d01.txt) |
| CH01–03 | exit0，3/3 pass，0 fail/cancel/skip，196.55625ms | [chapters](evidence/semantic-controller-independent-final-ch.txt) |

合计**30/30定向测试通过、0跳过**。父任务后续遇到模型容量错误时，这些命令已实际结束并保留结果；本审核先核对日志/进程退出及SHA，未把中断当通过，也没有重复执行同版本命令。35的63场景/专用TS结果另记，不混入本表；未运行P01–03、browser、packaging、全仓typecheck/构建或任何全suite。

## 执行前后11文件身份

下列SHA在独立执行前后各计算一次，逐项与最后冻结清单相同。publisher与P01–03文件仅核对组合身份，其实现/数据库用例由38独立审核，未被本表代签。

```text
6292d4567fe3e7a06b6ec86265b28a9b3a79158e8cdd899d4be859d92b8837b3 desktop/main/novel-import.ts
3aeb90fded876870a83d272ba3d9a24b75fde397cebcb8182ae2dbf40f3a1db2 desktop/shared/novel-import.ts
854c734df935bb7631e71bf3c7e9d9a1f70a1c582a6d50ba102d5ba491793dbc desktop/core/novel-import.ts
30ea421c4c70008ca1b975a16bfc9a83b70ed7dfbab1c9bfc7bac1312ef704ab desktop/core/novel-import-semantics.ts
57bc498f75b800fc602666f984594bb7ec10e59207d5ee709f8dacda7272f60c desktop/core/novel-import-semantic-state.ts
9e26d2c5751550b6410b3b6d00a3e220e4b917ac7b5124fad493e25b75e76051 desktop/core/novel-import-ai-payload.ts
803de671b3a9ec5e764d8b9bcabe081835750984acd862597fb5d87718e02599 desktop/service/novel-import-ai.ts
790c360ebe5e734cdfe5b95c68d58c25f512a4acf01cafb97baa04655ac92dde desktop/service/novel-import-publish.ts
d822a3eed0f3ca1698d7326ffd70370269786fab0a95412a32e3efd3eee2787c tests/unit/novel-import-semantic.test.ts
730343f42e7ddfca71fd1c9912d40966cb49c5ba22c2bbd5084101512b1aa8dc tests/unit/novel-import-semantic-session.test.ts
b1ae2f06289b3279d60469d088988af8181185780d6c85d5c1d64b6216eb6469 tests/integration/novel-import-semantic-publish.test.ts
```

**最终PASS：四项控制器P1关闭，最终资源/shape增量在本范围无剩余必须修订项。** 这是静态代码与上述合成定向合同结论，不证明模型能正确理解全书，不代替真实新run的独立oracle、实表/native UI/发布和正常重开验收。未修改生产/测试，未读取Key、真实用户DB或journal，未调用真实模型/应用/CUA。
