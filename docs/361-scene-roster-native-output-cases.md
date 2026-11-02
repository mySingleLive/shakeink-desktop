# 新场景清单native输出最小用例

依360，按顺序独审后TDD；全部新fixture为合成来源，无真实小说/Key。真实SDK指`MockLanguageModelV4.doStream`经过生产`generateText/Output.object`，不称为实际供应商通过。

| ID | 固定fixture与真实入口 | 必须断言 |
| --- | --- | --- |
| NR01 | 小型两地点/同literal不同context，真实SDK首代preferred roster | doStream.responseFormat为首JSON schema，strict根/required/extra门完整；evidence为原raw/ef/halfopen严格anyOf，prompt只首选ef。真实SDK正控含literal跨fragment及单片重复但扩连续片段才唯一，两者均首代完整成功，不靠坏首答触发repair；未传的maxOutputTokens仍undefined、role/thinking/usage原行为；完整canonical/mentions/context/links和Unicode/CRLF原窗口保真。首代ordinary generation wire仍分别接受原合法raw、ef、halfopen及full/primary记录；公共canonical仍仅原raw。反例错误ef/literal/owner仍原门拒绝，原native entity合同黄金不变。 |
| NR02 | 首答形状合法但一条坏锚点，次答预定精确CF typed repair，经真实SDK两次 | 实际第一次responseFormat首schema，第二次仅repairs schema，全部引用CF-only；good rows/原badrow已证窗口、owner、context/link保留，原草稿/请求不变。持续错误/完整JSON但finish=length仍最多两代且失败；不采首答、不fallback整roster、不新增第三代。原完全非法根仍原unlocatable首1/次0，无native保证假成功。 |
| NR03 | 纯schema/helper与真实controller planner/worker共享预算边界 | actual首schema UTF8及全部payload在N通过/N+1分包或固定拒；planner产出包worker前门同判、源units并集/次序/文本完全保留。actual二prompt+次schema fixed N/N+1、v1有效role/0未知16000边界，超限首1/次0且未裁prior/choices。不得用纯schema字符数冒充实际输入。非eligible模型/旧scene/parent/links/entity/其它kind不新增native schema或预算开销。 |
| NR04 | generateJSON兼容性与能力工厂隔离 | 无repair、原string repair的实际SDK options/prompt/schema/cap保持；新object只换次schema，hook不进SDKrest。网络/取消/原usage抛错只原次数且原错误身份，不触发repair；精确endpoint/protocol/model/auth负控不native、不改URL/Key。Responses实际合成HTTP请求strict schema与thinking-off/store等保真，不接真实provider。 |

RED先证明当前真实入口没有roster native responseFormat/不能切换次schema；模块缺失单独记录为未达，不替代功能RED。预算正控先通过原输入门，再让新增schema字节独立触边界，避免其它门遮蔽。保留现CO/RR/TR/TR05、entity结构化/缓冲、generic以及场景身份范围的定向回归和tsc；不同节点组不重复相加。准入后的实际包/全文由root单独记录，原R36原因限定为固定unlocatable-json，不猜未捕获输出内容。
