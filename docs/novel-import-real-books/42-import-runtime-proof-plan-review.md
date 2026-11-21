# 私有运行时证明技术方案与限定用例独立审核

日期：2026-10-26。审核者：独立子代理 `remaining_books_oracle`。只审41及当前明确调用／停机接点的静态源，没有实现、执行测试、实际应用、模型、用户数据库或journal，也没有修改生产代码、工具、原件和真实结果。

初审41 SHA-256：`ea1d9952ea33d3b9b8a0e7a36498d2daec89d701a13f338cac016ebce4f422ae`。

**技术方案初审：暂不通过。用例初审：暂不通过。** 方向和修改范围合理，但在证明真伪的核心位置还需RT-TR01、RT-TR02两项最小具体化，已先报告主代理。仅修改方案／现有两项新用例，不扩大编号、实际模型调用或测试许可；通过前不进入编码。

## RT-TR01 · P1 · 锁定原Promise观察及暂停捕获的微任务边界

第16–17行要求调用返回Promise后登记、及时观察settle并在取消前同步捕获，这比直接使用operations正确，但“及时”仍没有封闭内存陈旧pending的窗口。已fulfilled/rejected的Promise在附加then后，其reaction仍到微任务才运行；resolve之后到观察回调之间，token可能仍为pending。当前用例只明确“刚settle但磁盘pending滞后”，还不能证明内存这个更早窗口被处理。该窗口若被捕获为真在途，会直接违反39／40。

最小必修：

- 具体规定实际 `options.ai` 调用、返回原Promise、无await登记token并附加双向settle观察的顺序；同步抛错不得写pending。观察只写本实例内存，成功／失败／cancel-requested和结果采用分开，不产生未处理rejection，不因诊断改变原Promise的值／错误。
- 暂停须定义一个可验证的线性化点：捕获前先让已经排队的原Promise settle观察完成，再在核对当前session/process/旧epoch之后以无新await的同步操作取得pending集合；随后才改变epoch、发AI取消。仅用旧磁盘字段或尚未flush的token不能有效捕获。方案可以选择等价、可证明的机制，但不能把静态执行顺序当实际pending状态。
- 区分UI点击／action进入时间和实际捕获时间；如果因既有PDF drain／串行等待而调用先结束，最终必须记录未捕获，不能倒填点击时在途。迟到settle只能更新属于原token的终态，不能覆盖新session、新operation或恢复后的process，也不能记模型结果信用。
- NI-RT01必须加入原生已fulfilled、已rejected Promise，以及resolve/reject后立即发pause、settle观察尚未执行的精确调度反例；这些都不能生成captured-inflight。真正未决deferred Promise则可捕获，待真实settle、工作收尾后才drained。两组测试必须区分磁盘滞后与内存reaction滞后。

**栅栏精度要求：单次 `await Promise.resolve()` 或 queueMicrotask 不够。** 前序resolver微任务可以将原Promise的settle reaction排到捕获continuation之后。可行的最小方式是保持串行线性化边界、仅等待不依赖serial/jobs的一个新task（如setImmediate），直接在该task回调内同步核对lineage并快照，不在回调里新增await或业务／FS操作；此前task的reactions已经flush，之后再epoch++和取消。实现也可采用等价可证明机制。RT01必须显式包含上述“resolver在前、observer后排”的调度反例，不能把一次microtask yield算作通过。

本方案的“在途”限于应用层 `options.ai` Promise 已实际调用且未settle，不证明供应商内部状态。主控制器现有options.ai边界包含RPC／网关工作，这个限定符合39；不得把它改称供应商已开始生成、远端取消成功或停止计费。

## RT-TR02 · P1 · 固定诊断schema、硬上限及真实drain分量

第16行目前是“建议各<=16KiB、当前token<=16”，而第18行的计数是“本范围资源”；尚不足以给实现和审计一个固定契约。运行时证明一旦可以在漏计工作或诊断损坏时仍标drained，便不能满足39。这里无需新增资源系统，只需把现有接点写明。

最小必修：

