# 片段索引与提及名称编码：最小定向用例

2026-11-01。依据336，仅合成资料，新`tests/unit/novel-import-scene-roster-fragments.test.ts`；真实JSON桥使用预定输出，不调用provider或读真实小说。旧raw门通过既有RC/CI及定向反例保留。

| ID | 固定fixture | 必须断言 |
| --- | --- | --- |
| FA01 | 中文句/分句标点、英文标点、连续标点、前后空白、CRLF/单CR/单LF、emoji与组合字符、无标点、全空白、空text；同ID改text/交换units顺序 | 分段稳定，逐片非空有序连续index；concat逐字等于原文，无surrogate/CRLF切口，空单位仍在表且[]。原输入不变；还原用当前顺序/文字，不复用旧ID或旧目录。不因空白或无标点丢原文。 |
| FA02 | 两地点同literal但不同context，合法别名及长Unicode/CRLF；同一单位重复literal但可选更窄片段；每种anchor/record分支及混用 | 新索引完整wire经真实generateImportAiJson→generateJSON→service-final还原为与原合法raw一致的完整canonical；新primary派生name及全部不同aliases，保留全部mentions/context/links。首坏索引/primary→预定好第二代可恢复，持续两次仍拒绝；旧合法raw仍通过，旧坏raw不修。 |
| FA02-N | 索引负数/小数/不安全整数/越界/反序/空跨度/空单位，primary越界；混合分支、多键、wire自填目录、own undefined；坏第二证据/坏后记录；索引恢复quote含两次literal或非唯一quote；旧记录name/alias不对应；21种其它literal | 整份strict wire先拒坏shape；索引范围错误静态known路径且最多6条/250 UTF-16，无私密哨兵/未知键/值回显。派生名称问题只指当前wire合法的primaryMentionIndex/mentions，quote非唯一固定指导扩大连续片段但保留literal恰一次。不能drop、fallback、按外包单位改绑或截断别名；原literal/quote双唯一、名称覆盖、alias20及完整容量门照常拒绝。undefined用直接对象门，不能先JSON.stringify抹掉。 |
| FA03 | 当前包完整发送副本与原payload基线；原text删除后所有片段/metadata计入实际text/review角色的完整预算；非scope旧请求 | 新roster发送只将text替换为逐字完整fragments并加unitIndex，其它单位/请求值全保留且输入不变；不是text与fragments双份发送。原stageRequests/worker同serialize预算，完整metadata边界N可达生成、N+1拒绝0gen，不裁剪；16KiB reserve/原cap/2gen不变。非scope byte黄金及旧strict raw/canonical回归不变。 |

先在旧代码真实RED，未实现helper的module-missing不能充作整个generation功能RED；应先以原真实入口证明新合法wire尚不被支持，再增加helper正负控。日志记录实际节点/先后门到达范围；GREEN后必要既有服务回归、tsc及diff检查，source冻结交独审。实际接口、App、全书、发布与重开由主代理另验。
