# R62 实际失败证据独立审核

结论：440 主文、安全标量记录及当前台账与实际证据一致，无阻塞性记录问题。R62 全文导入仍未通过；本审核不批准新的产品改动，也不将部分识别、完整捕获或零接口回放记为完整导入成功。

独立核实际 runtime 与 RPC 标量：27 个请求全部 settled，22 fulfilled、5 rejected，RPC 标量共 54 行。零接口回放的 27 项逐 operationId/payloadHash 与实际请求及结果精确对应，providerCalls=0；60 次生成的 inputTextHashEqual 全为 true。逐 transferId、ordinal、operationId、payloadSha256 关联原捕获，并重新核 delta 字符数与 SHA，60 项全部一致。回放私有文件 SHA 为 `4abeb61714c73632353ec67eb05fc3d3dd2e68dfba3cda8a8af86f3abafe8239`，与安全记录相同。

60/60 捕获均 captureComplete、streamClosed，providerEvent=completed，回放 finishReason=stop；parseErrors、utf8Errors、terminalConflicts 均 0。这些只能证明捕获完整，不能证明生成内容合法。文本观察器停止时 requested27/transfers60/captured60，pending、unmatched、ambiguous、observationFailures、limitFailures、retainedBytes、writeFailures 均 0，restored=true；RPC 观察器同样排空并恢复。page-errors 为 0。

失败 journal 为 detect-scene failed、import-scene pending：914 单元获得清单覆盖；ledger 为 520 来源成员、350 记录、340 身份、48 关系，artifacts=0。1402 章、5589 工作单元，workingRevision=0，originalProse 与 workingProse 的 SHA 相同。该状态没有证明全部清单、场景资料导入或完整 review 通过。实际允许分析、失败和关闭时间分别与安全记录的 09:20:11.965、09:21:13.960、09:21:16.702 UTC 一致；shutdown App code0/signal=null，driver exit2。没有将短时间失败当作七分钟完成目标，没有发布或正常重开成功证据。

失败回放中确有局部编号/数量/replacement 结构及固定 literal-window-missing 反馈；本审核未展开真实回复或独立重跑首拒诊断。反馈中存在指导不等于每一代都已到达该门，不能据此宣称来源、保留或归属门全部通过，也不能把 R61/R62 成功率差异归为单一指导改动的确定效果。后续五包首拒诊断须单独记录。

独立复核 R62 冻结身份的 57 产品源、8 bundles、303 renderer、22 helper、33 测试当前 SHA 全一致。667 定向测试及类型/桌面构建/diff 的通过属于构建前验证；439 独立 164 包含于 667，不相加。未重建 renderer、未执行全仓测试。此前 130 首轮+196 历史代的本地预算及 70/20 接受结果不能替代本轮实际失败。当前 trace latestRun/status/latestCountsScope 明确为 R62 清单识别失败，场景阶段、全文、七分钟、发布、重开均 false，activeRun=null；历史 R27 等计数另标历史范围。

实际独立命令为 Python 只读提取和断言上述计数、时间、SHA、请求/捕获/回放关联、冻结文件及台账字段，以及本文件 `git diff --check`。未 App/API、未编辑产品或测试，未输出或语义读取小说正文、真实生成文本、Key 或开放错误正文。
