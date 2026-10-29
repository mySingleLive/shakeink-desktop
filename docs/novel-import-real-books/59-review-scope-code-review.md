# 审核分包、遗漏修订与信用迁移独立代码审核

日期：2026-10-26。审核者：`remaining_books_oracle`。依据57／58，仅审核七个冻结文件及相对真实56基线的完整差异。

**当前生效结论：最终限定PASS，RS-CR01已关闭，无剩余本范围P1/P2。** 最终main为`a0acd1a282eea4dc874ff45fa4b4b143cc2c2fe688880a235399bcff1d49bcd7`，session测试为`8c9df1bcec64315bd6a585e89e994ec7f1bde302a5df169ddccafb3104ce6d6f`；其余五个生产文件维持首轮冻结身份。详见文末60增量代码复审，首轮NOT PASS与原绿日志保留。

**首轮结论：NOT PASS。存在P1 RS-CR01，候选journal成功rename后的异常可能造成磁盘新候选与内存旧信用分叉。** 独立三个精确命令全绿，但未覆盖该提交后故障，不能据此记PASS。主代理已收到P1并停止构建／真实重试，待最小提交点方案与修复后增量复审。

没有修改生产／测试，没有访问真实小说、应用、模型、用户journal或DB；未运行其它suite。本轮只新增独立原始日志、metadata和本报告。

## RS-CR01（P1）：rename之后抛错，调用者尚未采用已提交候选

冻结main第96行save流程为`await rename(temp,file); await this.owner(s.id)`。rename成功已经替换session.json，但后一次owner检查仍可能拒绝并使save抛错。迁移第353行与遗漏计划第480行只有在`await this.save(candidate,false)`成功返回后才将候选替换到live owner，因此这一分支会形成：

- 持久化journal已经是新版policy／清理后的信用，或已安排新任务及omission.done的候选；
- 内存仍为旧state，调用者收到保存失败且未采用候选；
- 重新打开会看到已提交候选，或后续错误处理可能再次写入旧live state。不能将其描述为“所有保存失败均完整旧信用”。

这不要求去掉安全后验检查。必须明确rename提交点：提交前失败保留旧state；确认rename成功后，即使后验失败，也须一致采用已提交候选、固定阻断且0AI，或有安全可证明的回滚机制。迁移与遗漏排程两个候选保存接点都要覆盖，不能只修其中一处。候选在提交后错误／重开时也不应凭running状态自动启动AI。

现R02的candidate-save模式在save方法入口看到candidate即抛错，只覆盖提交前失败；并未让真实rename成功后再故障。需在原R02内增加该真实接点反例，检查live与重开journal一致、无launch／AI／发布／假信用，保留原提交前失败全旧state反例。本文根据已冻结源码确认该可达分支，没有越权改代码或额外运行故障探针。

## 冻结身份及独立差异核对

| 文件 | 首轮冻结SHA-256 |
| --- | --- |
| `desktop/core/novel-import-ai-payload.ts` | `8edd5629d1f5153d00a5b4c0bfd90dd0bddcad29b7409f5b9546869ed6cb2d98` |
| `desktop/core/novel-import-review-tasks.ts` | `89e9c39e8a0c362d34baa5b393f44ca3dbfda1a52022ebc4ce66c9e6da566a82` |
| `desktop/core/novel-import-semantics.ts` | `e33fe475457e8829ed321fc428c108145ec441934db6017e83313d4aacab1874` |
| `desktop/core/novel-import-semantic-state.ts` | `592563c09ea0a12fed399a2f8eeef8016c5e9c099d46de9ab6f66e99a99f05d5` |
| `desktop/main/novel-import.ts` | `727cddac9037120c8162667c8ef213ad799da8ef43c82024ff7837910015e546` |
| `desktop/service/novel-import-ai.ts` | `312fe64bf374168f6ec33267006a5c64d7e8b934093a33f4ef57398cf9271cd6` |
| `tests/unit/novel-import-semantic-session.test.ts` | `e6809422606534cbd96ae207e40de9b20c984650a8d94079f6c2fc3165c89f85` |

