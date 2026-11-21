# R65 实际全文失败证据独立审核

结论：453主文、安全记录与实际证据一致，无记录阻塞。R65完整导入仍未通过；部分识别、来源原型或人工改一项选择均不能代替真实模型完成。后续454/455另经按序独审准入TDD，不回写本轮结果。

独立核runtime56个请求全部settled，54fulfilled/2rejected，与RPC观察及零接口回放逐operationId/payloadHash/结果精确对应。101次实际生成逐transferId/ordinal/operationId/payloadSHA关联捕获，重新核delta字符数/SHA，inputTextHashEqual全部true；回放101calls、providerCalls0，复现54/2。101/101 captureComplete/streamClosed/providerEvent completed，finishReason均stop，parseErrors/utf8Errors/terminalConflicts均0。回放文件SHA `dc5dc4e88686aff18c7a16cf9bd1a72ea9e24352fb01a9448f7cc64a276771a9` 与公开记录相同。这证明捕获和回放绑定完整，不证明全部生成内容合法。

失败journal为detect-scene failed，import-scene未完成：2249覆盖单元，1439来源成员、912记录、896身份、99关系；artifacts0、workingRevision0。1402章和5589工作单元，originalProse与workingProse的SHA相同。允许分析10:41:22.459、失败10:42:26.775、关闭10:42:29.375 UTC与events精确一致；App原退出code0/signal=null，driver2，pageerrors0。文本观察器56requests/101transfers/101captured，pending/unmatched/ambiguous/观察失败/限制失败/retainedBytes/写失败均0，恢复；RPC亦54/2、pending0、恢复。短时间失败不能当作420000ms完成目标。

两失败回放保留原context.label与literal-window-missing固定来源反馈，没有HTTP或预算失败记录。私有安全来源诊断同时明确0模型调用、未改原provider raw：原完整focus4337B在该包原限额内，人工将一个CF选择改为另一项后24records过原门，只是反事实局部验证。边界安全收据记录三UTF16称呼在包内单unit出现0、真实连续同file跨界1，旧硬切复现、原coalesce不能合并；新原型4912/max1000/fallback0、正文rejoin/1402章保持且该称呼不再跨界。这里核安全收据的闭合结论与范围，不将人工/原型记成模型成功、产品实现或所有场景可锚定证明。

审核时独立核R65冻结身份57源、8bundles、303renderer、22helpers、35tests当前SHA全一致；构建前根693/693、独审223/223及类型/build/diff0属于局部验证，两组重叠不相加。130首轮+256历史的92/25与全部预算fit不等于新供应商语义可靠，独立schema桶确提高组合控制允许量，不能记成旧组合限制不变。台账最新正常全文为R65失败，latestCountsScope限定清单识别，场景资料导入、完整review、发布、重开未到达，全文/七分钟/发布/重开均false，activeRun=null。

实际独立命令为Python只读提取/断言上述计数、时间、SHA、runtime/回放/捕获绑定、冻结身份、台账及私有安全诊断收据，以及本文件diff检查。未启动App、未调用模型API、未语义读取小说或真实生成内容/Key，未修改产品和测试。仍须新构建正常fresh全文完成全部场景、正文与资料完整性、发布、正常关闭重开及DB比较，才能总结完成。
