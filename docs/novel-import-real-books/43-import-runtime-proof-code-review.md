# 私有运行时证明独立代码审核

日期：2026-10-26。审核者：独立子代理 `remaining_books_oracle`。依据41／42，只审本轮冻结的主控制器、shared、runtime helper、新RT测试及S10获准最小fixture适配。没有修改生产／测试源码、工具、原件、真实journal或数据库，没有运行模型、应用、CUA或全suite。44的observer／CLI独审不重复执行，37／38旧基线不重跑。

**当前最终结论：PASS，RT-CR01已修复并关闭，无本范围剩余必须修订项。** 最终独立三命令为11/11、6/6、9/9；版本身份及关闭依据见末节。下文保留初审P1和首轮绿但缺覆盖的真实历史，不把此前失败版本改称通过。此结论不代表真实RB-LIFE01、供应商内部状态或整书导入／语义／发布通过。

**初审结论：暂不通过，存在下述RT-CR01 P1。** 首轮获准的三命令全部绿，但没有覆盖初次pending诊断保存失败。已立即报告主代理和独占实现代理；主代理只解冻必要main与原RT01内部反例／修复，不扩大编号或生产功能。最终结论等待新冻结身份和必要增量复验。

## 初审冻结身份

五项均与主代理交付严格相同；独立测试使用下表这个版本。

| 文件 | SHA-256 |
| --- | --- |
| `desktop/main/novel-import.ts` | `6cc71e987b2f9b4cd35570668c83bca5d80074c1ef4872cdb0b198798fa3ac83` |
| `desktop/shared/novel-import.ts` | `4b13236a2e14a0c55454fce4115784f8cb3145e6acd7a8b8fc193515b7754ef1` |
| `desktop/core/novel-import-runtime-proof.ts` | `ed77bbf8fe0f1c572e49e4d8178bbc27d712f56799616cc27ab4a6acf78bf5d7` |
| `tests/unit/novel-import-runtime-proof.test.ts` | `23e9c7c8f08d3dc651ffce603d0803c9e227f329fd49af0687baa9fdb281bb7b` |
| `tests/unit/novel-import-session.test.ts` | `617127bff8096f82b8d5300f72b092f8b2a7f76c9ef2db1d8fa4897a645c07c4` |

## RT-CR01 · P1 · 首次诊断保存失败没有取消并等待真实调用

初审主控制器第305行 `recordRuntime(s,epoch)` 是fire-and-forget的serial(save)，其catch只清除runtimePauseProof并设runtimeDiagnosticsStatus=unavailable。第313行调用它后仍直接await原options.ai Promise。失败没有传播回该次ai，没有使epoch失效，也没有调用cancelAi或等实际请求收尾。因此若首次pending诊断落盘失败，请求仍在后台继续；暂时性写失败恢复后，正常result仍可经过current／来源验证并获得后续覆盖／artifact信用。

这违反41明确的诊断持久化失败契约：不能假称证明已保存，仍须取消并等真实底层收尾。问题不是把unavailable当drained，而是失败后根本没有执行必要的取消／等待；此时不能仅以eventual手工pause补偿实现缺口。

现有 `proof-write-failure-still-drains` 在pending已成功保存后才将journal叶替换成目录，再发pause，验证的是**最终pause proof写失败**。它不覆盖首次recordRuntime失败，所以首轮RT 10/10不能关闭本项。

最小修订范围已由主代理授权：在原RT01增加“首次pending保存失败、原RPC仍未settle”的精确反例，先保留真实RED；验证取消确实触发、cancel同步抛错也继续等待原Promise、真实settle前不提前归零／完成、终态后没有覆盖或artifact信用。实现从该次ai自身失败路径在serial外取消该operation并等**该原Promise**实际settle，再安全失败；不能在AI job内等包含自己的this.jobs集合，也不能改成重包装Promise先返回而后台仍运行。由实现所有者修复后新冻结，独审再复验相同三个许可命令。

## 首轮独立实际验证