七份真实基线在`/private/tmp/novel-import-review-scope-57-baseline/`，逐项SHA与两个manifest一致。独立从这七份基线重新生成完整统一diff，与作者532行差异文件逐字节一致，SHA=`f8199fe22aa6a35adc03042cafc7128fbe6e4f8154e8cfeac09a331a5f3b061b`，并已完整审读各差异块。

独立metadata：[review-scope-independent-first-review.json](evidence/review-scope-independent-first-review.json)，SHA=`d0074039598845a1704eebcf8b8d3b57be81524286d4c4222ad08094896a8b91`。包含七文件旧／新完整hash、差异重建一致证明和独立日志hash，不保存真实小说／模型文本。

## 其余门控审核

除RS-CR01外，未发现本轮其它必须修订项：

- **投影与范围。** controller从完整当前对象生产位置对应projection，重复ID分片保持数组位置；正文slim省略text不冒充空全文，确定性事实任务保留原key与几何，只附可选projection。schema检查hash格式、长度、键集合／fields、范围及同ID一致性；main再比较完整对象hash、长度、完整键与实际slice／字段值。三元遗漏必须指向本包投影；已有字段未实际提供、局部text未覆盖全文时拒绝。新prompt明确相关目录与分片语义，不把片外未知当不存在。
- **三元与目标。** service三元同时存在／省略，保留selectedTargets、来源／证据和阶段门。core及main校验目标id／kind／hash、合法可改字段、source/raw与锁；已有实体缺口进入reconcile，不走ordinary整对象生成。新实体补全在merge前硬拒现有／本批重复ID，原同名身份算法不扩大，pending冲突checkpoint后内外workflow立即停。
- **排程与信用。** 同artifactId／baseHash先聚合字段理由、证据与extra units；pending／committed同base任务增补，旧key／done／edits保留。omissionKeys绑定新任务指纹，旧无上下文任务key不变；实际请求包含原因／证据／field，新增源单位实际进入任务。容量与完整payload／reconcile／固定prompt预算在clone上预检，原original／baseHash、完整稀疏原子应用及锁校验保留。done只代表可靠排程，ready仍需任务完成、repair提交及复核；其持久化失败一致性由RS-CR01阻断。
- **策略与恢复。** publication优先恢复，旧pending冲突之前统一检查新政策，resume不能绕过；旧版本须明确consent及模型／来源／原目录／预算门，决定／锁及未知policy拒绝。clone保存前不清旧live信用，同policy2正常恢复保成功分析／审核；legacy与零AI不设新policy。提交后故障仍需RS-CR01修正。
- **兼容与范围。** 可选projection只进入新语义review payload；分类固定契约、非review原prompt行为、网关／纠正上限未改。新state可选字段不默认注入旧记录；旧审核任务key／几何不变。测试从原NI-SEM06起直到文件末的全部旧字节与56基线完全相同，未删减恢复／两轮／锁／正文断言。fixture仅增记录actual adapter prompt及隔离重开／控制辅助，新R均在临时合成目录。

## 独立实际执行

