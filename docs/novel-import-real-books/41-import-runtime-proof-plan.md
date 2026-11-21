# 真实暂停测试的私有运行时证据方案及限定用例

日期：2026-10-26。状态：方案及限定用例已通过42独立审核，限定实现中；不宣称真实RB-LIFE01通过。

## 必要性与范围

03/39的RB-LIFE01要求真实在途调用、实际停机屏障和同会话恢复。当前主控制器已有`operationId`和`operations`集合，但它们不写私有journal，而且该集合直到返回后来源复核结束才移除，不能直接当模型Promise仍pending的证据。UI阶段或spinner同样不足。增加小型、无正文/凭证的私有运行时记录，供已获准的本次观察器读取；不增加产品UI、HTTP监听、模型/来源/发布替身或用户数据库查询。

证据边界是**应用层实际AI调用的Promise生命周期**，即经过现有前置来源/授权/预算校验后调用当前真实`options.ai`，到该调用返回/拒绝。它不宣称供应商内部执行状态、供应商request ID或远端计费停止；这些继续按39标未知。源解析、包构造、空闲和仅已排队未进入该调用不能被记录成在途。

## 最小实现

修改仅限`desktop/main/novel-import.ts`、`desktop/shared/novel-import.ts`，可新增无IO的runtime证据类型/验证小helper；另为本证据新增单独定向unit文件。现有service/model网关、UI、语义算法、预算、PDF子系统、数据库/schema不变。主代理另改观察器白名单与构建身份并独审。

1. 控制器实例生成私有`processRunId`。复用现有AI `operationId`；实际调用进入后记录token。元数据仅含版本、processRunId、sessionId、epoch、phase/kind/intent、workingRevision、scope/payload哈希、开始/settle时间及成功/失败/取消等固定状态。没有正文、facts、prompt、模型响应、URL、headers、grants、Key或原始error。
2. 在调用`options.ai`返回Promise之后才能登记“已调用”；若同步抛错不得伪造pending。直接对原Promise附settle观察，及时更新私有token状态及时间，与结果是否因epoch过期而被采用分开。记录最多最后一次调用和最后一次暂停证明，外加固定小上限的当前调用token；不建立无限历史。上限、schema及UTF-8编码后容量明确（建议各<=16KiB、当前token<=16）。
3. 私有journal可保存可选`runtimeAiCall`（最后一次）供观察前定位，但磁盘状态可能滞后，**不能单独用其pending作在途结论**。实际暂停操作在发出取消前同步快照本实例token中该session/旧epoch仍pending的调用；保存`runtimePauseProof`，区分请求时活动列表、调用真实settle时间和停机屏障结束时间。即使先读到pending记录，若暂停瞬间已settle，证明必须标没有捕获在途，测试不算通过。
4. 保留现有“取消operation→等待真实jobs/资源结束→serial保存paused”的顺序；证明只能在该实际屏障后标drained，记录对应模型调用、operation、workflow jobs及本范围资源的剩余计数。不能用pause操作自身的actions计数冒充AI仍活跃，也不能在未归零时写drained。保存前核对session/operation lineage；旧epoch只能记录诊断终态，绝不获得分析/修订/覆盖信用或覆盖新会话。
5. 不让记录造成死锁：Promise settle观察只更新实例内token，不在持有serial队列时等待会反向需要该队列的保存。正常结果的元数据随可用checkpoint保存；取消时由屏障后的暂停保存一次收口。若诊断持久化失败，不能假称证据已保存或完成停机；取消/等待仍必须收尾，不遗留后台请求。
6. 重开后内存token从空开始。旧journal中的pending最多标interrupted/不可证明继续，不恢复为真实活动调用；旧已完成pause proof可保留历史身份。新调用使用新processRunId。未知/损坏诊断不能当有效证明；保持旧正文、coverage、artifacts和语义checkpoint，不把诊断修复当重新分析。
7. 字段为可选、仅新语义会话按需要出现；source-only 0AI不会生成假调用。它们不进AI payload/prompt、scope/plan/semanticResultHash、NOVEL_IMPORT内容快照或公开读取，不因时间戳破坏幂等回执。旧缺字段数据不补默认值、不升级已发布S01。观察器仅对已绑定本run来源/session的journal复制这些无敏感字段。