- 固定两个可选持久字段及当前token的严格schema、状态枚举、UUID／hash／枚举／安全整数／时间字段长度、列表数量及UTF-8编码总容量。明确容量满时不丢仍活动token、不另发AI补证、不静默截断成有效证明；坏字段／溢出／跨session或process记录不能被采信。
- 指明drain检查的真实分量：本次捕获token的settle、旧operation集合、workflow jobs，以及既有PDF registry/client活动／未收口preview request等相关工作，所有相应计数均为0才能写drained；pause自身actions不能充作AI工作。不能用Promise wrapper已返回或cancel RPC已响应代替真实worker／FS／workflow退出。
- 明确取消和实际等待保持在serial外，最后才serial核对lineage并保存；settle观察不反向等待serial。保留既有PDF“先取消、serial/tail前真实drain”和FS预算直到实际settle才释放的边界，不为记录证明提前释放slot或改成超时假归零。
- 诊断校验／编码／持久化失败仍须完成取消与真实等待，不能发valid proof或假称已保存；旧正文、coverage、artifacts、语义checkpoint和既有journal保留，不以诊断修复重新推断或迁移旧已发布run。重开旧pending只可作为历史中断／不可证明，绝不回填活动token。
- NI-RT01/02补固定上限边界、非法enum/hash／跨process/session、诊断写失败及取消期间真实资源未settle的反例，并保持同两个唯一名称。SEM08／S10命令须补实际明确路径，不能只写“各自文件”。

## 已认可的设计边界

| 范围 | 静态结论 |
| --- | --- |
| 原operations不足为pending证明 | 已有主控制器ai在options.ai返回后还核对current、verifySources／PDF、模型授权，直到finally才删除operations；41正确排除该集合独自证明在途 |
| 实际invoke后的登记 | 方向正确，源验证、预算、模型核对与排队阶段均不得造调用；须按RT-TR01封闭reaction窗口 |
| 迟到结果与取消 | 保留epoch和现有停机顺序正确；诊断终态必须与artifact／coverage信用分离，不能因记录需求使旧epoch生效 |
| 私密边界 | 只允许元数据／固定状态／hash，无正文、facts、prompt、响应、URL、grant或raw error；不新增UI／HTTP／全局DB，不读取模型Key |
| 内容兼容 | 可选且仅新语义会话按需出现；不进payload／scope／plan／semanticResultHash／公开view／NOVEL_IMPORT快照，旧缺字段不默认，旧已发布S01不升级；NI-RT02须用独立冻结值证明 |
| 零AI | source-only无调用无假token；不能为测试补一次探针AI或改变用户模型／重试配置 |
| 真正LIFE | 组件证据不是实测；M02/L02仍需本次实际proof、同session恢复、已完成覆盖不重做、完整语义／发布／重开。未捕获、坏proof或停机未归零均不得算通过 |

## 定向用例范围

只认可拟新增的两个唯一测试名称，分别覆盖真实控制器的调用／暂停边界和重开／内容身份；可控RPC Promise属于隔离单测，不冒充真实模型。RT-TR01/02需加入这两个名称内部，不扩为新suite。

实际旧测试定位为：

- `tests/unit/novel-import-semantic-session.test.ts:65`，`NI-SEM08: bounded semantic repair checkpoints atomically and resumes without stale credit`。
- `tests/unit/novel-import-session.test.ts:94`，`NI-S10: start after durable pause and target reauthorization retains only valid analysis checkpoints`。

后续只允许对应锚定名称和明确文件的Node24命令；不跑其它NI/PDF/LB/browser/packaging或全仓测试。本轮未执行任何这些命令。TDD RED／GREEN、独立代码审核、组合构建及真正RB-LIFE01仍为后续阶段。

## RT-TR01/02 增量复审

修订41 SHA-256：`1fe7880018625b04e09de11f9c1e44c18e5f02efc766d21a9b88e9235ec2a840`。末节“RT-TR01/02 具体收敛”明确优先于前文概述；本复审按该固定契约核对，保留上文初审历史。

**技术方案最终结论：PASS。** **限定用例最终结论：PASS。** 无剩余必须修订项。该结论只允许按方案进入限定TDD与独立代码审核，不是实现、测试或真实RB-LIFE01结果。