仅执行57／58批准的三个精确命令。日志以exclusive方式新建，未覆盖作者记录：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-R0[12]:' tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM(?:08|09|10):' tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM04:' tests/unit/novel-import-semantic.test.ts
```

| 范围 | 独立结果 | 原始日志／SHA-256 |
| --- | --- | --- |
| R01／R02及子例 | exit0，13/13；fail/cancelled/skipped均0；3846.639916ms | [review-scope-independent-r01-r02.txt](evidence/review-scope-independent-r01-r02.txt)，`080dec184bc1fdf248df63f4893af7adaf7545fb7bd839e5383f6bdb820b587c` |
| SEM08／09／10及子例 | exit0，11/11；fail/cancelled/skipped均0；3209.005375ms | [review-scope-independent-sem08-sem10.txt](evidence/review-scope-independent-sem08-sem10.txt)，`341781da45332ab73829cf3732178e0136efef4a8d73ca4ad291770ae0358546` |
| SEM04 | exit0，1/1；fail/cancelled/skipped均0；164.503667ms | [review-scope-independent-sem04.txt](evidence/review-scope-independent-sem04.txt)，`940bf588acebc843c3274ce5d00a378bc5874417d1ed8a97b3803d35727e63b9` |

新R通过真实controller和受控合成AI adapter，actual service生成prompt被记录验证；错误三元等负例断言`issued===true`并保留原review coverage，避免以前置kind失败制造假绿。双字段／双extra、pending／committed增补、超预算无done信用、publication／legacy／零AI及立即停均实际执行。上述绿色不能替代尚缺的post-rename反例。

作者保留的56行为基线RED为2pass／8fail（含父测试统计），SHA=`fb22d2b31d0fb0dda030aba9a43f200c8c3cd90916534945c671ec69ee23373d`。更早含seed fixture问题的红、实施中actual review prompt漏接的红和后来防假绿补足属于不同阶段，不能回填成全部反例最初均已有效验证。本代理只读取历史，没有切换源码制造RED。

作者owned TS诊断0只作作者证据；本代理未另跑typecheck或其它suite。所有计数是隔离合成执行，不代表真实供应商调用、费用、文学语义、发布或C1已通过。

## 后续边界

RS-CR01小方案须先独立确认，再由作者在main与原R02最小范围真实RED→修复、重新冻结；本报告保留首轮NOT PASS及绿日志，后续只作必要增量复验并追加关闭记录。真实rev177失败、33项中已有变化、未发布状态和正文保真事实不回溯修改。最终代码通过前不构建／恢复模型；其后仍需同C1授权重建、完整复核、独立文学审核、发布／查表／重开另行验收。

## RS-CR01补充方案独立审核

60 SHA-256：`52ce8f9f801f0be6f1693d8aa1c7a47342b25bfda3243b4324ded4ab51404b7d`。**补充技术方案PASS；限定用例PASS，无剩余方案级必须修订项。代码RS-CR01仍未关闭，首轮NOT PASS保持，须待实施及冻结后增量代码复审。**

60正确区分提交前与提交后失败：两个候选先以paused／resumePhase=running、固定提示及targetNeedsAuthorization持久化；以rename成功返回为唯一提交点，立即同步采用到原live对象，然后继续原owner后验。此同步采用接点须保持纯操作，无await、业务hook、通知或另加会抛的校验，避免在已提交但未采用之间重开窗口。

后验失败保留已提交暂停候选，并由固定专用错误及实例latch阻止新发送／写入；不再声称旧信用未提交，不回滚或另写phase。launch特殊终止，current只读，checkpoint在fn前拒绝，关闭仍cancel／drain而不重写候选，正常新controller核验及撤权后才恢复。后验成功才恢复live期望状态并继续，磁盘paused作为崩溃恢复点，避免为running另造第二候选事务。目录／归属安全检查、锁、两轮上限和原文边界没有放宽。

原R02内两个新增反例必须分别让迁移／遗漏规划的**真实rename已经提交**，再精确拒绝owner后验；检查live与raw disk同候选、0新增AI／发布、retry／current／close不改写、异步checkpoint不先修改live、排空不死锁及新controller重开同业务候选后需重新授权。原提交前失败全旧信用断言保留。不得以save入口throw或实现后故障注入替代这次真实RED。

本批准仅main与既有session测试的R02；其他五个生产文件及原R01／SEM断言不改，仍仅本报告三条精确命令和必要类型验证。不另开suite／真实调用。60“其余六源文件”按明确文件范围理解为其余生产接点不变，不据该计数笔误扩大授权。

此次只读补充方案并追加审核文档，没有编码、执行测试、访问应用／模型／真实数据。原独立绿日志和首轮P1证据完整保留，未提前记代码修复通过。

## 60增量代码复审：RS-CR01关闭

**最终限定PASS，无本范围剩余P1/P2。** 仅重新审核main与R02增量并复验原三个精确命令，没有重做或扩大旧七文件测试范围。

| 文件 | 最终SHA-256 |
| --- | --- |
| `desktop/main/novel-import.ts` | `a0acd1a282eea4dc874ff45fa4b4b143cc2c2fe688880a235399bcff1d49bcd7` |
| `tests/unit/novel-import-semantic-session.test.ts` | `8c9df1bcec64315bd6a585e89e994ec7f1bde302a5df169ddccafb3104ce6d6f` |

真实57冻结基线在`/private/tmp/novel-import-candidate-commit-60-baseline/`，main完整SHA `727cddac…5e546`及测试`e6809422…89f85`均已独立核实。独立重生成两文件完整diff与作者差异逐字节一致，SHA=`90670692eaa7b37815c4468c38dc249b2af244d0e888b2c9d7e14ebd2e60108a`。测试只有原R02内新增行，首轮全部既有测试行保持原字节；其余五生产SHA与本报告首轮表完全相同。

新commitCandidate在编码前准备paused、resumePhase=running、固定安全提示和需重授权的同一候选。save确认rename返回后立即以私有同步onCommit采用到原live对象，只有标记、删除原键及Object.assign，无await、通知或业务hook；随后仍保留原owner后验。提交前失败未采用旧live，提交后失败则设置实例latch并抛固定CandidateCommittedBlocked，不附原始异常、不回滚已提交候选，也不unlink已经rename的候选临时路径。

后验成功只在live恢复原期望状态，磁盘保留paused恢复点；后续原checkpoint正常写入。后验失败时，两候选路径都保持live与disk同一暂停候选；launch识别专用错误而不走failed后二次save。current只返回视图，排队动作再检查latch，checkpoint在fn前、private current／AI入口及已排PDF成功／失败回调在修改前阻断；不会将此故障误标成来源变化。stopAction仍取消并等待实际jobs／operations／PDF，latch时不写状态，close对已暂停候选不重写。这里仅作必要静态守护核对，不宣称执行了真实PDF流程。

### 真实post-rename RED与独立复验

作者[post-rename RED](evidence/candidate-commit-r02-post-rename-red.txt) SHA=`82a98d32a700f4fa6e5ff3afa03203cf2a7eb63d2634f33c65781d06b71c3e2e`，12pass／3fail（含失败父测试）。两子例确在真实disk已被rename成新revision后，通过原owner后验拒绝，均失败于live未采用候选；遗漏路径还显示普通failed保存覆盖已安排任务。这是新P1反例实施前的真实RED，不是save入口失败或实现后变异验证。

本代理以exclusive新日志独立重跑相同三命令，结果：

| 范围 | 独立实际结果 | 新日志／SHA-256 |
| --- | --- | --- |
| R01／R02及子例 | exit0，15/15；fail/cancelled/skipped均0；3857.119167ms | [candidate-commit-independent-r01-r02.txt](evidence/candidate-commit-independent-r01-r02.txt)，`d01c1532185cc25cb75178ee4a5c04ab3a1a8cfc276fbe18636bc655861aab3d` |
| SEM08／09／10及子例 | exit0，11/11；fail/cancelled/skipped均0；3664.747125ms | [candidate-commit-independent-sem08-sem10.txt](evidence/candidate-commit-independent-sem08-sem10.txt)，`6b573702efdb7d16fd591066f54e259524cd2d6f1a5caf2603ba2e5524274760` |
| SEM04 | exit0，1/1；fail/cancelled/skipped均0；204.495916ms | [candidate-commit-independent-sem04.txt](evidence/candidate-commit-independent-sem04.txt)，`7da6793ff2782cca39681b233eea95878436ebc30142e2b10796da17397a9871` |

R02两条新反例分别覆盖迁移与遗漏排程：真实owner先照常核验，读取到候选新revision后拒绝；断言live与raw disk完整相等，固定暂停／错误／授权标记，0新增AI／发布。retry／current／save／AI／checkpoint无法写或发送，checkpoint fn旗标保持false；close确实drain且不改journal。新controller正常核验重开后业务候选一致、旧grant撤销，重新授权才继续成功。原提交前失败全旧live／disk信用断言仍通过。

独立metadata：[candidate-commit-independent-review.json](evidence/candidate-commit-independent-review.json)，SHA=`38ab57631bcc12c044b64039b1d916916c6e38e645ec674baf10ae0b09861d11`，记录完整旧／新身份、五文件控制hash、独立差异一致及日志结果。结束前两最终源码SHA仍匹配。未另跑typecheck、其它suite、应用、模型或真实数据；主代理必要类型／构建结果应单独记录。

至此RS-CR01代码问题关闭，首轮NOT PASS与覆盖缺口不回填为最初即通过。该PASS只允许后续组合构建和既定同C1恢复，不能代替实际12类重建、完整事实复核、作者决定、独立文学质量、发布／查表／重开或其余真实用例。
