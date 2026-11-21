# R65 内联键格式正常全文验证

本轮完整导入仍未通过。正常隔离向导载入原1402章/5589工作单元，2026-11-01 10:41:22.459 UTC允许分析，10:42:26.775识别失败，10:42:29.375正常关闭。App0/signalnull、驱动2，未发布，七分钟完成及重开未通过。

56个清单RPC中54成功、2失败；101次生成均completed、完整闭合。失败时覆盖2249工作单元，累计1439成员、912记录、896身份、99关系；正式artifacts仍0，workingRevision0。不能把部分识别计数或覆盖当作场景导入完成。

零API重建原130规划请求并逐代回放，56实际payload及101实际输入SHA均匹配，复现54/2。两包最后反馈分别是context限定词未在所选窗口，以及mention的literal-window-missing；没有HTTP400或预算失败。观察器101/101，pending/不匹配/观察失败/限制失败/写失败均0，恢复完成。仍须按真实source首拒诊断，不能以未出现的格式问题推所有后置门通过。

随后已证明一例三UTF16称呼跨真实同file相邻单元边界（前2字/后1字），原hasSource保守判定存在，但没有任何合法单unit引用窗口。该事务不能靠改选窗口解决，也不能把它判作无源或自动拒绝；后续须另审来源切分/证据表达方案。另一例限定词在包内其它窗口，模型未选择对应窗口，需另验聚焦来源资料是否有助纠正。均未据此改接受门。

构建前根35文件693/693、独审13文件223/223、types/build/diff0；130首轮与256历史生成完整预算fit，本地92/25保持。Native独立65536B桶使组合控制允许量增加，原source/prompt-fixed/完整context上限保持；最大schema42369B、prompt-fixed61304B、组合90684B，完整context余666989B。它不等于新模型语义必然正确。

证据：[安全标量记录](scene-import-verification/r65-inline-keyed-normal-observation.json)、[冻结构建](scene-import-verification/build-identity-r65.json)、[代码独审](452-scene-inline-keyed-budget-code-review.md)。全文、生成内容及原操作绑定仅保留私有隔离目录，未进本文。