| 初审项 | 关闭依据 |
| --- | --- |
| RT-TR01：原Promise与微任务窗口 | 真实options.ai返回原生原Promise后无await附双向观察／登记；同步抛错不造pending，observer只更新本实例内存的固定终态和应用观察时间。暂停先serial验证身份，等待不依赖serial/jobs的setImmediate新task，并在该回调内同步纯lineage检查、捕获pending和改变epoch，期间没有await、FS或业务hook。明确禁止一次microtask yield，不把磁盘pending作为结论，错过窗口即missed |
| RT-TR01：精确反例与取消 | NI-RT01明确包含已resolve/reject立即pause、resolver微任务在前而observer排在捕获continuation之后的竞态，要求旧单microtask方案RED；另有真正pending捕获后settle和owner/epoch等待期间变化。取消和等jobs都在serial区外，迟到终态只能归属于原token，不能取得coverage／artifact信用或覆盖新会话 |
| RT-TR02：固定容量／schema | v1严格已知key，UUID／安全整数／既有枚举／64位hash／最长40 ASCII合法ISO时间，call状态和settled outcome固定；最多16当前token、每call≤1024B、整体JSON UTF-8≤16384B。先预留／检查再调用，满额不发未登记请求，不丢活动token或截断成有效proof。没有自由文本、路径、模型快照、正文／响应／错误 |
| RT-TR02：真实drain／失败保留 | pendingCalls、operations、workflowJobs、pdfActive、pdfRequests分别取实际剩余数，全部为0且捕获调用都settle才能drained；无捕获为missed，排除pause自身actions。坏／超限诊断不可采信，只隔离可选元数据，核心正文／source／artifacts／coverage／预算与SEM checkpoint保留；保存失败仍取消并等真实调用收尾，不签有效证明，明确禁止AI job等包含自己的jobs集合 |
| RT-TR02：用例／命令 | 两个唯一RT名称内补硬界、坏字段／类型／时间、满token、同步抛错、写失败、旧证明不能冒用、新实例及内容指纹不变；补齐两个旧回归的准确文件和三个Node24精确命令，没有扩大测试范围 |

持有serial只跨一个不依赖serial/jobs的新任务边界，与在serial内等待整个AI job不同；真正取消／drain及最终保存仍保持已有生命周期顺序。PDF与FS预算没有新增提前释放或超时假归零的许可，相关计数是诊断门，不替代真实registry／worker／FS结束。实现阶段仍须核对这些具体接点，不能仅填0常量或从phase反推。

重开由空内存token和新processRunId开始，旧pending只能interrupted／unavailable，旧有效证明只作为历史；source-only保持0AI。可选字段继续不进入payload、scope、plan、semanticResultHash、公开view、发布快照或幂等回执；旧S01缺字段不补默认、不迁移。观察器增量归主代理另案独审，不由本PASS自动覆盖。

本次只重新读取修订41并追加42，没有运行三个拟命令、模型、DB、journal、应用或CUA。后续真实M02/L02仍须取得本次捕获及实际drain证明、正常退出／同session重开恢复、完整正文／十二目标／独立语义与发布／重开全部验收；供应商内部状态、请求身份和无法归属的用量仍按39保留未知。

## 观察器小增量方案及用例审核

附录版41 SHA-256：`e885706b5d9be4b1c2a6c306be2eb47819fd81731a62c82192861ec26a56655d`。本节只审新增“观察器增量”，不重开已通过的生产方案或扩大实现文件所有权。

**观察器增量技术方案：PASS。限定隔离用例：PASS。** 没有方案级P1阻断。允许主代理实现该私有投影工具，最终代码／冻结身份及隔离执行结果仍需独立审核；本节没有执行这些用例，也不证明尚在实现中的生产helper正确。

方案维持同一入口：仅针对已绑定本run及完整来源集合、唯一匹配的新journal，Python在semanticVersion=1且可选字段存在时挑选runtimeAiCall、runtimePauseProof、runtimeDiagnosticsStatus，额外只传sessionId。无字段legacy继续缺字段、非语义会话不投影，不将整个journal、正文或model/grant送入子进程。构建身份同时记录helper／CLI／observer，使后续投影结果可追溯到实际组合。

新CLI的stdin envelope严格限定sessionId／diagnostics，UUID及已知key检查、17408 UTF-8输入字节上限、生产parser的16384诊断上限形成两层约束；它复用parseImportRuntimeDiagnostics而不是另造宽松协议。有效输出只能为校验后的三字段纯元数据；非法、错配、超限或异常统一固定unavailable，不把原对象、自由错误或输入片段复制到证据。实现审核还须确认stdin读入／Python编码的字节计数在累积前截断拒绝，UTF-8／JSON解码失败同样固定降级，子进程stdout／stderr不透传秘密哨兵或raw异常。

获准隔离验证恰覆盖合法pending、settled／drained、未知key带哨兵、容量超限、session错配、legacy缺字段和非语义会话；均只用合成stdin／对象，无用户journal、DB或模型。负例应同时检查无原输入／哨兵泄漏，不能仅检查unavailable字段存在。这个有限集合与该投影变化直接相关，不授权真实observer扫描、额外模型请求、全suite、HTTP或产品UI改动。

投影仅保存诊断，不认证其为当前实例活跃或真正LIFE通过；pending磁盘状态仍不能独自证明在途，drained历史证明仍须结合本次session/process/epoch及真实操作判断。39／40关于未知用量和供应商状态的边界不变。