只执行41的三条精确命令，没有其它测试或动态探针。日志通过noclobber独占新建，未覆盖实现者或历史证据。

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-RT0[12]:' tests/unit/novel-import-runtime-proof.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM08:' tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-S10:' tests/unit/novel-import-session.test.ts
```

| 命令 | 实际结果 | 独立原始日志 |
| --- | --- | --- |
| RT01／02 | exit0，10/10，fail/cancelled/skipped均0，1614.640041ms | [runtime-proof-independent-rt.txt](evidence/runtime-proof-independent-rt.txt) |
| SEM08 | exit0，6/6，fail/cancelled/skipped均0，2409.047458ms | [runtime-proof-independent-sem08.txt](evidence/runtime-proof-independent-sem08.txt) |
| S10 | exit0，9/9，fail/cancelled/skipped均0，2141.831875ms | [runtime-proof-independent-s10.txt](evidence/runtime-proof-independent-s10.txt) |

这些通过只说明当前已有分支符合断言，不能弥补RT-CR01缺失分支。未独立执行实现者的typecheck，原 `runtime-proof-typecheck.txt` 仅报告owned runtime文件诊断0，不当作本代理执行结果。

## 证据时序与RED口径

读取实现者四份red文件及 `runtime-proof-red-command-metadata.json`：禁调用记录、单microtask、旧同步cancel行为和旧S10 fixture都是**实现后的故障注入／变异验证**。metadata明确记录这一性质及变异前／恢复后的相同最终SHA；日志中的red能说明现断言识别这些变异，但不是最初实现前的TDD RED，本报告不将其改称TDD顺序已完成。

四份red文件的文件时间早于实现者最终green，首次独立测试则在其后；文件mtime仅作辅助时间线，不独自证明修改历史。真实执行／恢复的主依据为实现者命令metadata、冻结SHA和本代理独立执行前的五项SHA匹配。RT-CR01后续新增反例应单独保留本次真实RED／修复GREEN，与上述变异历史区别。

## 其余静态审阅范围

主控制器先做既有source／授权／预算校验，再由tracker调用真实options.ai。tracker仅对实际返回的原生原Promise登记；同步抛错不造pending，返回给调用者仍是同一Promise。双向settle observer只改内存终态，不反向await serial。freshImportRuntimeTask直接在setImmediate回调内运行捕获；暂停持有serial只跨该独立task，在回调内校验session对象、epoch、PDF generation、process，再同步捕获和epoch变更。真正取消、等jobs、PDF drain都在serial外，最后另行保存。

drain证明读取实际pendingCalls、operations、workflowJobs、pdfActive、pdfRequests；全部为0且捕获调用全部settled才drained，没有捕获则missed，排除pause自身actions。严格schema限制UUID／enum／safe integer／hash／ASCII ISO时间，最多16 token、单call1024B、总体16384B，容量在invoke前预留检查。旧pending恢复只改为interrupted，内存tracker从空和新process开始；坏可选诊断隔离为unavailable并保留核心内容。

shared只增加可选私有字段；toImportView、明确字段的AI payload／scope／plan／semanticResultHash／publicationRecord没有加入它们。RT02检查旧MD／PDF固定golden、公开view及实际publicationRecord AST输出不随诊断改变，source-only无调用无假token。源／预算／PDF实现未因诊断增量扩大。本段是静态核对及当前测试覆盖说明，不关闭上述失败路径，也不认证供应商状态、账单或真实LIFE。

S10当前范围限原测试内部：两处合成inferred角色补严格roleType／aliases／relationships；working-revision的角色来源用明确年龄19和角色类型标签。正文仍为“第一章\n沈砚十七岁。”，patch仍start6/end9，before十七岁、after十九岁；恢复／失效／原目录／coverage／产物／工作修订断言继续存在。最终冻结复审还需确认没有其它fixture／编号变动；生产不得恢复从叙事猜年龄或放宽严格schema。

## RT-CR01 修复后的最终增量复审

主代理授权实现者只修必要main、原RT01内部反例，并针对本次固定PersistenceError处理再次保存失败；其余错误路径不扩大。实现者完成新反例的真实RED后修复。最终五项SHA独立读取与交付一致：

| 文件 | 最终SHA-256 |
| --- | --- |
| `desktop/main/novel-import.ts` | `04ef2051cc12c6b53b92b2b6787c166ed7f317bb89417115b89b732ed6585147` |
| `desktop/shared/novel-import.ts` | `4b13236a2e14a0c55454fce4115784f8cb3145e6acd7a8b8fc193515b7754ef1` |
| `desktop/core/novel-import-runtime-proof.ts` | `ed77bbf8fe0f1c572e49e4d8178bbc27d712f56799616cc27ab4a6acf78bf5d7` |
| `tests/unit/novel-import-runtime-proof.test.ts` | `181e5e8d2deada5d6c4dd5958d76f73eb6bd15d8fd86ae94fea04777a0d32660` |
| `tests/unit/novel-import-session.test.ts` | `617127bff8096f82b8d5300f72b092f8b2a7f76c9ef2db1d8fa4897a645c07c4` |

**RT-CR01关闭。** 第306行recordRuntime现在返回可await的serial保存Promise，失败清除proof并抛固定 `ImportRuntimePersistenceError`，不携raw error、路径或Key。第314行ai先await它；失败后在serial外把本operation的cancelAi纳入allSettled，捕获同步抛错，再等待**原options.ai Promise**真实fulfilled或rejected，随后重新抛该固定错误。该分支完全跳过正常result采用、source后验与coverage／artifact提交；没有等待包含自己的workflow jobs。operation在真实原Promise收尾后才由finally删除。

launch第269行仅在原错误为这个私有PersistenceError时，对其failed状态的再次保存失败做内存兜底：清除proof、标unavailable、保留failed及固定错误和核心状态。其它错误仍抛其saveError，原PdfFileChanged专用分支未改。该兜底没有声称写成功，也不生成drained证明；不能因持续IO失败把后台请求丢弃或授予迟到结果信用。

新增 `first-pending-write-failure-cancels-and-drains-with-zero-result-credit` 留在原RT01内，使用临时隔离journal叶模拟初次pending保存失败，并让该IO故障一直持续到failed状态再次保存。循环分别覆盖cancel正常响应和同步抛错；在原RPC未settle时断言active>0、operations=1及真实token pending=1，取消响应／异常都不能使它提前结束。随后返回结构合法、带源证据的迟到角色，最终仍failed／unavailable，正文不变，coverage和artifacts为空，operation/token归零，无后续分析或复核、无假proof，原持久备份完整。不是用不合法模型结果来碰巧触发别的错误。

实现者的 [本次真实TDD RED](evidence/runtime-proof-first-pending-write-failure-tdd-red.txt) 为9pass／2fail，精确失败于等不到初次写失败后的cancel窗口；它发生在本P1提出后的新增反例阶段，和上文四份实现后变异不同。本代理读取该原始日志，但未重新运行旧缺陷代码或修改源码制造RED。日志SHA为 `77523d8e11b83119359914c67ae91d3eb1fc8035df150306d0adc2608617a275`。实现者关于更早首次0/4 RED的说明注明原始输出当时未落盘，本报告不把后来的变异文件冒充它。

## 最终独立实际结果及限制

新冻结后只重复上文完全相同的三条获准命令；各日志独占新建，保留首轮原始文件不覆盖。

| 命令 | 实际结果 | 新独立原始日志／SHA-256 |
| --- | --- | --- |
| RT01／02 | exit0，11/11，fail/cancelled/skipped均0，1675.082667ms | [runtime-proof-independent-final-rt.txt](evidence/runtime-proof-independent-final-rt.txt)，`ee3d94e5055d2478f25dc8b3316f399654c6c46f2ed08aa1bd9a7dcec345aa5d` |
| SEM08 | exit0，6/6，fail/cancelled/skipped均0，2298.48525ms | [runtime-proof-independent-final-sem08.txt](evidence/runtime-proof-independent-final-sem08.txt)，`57f159cadd2adce89937576d9e81bf06c532776ae7a8edfd9fa5b1a76933f709` |
| S10 | exit0，9/9，fail/cancelled/skipped均0，2057.094958ms | [runtime-proof-independent-final-s10.txt](evidence/runtime-proof-independent-final-s10.txt)，`4b9549a8a2ac76ed5b3cfa935686621e2d9b8de59052b42966ee378c994f749f` |

独立日志没有PromiseRejectionHandledWarning／unhandled rejection；Node测试运行器也未报告相关异步失败。持续写失败路径实际执行通过，不能仅凭静态catch或最终phase推断。没有独立执行额外typecheck或其它测试；实现者owned TS诊断0仍仅按其证据记录。

最终S10文件与初审冻结相同。静态核对获准角色字段／显式年龄适配后，正文、patch6–9、所有恢复／失效／原目标／coverage／artifact断言均保留，三条独立命令中S10再次9/9。测试文件在本仓库为untracked，未声称通过git差分独立重建更早字节；本结论依据实际源中授权的局部fixture、保留的断言、冻结身份和执行结果，不放宽生产schema或改成全legacy。

结束前复核五项SHA，helper／shared／S10保持原值；44绑定同helper而不重跑。组合构建及真正M02/L02在途暂停→同session恢复→完整正文／十二目标／独立语义／发布／重开仍由主代理另行执行，本次PASS不提供真实模型或用户数据验收。
