# 483：联合分组正常全文实测真实性独立审核

结论：**实测报告与安全观察记录的失败事实成立。** R73 正常全文导入未通过，482 代码审核与本地测试通过不替代此结论。审核未启动 App、调用供应商、修改产品或测试源码，也未提出或实施新方案。

审核对象：

| 文件 | SHA-256 |
| --- | --- |
| `docs/483-scene-joint-group-decisions-real-verification.md` | `44bec7fcf2fca9c0b0df4760685faa9c028a2172b388cdf90036e2bca94d67cf` |
| `docs/scene-import-verification/r73-joint-group-normal-observation.json` | `2c934f4dccd309b31db07592781502cfdf81a4a1f3cb22b1e7d351b3db1661d8` |

独立执行只读核验副本 `verify-r73-evidence-reviewer.mjs`（仅换私有输出路径），exit 0；生成的 `r73-reviewer-evidence-safe.json` 与原独立安全收据逐字哈希相同：`acec64151e07522c35185e10e73b210c19bbc1dbc656797df9065978ead6f8c6`。核验内部只作哈希、绑定及逐值比较，未输出小说、模型回复或凭据。

核实的实际边界：

- session `dc669d19-1a9c-4b6d-8204-0153f07fc233` 在 consent 后 53,728ms 失败；App 正常退出 0/signal null、driver 2，原进程消失，pageErrors 0。此前 freeze scope guard 在 App/API/manifest 前拒绝，与本次唯一实际启动分别记录，不重置计时。
- 129 个计划包中实际 26 RPC，19 fulfilled、7 rejected；59 代 complete/closed/provider completed，delta/done/completed 文本一致。逐 transfer、operation、payload 与忠实回放绑定，59 个实际输入 SHA 全匹配；回放为 0 新供应商调用，仍是 19/7。
- 57 产品源、8 bundle、303 renderer、53 测试、25 helper、7 review，以及 runtime、driver、observer、验证工具哈希与冻结构建相符。driver 与 R72 逐字一致；源字节、1402 章和 4912 单元的完整连续分区、正文重组一致。
- 仅覆盖 705/4912 单元；362 成员、253 记录、249 身份、33 关系、0 未决均为部分识别账本。artifact 0、skip/drop 0、workingRevision 0、未发布，未到实体导入、完整复核和重开。
- 四文件状态审计保留原 bytes/hash。模型配置、catalog、根标记不变；drafts 的字节和内容均变化，不能称全状态不变。空 chat 的 draftId/rekey 与恢复记录 99→100 逐值核实，新增 RESTORE_DISABLED 的 value 严格等于 before.chat，旧记录、其余 sources、autosaves、issues 全留；`draftContentUnchanged=false` 未自动豁免。

诊断安全收据 `r73-failures-diagnostic-safe.json`，SHA `62c482ae2ba1883353db8ab66f6f47f73cfe122993abd8165f4a1abc64af9a5c`，当前源哈希与 R73 一致。独立重计七失败包的 28 代首拒为 source 7、decode 17、apply 3、json-parser 1；均到第四代，无预算中止。最终六包的返回值不在对应 claim 完整域，另一包个体域/Native 合法但重复同 occurrence，被原 apply 门拒绝。不得将早期 source/parser 拒绝也归为最终域错误，亦不据此声称后续 owner/retention 门全部通过。

本轮未捕获真实出站 schema。现有源链和真实 SDK 假出口控制支持“当前代码传 json_schema、未发现 json_object 降级路径”，不支持声称 R73 每次实际 wire 均已取证或供应商强制执行 enum。

准备阶段补核：`r73-group-preparation-diagnostic-private.json` 的 SHA 为 `38fa18ff476c5bb945621564da87398aab86bc110a8470c70cb38d1a23d7b7b9`。另核构建插桩仅观察原编译/准备控制流、当前四源与诊断 bundle 哈希对应，且两条输入 SHA 与实际同 operation/payload 捕获的 g1/g2 精确匹配。8cd6 的 slot1 原 mention 组 claimIndexes 为 `[0,3,4,5,6,7,8]`，各域 22 项；首个 LIMIT 为 rowSteps 4096、同刻 requestSteps 4096，随后整个组进入 remainder，没有达到 options 256 或 requestSteps 65536 的事件。首次 hard-fit 为 54,745 字节，余量已超过软目标，COMMIT 事件为零。因此新增正文所述“该组因原 rowSteps 门进入 claims，非 soft 降级”有本地忠实准备证据支持；不是新的供应商返回或一次新修复成功。该诊断阻断网络并在第二代供应商调用前停止，providerCalls/productWrites 均零。

台账当前 `actualFailed`、`activeRun=null`、最新计数范围及全文/七分钟/发布/重开 false 与证据一致。审核指出的未标范围 `providerCalls:0` 已改为 `offlineValidationProviderCalls:0`，并明确 `normalObservedProviderTransfers:59`；再次核对实际 26 RPC/59 代字段保留。该命名澄清不改原实际收据或失败结论，无剩余真实性审核阻塞。

本审核只确认真实性。下一技术提案仍须另行按方案、用例与独立审核顺序处理；本文件不授予实现或额外实际调用准入。