## 限定TDD与实际验收

新文件`tests/unit/novel-import-runtime-proof.test.ts`，只准以下两名，禁止整个目录/全仓测试：

| 精确名称 | 必须验证 |
| --- | --- |
| `NI-RT01: runtime AI and pause proof bind a pending invocation to the actual stop barrier` | 真实控制器+可控RPC Promise；前置source解析或空闲暂停没有pending调用证据；实际调用进入后pending；暂停瞬间捕获同operation/session/epoch，延迟取消/settle时不提前drained，终态后计数零且coverage/产物未因迟到结果推进；刚settle但磁盘pending滞后的窗口不能误算；同步抛错不造pending；记录字段无正文/模型/凭证/rawerror，容量硬界；不以注入RPC的unit场景宣称真实模型通过 |
| `NI-RT02: private runtime diagnostics survive restart without changing content identities` | 同实例与重开lineage；旧pending不能当活跃、旧已完成证明可读，新调用新processRunId；source-only零AI无假记录；旧MD/旧PDF/已发布快照的scope/plan与语义/预算工作几何不变；新字段不入payload/公开view/发布内容或回执；损坏/超限诊断拒绝被采信且不丢旧数据 |

另仅复跑直接改动主控制器的原`NI-SEM08`及恢复`NI-S10`，精确名称过滤、明确文件；不跑其余旧NI/PDF/LB/browser/packaging。必要typecheck/build另记。拟命令为Node24 `--import tsx --test --test-concurrency=1 --test-name-pattern='^NI-RT0[12]:' tests/unit/novel-import-runtime-proof.test.ts`及各自单独`^NI-SEM08:`、`^NI-S10:`的文件。先保留RED、再实现、独立code review后组合构建。

真正RB-LIFE01仍由主代理在M02或L02当前真实模型运行中执行原生UI动作：先观察本session/epoch的调用元数据，再暂停；最后必须取得本次runtimePauseProof捕获同一pending调用且屏障后归零的证据。如果错过窗口则记录未捕获并继续真实请求，不把unit/静态源码/历史证明或另一会话的事件计作通过。随后正常退出、同session重开、重新授权、只补未完成覆盖、最终全部目标/语义/发布/重开验收不变。用量与供应商内部状态仍未知，不查询全局Usage。

## RT-TR01/02 具体收敛（本节优先）

### 原Promise与暂停线性化

- 调用现有真实`options.ai`并取得它返回的**原生原Promise**，立即附成功/失败settle observer并登记实例内token；这些步骤之间不await、不复制/重包装Promise来延迟它的settle，也不把仅预留槽位当在途。同步抛错释放槽位且不生成pending记录。observer只同步更新实例内token的`settledObservedAt`和固定outcome，不做业务、FS或serial操作；该时间是应用观察到返回的时间，绝不声称供应商内部完成时刻。
- 暂停先在serial内验证action/owner，保存预期session对象、epoch、实例身份及现有owner/PDF generation。**不能仅await一次Promise.resolve/queueMicrotask。** 等待一次不依赖serial/jobs的`setImmediate`新任务边界，直接在该新任务的回调内同步做纯lineage核对、读取token及复制pending元数据、写暂停请求时刻，再增epoch/设stopping；捕获与epoch变更之间无新await、FS或可调用业务hook。此前任务已排队的resolver与全部Promise reactions必须在新任务前flush。新task回调是本次暂停捕获的线性化点。
- 若lineage在等待期间变化，不签发有效proof、不触新会话。取消operation和等待jobs在该短serial区退出之后进行，不能在serial内等待会反向使用serial的job。实际调用在捕获后settle属于合法捕获；已fulfilled/rejected但observer曾滞后的调用，不得被算pending。磁盘runtimeAiCall只是定位提示，最终以暂停线性化点的实例内token快照为准。
- NI-RT01必须覆盖：原Promise已resolve/reject且立刻请求pause；前序resolver微任务在捕获continuation之前执行、却把observer排在其后的精确竞态（旧单microtask方案须RED）；source解析尚未进入调用；同步抛错；捕获后才settle；owner/epoch在新任务等待期间改变。不能用随机sleep碰运气。

