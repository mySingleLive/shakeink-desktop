# 场景批量错误观测脚本独立审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`。仅读取明确授权的通用脚本`/private/tmp/shakeink-scene-import-20261031/observe-generation-errors.cjs`；未读取其它私有日志、小说、配置或Key，未调用API，未修改产品、测试或脚本。

**最终脚本审核通过，可用于隔离真实运行的错误定位。** 它不是产品修复或导入成功证据；真实接口、原全部校验和正常发布/重开验收仍须执行。

审核中发现初版safe函数反复读取错误属性，getter可在白名单校验后返回任意字符串。独立纯合成VM/内存fs反例确实记录了未校验的合成name值。主代理已修复为name/code/message/status/cause及causeName各读取一次，随后只验证和输出缓存值；最终同类反例不再泄漏，读取抛错也不影响业务回调。

- AI包装仅在已有显式onError函数时替换该回调，其它参数值保留；无回调时以原options原样调用SDK，保留SDK默认行为。原事件、回调返回值/Promise及同步异常对象保持，原streamText返回对象直接返回。同步启动异常只观测后重抛原对象，不补结果或注入成功。
- PGlite仅对query/exec/transaction调用原函数一次、传递原this及参数；返回原结果或Promise，观测拒绝后原await仍收到同一错误，数据保持。没有读取/记录SQL、修改查询结果、额外发查询或绕过事务门。仅观察实际PGlite已启动Promise，不包装可能惰性执行的PrismaPromise；本结论不泛称附加then后全局未处理拒绝事件的调度完全不变。
- 日志只含固定event/channel、时间/pid、白名单错误类、限定错误码格式/枚举、100—599整数状态及三个固定消息类别；未知类归other。没有message、stack、cause正文、请求/响应、SQL、模型正文或Key序列化。单次缓存后只输出已验证primitive，观测/写文件错误被隔离，不代替业务错误。模块按原导出对象/构造器缓存，避免重复包装。

独立执行纯合成VM和内存fs断言，退出0：白名单getter不泄漏且单次读取；缺onError的options身份不变；原回调返回/Promise/抛错、同步启动错误、stream对象、数据库参数、Promise/数据/错误身份均保持。探针未写真实诊断文件、未调用真实模型或数据库。主代理另报告hook下SO/RA 63项及内存PGlite SELECT42/42883测试通过，本审核未重复这些集成执行，也不改称独立执行。

审核版本SHA-256：`71b69acd425701b59c86e2691d9d4f736711c20462280123c5dec1ef10219021`。真实加载应使用该冻结版本；诊断记录只用于解释原失败，不能将日志静默、局部只读成功或带观测的运行替代全书完整验收。

## 追加：R18仅错误catch的诊断构建

Node启动探针未加载NODE_OPTIONS中的旧hook，未据此运行带hook整书。现改用以下临时诊断机制；**本节新审核通过，并取代上节旧hook作为R18加载方案**。旧Module/SDK/PGlite包装及其hash仅保留历史审核记录，不用于此轮。

已只读审核明确授权的四个通用代码文件，最终SHA-256逐项匹配：

| 文件（均位于`/private/tmp/shakeink-scene-import-20261031`） | SHA-256 |
| --- | --- |
| capture-import-error.cjs | 9421c640d9b0d2235fecc8e0ca968caae7549da6f261501dadbf4575600fa931 |
| run-r18-catch-observed.mjs | 94dc1c1e8094fa126ed36f7292a3eb3233b9b0267aabaa8da4dd4bb0d48f7820 |
| verify-observer-bootstrap-catch.mjs | b6b7bc3725f2d07e056fbacfc20730c0f5a21111c9a48040e29df91a129bd68f |
| run-r18-diagnostic-wizard.mjs | 4d03f721f6c2b3b37ef708eb23a2cdc29f026f8db0ca06d80ddadf930aee45f1 |

- 纯logger只依赖fs，无Module、SDK、Promise或数据库包装。它只读取data descriptors；遇到accessor不执行getter。name及causeName最多读取有限原型链的data descriptor，其它字段只取自身data descriptor；随后仍只输出已验证的类、码、状态、kind及固定类别。独立VM/内存fs验证getter调用0次、合成message/SQL/request/response秘密不回显，反射读取异常只产生固定observer-read-unavailable，捕获函数不向业务传播异常。
- 启动器先验证正常R17 bundle及logger哈希，断言旧catch标记唯一，再仅追加启动ready和现有错误catch中转换前的capture调用；两处调用均单独try/catch。反向移除插入片段后Buffer与原字节逐值相等。产品源码不变，不改模型参数、成功返回、异常对象、响应或SQL；不提供成功替代值。仅启动和已有错误路径增加观测，不在正常生成路径包装调用。
- 原bundle先以独占创建方式备份到私有目录；临时产物和恢复均经独立文件原子rename。恢复只接受当前为原hash或本轮诊断hash，检测到其它产物时拒绝覆盖，保留原备份供核查。finally恢复后再次核对正常hash；exit仅作同步兜底。诊断期间应保持构建冻结，不能把这些检查理解成跨进程文件系统比较交换锁。
- 首稿只有exit回调，独立无文件Node24子进程证明SIGINT/SIGTERM不会执行该兜底；随后又发现仅置停止flag不能中断挂起await。这两点均已修复：父进程收到信号即尝试同步恢复并转发给子进程；替换前后检查stop并重置恢复标志，避免信号与rename竞态。bootstrap/driver在app已就绪时主动启动同一个幂等close Promise，先挂exit监听再quit；app已退出时直接使用已知exitCode/signalCode，launch前收到信号则在返回后立即进入关闭。父进程仍等待子进程关闭并执行finally哈希核验。
- SIGKILL/系统强制终止无法保证JS清理；脚本元数据已明确原备份和正常hash恢复约束。后续任何普通验收之前必须确认原bundle已恢复且hash一致，不能使用临时诊断产物。
- bootstrap仅启动隔离app、读取本地bootstrap及GET /api/novels状态，丢弃正文；按新增日志字节offset确认本次observer-ready，正常quit，不调用模型。driver强制scene-only，保存按钮、意外completed及通用verify发布分支均硬拒绝；到场景证据边界或失败即关闭，不继续后置复核或发布。元数据固定diagnosticOnly=true、acceptance=false，因此driver边界exit0也不表示完整导入成功。

独立执行四文件Node24 `--check`均退出0，并核对上述SHA；只执行纯内存logger探针及无文件的信号语义探针。未启动实际app、bootstrap或小说测试，未读取其它私有数据或调用API，未实际改写bundle；恢复及关闭逻辑本次为源码审核，不能改称已独立执行真实恢复或真实全批验证。没有遗留代码审核阻塞，可使用这些冻结文件进行隔离诊断；正式完整验收仍须恢复后的正常构建及新的完整流程。

最终冻结追加核对：logger只扩展有限的标准错误类名字符串，launcher只同步其固定SHA，未新增输出字段或动态值。将该静态names行及SHA分别替换回上一审版本后，源码hash精确还原为d9482442…与7dbefd93…，证明其余逻辑逐字未变；bootstrap/driver完整hash也仍匹配。上表为实际允许执行的最终四文件版本，审核结论保持通过。
