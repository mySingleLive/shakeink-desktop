# 场景完整复核修复验收

2026-10-31。沿用已批准的真实 DeepSeek 接口，仅测试隔离目录；全文、Key、请求及完整 journal 不进入仓库。本记录更新本地修复与后续真实验收，不能将旧构建的场景阶段结果记为新构建完整导入通过。

本轮解决三处真实阻塞：普通场景复核以完整资料字段引用绑定当前来源版本；scene schema2 的四个长描述字段保持完整值参与预算内分片；分片规划逐包让出事件循环并等待停止捕获门。新增索引元数据仍纳入原完整请求预算，非向导普通场景也按该预算重排；不扩大请求额度、删减字段、改写正文或放宽冲突版本校验。

方案与用例独审分别见304/305、306/307、308/309；代码独审见[来源版本](310-scene-review-source-version-code-review.md)、[长字段](311-scene-long-fact-review-code-review.md)、[规划与停止门](312-scene-review-planning-yield-code-review.md)，均通过且无遗留阻塞。

来源版本有效 RED 9 节点全部失败，GREEN SV12、UR11、原 RA38 共61/61；部分后置子项在 RED 时未到达，不补记为执行。长字段 RED 13 节点10通过3失败，GREEN13/13；旧 guard 提前拒绝的后置断言不记为旧版本已执行。规划 RED8节点3通过5失败，单纯让出后仍3项失败，加入捕获门后8/8；与实际 RPC 拒绝和既有 runtime 组合共38/38，独审另跑通过。

最终同一源码定向回归 **394/394通过，0失败/取消/跳过**，包括场景、结构化生成、AI门、预算、证据、语义、runtime、用量事务与导入发布集成。无增量类型检查、桌面构建、diff检查通过；构建仅有既有 MODULE_TYPELESS_PACKAGE_JSON 提示。未运行全仓测试。命令输出保留于 private 临时目录。

R23旧构建事实保留：924/924场景成功，正文5589单元全部复核，随后长字段预算失败，未发布/重开。新构建R24完整实际验收尚未完成；冻结身份、真实长字段预检及新会话结果随后按实际补记。

新构建已冻结18项身份，driver/数字观测器与303独审字节一致：[构建](scene-import-verification/build-identity-r24.json)、[准备独审](scene-import-verification/r24-preparation-review.md)。含真实27529字完整字段的合法facts包，经当前DeepSeek实际只读复核，1次生成通过runImportAi全部末端校验（117721输入token、18927输出token、stop）；配置hash不变、app退出0。此结果只证明该包，不代表整书：[单包实际结果](scene-import-verification/r24-long-fact-readonly-actual.json)。

R24新会话于04:34 UTC启动；全量离线预检仍并行进行，尚未将其记为完整通过。默认全部场景与完整后续复核保留，不跳过失败项；真实结果待后续补记。

全量离线facts预检完成：原R23资料的126包精确、唯一、有序覆盖全部19163任务；3696个原生字段逐值对齐，完整预算与production service生成前门全部通过，0真实模型调用，原记录/文件未变。最大payload245737≤245760，不提高原额度；此项不替代真实响应语义验收：[离线记录](scene-import-verification/r23-full-facts-offline-preflight.json)。

R24于04:38 UTC被当前DeepSeek连续HTTP402中断。默认976场景全部选中，初次失败快照555done/5failed，关窗前保留快照560done/18failed（均HTTP402，另有21running/377waiting）；不将此快照计数说成最终发布数。driver退出2，Electron正常退出0，PS确认14801不存在，数字observer停止pending0；0跳过/丢弃/pageerror，1402章标题/卷/边界、工作正文hash与原小说hash不变。完整场景阶段、后置复核、发布/重开均未完成。官方[错误码](https://api-docs.deepseek.com/zh-cn/quick_start/error_codes/)说明402为余额不足；已向用户请求恢复当前接口可用状态或指定可用接口，未继续发起请求。结果：[接口阻塞](scene-import-verification/r24-provider-block.json)。

2026-11-01，用户明确回复当前接口已恢复，继续测试。R25的两次最初启动均在Electron原生初始化前退出，0模型调用；查明临时wrapper缺Info.plist等资源，目录mtime恰为本地零点。保留损坏wrapper，以repo同版本44.6.0完整bundle恢复原路径，仅改原bundleID，256文件/14symlink核对、主二进制SHA不变；不改配置/Key。恢复后最小原生入口APP_READY、正常exit0，随后正式R25新会话进入files。产品18项构建hash未变，尚未将新运行计为通过：[恢复记录](scene-import-verification/r25-runtime-restoration.json)、[R25身份](scene-import-verification/build-identity-r25.json)。

R25当前DeepSeek已正常响应；新会话971场景默认全选，970done/0failed，余1个请求自16:10:42.509UTC保持pending至固定阶段421675ms上限。driver退出4、Electron正常退出0；不是余额/结构失败，也不能记作完整场景通过。1402章与正文hash保持、0跳过/丢弃。单项请求待只读复测，不改7分钟门槛、不放宽最终校验：[阶段记录](scene-import-verification/r25-scene-stage-timeout.json)。

R25唯一未完成target按保存快照的原controller首请求重建后，当前接口只读复测137518ms通过：首gen length/32768输出token，原有一次JSON纠正后stop/1315输出token，完整runImportAi返回1资料，配置hash不变/app0。缺历史payloadHash/最后gen状态，不能将重建称为原挂起流逐字重放，也不能把本次length推定为历史挂起的已证原因；实际只证明本target当前可成功。R26已使用同18项冻结source/dist与同driver重新全新运行，完整发布/重开待结果：[单项实际](scene-import-verification/r25-unfinished-scene-readonly-actual.json)。

R26固定422731ms上限时975/976done、0failed、1pending，driver4/app0，未完整通过。随后旧prompt已预先bundled的同目标首请求只读复测通过；首gen length32768token、50773字符，原文JSON转义串精确含56单元中的52个（47388/51388字符），不是空白填充（空白2550、最长run2）；第二gen stop788token/1466字符、完整单位匹配0，完整资料通过、state hash不变/app0。此实测证明当前重建请求会产生大段原文复写，不能反推原历史挂起流字节同一或具体字段位置。314/315窄修指导与独审据此继续，不改cap或接受length：[R26阶段](scene-import-verification/r26-scene-stage-timeout.json)、[旧prompt只读诊断](scene-import-verification/r26-raw-shape-readonly-actual.json)。