### 固定字段与容量

- 统一v1可选私有诊断字段；所有对象严格已知key。call身份只接受UUID实例/会话/operation，epoch/workingRevision为非负safe integer，phase/kind/intent为既有枚举，scope/payload为64位SHA-256，时间为合法ISO字符串且最多40个ASCII字符。状态仅pending/settled/interrupted；settled需固定fulfilled/rejected outcome和观察时间，interrupted只能表示重开后无法继续证明，不是远端settle。没有任何自由说明、路径、URL、模型快照、正文、响应或原error字段。
- 当前token最多16，单call编码最多1024字节，call+pause proof组成的私有诊断整体`JSON.stringify`后的UTF-8字节**不超过16384**；这些是硬上限，只允许测试下调。先预留/检查容量再进入调用，满额时不启动第17个未登记的请求，不截断或丢token来凑有效proof。pause只保存一次捕获列表及其终态，不复制无限历史。
- pause proof固定包括实例/session、旧/新epoch、捕获/屏障时间、捕获的operation身份及settle终态、固定诊断状态，以及分别记录的`pendingCalls`、`operations`、`workflowJobs`、`pdfActive`、`pdfRequests`剩余数。**只有全部实际为0且捕获调用均settle后可签drained**；没有捕获调用即明确missed，不能成为RB-LIFE01在途通过。pause自身actions计数不当作模型活动；不能用“phase=paused”填计数。非零/损坏/超限均不可签有效证明，普通暂停功能不被伪证据替代。
- journal损坏诊断只能被标不可采信/隔离该可选元数据，原正文、source、artifacts、coverage、预算/semantic checkpoint不丢；允许在保留这些核心数据的前提下清除无效诊断并标固定unavailable状态，不重新分析、不把它恢复成active、不把未校验原对象复制到观察证据。保存失败时先确保取消并等待真实底层调用收尾，再报告无法保存证明；不能签有效proof，也不能在AI job内等待包含自身的jobs集合。
- NI-RT01/02须含硬界刚好/越界、未知字段/坏类型/非ASCII或超长时间、满token/同步抛错、异常持久化与旧有效证明不能冒用、旧pending恢复、新实例、原正文/coverage/fingerprint不变。所有负例只用临时隔离目录与合成RPC，不接触真实配置/模型/DB。

精确直接回归命令补齐（均Node24绝对路径，不能传整个目录）：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-RT0[12]:' tests/unit/novel-import-runtime-proof.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM08:' tests/unit/novel-import-semantic-session.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-S10:' tests/unit/novel-import-session.test.ts
```

## 观察器增量（另行独立审核）

主代理只在现有已绑定run及完整来源集合的新journal观察接点复制三个可选诊断字段。新私有CLI `scripts/project-real-novel-import-runtime.ts` 从stdin读取 `{sessionId,diagnostics}`，复用生产纯helper `parseImportRuntimeDiagnostics`；已知key严格校验，sessionId为UUID，输入UTF-8上限17408字节，诊断仍受生产16384字节上限约束。任何坏结构、未知字段、身份不符或超限只返回固定 `runtimeDiagnosticsStatus: unavailable`，不输出输入、原error或自由文本。Python以流式JSON编码限额，只传三个诊断字段及sessionId，不传正文、凭证或其余journal字段；旧会话缺字段保持缺字段，非semanticVersion1不投影。构建身份加入纯helper、CLI及观察器。

限定隔离验证仅覆盖该增量：合法pending、合法settled及drained、未知key含秘密哨兵不输出、超限、跨session、旧缺字段不注入、非语义会话不投影。复用既有RT诊断schema，不新增产品功能或扩大小说测试范围；只用合成stdin/隔离对象，禁止实际模型、用户库、真实journal、全仓测试。该工具审核独立留档，不能作为真正RB-LIFE01通过。
